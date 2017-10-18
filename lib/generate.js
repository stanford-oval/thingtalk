// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const adt = require('adt');
const assert = require('assert');
const crypto = require('crypto');

const Ast = require('./ast');
const Type = require('./type');
const Builtin = require('./builtin');

function notifyAction() {
    return Ast.RulePart(Ast.Selector.Builtin, 'notify', [], Ast.BooleanExpression.True, [], Builtin.Actions.notify);
}

function primitiveProgram(primType, prim, principal = null) {
    var rule;
    if (primType === 'trigger')
        rule = Ast.Rule(prim, [], [notifyAction()], false);
    else if (primType === 'query')
        rule = Ast.Rule(null, [prim], [notifyAction()], false);
    else if (primType === 'action')
        rule = Ast.Rule(null, [], [prim], false);
    return new Ast.Program('AlmondGenerated', [], [], [rule], principal);
}

function makeToken() {
    return crypto.randomBytes(16).toString('hex');
}

function isRemote(obj) {
    return obj && obj.selector.isDevice && obj.selector.principal !== null;
}

function cloneRemote(prim) {
    const in_params = prim.in_params.map((p) => p.value.isUndefined ? p.set({value: Ast.Value.Undefined(true)}) : p);
    function mapFilter(ast) {
        if (ast.isTrue || ast.isFalse)
            return ast;
        if (ast.isAnd)
            return Ast.BooleanExpression.And(ast.operands.map(mapFilter));
        if (ast.isOr)
            return Ast.BooleanExpression.Or(ast.operands.map(mapFilter));
        if (ast.isNot)
            return Ast.BooleanExpression.Not(mapFilter(ast.expr));
        if (ast.filter.value.isUndefined)
            return Ast.BooleanExpression.Atom(Ast.Filter(ast.filter.name, ast.filter.operator, Ast.Value.Undefined(true)));
        return ast;
    }
    let ast = Ast.RulePart(Ast.Selector.Device(prim.selector.kind, null, null), prim.channel, in_params, mapFilter(prim.filter),
        prim.out_params, prim.schema);
    return ast;
}

function factorPureRemoteActions(messaging, actions, sendrules) {
    var toRemove = new Set;
    actions.forEach((action) => {
        if (!isRemote(action))
            return;

        toRemove.add(action);
        // a pure action should result in nothing local and everything
        // sent out

        var toSend = new Ast.Program('AlmondGenerated', [], [], [
            new Ast.Rule(null, [], [cloneRemote(action)], false)
        ], action.selector.principal);
        sendrules.push(toSend);
    });
    return actions.filter((a) => !toRemove.has(a));
}

function getSelf(messaging) {
    return Ast.Value.Entity(messaging.type + '-account:' + messaging.account, 'tt:contact', "me");
}
function makeIndex(args) {
    var index = {};
    var i = 0;
    for (var a of args)
        index[a] = i++;
    return index;
}

function makeSendSchema(sendFrom) {
    let args = ['__principal', '__token', '__kindChannel'];
    let types = [Type.Entity('tt:contact'), Type.Entity('tt:flow_token'), Type.Entity('tt:function')];
    let inReq = {
        __principal: Type.Entity('tt:contact'),
        __token: Type.Entity('tt:flow_token'),
        __kindChannel: Type.Entity('tt:function')
    };
    let inOpt = {};
    for (let argname of sendFrom.schema.args) {
        args.push(argname);
        let type = sendFrom.schema.inReq[argname] || sendFrom.schema.inOpt[argname] || sendFrom.schema.out[argname];
        types.push(type);
        inOpt[argname] = type;
    }

    return new Ast.FunctionDef('other',
        args, types, makeIndex(args),
        inReq, inOpt, {},
        '', // canonical
        '', // confirmation
        '', // confirmation_remote
        [], // argcanonicals
        [] // questions
    );
}
function makeReceiveSchema(receiveFrom) {
    let args = ['__principal', '__token', '__kindChannel'];
    let types = [Type.Entity('tt:contact'), Type.Entity('tt:flow_token'), Type.Entity('tt:function')];
    let inReq = {
        __principal: Type.Entity('tt:contact'),
        __token: Type.Entity('tt:flow_token'),
    };
    let out = {
        __kindChannel: Type.Entity('tt:function'),
    };
    for (let argname of receiveFrom.schema.args) {
        args.push(argname);
        let type = receiveFrom.schema.inReq[argname] || receiveFrom.schema.inOpt[argname] || receiveFrom.schema.out[argname];
        types.push(type);
        out[argname] = type;
    }

    return new Ast.FunctionDef('other',
        args, types, makeIndex(args),
        inReq, {}, out,
        '', // canonical
        '', // confirmation
        '', // confirmation_remote
        [], // argcanonicals
        [] // questions
    );
}

function makeDynamicClass(classes, sendSchema, receiveSchema) {
    var classdef = Ast.ClassDef('__dyn_' + classes.length, 'org.thingpedia.builtin.thingengine.remote',
        {}, {}, {});
    if (sendSchema)
        classdef.actions.send = sendSchema;
    if (receiveSchema)
        classdef.triggers.receive = receiveSchema;
    classes.push(classdef);
    return classdef;
}

function adjustInputParams(params) {
    return params.filter((p) => !p.value.isUndefined);
}

function factorRemoteTrigger(messaging, trigger, newclasses, sendrules) {
    trigger.__kindChannel = 'trigger:' + trigger.selector.kind + ':' + trigger.channel;
    if (!isRemote(trigger))
        return;

    let token = makeToken();

    // a trigger is transformed in a trigger rule (remote) that
    // sends the data, and a receive rule (local) that continues on

    let sendSchema = makeSendSchema(trigger);
    let receiveSchema = makeReceiveSchema(trigger);
    let localClass = makeDynamicClass(newclasses, null, receiveSchema);
    let toSendClass = makeDynamicClass([], sendSchema, null);
    let triggerClone = cloneRemote(trigger);

    let sendInputs = [
        Ast.InputParam('__principal', getSelf(messaging)),
        Ast.InputParam('__token',  Ast.Value.Entity(token, 'tt:flow_token', null)),
        Ast.InputParam('__kindChannel', Ast.Value.Event('type'))]
         .concat(adjustInputParams(trigger.in_params))
         .concat(trigger.out_params.map((p) => Ast.InputParam(p.value, Ast.Value.VarRef(p.name))));
    let sendAction = Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'send',
        sendInputs, Ast.BooleanExpression.True, [], sendSchema);
    let receiveInputs = [
        Ast.InputParam('__principal', trigger.selector.principal),
        Ast.InputParam('__token',  Ast.Value.Entity(token, 'tt:flow_token', null)),
    ];
    let principal = trigger.selector.principal;
    trigger.selector = Ast.Selector.Device(localClass.name, null, null);
    trigger.channel = 'receive';
    trigger.in_params = receiveInputs;
    trigger.schema = receiveSchema;

    var toSend = new Ast.Program('AlmondGenerated', [], [toSendClass], [
        Ast.Rule(triggerClone, [], [sendAction], false)
    ], principal);
    sendrules.push(toSend);
}

const PartialRule = adt.newtype('PartialRule', {
    trigger: adt.only(Ast.RulePart, null),
    queries: adt.only(Array) // of Ast.RulePart
});
function getLast(partial) {
    if (partial.queries.length > 0)
        return partial.queries[partial.queries.length - 1];
    else
        return partial.trigger;
}

function factorRemoteQuery(messaging, query, previous, newrules, newclasses, sendrules) {
    query.__kindChannel = 'query:' + query.selector.kind + ':' + query.channel;
    if (!isRemote(query)) {
        previous.queries.push(query);
        return;
    }

    let token1 = makeToken(), token2 = makeToken();
    let principal = query.selector.principal;

    // first the part before the query: we must send whatever data we have to the remote guy
    let lastPrimitive = getLast(previous);
    let toSendTrigger = null;
    let toSendClasses = [];
    if (lastPrimitive !== null) {
        let sendSchema = makeSendSchema(lastPrimitive);
        let receiveSchema = makeReceiveSchema(lastPrimitive);
        let localClass = makeDynamicClass(newclasses, sendSchema, null);
        let toSendClass = makeDynamicClass(toSendClasses, null, receiveSchema);

        let sendInputs = [
            Ast.InputParam('__principal', principal),
            Ast.InputParam('__token',  Ast.Value.Entity(token1, 'tt:flow_token', null)),
            Ast.InputParam('__kindChannel', Ast.Value.Event('type'))]
            .concat(adjustInputParams(lastPrimitive.in_params))
            .concat(lastPrimitive.out_params.map((p) => Ast.InputParam(p.value, Ast.Value.VarRef(p.name))));
        let sendAction = Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'send',
            sendInputs, Ast.BooleanExpression.True, [], sendSchema);

        let receiveInputs = [
            Ast.InputParam('__principal', getSelf(messaging)),
            Ast.InputParam('__token',  Ast.Value.Entity(token1, 'tt:flow_token', null))
        ];
        let receiveOutputs = lastPrimitive.out_params;
        let receiveTrigger = Ast.RulePart(Ast.Selector.Device(localClass.name, null, null), 'receive',
            receiveInputs, Ast.BooleanExpression.True, receiveOutputs, receiveSchema);
        toSendTrigger = receiveTrigger;

        newrules.push(Ast.Rule(previous.trigger, previous.queries.slice(), [sendAction], false));
    }

    // then we run the query and send the result
    {
        let sendSchema = makeSendSchema(query);
        let receiveSchema = makeReceiveSchema(query);
        let localClass = makeDynamicClass(newclasses, null, receiveSchema);
        let toSendClass = makeDynamicClass(toSendClasses, sendSchema, null);

        let sendInputs = [
            Ast.InputParam('__principal', getSelf(messaging)),
            Ast.InputParam('__token',  Ast.Value.Entity(token2, 'tt:flow_token', null)),
            Ast.InputParam('__kindChannel', Ast.Value.Event('type'))]
            .concat(adjustInputParams(query.in_params))
            .concat(query.out_params.map((p) => Ast.InputParam(p.value, Ast.Value.VarRef(p.name))));
        let sendAction = Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'send',
            sendInputs, Ast.BooleanExpression.True, [], sendSchema);

        let receiveInputs = [
            Ast.InputParam('__principal', principal),
            Ast.InputParam('__token',  Ast.Value.Entity(token2, 'tt:flow_token', null))
        ];
        let receiveOutputs = query.out_params;
        let receiveTrigger = Ast.RulePart(Ast.Selector.Device(localClass.name, null, null), 'receive',
            receiveInputs, Ast.BooleanExpression.True, receiveOutputs, receiveSchema);
        receiveTrigger.__kindChannel = query.___kindChannel;

        var toSend = new Ast.Program('AlmondGenerated', [], toSendClasses, [
            Ast.Rule(toSendTrigger, [cloneRemote(query)], [sendAction], false)
        ], principal);
        sendrules.push(toSend);

        previous.trigger = receiveTrigger;
        previous.queries = [];
    }
}

function factorRemoteAction(messaging, action, previous, newclasses, sendrules) {
    if (!isRemote(action))
        return;
    let token = makeToken();
    let principal = action.selector.principal;

    let lastPrimitive = getLast(previous);
    assert(lastPrimitive !== null);

    let sendSchema = makeSendSchema(lastPrimitive);
    let receiveSchema = makeReceiveSchema(lastPrimitive);
    let localClass = makeDynamicClass(newclasses, sendSchema, null);
    let toSendClass = makeDynamicClass([], null, receiveSchema);

    var actionClone = cloneRemote(action);

    let sendInputs = [
        Ast.InputParam('__principal', principal),
        Ast.InputParam('__token',  Ast.Value.Entity(token, 'tt:flow_token', null)),
        Ast.InputParam('__kindChannel', Ast.Value.Event('type'))]
        .concat(adjustInputParams(lastPrimitive.in_params))
        .concat(lastPrimitive.out_params.map((p) => Ast.InputParam(p.value,  Ast.Value.VarRef(p.name))));
    action.selector = Ast.Selector.Device(localClass.name, null, null);
    action.channel = 'send';
    action.in_params = sendInputs;
    action.out_params = [];
    action.filters = [];
    action.schema = sendSchema;

    let receiveInputs = [
        Ast.InputParam('__principal', getSelf(messaging)),
        Ast.InputParam('__token',  Ast.Value.Entity(token, 'tt:flow_token', null))
    ];
    let receiveOutputs = lastPrimitive.out_params;
    let receiveTrigger = Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'receive',
        receiveInputs, Ast.BooleanExpression.True, receiveOutputs, receiveSchema);

    var toSend = new Ast.Program('AlmondGenerated', [], [toSendClass], [
        Ast.Rule(receiveTrigger, [], [actionClone], false)
    ], principal);
    sendrules.push(toSend);
}

function factorRule(messaging, newclasses, rule) {
    let newrules = [];
    let sendrules = [];

    if (!rule.trigger && rule.queries.length === 0) {
        rule.actions = factorPureRemoteActions(messaging, rule.actions, sendrules);
        if (rule.actions.length === 0)
            return [[], sendrules];
        else
            return [[rule], sendrules];
    }

    if (rule.trigger !== null)
        factorRemoteTrigger(messaging, rule.trigger, newclasses, sendrules);
    let previous = PartialRule(rule.trigger, []);
    rule.queries.forEach((query) => {
        factorRemoteQuery(messaging, query, previous, newrules, newclasses, sendrules);
    });
    rule.actions.forEach((action) => {
        factorRemoteAction(messaging, action, previous, newclasses, sendrules);
    });

    // flush any remaining rule pieces after transforming the queries
    newrules.push(Ast.Rule(previous.trigger, previous.queries, rule.actions, rule.once));
    return [newrules, sendrules];
}

function factorProgram(messaging, program) {
    var newrules = [];
    var newclasses = program.classes;
    var sendrules = [];

    program.rules.forEach((r) => {
        let [subnewrules, subsendrules] = factorRule(messaging, newclasses, r);
        newrules = newrules.concat(subnewrules);
        sendrules = sendrules.concat(subsendrules);
    });
    if (newrules.length === 0)
        return [null, sendrules];
    else
        return [new Ast.Program(program.name, program.params, newclasses, newrules, null), sendrules];
}

// note: this is similar to factorRemoteAction, but self/remote are flipped
// the "lowered" action is what will be shipped out as a blob, whereas ourrules is what
// we need to run locally to receive the results
//
// because we don't mess with queries, we never need to split something in more than one piece
// which drastically simplifies the implementation
function lowerReturnAction(messaging, action, lastPrimitive, principal, newclasses, ourrules) {
    if (!action.selector.isBuiltin || action.channel !== 'return')
        return;
    if (principal === null) {
        action.channel = 'notify';
        return;
    }

    let token = makeToken();
    assert(lastPrimitive !== null);

    let sendSchema = makeSendSchema(lastPrimitive);
    let receiveSchema = makeReceiveSchema(lastPrimitive);
    let localClass = makeDynamicClass(newclasses, sendSchema, null);
    let toSendClass = makeDynamicClass([], null, receiveSchema);

    let sendInputs = [
        Ast.InputParam('__principal', getSelf(messaging)),
        Ast.InputParam('__token',  Ast.Value.Entity(token, 'tt:flow_token', null)),
        Ast.InputParam('__kindChannel', Ast.Value.Event('type'))]
        .concat(adjustInputParams(lastPrimitive.in_params))
        .concat(lastPrimitive.out_params.map((p) => Ast.InputParam(p.value,  Ast.Value.VarRef(p.name))));
    action.selector = Ast.Selector.Device(localClass.name, null, null);
    action.channel = 'send';
    action.in_params = sendInputs;
    action.out_params = [];
    action.filters = [];
    action.schema = sendSchema;

    let receiveInputs = [
        Ast.InputParam('__principal', principal),
        Ast.InputParam('__token',  Ast.Value.Entity(token, 'tt:flow_token', null))
    ];
    let receiveOutputs = lastPrimitive.out_params;
    let receiveTrigger = Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'receive',
        receiveInputs, Ast.BooleanExpression.True, receiveOutputs, receiveSchema);

    var ourrule = new Ast.Program('AlmondGenerated', [], [toSendClass], [
        Ast.Rule(receiveTrigger, [], [notifyAction()], false)
    ], null);
    ourrules.push(ourrule);
}

function lowerReturnRule(messaging, newclasses, rule, principal, ourrules) {
    let lastPrimitive = rule.trigger;
    if (rule.queries.length > 0)
        lastPrimitive = rule.queries[rule.queries.length-1];

    rule.actions.forEach((action) => {
        lowerReturnAction(messaging, action, lastPrimitive, principal, newclasses, ourrules);
    });
}

function lowerReturn(messaging, program) {
    var newrules = [];
    var newclasses = program.classes;
    var ourrules = [];

    program.rules.forEach((r) => {
        lowerReturnRule(messaging, newclasses, r, program.principal, ourrules);
    });
    return ourrules;
}

function computeSlots(prim) {
    let toFill = [], toConcretize = [];
    for (let inParam of prim.in_params) {
        if (inParam.value.isUndefined && inParam.value.local)
            toFill.push(inParam);
        if (inParam.value.isEntity &&
            (inParam.value.type === 'tt:contact' && !inParam.value.display) ||
            inParam.value.type === 'tt:contact_name')
            toConcretize.push(inParam);
        if (inParam.value.isLocation && inParam.value.value.isRelative)
            toConcretize.push(inParam);
    }
    function filterRecurse(expr) {
        if (expr.isTrue || expr.isFalse)
            return undefined;
        if (expr.isAnd || expr.isOr)
            return expr.operands.forEach(filterRecurse);
        if (expr.isNot)
            return filterRecurse(expr.expr);

        let filter = expr.filter;
        let value = filter.value;
        if (value.isUndefined && value.isLocation)
            toFill.push(filter);
        else if (!value.isConcrete())
            toConcretize.push(filter);
        return undefined;
    }
    filterRecurse(prim.filter);

    return [toFill, toConcretize];
}

function getFlowTokens(program) {
    let tokens = new Set;

    function extractTokensInvocation(invocation) {
        for (let inParam of invocation.in_params) {
            if (inParam.value.isEntity && inParam.value.type === 'tt:flow_token')
                tokens.add(inParam.value.value);
        }
    }

    for (let rule of program.rules) {
        if (rule.trigger)
            extractTokensInvocation(rule.trigger, tokens);
        for (let query of rule.queries)
            extractTokensInvocation(query, tokens);
        for (let action of rule.actions)
            extractTokensInvocation(action, tokens);
    }

    return tokens;
}

module.exports = {
    notifyAction,
    primitiveProgram,
    factorProgram,
    computeSlots,
    getFlowTokens,
    lowerReturn
};
