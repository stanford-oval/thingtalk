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

const Ast = require('./ast');
const Type = require('./type');
const Utils = require('./utils');
const { typeCheckProgram, typeCheckPermissionRule } = require('./typecheck');
const { optimizeFilter } = require('./optimize');

const { isUnaryTableToTableOp,
        isUnaryStreamToTableOp,
        isUnaryStreamToStreamOp,
        isUnaryTableToStreamOp } = Utils;

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
    if (value.type === 'Ast')
        return value.value; // already in right format

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

function parsePredicate(filters, schema) {
    return Ast.BooleanExpression.And(filters.map((clause) =>
        Ast.BooleanExpression.Or(clause.map((atom) => {
            let argname = handleName(atom.name);
            if (argname.startsWith('tt:param.'))
                argname = argname.substr('tt:param.'.length);
            let op = cleanOperator(atom.operator);
            return Ast.BooleanExpression.Atom(argname, op, parseValue(atom));
        }))));
}

function parsePrimitive(schemaRetriever, prim, primType, getMeta = false) {
    if (!prim)
        return Promise.resolve([null, Ast.BooleanExpression.True]);

    let [kind, channel] = handleSelector(prim.name);
    if (kind === '$builtin')
        return Promise.resolve([new Ast.Invocation(Ast.Selector.Builtin, channel, [], null), Ast.BooleanExpression.True]);

    let principal = prim.person ? Ast.Value.Entity(prim.person, 'tt:username', null) : null;
    if (prim.slots && prim.slots.indexOf('__person') > -1) principal = principal? principal : Ast.Value.Undefined(true);
    let sel = Ast.Selector.Device(kind, null, principal);

    return Promise.resolve().then(() => {
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
    return Promise.all([parseTrigger(schemaRetriever, json.trigger, getMeta),
                        parseQuery(schemaRetriever, json.query, getMeta),
                        parseAction(schemaRetriever, json.action, getMeta)]).then(([trigger, query, action]) => {
        if (action === null) {
            if (query !== null && query.isProjection) {
                //let projArg = query.args[0];
                query = query.table;

                // XXX: keep the action as "notify" even if the user asks for just a specific field (it's easier)
                //let selector = new Ast.Selector.Device('org.thingpedia.builtin.thingengine.builtin', null, null);
                //let param = new Ast.InputParam('message', new Ast.Value.VarRef(projArg));
                //action = new Ast.Invocation(selector, 'say', [param], null);
                action = new Ast.Invocation(Ast.Selector.Builtin, 'notify', [], null);
            } else if (trigger !== null && trigger.isProjection) {
                //let projArg = trigger.args[0];
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
            prog.principal = Ast.Value.Entity(json.setup.person, 'tt:username', null);
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
        return Promise.resolve(Ast.PermissionFunction.Builtin);

    let [kind, channel] = handleSelector(prim.name);
    let argfilters = [];
    prim.args.forEach((arg) => {
        let argname = handleName(arg.name);
        if (argname.startsWith('tt:param.'))
            argname = argname.substr('tt:param.'.length);
        argfilters.push(Ast.BooleanExpression.Atom(argname, '==', parseValue(arg)));
    });

    let filter = Ast.BooleanExpression.And([...argfilters, parsePredicate(prim.predicate)]);
    return Utils.getSchemaForSelector(schemaRetriever, kind, channel, primType, getMeta).then((schema) => {
        return new Ast.PermissionFunction.Specified(kind, channel, optimizeFilter(filter), schema);
    });
}

function parsePermissionRuleInternal(schemaRetriever, toplevel, json, getMeta = false) {
    return Promise.all([parsePermissionFunction(schemaRetriever, 'queries', json.trigger, getMeta),
                        parsePermissionFunction(schemaRetriever, 'queries', json.query, getMeta),
                        parsePermissionFunction(schemaRetriever, 'actions', json.action, getMeta)]).then(([trigger, query, action]) => {
        if (trigger.isSpecified && query.isSpecified)
            throw new Error('policies with 2 get functions are not supported');
        if (trigger.isSpecified && !query.isSpecified)
            query = trigger;
        let principal = null;
        if (toplevel.person)
            principal = new Ast.Value.Entity(toplevel.person, 'tt:username', null);
        else if (toplevel.principal)
            principal = new Ast.Value.Entity(toplevel.principal.value, 'tt:contact', toplevel.principal.display || null);
        else if (toplevel.group)
            throw new Error('groups???');

        const rule = new Ast.PermissionRule(
            principal ? Ast.BooleanExpression.Atom('source', '==', principal) : Ast.BooleanExpression.True,
            query, action);
        return typeCheckPermissionRule(rule, schemaRetriever).then(() => rule);
    });
}

function parsePermissionRule(schemaRetriever, json, getMeta = false) {
    if (json.rule)
        return parsePermissionRuleInternal(schemaRetriever, json, json.rule, getMeta);
    else
        return parsePermissionRuleInternal(schemaRetriever, json, json, getMeta);
}

module.exports.parseValue = parseValue;
module.exports.parsePrimitive = parsePrimitive;
module.exports.parseRule = parseRule;
module.exports.parseToplevel = parseToplevel;
module.exports.parsePredicate = parsePredicate;
module.exports.parsePermissionRule = parsePermissionRule;