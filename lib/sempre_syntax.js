// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const assert = require('assert');

const Ast = require('./ast');
const Type = require('./type');
const Utils = require('./utils');

function parseDate(form) {
    let now = new Date;
    let year = form.year;
    if (year < 0)
        year = now.getFullYear();
    let month = form.month;
    if (month < 0)
        month = now.getMonth() + 1;
    let day = form.day;
    if (day < 0)
        day = now.getDate();
    let hour = 0, minute = 0, second = 0;
    hour = form.hour;
    if (hour < 0)
        hour = now.getHours();
    minute = form.minute;
    if (minute < 0)
        minute = now.getMinutes();
    second = form.second;
    if (second < 0)
        second = now.getSeconds();

    return new Date(year, month-1, day, hour, minute, second);
}

function parseTime(form) {
    let year = form.year;
    let month = form.month;
    let day = form.day;
    if (year >= 0 || month >= 0 || day >= 0)
        throw new TypeError('Invalid time');
    let hour = form.hour;
    let minute = form.minute;
    if (hour < 0 || minute < 0)
        throw new TypeError('Invalid time ' + [hour, minute]);
    return [hour, minute];
}

function parseLocation(loc) {
    if (loc.relativeTag === 'absolute')
        return Ast.Location.Absolute(loc.latitude, loc.longitude, loc.display || null);
    else
        return Ast.Location.Relative(loc.relativeTag.substr('rel_'.length));
}

function parseValue(value) {
    // first the special cases
    if (value.type === 'Measure')
        return Ast.Value.Measure(value.value.value, value.value.unit);
    if (value.type === 'Bool')
        return Ast.Value.Boolean(value.value.value);
    if (value.type === 'Enum')
        return Ast.Value.Enum(value.value.value);
    if (value.type === 'VarRef') {
        let name = handleName(value.value);
        if (name.startsWith('tt:param.'))
            name = name.substr('tt:param.'.length);
        if (name.startsWith('$event'))
            return Ast.Value.Event(name.substr('$event.'.length) || null);
        else
            return Ast.Value.VarRef('v_' + name);
    }

    let type = Type.fromString(value.type);
    if (type.isEntity) {
        return Ast.Value.Entity(value.value.value, type.type, value.value.display || null);
    } else if (type.isString) {
        return Ast.Value.String(value.value.value);
    } else if (type.isNumber) {
        return Ast.Value.Number(value.value.value);
    } else if (type.isTime) {
        let [hour, minute] = parseTime(value.value);
        return Ast.Value.Time(hour, minute);
    } else if (type.isDate) {
        return Ast.Value.Date(parseDate(value.value));
    } else if (type.isLocation) {
        return Ast.Value.Location(parseLocation(value.value));
    } else {
        throw new Error('Invalid type ' + type);
    }
}

function handleName(name) {
    if (typeof name === 'string')
        return name;

    if (typeof name !== 'object' || name === null)
        throw new TypeError('Invalid name');

    if (typeof name.id === 'string')
        return name.id;

    if (typeof name.value === 'string')
        return name.value;

    throw new TypeError('Invalid name');
}

function handleSelector(sel) {
    sel = handleName(sel);

    let match = /^(?:tt:)?(\$?[a-z0-9A-Z_.-]+)\.([a-z0-9A-Z_]+)$/.exec(sel);
    if (match === null)
        throw new TypeError('Invalid selector ' + sel);

    return [match[1], match[2]];
}

function parsePrimitive(schemaRetriever, primType, prim, getMeta = false, classes = []) {
    if (!prim)
        return Q(null);

    let [kind, channel] = handleSelector(prim.name);
    let principal = prim.person ? Ast.Value.Entity(prim.person, 'tt:contact_name', null) : null;
    let sel = Ast.Selector.Device(kind, null, principal);

    return Q.try(() => {
        if (prim.dynamic_type) {
            var classdef = Ast.ClassDef('__dyn_' + classes.length, sel.kind, {}, {}, {});
            var fndef = Utils.splitArgsForSchema({
                types: prim.dynamic_type.types.map((t) => Type.fromString(t)),
                args: prim.dynamic_type.args,
                required: prim.dynamic_type.required || [],
                is_input: prim.dynamic_type.is_input || prim.dynamic_type.required || [],
            }, primType, false);
            classdef[primType][channel] = fndef;
            classes.push(classdef);
            sel = Ast.Selector.Device(classdef.name, sel.id, sel.principal);
            return fndef;
        } else {
            return Utils.getSchemaForSelector(schemaRetriever, sel.kind, channel, primType, getMeta);
        }
    }).then((schema) => {
        let inParams = [], outParams = [], filters = [];

        let assignedInParams = new Set;
        prim.args.forEach((arg) => {
            let argname = handleName(arg.name);
            if (argname.startsWith('tt:param.'))
                argname = argname.substr('tt:param.'.length);
            if (arg.operator === 'is') {
                if (argname in schema.inReq || argname in schema.inOpt) {
                    assignedInParams.add(argname);
                    inParams.push(Ast.InputParam(argname, parseValue(arg)));
                } else if (argname in schema.out) {
                    filters.push(Ast.Filter(argname, '=', parseValue(arg)));
                } else {
                    throw new TypeError('Invalid parameter name ' + argname);
                }
            } else if (argname in schema.out) {
                let op = arg.operator;
                if (op === 'contains')
                    op = '=~';
                else if (op === 'has')
                    op = 'contains';
                filters.push(Ast.Filter(argname, op, parseValue(arg)));
            } else {
                throw new TypeError('Invalid parameter name ' + argname);
            }
        });
        if (Array.isArray(prim.slots)) {
            for (let pname of prim.slots) {
                if (pname in schema.inReq || pname in schema.inOpt) {
                    if (!assignedInParams.has(pname))
                        inParams.push(Ast.InputParam(pname, Ast.Value.Undefined(true)));
                    assignedInParams.add(pname);
                } else if (pname in schema.out) {
                    filters.push(Ast.Filter(pname, '=', Ast.Value.Undefined(true)));
                }
            }
        }
        if (Array.isArray(prim.remoteSlots)) {
            for (let pname of prim.remoteSlots) {
                if (pname in schema.inReq || pname in schema.inOpt) {
                    if (!assignedInParams.has(pname))
                        inParams.push(Ast.InputParam(pname, Ast.Value.Undefined(false)));
                    assignedInParams.add(pname);
                } else if (pname in schema.out) {
                    filters.push(Ast.Filter(pname, '=', Ast.Value.Undefined(false)));
                }
            }
        }
        // make slots for missing required arguments
        for (let pname in schema.inReq) {
            if (!assignedInParams.has(pname))
                inParams.push(Ast.InputParam(pname, Ast.Value.Undefined(true)));
        }
        // set missing optional arguments to null
        for (let pname in schema.inOpt) {
            if (!assignedInParams.has(pname))
                inParams.push(Ast.InputParam(pname, Ast.Value.Null));
        }

        if (primType !== 'actions') {
            // for each out parameter, make a variable binding
            for (let pname in schema.out) {
                if (!pname.startsWith('__'))
                    outParams.push(Ast.OutputParam('v_' + pname, pname));
            }
        }

        var ast = Ast.RulePart(sel, channel, inParams, filters, outParams);
        ast.schema = schema;
        return ast;
    });
}

function parseRule(schemaRetriever, json, getMeta = false) {
    var classes = [];
    return Q.all([parsePrimitive(schemaRetriever, 'triggers', json.trigger, getMeta, classes),
                  parsePrimitive(schemaRetriever, 'queries', json.query, getMeta, classes),
                  parsePrimitive(schemaRetriever, 'actions', json.action, getMeta, classes)]).then(([trigger, query, action]) => {
        if (action === null)
            action = Ast.RulePart(Ast.Selector.Builtin, 'notify', [], [], []);
        var rule = Ast.Rule(trigger, query !== null ? [query] : [], [action], !!json.once);
        return Ast.Program('AlmondGenerated', [], classes, [rule]);
    });
}

function parseToplevel(schemaRetriever, json, getMeta = false) {
    if (json.rule)
        return parseRule(schemaRetriever, json.rule, getMeta);
    if (json.action || json.query || json.trigger)
        return parseRule(schemaRetriever, json, getMeta);
    throw new Error('Not a ThingTalk program');
}

function timeToSEMPRE(jsArg) {
    var split = jsArg.split(':');
    return { hour: parseInt(split[0]), minute: parseInt(split[1]), second: 0,
        year: -1, month: -1, day: -1 };
}
function dateToSEMPRE(jsArg) {
    return { year: jsArg.getFullYear(), month: jsArg.getMonth() + 1, day: jsArg.getDate(),
        hour: jsArg.getHours(), minute: jsArg.getMinutes(), second: jsArg.getSeconds() };
}

function valueToSEMPRE(value, scope, revscope) {
    if (value.isVarRef) {
        let origParamName = scope[value.name];
        if (revscope[origParamName] !== value.name)
                throw new Error('Variable ' + value.name + ' refers to a shadowed parameter');
        return ['VarRef', { id: 'tt:param.' + origParamName }];
    }
    if (value.isEvent) {
        if (value.name)
            return ['VarRef', { id: 'tt:param.$event.' + value.name }];
        else
            return ['VarRef', { id: 'tt:param.$event' }];
    }
    if (value.isLocation && !value.value.isAbsolute)
        return ['Location', { relativeTag: 'rel_' + value.value.relativeTag, latitude: -1, longitude: -1 }];

    let jsArg = value.toJS();
    let type = value.getType();

    if (value.isBoolean)
        return ['Bool', { value: jsArg }];
    if (value.isString)
        return ['String', { value: jsArg }];
    if (value.isNumber)
        return ['Number', { value: jsArg }];
    if (value.isEntity)
        return [String(type), { value: jsArg }];
    if (value.isMeasure) // don't use jsArg as that normalizes the unit
        return ['Measure', { value: value.value, unit: value.unit }];
    if (value.isEnum)
        return ['Enum', { value: jsArg }];
    if (value.isTime)
        return ['Time', timeToSEMPRE(jsArg)];
    if (value.isDate)
        return ['Date', dateToSEMPRE(jsArg)];
    if (value.isLocation)
        return ['Location', { relativeTag: 'absolute', latitude: jsArg.y, longitude: jsArg.x, display: jsArg.display }];
    throw new TypeError('Unhandled type ' + type);
}

function operatorToSEMPRE(op) {
    if (op === '=')
        return 'is';
    if (op === 'contains')
        return 'has';
    if (op === '=~')
        return 'contains';
    return op;
}

function makeDynamicType(schema) {
    var args = schema.args;
    var types = args.map((a) => {
        if (schema.inReq[a])
            return schema.inReq[a];
        if (schema.inOpt[a])
            return schema.inOpt[a];
        return schema.out[a];
    }).map((t) => t.toString());
    var required = args.map((a) => {
        if (schema.inReq[a])
            return true;
        else
            return false;
    });
    var is_input = args.map((a) => {
        if (schema.out[a])
            return false;
        else
            return true;
    });
    return {
        types: types,
        args: args,
        required: required,
        is_input: is_input
    };
}

function primToSEMPRE(prim, scope, revscope, includeSlots, primType, classes) {
    if (prim.selector.isBuiltin)
        return undefined;
    if (prim.selector.principal && prim.selector.principal.type !== 'tt:contact_name')
        throw new Error('Pre-resolved contact names are not supported in SEMPRE syntax');

    var obj = {
        name: { id: 'tt:' + prim.selector.kind + '.' + prim.channel },
        person: prim.selector.principal ? prim.selector.principal.value : undefined,
        args: []
    };

    if (prim.selector.kind in classes) {
        let classdef = classes[prim.selector.kind];
        obj.dynamic_type = makeDynamicType(classdef[primType][prim.channel]);
        obj.name.id = 'tt:' + classdef.extends + '.' + prim.channel;
    }

    var localSlots = [];
    var remoteSlots = [];
    for (let inParam of prim.in_params) {
        if (inParam.value.isUndefined) {
            if (inParam.value.local)
                localSlots.push(inParam.name);
            else
                remoteSlots.push(inParam.name);
        } else if (!inParam.value.isNull) {
            let [sempreType, sempreValue] = valueToSEMPRE(inParam.value, scope, revscope);
            obj.args.push({
                name: { id: 'tt:param.' + inParam.name },
                operator: 'is',
                type: sempreType,
                value: sempreValue
            });
        }
    }
    for (let filter of prim.filters) {
        if (filter.value.isUndefined) {
            if (filter.operator !== '=')
                throw new Error('Slot-filled non-equality filters are not supported in SEMPRE syntax');
            if (filter.value.local)
                localSlots.push(filter.name);
            else
                remoteSlots.push(filter.name);
        } else if (!filter.value.isNull) {
            let [sempreType, sempreValue] = valueToSEMPRE(filter.value, scope, revscope);
            obj.args.push({
                name: { id: 'tt:param.' + filter.name },
                operator: operatorToSEMPRE(filter.operator),
                type: sempreType,
                value: sempreValue
            });
        }
    }
    if (includeSlots) {
        if (localSlots.length > 0)
            obj.slots = localSlots;
        if (remoteSlots.length > 0)
            obj.remoteSlots = remoteSlots;
    }

    for (let outParam of prim.out_params) {
        scope[outParam.name] = outParam.value;
        revscope[outParam.value] = outParam.name;
    }

    return obj;
}

function toSEMPRE(ast, includeSlots = true) {
    assert(ast.isProgram);

    if (ast.params.length > 0)
        throw new Error('Programs with arguments are not supported');
    if (ast.rules.length > 1)
        throw new Error('Programs with multiple rules are not supported');

    let classes = {};
    ast.classes.forEach((classdef) => {
        classes[classdef.name] = classdef;
    });

    let rule = ast.rules[0];
    let trigger = null, query = null, action = null;
    if (rule.trigger !== null)
        trigger = rule.trigger;
    if (rule.queries.length > 1)
        throw new Error('Rules with multiple queries are not supported');
    if (rule.queries.length > 0)
        query = rule.queries[0];
    if (rule.actions.length > 1)
        throw new Error('Rules with multiple actions are not supported');
    if (rule.actions.length > 0)
        action = rule.actions[0];

    let fncount = 0;
    if (trigger)
        fncount++;
    if (query)
        fncount++;
    if (action)
        fncount++;
    let top = {}, ret;
    if (fncount > 1)
        ret = {rule:top};
    else
        ret = top;

    let scope = {}, revscope = {};
    if (trigger)
        top.trigger = primToSEMPRE(trigger, scope, revscope, includeSlots, 'triggers', classes);
    if (query)
        top.query = primToSEMPRE(query, scope, revscope, includeSlots, 'queries', classes);
    if (action)
        top.action = primToSEMPRE(action, scope, revscope, includeSlots, 'actions', classes);

    return ret;
}

module.exports.parseValue = parseValue;
module.exports.parsePrimitive = parsePrimitive;
module.exports.parseRule = parseRule;
module.exports.parseToplevel = parseToplevel;
module.exports.toSEMPRE = toSEMPRE;
