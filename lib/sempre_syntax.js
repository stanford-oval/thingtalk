// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
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

function isUnaryTableToTableOp(table) {
    return table.isFilter ||
        table.isProjection ||
        table.isCompute ||
        table.isAlias ||
        table.isAggregation ||
        table.isArgMinMax ||
        table.isSequence ||
        table.isHistory;
}
function isUnaryStreamToTableOp(table) {
    return table.isWindow || table.isTimeSeries;
}
function isUnaryStreamToStreamOp(stream) {
    return stream.isEdgeNew ||
        stream.isEdgeFilter ||
        stream.isFilter ||
        stream.isProjection ||
        stream.isCompute ||
        stream.isAlias;
}
function isUnaryTableToStreamOp(stream) {
    return stream.isMonitor;
}

function findFunctionNameTable(table) {
    if (table.isInvocation)
        return [table.invocation.selector.kind + ':' + table.invocation.channel];

    if (isUnaryTableToTableOp(table))
        return findFunctionNameTable(table.table);

    if (isUnaryStreamToTableOp(table))
        return findFunctionNameStream(table.stream);

    if (table.isJoin)
        return findFunctionNameTable(table.lhs).concat(findFunctionNameTable(table.rhs));

    throw new TypeError();
}

function findFunctionNameStream(stream) {
    if (stream.isTimer || stream.isAtTimer)
        return 'timer';

    if (isUnaryStreamToStreamOp(stream))
        return findFunctionNameStream(stream.stream);

    if (isUnaryTableToStreamOp(stream))
        return findFunctionNameTable(stream.table);

    throw new TypeError();
}

function isMonitorable(table) {
    let functions = findFunctionNameTable(table);
    for (let f of functions) {
        if (NON_MONITORABLE_FUNCTIONS.has(f))
            return false;
    }
    return true;
}

function isSingleResult(table) {
    let functions = findFunctionNameTable(table);
    for (let f of functions) {
        if (SINGLE_RESULT_FUNCTIONS.has(f))
            return true;
    }
    return false;
}

// FIXME this should be in Thingpedia
const NON_MONITORABLE_FUNCTIONS = new Set([
    'com.dropbox:open',
    'com.giphy:get',
    'com.imgflip:generate',
    'com.imgflip:list',
    'com.thecatapi:get',
    'com.xkcd:random_comic',
    'com.yandex.translate:detect_language',
    'com.yandex.translate:translate',
    'org.thingpedia.builtin.thingengine.builtin:get_date',
    'org.thingpedia.builtin.thingengine.builtin:get_random_between',
    'org.thingpedia.builtin.thingengine.builtin:get_time',
    'security-camera:get_snapshot',
    'security-camera:get_url',
    'uk.co.thedogapi:get',
]);

const SINGLE_RESULT_FUNCTIONS = new Set([
    'com.bodytrace.scale:get',
    'com.dropbox:get_space_usage',
    'com.dropbox:open',
    'com.giphy:get',
    'com.imgflip:generate',
    'com.linkedin:get_profile',
    'com.phdcomics:get_post',
    'com.thecatapi:get',
    'com.xkcd:get_comic',
    'com.xkcd:random_comic',
    'com.yahoo.finance:get_stock_div',
    'com.yahoo.finance:get_stock_quote',
    'com.yandex.translate:detect_language',
    'com.yandex.translate:translate',
    'edu.stanford.rakeshr1.fitbit:getbody',
    'edu.stanford.rakeshr1.fitbit:getsteps',
    'gov.nasa:apod',
    'gov.nasa:asteroid',
    'gov.nasa:rover',
    'org.thingpedia.builtin.thingengine.builtin:get_date',
    'org.thingpedia.builtin.thingengine.builtin:get_random_between',
    'org.thingpedia.builtin.thingengine.builtin:get_time',
    'org.thingpedia.builtin.thingengine.phone:get_gps',
    'org.thingpedia.weather:current',
    'org.thingpedia.weather:moon',
    'org.thingpedia.weather:sunrise',
    'security-camera:current_event',
    'security-camera:get_snapshot',
    'security-camera:get_url',
    'thermostat:get_humidity',
    'thermostat:get_hvac_state',
    'thermostat:get_temperature',
    'uk.co.thedogapi:get',
    'us.sportradar:mlb',
    'us.sportradar:nba',
    'us.sportradar:ncaafb',
    'us.sportradar:ncaambb',
    'us.sportradar:soccer_eu',
    'us.sportradar:soccer_us',
]);

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
    if (value.type === 'Currency')
        return Ast.Value.Currency(value.value.value, value.value.unit);
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
            return Ast.Value.VarRef(name);
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
        return Ast.Value.Date(parseDate(value.value), '+', null);
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

function cleanOperator(op) {
    if (op === '=' || op === 'is')
        op = '==';
    else if (op === 'contains')
        op = '=~';
    else if (op === 'has')
        op = 'contains';
    else if (op === '>')
        op = '>=';
    else if (op === '<')
        op = '<=';
    return op;
}

function parsePredicate(filters) {
    return Ast.BooleanExpression.And(filters.map((clause) =>
        Ast.BooleanExpression.Or(clause.map((atom) => {
            let argname = handleName(atom.name);
            if (argname.startsWith('tt:param.'))
                argname = argname.substr('tt:param.'.length);
            return Ast.BooleanExpression.Atom(argname, cleanOperator(atom.operator), parseValue(atom));
        }))));
}

function parsePrimitive(schemaRetriever, prim, primType, getMeta = false) {
    if (!prim)
        return Q([null, Ast.BooleanExpression.True]);

    let [kind, channel] = handleSelector(prim.name);
    if (kind === '$builtin')
        return Q([new Ast.Invocation(Ast.Selector.Builtin, channel, [], null), Ast.BooleanExpression.True]);

    let principal = prim.person ? Ast.Value.Entity(prim.person, 'tt:contact_name', null) : null;
    let sel = Ast.Selector.Device(kind, null, principal);

    return Q.try(() => {
        if (prim.dynamic_type)
            throw new Error('Subclassing in SEMPRE-syntax is no longer supported');
        return Utils.getSchemaForSelector(schemaRetriever, sel.kind, channel, primType, getMeta);
    }).then((schema) => {
        let inParams = [], filters = [];

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
                    filters.push(Ast.BooleanExpression.Atom(argname, '==', parseValue(arg)));
                } else {
                    throw new TypeError('Invalid parameter name ' + argname);
                }
            } else if (argname in schema.out) {
                filters.push(Ast.BooleanExpression.Atom(argname, cleanOperator(arg.operator), parseValue(arg)));
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
                    filters.push(Ast.BooleanExpression.Atom(pname, '==', Ast.Value.Undefined(true)));
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
                    filters.push(Ast.BooleanExpression.Atom(pname, '==', Ast.Value.Undefined(false)));
                }
            }
        }
        // make slots for missing required arguments
        for (let pname in schema.inReq) {
            if (!assignedInParams.has(pname))
                inParams.push(Ast.InputParam(pname, Ast.Value.Undefined(true)));
        }
        if (prim.predicate)
            filters.push(parsePredicate(prim.predicate));

        return [new Ast.Invocation(sel, channel, inParams, null),
            optimizeFilter(Ast.BooleanExpression.And(filters))];
    });
}

function parseQuery(schemaRetriever, prim, getMeta = false) {
    return parsePrimitive(schemaRetriever, prim, 'queries', getMeta).then(([invocation, filter]) => {
        if (!invocation)
            return null;
        let table = new Ast.Table.Invocation(invocation, null);
        if (!filter.isTrue)
            table = new Ast.Table.Filter(table, filter, null);
        if (prim.projection)
            table = new Ast.Table.Projection(table, prim.projection, null);
        return table;
    });
}
function parseTrigger(schemaRetriever, prim, getMeta = false) {
    if (!prim)
        return null;
    let [kind, channel] = handleSelector(prim.name);
    if (kind === 'org.thingpedia.builtin.thingengine.builtin' &&
        (channel === 'at' || channel === 'timer')) {
        let time, interval;
        prim.args.forEach((arg) => {
            let argname = handleName(arg.name);
            if (argname.startsWith('tt:param.'))
                argname = argname.substr('tt:param.'.length);
            if (argname === 'time')
                time = parseValue(arg);
            else
                interval = parseValue(arg);
        });
        if (time === undefined && channel === 'at')
            throw new Error('Missing time in atttimer');
        if (channel === 'timer')
            return new Ast.Stream.Timer(Ast.Value.Date.now(), interval, null);
        else
            return new Ast.Stream.AtTimer(time, null);
    }

    return parsePrimitive(schemaRetriever, prim, 'queries', getMeta).then(([invocation, filter]) => {
        if (!invocation)
            return null;
        let table = new Ast.Table.Invocation(invocation, null);

        if (!isMonitorable(table))
            throw new Error('Primitive ' + invocation.selector.kind + ':' + invocation.channel + ' is not monitorable');

        let stream;
        if (!filter.isTrue && isSingleResult(table)) {
            stream = new Ast.Stream.Monitor(table, prim.projection ? [prim.projection] : null, null);

            if (prim.edge_predicate)
                filter = optimizeFilter(Ast.BooleanExpression.And(parsePredicate(prim.edge_predicate)));
            stream = new Ast.Stream.EdgeFilter(stream, filter, null);
        } else {
            if (!filter.isTrue)
                table = new Ast.Table.Filter(table, filter, null);
            stream = new Ast.Stream.Monitor(table, prim.projection ? [prim.projection] : null, null);
            if (prim.edge_predicate)
                stream = new Ast.Stream.EdgeFilter(stream, parsePredicate(prim.edge_predicate), null);
        }

        if (prim.outer_projection)
            stream = new Ast.Stream.Projection(stream, prim.outer_projection, null);
        return stream;
    });
}

function parseAction(schemaRetriever, prim, getMeta = false) {
    return parsePrimitive(schemaRetriever, prim, 'actions', getMeta).then(([invocation, filter]) => invocation);
}

function parseRule(schemaRetriever, json, getMeta = false) {
    return Q.all([parseTrigger(schemaRetriever, json.trigger, getMeta),
                  parseQuery(schemaRetriever, json.query, getMeta),
                  parseAction(schemaRetriever, json.action, getMeta)]).then(([trigger, query, action]) => {
        if (action === null) {
            if (query !== null && query.isProjection) {
                let projArg = query.args[0];
                query = query.table;

                // XXX: keep the action as "notify" even if the user asks for just a specific field (it's easier)
                //let selector = new Ast.Selector.Device('org.thingpedia.builtin.thingengine.builtin', null, null);
                //let param = new Ast.InputParam('message', new Ast.Value.VarRef(projArg));
                //action = new Ast.Invocation(selector, 'say', [param], null);
                action = new Ast.Invocation(Ast.Selector.Builtin, 'notify', [], null);
            } else if (trigger !== null && trigger.isProjection) {
                let projArg = trigger.args[0];
                trigger = trigger.stream;

                // XXX: keep the action as "notify" even if the user asks for just a specific field (it's easier)
                //let selector = new Ast.Selector.Device('org.thingpedia.builtin.thingengine.builtin', null, null);
                //let param = new Ast.InputParam('message', new Ast.Value.VarRef(projArg));
                //action = new Ast.Invocation(selector, 'say', [param], null);
                action = new Ast.Invocation(Ast.Selector.Builtin, 'notify', [], null);
            } else {
                action = new Ast.Invocation(Ast.Selector.Builtin, 'notify', [], null);
            }
        }
        let rule;
        if (trigger === null) {
            rule = new Ast.Statement.Command(query, [action]);
        } else if (trigger !== null && query !== null) {
            // pull out any parameter passing
            let innermostQuery = query;
            while (!innermostQuery.isInvocation)
                innermostQuery = innermostQuery.table;
            let originalInParams = innermostQuery.invocation.in_params;
            innermostQuery.invocation.in_params = originalInParams.filter((p) => !p.value.isVarRef && !p.value.isEvent);
            let paramPassing = originalInParams.filter((p) => p.value.isVarRef || p.value.isEvent);
            rule = new Ast.Statement.Rule(new Ast.Stream.Join(trigger, query, paramPassing, null), [action]);
        } else {
            rule = new Ast.Statement.Rule(trigger, [action]);
        }
        var prog = new Ast.Program([], [], [rule], null);
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
    throw new Error('This function no longer exists, use NNSyntax instead');
}

module.exports.parseValue = parseValue;
module.exports.parsePrimitive = parsePrimitive;
module.exports.parseRule = parseRule;
module.exports.parseToplevel = parseToplevel;
module.exports.parsePredicate = parsePredicate;
module.exports.parsePermissionRule = parsePermissionRule;
module.exports.toSEMPRE = toSEMPRE;
module.exports.valueToSEMPRE = valueToSEMPRE;
