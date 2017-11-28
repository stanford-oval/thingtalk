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
const { typeCheckProgram } = require('./typecheck');
const { optimizeFilter } = require('./optimize');

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
    let second = form.second;
    if (second < 0 || second === undefined)
        second = 0;
    return [hour, minute, second];
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
        let [hour, minute, second] = parseTime(value.value);
        return Ast.Value.Time(hour, minute, second);
    } else if (type.isDate) {
        return Ast.Value.Date(parseDate(value.value), null);
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

function parsePredicate(obj) {
    let filters = obj.predicate;

    return Ast.BooleanExpression.And(filters.map((clause) =>
        Ast.BooleanExpression.Or(clause.map((atom) => {
            let argname = handleName(atom.name);
            if (argname.startsWith('tt:param.'))
                argname = argname.substr('tt:param.'.length);
            let op = atom.operator;
            if (op === 'contains')
                op = '=~';
            else if (op === 'has')
                op = 'contains';
            return Ast.BooleanExpression.Atom(Ast.Filter(argname, op, parseValue(atom)));
        }))));
}

function parsePrimitive(schemaRetriever, primType, prim, getMeta = false, classes = []) {
    if (!prim)
        return Q(null);

    let [kind, channel] = handleSelector(prim.name);
    if (kind === '$builtin')
        return Q(new Ast.RulePart(Ast.Selector.Builtin, channel, [], Ast.BooleanExpression.True, [], null, null));

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
                    filters.push(Ast.BooleanExpression.Atom(Ast.Filter(argname, '=', parseValue(arg))));
                } else {
                    throw new TypeError('Invalid parameter name ' + argname);
                }
            } else if (argname in schema.out) {
                let op = arg.operator;
                if (op === 'is')
                    op = '=';
                if (op === 'contains')
                    op = '=~';
                else if (op === 'has')
                    op = 'contains';
                filters.push(Ast.BooleanExpression.Atom(Ast.Filter(argname, op, parseValue(arg))));
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
                    filters.push(Ast.BooleanExpression.Atom(Ast.Filter(pname, '=', Ast.Value.Undefined(true))));
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
                    filters.push(Ast.BooleanExpression.Atom(Ast.Filter(pname, '=', Ast.Value.Undefined(false))));
                }
            }
        }
        // make slots for missing required arguments
        for (let pname in schema.inReq) {
            if (!assignedInParams.has(pname))
                inParams.push(Ast.InputParam(pname, Ast.Value.Undefined(true)));
        }
        if (prim.predicate)
            filters.push(parsePredicate(prim));

        // for each out parameter, make a variable binding
        for (let pname in schema.out) {
            if (!pname.startsWith('__'))
                outParams.push(Ast.OutputParam('v_' + pname, pname));
        }

        var ast = Ast.RulePart(sel, channel, inParams,
            optimizeFilter(Ast.BooleanExpression.And(filters)), outParams, schema, null);
        return ast;
    });
}

function parseRule(schemaRetriever, json, getMeta = false) {
    var classes = [];
    return Q.all([parsePrimitive(schemaRetriever, 'triggers', json.trigger, getMeta, classes),
                  parsePrimitive(schemaRetriever, 'queries', json.query, getMeta, classes),
                  parsePrimitive(schemaRetriever, 'actions', json.action, getMeta, classes)]).then(([trigger, query, action]) => {
        if (action === null)
            action = Ast.RulePart(Ast.Selector.Builtin, 'notify', [], Ast.BooleanExpression.True, [], null, null);
        var rule = new Ast.Rule(trigger, query !== null ? [query] : [], [action], !!json.once, null, null);
        var prog = new Ast.Program('AlmondGenerated', [], classes, [rule], null);
        return typeCheckProgram(prog, schemaRetriever).then(() => prog);
    });
}

function parseToplevel(schemaRetriever, json, getMeta = false) {
    if (json.setup) {
        return parseToplevel(schemaRetriever, json.setup, getMeta).then((prog) => {
            prog.principal = Ast.Value.Entity(json.setup.person, 'tt:contact_name', null);
            return prog;
        });
    }
    if (json.access)
        return parsePermissionRule(schemaRetriever, json.access, getMeta);
    if (json.rule)
        return parseRule(schemaRetriever, json.rule, getMeta);
    if (json.action || json.query || json.trigger)
        return parseRule(schemaRetriever, json, getMeta);
    throw new Error('Not a ThingTalk program');
}

function parsePermissionFunction(schemaRetriever, primType, prim, getMeta = false) {
    if (!prim)
        return Q(Ast.PermissionFunction.Builtin);

    let [kind, channel] = handleSelector(prim.name);
    if (prim.args && prim.args.length > 0)
        throw new Error('Policies cannot have a non empty args array');

    let filter = parsePredicate(prim);
    return Utils.getSchemaForSelector(schemaRetriever, kind, channel, primType, getMeta).then((schema) => {
        let outParams = [];
        // for each out parameter, make a variable binding
        for (let pname in schema.out) {
            if (!pname.startsWith('__'))
                outParams.push(Ast.OutputParam('v_' + pname, pname));
        }

        return new Ast.PermissionFunction.Specified(kind, channel, optimizeFilter(filter),
                                                    outParams, schema);
    });
}

function parsePermissionRuleInternal(schemaRetriever, toplevel, json, getMeta = false) {
    return Q.all([parsePermissionFunction(schemaRetriever, 'triggers', json.trigger, getMeta),
                  parsePermissionFunction(schemaRetriever, 'queries', json.query, getMeta),
                  parsePermissionFunction(schemaRetriever, 'actions', json.action, getMeta)]).then(([trigger, query, action]) => {
        let principal = null;
        if (toplevel.person)
            principal = new Ast.Value.Entity(toplevel.person, 'tt:contact_name', null);
        else if (toplevel.principal)
            principal = new Ast.Value.Entity(toplevel.principal.value, 'tt:contact', toplevel.principal.display || null);
        else if (toplevel.group)
            principal = new Ast.Value.Entity(toplevel.group, 'tt:contact_group_name', null);

        return new Ast.PermissionRule(principal, trigger, query, action);
    });
}

function parsePermissionRule(schemaRetriever, json, getMeta = false) {
    if (json.rule)
        return parsePermissionRuleInternal(schemaRetriever, json, json.rule, getMeta);
    else
        return parsePermissionRuleInternal(schemaRetriever, json, json, getMeta);
}

function timeToSEMPRE(jsArg) {
    return { hour: jsArg.hour, minute: jsArg.minute, second: jsArg.second,
        year: -1, month: -1, day: -1 };
}
function dateToSEMPRE(jsArg) {
    return { year: jsArg.getFullYear(), month: jsArg.getMonth() + 1, day: jsArg.getDate(),
        hour: jsArg.getHours(), minute: jsArg.getMinutes(), second: jsArg.getSeconds() };
}

function handleCompatEntityType(type) {
    switch (type.type) {
    case 'tt:username':
        return 'Username';
    case 'tt:hashtag':
        return 'Hashtag';
    case 'tt:picture':
        return 'Picture';
    case 'tt:email_address':
        return 'EmailAddress';
    case 'tt:phone_number':
        return 'PhoneNumber';
    case 'tt:url':
        return 'URL';
    default:
        return String(type);
    }
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
        return [handleCompatEntityType(type), jsArg];
    if (value.isMeasure) // don't use jsArg as that normalizes the unit
        return ['Measure', { value: value.value, unit: value.unit }];
    if (value.isEnum)
        return ['Enum', { value: jsArg }];
    if (value.isTime)
        return ['Time', timeToSEMPRE(jsArg)];
    if (value.isDate) {
        if (value.offset || value.value === null || !(value.value instanceof Date))
            throw new Error('Relative dates are not supported in SEMPRE syntax');
        return ['Date', dateToSEMPRE(jsArg)];
    }
    if (value.isLocation)
        return ['Location', { relativeTag: 'absolute', latitude: jsArg.y, longitude: jsArg.x, display: jsArg.display }];
    throw new TypeError('Unhandled type ' + type);
}

function operatorToSEMPRE(op) {
    if (op === 'contains')
        return 'has';
    if (op === '=~')
        return 'contains';
    if (op === 'group_member')
        throw new Error('Group membership is not supported in SEMPRE syntax');
    if (op === 'prefix_of' || op === 'suffix_of' || op === 'in_array')
        throw new Error('flipped ops are not support in SEMPRE syntax');
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

function predicateToSEMPRE(filter, scope, revscope) {
    let optFilter = optimizeFilter(filter);
    if (optFilter.isFalse)
        optFilter = Ast.BooleanExpression.And([Ast.BooleanExpression.Or([])]);
    else if (optFilter.isTrue)
        optFilter = Ast.BooleanExpression.And([]);
    else if (!optFilter.isAnd)
        optFilter = Ast.BooleanExpression.And([optFilter]);

    return optFilter.operands.map((o) => {
        let orOperands;
        if (o.isOr)
            orOperands = o.operands;
        else
            orOperands = [o];

        return orOperands.map((o) => {
            let negated = false;
            if (o.isNot) {
                negated = true;
                o = o.expr;
            }

            if (!o.isAtom)
                throw new Error('Nested and external filters are not supported in SEMPRE syntax');
            let filter = o.filter;
            if (filter.value.isUndefined) {
                throw new Error('Slot-filled filters are not supported in SEMPRE syntax');
            } else {
                let [sempreType, sempreValue] = valueToSEMPRE(filter.value, scope, revscope);
                let arg = {
                    name: { id: 'tt:param.' + filter.name },
                    operator: operatorToSEMPRE(filter.operator),
                    type: sempreType,
                    value: sempreValue,
                };
                if (negated)
                    arg.negated = true;
                return arg;
            }
        });
    });
}

function primToSEMPRE(prim, scope, revscope, includeSlots, primType, classes) {
    if (prim.selector.isBuiltin) {
        if (prim.channel === 'notify')
            return undefined;
        return {name: {id:'tt:$builtin.' + prim.channel }, args: [], predicate: []};
    }
    if (prim.selector.principal && prim.selector.principal.type !== 'tt:contact_name')
        throw new Error('Pre-resolved contact names are not supported in SEMPRE syntax');

    var obj = {
        name: { id: 'tt:' + prim.selector.kind + '.' + prim.channel },
        person: prim.selector.principal ? prim.selector.principal.value : undefined,
        args: [],
        predicate: []
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
        } else {
            let [sempreType, sempreValue] = valueToSEMPRE(inParam.value, scope, revscope);
            obj.args.push({
                name: { id: 'tt:param.' + inParam.name },
                operator: 'is',
                type: sempreType,
                value: sempreValue
            });
        }
    }

    obj.predicate = predicateToSEMPRE(prim.filter, scope, revscope);
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
    if (ast.isProgram)
        return programToSempre(ast, includeSlots);
    else
        return permissionRuleToSempre(ast);
}

function permissionFunctionToSEMPRE(fn, scope, revscope) {
    let obj = {
        name: { id: 'tt:' + fn.kind + '.' + fn.channel },
        args: [],
        predicate: predicateToSEMPRE(fn.filter, scope, revscope)
    };

    for (let outParam of fn.out_params) {
        scope[outParam.name] = outParam.value;
        revscope[outParam.value] = outParam.name;
    }

    return obj;
}

function permissionRuleToSempre(ast) {
    assert(ast.isPermissionRule);

    let trigger = null, query = null, action = null;
    if (ast.trigger.isSpecified)
        trigger = ast.trigger;
    else if (!ast.trigger.isBuiltin)
        throw new Error('Star/ClassStar permissions are not supported in SEMPRE syntax yet');
    if (ast.query.isSpecified)
        query = ast.query;
    else if (!ast.query.isBuiltin)
        throw new Error('Star/ClassStar permissions are not supported in SEMPRE syntax yet');
    if (ast.action.isSpecified)
        action = ast.action;
    else if (!ast.action.isBuiltin)
        throw new Error('Star/ClassStar permissions are not supported in SEMPRE syntax yet');

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
        top.trigger = permissionFunctionToSEMPRE(trigger, scope, revscope, 'triggers');
    if (query)
        top.query = permissionFunctionToSEMPRE(query, scope, revscope, 'queries');
    if (action)
        top.action = permissionFunctionToSEMPRE(action, scope, revscope, 'actions');
    if (ast.principal) {
        if (ast.principal.type === 'tt:contact_name')
            ret.person = ast.principal.value;
        else if (ast.principal.type === 'tt:contact_group_name')
            ret.group = ast.principal.value;
        else if (ast.principal.type === 'tt:contact')
            ret.principal = { value: ast.principal.value, display: ast.principal.display };
    }

    return { access: ret };
}

function programToSempre(ast, includeSlots) {
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
    if (rule.actions.length > 0 && (!rule.actions[0].selector.isBuiltin || rule.actions[0].channel !== 'notify'))
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

    if (ast.principal !== null) {
        if (ast.principal.type === 'tt:contact_name')
            ret.person = ast.principal.value;
        else if (ast.principal.type === 'tt:contact_group_name')
            ret.group = ast.principal.value;
        else if (ast.principal.type === 'tt:contact')
            ret.principal = { value: ast.principal.value, display: ast.principal.display };
        return { setup:ret };
    } else {
        return ret;
    }
}

module.exports.parseValue = parseValue;
module.exports.parsePrimitive = parsePrimitive;
module.exports.parseRule = parseRule;
module.exports.parseToplevel = parseToplevel;
module.exports.parsePredicate = parsePredicate;
module.exports.parsePermissionRule = parsePermissionRule;
module.exports.toSEMPRE = toSEMPRE;
