// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const events = require('events');
const crypto = require('crypto');

const Compiler = require('./compiler');
const Ast = require('./ast');
const Type = require('./type');

function capitalize(str) {
    return (str[0].toUpperCase() + str.substr(1)).replace(/[\-_]([a-z])/g, function(whole, char) { return char.toUpperCase(); }).replace(/[\-_]/g, '');
}

function capitalizeSelector(kind, channel) {
    if (kind === 'builtin')
        return capitalize(channel);
    else
        return capitalize(kind);
}

function codegenInvocation(invocation, params) {
    var sel, part;
    if (invocation.kind_type === 'app' || invocation.kind === 'builtin' || invocation.kind === 'remote') {
        sel = Ast.Selector.GlobalName(invocation.kind);
    } else {
        var attributes = [Ast.Attribute('type', invocation.kind)];
        if (invocation.principal)
            attributes.push(Ast.Attribute('principal', invocation.principal));
        else if (invocation.id)
            attributes.push(Ast.Attribute('id', invocation.id));
        sel = Ast.Selector.Attributes(attributes);
    }
    part = Ast.RulePart.Invocation(sel, invocation.channel, params);

    return part;
}

function codegenValue(arg) {
    if (arg.isVarRef) {
        switch (arg.name) {
        case '$event':
            return Ast.Expression.FunctionCall('eventToString', []);
        case '$event.title':
            return Ast.Expression.FunctionCall('eventToString', [Ast.Expression.Constant(Ast.Value.String('string-title'))]);
        case '$event.body':
            return Ast.Expression.FunctionCall('eventToString', [Ast.Expression.Constant(Ast.Value.String('string-body'))]);
        default:
            return Ast.Expression.VarRef(arg.name);
        }
    } else {
        return Ast.Expression.Constant(arg);
    }
}

function codegenTrigger(trigger) {
    var triggerParams = [];
    var triggerPredicates = [];
    var triggerConditions = [];
    if (trigger.resolved_args.length !== trigger.schema.schema.length)
        throw new Error('wrong number of arguments');
    if (trigger.schema.schema.length !== trigger.schema.args.length)
        throw new Error('corrupted schema');

    var triggerParams = trigger.resolved_args.map(function(arg, i) {
        if (arg === undefined)
            return Ast.Expression.VarRef(trigger.schema.args[i]);
        else
            return codegenValue(arg);
    }, this);
    trigger.resolved_conditions.map(function(cond) {
        var varRef = Ast.Expression.VarRef(cond.name);
        var value;
        if (cond.value.isVarRef)
            value = Ast.Expression.VarRef(conv.value.name);
        else
            value = Ast.Expression.Constant(cond.value);

        const BINARY_OPS = { 'is': '=', 'contains': '=~', '>': '>', '<': '<' };
        const FUNCTION_OPS = { 'has': 'contains' };

        if (cond.operator in BINARY_OPS)
            triggerConditions.push(Ast.Expression.BinaryOp(varRef, value, BINARY_OPS[cond.operator]));
        else if (cond.operator in FUNCTION_OPS)
            triggerConditions.push(Ast.Expression.FunctionCall(FUNCTION_OPS[cond.operator], [varRef, value]));
        else
            throw new Error('Unsupported operator ' + cond.operator);
    });

    var triggerPart = codegenInvocation(trigger, triggerParams);
    triggerConditions = triggerConditions.map((c) => Ast.RulePart.Condition(c));
    triggerPredicates = triggerPredicates.map((c) => Ast.RulePart.BuiltinPredicate(c));
    return [triggerPart].concat(triggerPredicates).concat(triggerConditions);
}

function codegenActionPart(action) {
    var actionParams = action.resolved_args.map(codegenValue);
    var actionPart = codegenInvocation(action, actionParams);
    return [actionPart];
}

function codegenRule(trigger, query, action, once) {
    var triggerAst = null;
    if (trigger !== null)
        triggerAst = codegenTrigger(trigger);
    var queryAst = null;
    if (query !== null)
        queryAst = codegenTrigger(query);

    var actionAst;
    if (action !== null) {
        actionAst = codegenActionPart(action);
    } else {
        var actionPart = Ast.RulePart.Invocation(Ast.Selector.Builtin, 'notify', []);
        actionAst = [actionPart];
    }

    if (triggerAst !== null) {
        var rule = Ast.Statement.Rule(triggerAst, queryAst !== null ? [queryAst] : [], actionAst, !!once);
    } else {
        var rule = Ast.Statement.Command(queryAst !== null ? [queryAst] : [], actionAst);
    }
    return rule;
}

function typeCompat(t1, t2) {
    try {
        Type.typeUnify(t1, t2);
        return true;
    } catch(e) {
        return false;
    }
}

function assignSlots(slots, prefilled, values, comparisons, fillAll, mustFill, scope, toFill) {
    var newScope = {};

    slots.forEach((slot, i) => {
        var found = false;
        for (var pre of prefilled) {
            if (pre.name !== slot.name)
                continue;

            if (pre.operator === 'is') {
                if (!pre.value.isVarRef)
                    Type.typeUnify(slot.type, Ast.typeForValue(pre.value));

                values[i] = pre.value;
                pre.assigned = true;
                found = true;
                break;
            }
        }

        if (!found) {
            values[i] = undefined;
            if (fillAll || mustFill.has(slot.name) || slot.required)
                toFill.push(i);
            else
                newScope[slot.name] = slot;
        }
    });

    prefilled.forEach((pre) => {
        var found = false;
        for (var slot of slots) {
            if (slot.name === pre.name) {
                found = true;
                break;
            }
        }

        if (!found)
            throw new Error("I don't know what to do with " + pre.name + " " + pre.operator + " " + pre.value);

        if (pre.assigned)
            return;

        comparisons.push(pre);
    });
    if (fillAll && comparisons.length > 0)
        throw new Error("Actions cannot have conditions");

    for (var name in newScope)
        scope[name] = newScope[name];
}

function parseTime(jsArg) {
    var split = jsArg.split(':');
    return { hour: parseInt(split[0]), minute: parseInt(split[1]), second: 0,
        year: -1, month: -1, day: -1 };
}
function parseDate(jsArg) {
    return { year: jsArg.getFullYear(), month: jsArg.getMonth() + 1, day: jsArg.getDate(),
        hour: jsArg.getHours(), minute: jsArg.getMinutes(), second: jsArg.getSeconds() };
}

function valueToJSON(type, value) {
    if (value.isVarRef)
        return ['VarRef', { id: 'tt:param.' + value.name }];
    var jsArg = Ast.valueToJS(value);

    if (type.isBoolean)
        return ['Bool', { value: jsArg }];
    if (type.isString)
        return ['String', { value: jsArg }];
    if (type.isNumber)
        return ['Number', { value: jsArg }];
    if (type.isEntity)
        return [String(type), { value: jsArg }];
    if (type.isMeasure) // don't use jsArg as that normalizes the unit
        return ['Measure', { value: value.value, unit: value.unit }];
    if (type.isEnum)
        return ['Enum', { value: jsArg }];
    if (type.isTime)
        return ['Time', parseTime(jsArg)];
    if (type.isDate)
        return ['Date', parseDate(jsArg)];
    if (type.isLocation)
        return ['Location', { relativeTag: 'absolute', latitude: jsArg.y, longitude: jsArg.x, display: jsArg.display }];
    throw new TypeError('Unhandled type ' + type);
}

function makeToken() {
    return crypto.randomBytes(16).toString('hex');
}

function isRemote(obj) {
    return obj && obj.principal && obj.kind !== 'remote';
}

function factorRule(messaging, rule) {
    var trigger = rule.trigger;
    var query = rule.query;
    var action = rule.action;

    var newrules = [];
    var sendrules = [];

    if (!trigger && !query && isRemote(action)) {
        // a pure action should result in nothing local and everything
        // sent out
        var toSend = {
            action: {
                name: {
                    id: 'tt:' + action.kind + '.' + action.channel
                },
                args: []
            }
        };
        var actionPrincipal = Ast.Value.Entity(action.principal, 'tt:contact');
        actionPrincipal.display = action.owner.display;
        sendrules.push([actionPrincipal, toSend]);
        action.schema.schema.forEach((type, i) => {
            if (action.resolved_args[i] !== undefined) {
                var [jsonType, jsonValue] = valueToJSON(type, action.resolved_args[i]);
                toSend.action.args.push({
                    name: { id: 'tt:param.' + action.schema.args[i] },
                    type: jsonType,
                    operator: 'is',
                    value: jsonValue
                });
            } else {
                throw new Error('unexpected undefined argument for action');
            }
        });

        return [newrules, sendrules];
    }

    if (isRemote(trigger)) {
        // factor out trigger

        var token = makeToken();
        var toSend = {
            trigger: {
                name: {
                    id: 'tt:' + trigger.kind + '.' + trigger.channel
                },
                args: []
            },
            action: {
                name: {
                    id: 'tt:remote.send'
                },
                dynamic_type: {
                    types: ['Entity(tt:contact)', 'Entity(tt:flow_token)'].concat(trigger.schema.schema.map(String)),
                    args: ['__principal', '__token'].concat(trigger.schema.args),
                    required: [true, true],
                },
                args: [{
                    name: { id: 'tt:param.__principal' },
                    type: 'Entity(tt:contact)',
                    operator: 'is',
                    value: { value: messaging.type + '-account:' + messaging.account }
                }, {
                    name: { id: 'tt:param.__token' },
                    type: 'Entity(tt:flow_token)',
                    operator: 'is',
                    value: { value: token }
                }]
            }
        };
        var triggerPrincipal = Ast.Value.Entity(trigger.principal, 'tt:contact');
        triggerPrincipal.display = trigger.owner.display;
        sendrules.push([triggerPrincipal, {rule: toSend}]);
        trigger.schema.schema.forEach((type, i) => {
            if (trigger.resolved_args[i] !== undefined) {
                var [jsonType, jsonValue] = valueToJSON(type, trigger.resolved_args[i]);
                toSend.trigger.args.push({
                    name: { id: 'tt:param.' + trigger.schema.args[i] },
                    type: jsonType,
                    operator: 'is',
                    value: jsonValue
                });
            }
            toSend.action.args.push({
                name: { id: 'tt:param.' + trigger.schema.args[i] },
                type: 'VarRef',
                operator: 'is',
                value: { id: 'tt:param.' + trigger.schema.args[i] }
            });
        });

        var oldKindChannel = 'trigger:' + trigger.kind + ':' + trigger.channel;
        trigger.kind = 'remote';
        trigger.channel = 'receive';
        trigger.schema = {
            schema: [Type.Entity('tt:contact'), Type.Entity('tt:flow_token'), Type.Entity('tt:function')].concat(trigger.schema.schema),
            args: ['__principal', '__token', '__kindChannel'].concat(trigger.schema.args),
            required: [true],
        };
        trigger.resolved_args = [Ast.Value.Entity(trigger.principal, 'tt:contact'),
            Ast.Value.Entity(token, 'tt:flow_token'),
            Ast.Value.Entity(oldKindChannel, 'tt:function')]
            .concat(trigger.resolved_args);
        trigger.owner = null;
        trigger.principal = null;
    }
    if (isRemote(query)) {
        var token1 = makeToken(), token2 = makeToken();
        var toSend = {};
        if (trigger) {
            toSend.trigger = {
                name: {
                    id: 'tt:remote.receive'
                },
                args: [{
                    name: { id: 'tt:param.__principal' },
                    type: 'Entity(tt:contact)',
                    operator: 'is',
                    value: { value: messaging.type + '-account:' + messaging.account }
                },
                {
                    name: { id: 'tt:param.__token' },
                    type: 'Entity(tt:flow_token)',
                    operator: 'is',
                    value: { value: token1 }
                },
                {
                    name: { id: 'tt:param.__kindChannel' },
                    type: 'Entity(tt:function)',
                    operator: 'is',
                    value: { value: 'query:' + query.kind + ':' + query.channel }
                }]
            };
            if (trigger.kind === 'remote' && trigger.channel === 'receive') {
                toSend.trigger.dynamic_type = {
                    types: trigger.schema.schema.map(String),
                    args: trigger.schema.args,
                    required: trigger.schema.required
                };
            } else {
                toSend.trigger.dynamic_type = {
                    types: ['Entity(tt:contact)', 'Entity(tt:flow_token)', 'Entity(tt:function)'].concat(trigger.schema.schema.map(String)),
                    args: ['__principal', '__token', '__kindChannel'].concat(trigger.schema.args),
                    required: [true, true, true]
                };
            }
        } else {
            toSend.trigger = null;
        }
        toSend.query = {
            name: {
                id: 'tt:' + query.kind + '.' + query.channel
            },
            args: []
        };
        toSend.action = {
            name: {
                id: 'tt:remote.send'
            },
            dynamic_type: {
                types: ['Entity(tt:contact)', 'Entity(tt:flow_token)'].concat(query.schema.schema.map(String)),
                args: ['__principal', '__token'].concat(query.schema.args),
                required: [true, true],
            },
            args: [{
                name: { id: 'tt:param.__principal' },
                type: 'Entity(tt:contact)',
                operator: 'is',
                value: { value: messaging.type + '-account:' + messaging.account }
            }, {
                name: { id: 'tt:param.__token' },
                type: 'Entity(tt:flow_token)',
                operator: 'is',
                value: { value: token2 }
            }]
        };
        var queryPrincipal = Ast.Value.Entity(query.principal, 'tt:contact');
        queryPrincipal.display = query.owner.display;
        sendrules.push([queryPrincipal, {rule: toSend}]);
        query.schema.schema.forEach((type, i) => {
            if (query.resolved_args[i] !== undefined) {
                var [jsonType, jsonValue] = valueToJSON(type, query.resolved_args[i]);
                toSend.query.args.push({
                    name: { id: 'tt:param.' + query.schema.args[i] },
                    type: jsonType,
                    operator: 'is',
                    value: jsonValue
                });
                toSend.action.args.push({
                    name: { id: 'tt:param.' + query.schema.args[i] },
                    type: jsonType,
                    operator: 'is',
                    value: jsonValue
                });
            } else {
                toSend.action.args.push({
                    name: { id: 'tt:param.' + query.schema.args[i] },
                    type: 'VarRef',
                    operator: 'is',
                    value: { id: 'tt:param.' + query.schema.args[i] }
                });
            }
        });

        if (trigger) {
            newrules.push({
                trigger: trigger,
                query: null,
                action: {
                    kind: 'remote',
                    id: query.id,
                    channel: 'send',
                    owner: null,
                    principal: null,
                    schema: {
                        schema: [Type.Entity('tt:contact'), Type.Entity('tt:flow_token')].concat(trigger.schema.schema),
                        args: ['__principal', '__token'].concat(trigger.schema.args),
                        required: [true]
                    },
                    resolved_args: [
                        Ast.Value.Entity(query.principal, 'tt:contact'),
                        Ast.Value.Entity(token1, 'tt:flow_token')].concat(trigger.schema.args.map((a, i) => {
                        if (trigger.resolved_args[i] !== undefined)
                            return trigger.resolved_args[i];
                        else
                            return Ast.Value.VarRef(a);
                    })),
                    resolved_conditions: []
                }
            });
        }
        newrules.push({
            trigger: {
                kind: 'remote',
                id: query.id,
                channel: 'receive',
                owner: null,
                principal: null,
                schema: {
                    schema: [Type.Entity('tt:contact'), Type.Entity('tt:flow_token'), Type.Entity('tt:function')].concat(query.schema.schema),
                    args: ['__principal', '__token', '__kindChannel'].concat(query.schema.args),
                    required: [true, true, true]
                },
                resolved_args: [Ast.Value.Entity(query.principal, 'tt:contact'),
                    Ast.Value.Entity(token2, 'tt:flow_token'),
                    Ast.Value.Entity('query:' + query.kind + ':' + query.channel, 'tt:function')]
                    .concat(query.schema.args.map((a) => Ast.Value.VarRef(a))),
                resolved_conditions: []
            },
            query: null,
            action: action
        });
    }
    if (isRemote(action)) {
        var token = makeToken();
        var toSend = {
            trigger: {
                name: {
                    id: 'tt:remote.receive'
                },
                args: [{
                    name: { id: 'tt:param.__principal' },
                    type: 'Entity(tt:contact)',
                    operator: 'is',
                    value: { value: messaging.type + '-account:' + messaging.account }
                },
                {
                    name: { id: 'tt:param.__token' },
                    type: 'Entity(tt:flow_token)',
                    operator: 'is',
                    value: { value: token }
                },
                {
                    name: { id: 'tt:param.__kindChannel' },
                    type: 'Entity(tt:function)',
                    operator: 'is',
                    value: { value: (query ? ('query:' + query.kind + ':' + query.channel) : ('trigger:' + trigger.kind + ':' + trigger.channel)) }
                }]
            },
            action: {
                name: {
                    id: 'tt:' + action.kind + '.' + action.channel
                },
                args: []
            }
        };
        var actionPrincipal = Ast.Value.Entity(action.principal, 'tt:contact');
        actionPrincipal.display = action.owner.display;
        sendrules.push([actionPrincipal, {rule: toSend}]);
        action.schema.schema.forEach((type, i) => {
            if (action.resolved_args[i] !== undefined) {
                var [jsonType, jsonValue] = valueToJSON(type, action.resolved_args[i]);
                toSend.action.args.push({
                    name: { id: 'tt:param.' + action.schema.args[i] },
                    type: jsonType,
                    operator: 'is',
                    value: jsonValue
                });
            } else {
                throw new Error('unexpected undefined argument for action');
            }
        });

        action.kind = 'remote';
        action.channel = 'send';

        if (query) {
            toSend.trigger.dynamic_type = {
                types: ['Entity(tt:contact)', 'Entity(tt:flow_token)', 'Entity(tt:function)'].concat(query.schema.schema.map(String)),
                args: ['__principal', '__token', '__kindChannel'].concat(query.schema.args),
                required: [true, true, true]
            };
            action.schema = {
                schema: [Type.Entity('tt:contact'), Type.Entity('tt:flow_token')].concat(query.schema.schema),
                args: ['__principal', '__token'].concat(query.schema.args),
                required: [true, true],
            };
            action.resolved_args = [Ast.Value.Entity(action.principal, 'tt:contact'),
                Ast.Value.Entity(token, 'tt:flow_token')]
                .concat(query.schema.args.map((a, i) => {
                if (query.resolved_args[i] !== undefined)
                    return query.resolved_args[i];
                else
                    return Ast.Value.VarRef(a);
            }));
        } else if (trigger) {
            if (trigger.kind === 'remote' && trigger.channel === 'receive') {
                toSend.trigger.dynamic_type = {
                    types: trigger.schema.schema.map(String),
                    args: trigger.schema.args,
                    required: trigger.schema.required
                };
                action.schema = {
                    schema: [Type.Entity('tt:contact'), Type.Entity('tt:flow_token')].concat(trigger.schema.schema.slice(3)),
                    args: ['__principal', '__token'].concat(trigger.schema.args.slice(3)),
                    required: [true, true],
                };
                action.resolved_args = [Ast.Value.Entity(action.principal, 'tt:contact'),
                    Ast.Value.Entity(token, 'tt:flow_token')]
                    .concat(trigger.schema.args.slice(3).map((a, i) => {
                    if (trigger.resolved_args[i] !== undefined)
                        return trigger.resolved_args[i];
                    else
                        return Ast.Value.VarRef(a);
                }));
                action.resolved_args[0] = Ast.Value.String(token);
            } else {
                toSend.trigger.dynamic_type = {
                    types: ['Entity(tt:contact)', 'Entity(tt:flow_token)', 'Entity(tt:function)'].concat(trigger.schema.schema.map(String)),
                    args: ['__principal', '__token', '__kindChannel'].concat(trigger.schema.args),
                    required: [true]
                };
                action.schema = {
                    schema: [Type.Entity('tt:contact'), Type.Entity('tt:flow_token')].concat(trigger.schema.schema),
                    args: ['__principal', '__token'].concat(trigger.schema.args),
                    required: [true],
                };
                action.resolved_args = [Ast.Value.Entity(action.principal, 'tt:contact'),
                    Ast.Value.Entity(token, 'tt:flow_token')]
                    .concat(trigger.schema.args.map((a, i) => {
                    if (trigger.resolved_args[i] !== undefined)
                        return trigger.resolved_args[i];
                    else
                        return Ast.Value.VarRef(a);
                }));
            }
        }
        action.principal = null;
        action.owner = null;
    }

    if (newrules.length === 0) {
        newrules.push({
            trigger: trigger,
            query: query,
            action: action
        });
    }

    return [newrules, sendrules];
}

module.exports = {
    capitalizeSelector: capitalizeSelector,
    codegenRule: codegenRule,
    assignSlots: assignSlots,
    factorRule: factorRule,
}
