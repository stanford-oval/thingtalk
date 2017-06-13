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

function notifyAction() {
    return Ast.RulePart(Ast.Selector.Builtin, 'notify', [], [], []);
}

function primitiveProgram(primType, prim) {
    var rule;
    if (primType === 'trigger')
        rule = Ast.Rule(prim, [], [notifyAction()], false);
    else if (primType === 'query')
        rule = Ast.Rule(null, [prim], [notifyAction()], false);
    else if (primType === 'action')
        rule = Ast.Rule(null, [], [prim], false);
    return Ast.Program('AlmondGenerated', [], [], [rule]);
}

function makeToken() {
    return crypto.randomBytes(16).toString('hex');
}

function isRemote(obj) {
    return obj && obj.selector.isDevice && obj.selector.principal !== null;
}

function cloneRemote(prim) {
    const in_params = prim.in_params.map((p) => p.value.isUndefined ? p.set({value: Ast.Value.Undefined(true)}) : p);
    const filters = prim.filters.map((p) => p.value.isUndefined ? p.set({value: Ast.Value.Undefined(true)}) : p);
    let ast = Ast.RulePart(Ast.Selector.Device(prim.selector.kind, null, null), prim.channel, in_params, filters, prim.out_params);
    ast.schema = prim.schema;
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

        var toSend = Ast.Program('AlmondGenerated', [], [
            Ast.Rule(null, [], [cloneRemote(action)], false)
        ]);
        sendrules.push([action.selector.principal, toSend]);
    });
    return actions.filter((a) => !toRemove.has(a));
}

function getSelf(messaging) {
    return Ast.Value.Entity(messaging.type + '-account:' + messaging.account, 'tt:contact', null);
}
function makeIndex(args) {
    var index = {};
    var i = 0;
    for (var a of args)
        index[a] = i++;
    return index;
}

function makeSendSchema(sendFrom) {
    let args = ['__principal', '__token'];
    let inReq = {
        __principal: Type.Entity('tt:contact'),
        __token: Type.Entity('tt:flow_token')
    };
    let inOpt = {};
    for (let argname of sendFrom.schema.args) {
        args.push(argname);
        inOpt[argname] = sendFrom.schema.inReq[argname] || sendFrom.schema.inOpt[argname] || sendFrom.schema.out[argname];
    }

    return {
        kind_type: 'other',
        args: args,
        index: makeIndex(args),
        inReq: inReq,
        inOpt: inOpt,
        out: {},
        confirmation: '',
        confirmation_remote: '',
        argcanonicals: [],
        questions: [],
    };
}
function makeReceiveSchema(receiveFrom) {
    let args = ['__principal', '__token', '__kindChannel'];
    let inReq = {
        __principal: Type.Entity('tt:contact'),
        __token: Type.Entity('tt:flow_token'),
        __kindChannel: Type.Entity('tt:function'),
    };
    let out = {};
    for (let argname of receiveFrom.schema.args) {
        args.push(argname);
        out[argname] = receiveFrom.schema.inReq[argname] || receiveFrom.schema.inOpt[argname] || receiveFrom.schema.out[argname];
    }

    return {
        kind_type: 'other',
        args: args,
        index: makeIndex(args),
        inReq: inReq,
        inOpt: {},
        out: out,
        confirmation: '',
        confirmation_remote: '',
        argcanonicals: [],
        questions: [],
    };
}

function makeDynamicClass(classes, sendSchema, receiveSchema) {
    var classdef = Ast.ClassDef('__dyn_' + classes.length, 'remote',
        {}, {}, {});
    if (sendSchema)
        classdef.actions.send = sendSchema;
    if (receiveSchema)
        classdef.triggers.receive = receiveSchema;
    classes.push(classdef);
    return classdef;
}

function adjustInputParam(p) {
    if (p.value.isUndefined)
        return Ast.InputParam(p.name, Ast.Value.Null);
    else
        return Ast.InputParam(p.name, p.value);
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
        Ast.InputParam('__token',  Ast.Value.Entity(token, 'tt:flow_token', null))]
         .concat(trigger.in_params.map((p) => adjustInputParam(p)))
         .concat(trigger.out_params.map((p) => Ast.InputParam(p.value, Ast.Value.VarRef(p.name))));
    let sendAction = Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'send',
        sendInputs, [], []);
    sendAction.schema = sendSchema;
    let receiveInputs = [
        Ast.InputParam('__principal', trigger.selector.principal),
        Ast.InputParam('__token',  Ast.Value.Entity(token, 'tt:flow_token', null)),
        Ast.InputParam('__kindChannel', Ast.Value.Entity(trigger.__kindChannel, 'tt:function', null))
    ];
    let principal = trigger.selector.principal;
    trigger.selector = Ast.Selector.Device(localClass.name, null, null);
    trigger.channel = 'receive';
    trigger.in_params = receiveInputs;
    trigger.schema = receiveSchema;

    var toSend = Ast.Program('AlmondGenerated', [], [toSendClass], [
        Ast.Rule(triggerClone, [], [sendAction], false)
    ]);
    sendrules.push([principal, toSend]);
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
            Ast.InputParam('__token',  Ast.Value.Entity(token1, 'tt:flow_token', null))]
            .concat(lastPrimitive.in_params.map((p) => adjustInputParam(p)))
            .concat(lastPrimitive.out_params.map((p) => Ast.InputParam(p.value, Ast.Value.VarRef(p.name))));
        let sendAction = Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'send',
            sendInputs, [], []);
        sendAction.schema = sendSchema;

        let receiveInputs = [
            Ast.InputParam('__principal', getSelf(messaging)),
            Ast.InputParam('__token',  Ast.Value.Entity(token1, 'tt:flow_token', null)),
            Ast.InputParam('__kindChannel', Ast.Value.Entity(lastPrimitive.__kindChannel, 'tt:function', null))
        ];
        let receiveOutputs = lastPrimitive.out_params;
        let receiveTrigger = Ast.RulePart(Ast.Selector.Device(localClass.name, null, null), 'receive',
            receiveInputs, [], receiveOutputs);
        receiveTrigger.schema = receiveSchema;
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
            Ast.InputParam('__token',  Ast.Value.Entity(token2, 'tt:flow_token', null))]
            .concat(query.in_params.map((p) => adjustInputParam(p)))
            .concat(query.out_params.map((p) => Ast.InputParam(p.value, Ast.Value.VarRef(p.name))));
        let sendAction = Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'send',
            sendInputs, [], []);
        sendAction.schema = sendSchema;

        let receiveInputs = [
            Ast.InputParam('__principal', principal),
            Ast.InputParam('__token',  Ast.Value.Entity(token2, 'tt:flow_token', null)),
            Ast.InputParam('__kindChannel', Ast.Value.Entity(query.__kindChannel, 'tt:function', null))
        ];
        let receiveOutputs = query.out_params;
        let receiveTrigger = Ast.RulePart(Ast.Selector.Device(localClass.name, null, null), 'receive',
            receiveInputs, [], receiveOutputs);
        receiveTrigger.schema = receiveSchema;
        receiveTrigger.__kindChannel = query.___kindChannel;

        var toSend = Ast.Program('AlmondGenerated', [], toSendClasses, [
            Ast.Rule(toSendTrigger, [cloneRemote(query)], [sendAction], false)
        ]);
        sendrules.push([principal, toSend]);

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
        Ast.InputParam('__token',  Ast.Value.Entity(token, 'tt:flow_token', null))]
        .concat(lastPrimitive.in_params.map((p) => adjustInputParam(p)))
        .concat(lastPrimitive.out_params.map((p) => Ast.InputParam(p.value,  Ast.Value.VarRef(p.name))));
    action.selector = Ast.Selector.Device(localClass.name, null, null);
    action.channel = 'send';
    action.in_params = sendInputs;
    action.out_params = [];
    action.filters = [];
    action.schema = sendSchema;

    let receiveInputs = [
        Ast.InputParam('__principal', getSelf(messaging)),
        Ast.InputParam('__token',  Ast.Value.Entity(token, 'tt:flow_token', null)),
        Ast.InputParam('__kindChannel', Ast.Value.Entity(lastPrimitive.__kindChannel, 'tt:function', null))
    ];
    let receiveOutputs = lastPrimitive.out_params;
    let receiveTrigger = Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'receive',
        receiveInputs, [], receiveOutputs);
    receiveTrigger.schema = receiveSchema;

    var toSend = Ast.Program('AlmondGenerated', [], [toSendClass], [
        Ast.Rule(receiveTrigger, [], [actionClone], false)
    ]);
    sendrules.push([principal, toSend]);
}

function factorRule(messaging, newclasses, rule) {
    let newrules = [];
    let sendrules = [];

    if (!rule.trigger && rule.queries.length === 0) {
        rule.actions = factorPureRemoteActions(messaging, rule.actions, sendrules);
        if (rule.actions.length === 0)
            return [[], [], sendrules];
        else
            return [[rule], [], sendrules];
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
        return [Ast.Program(program.name, program.params, newclasses, newrules), sendrules];
}

module.exports = {
    primitiveProgram: primitiveProgram,
    factorProgram: factorProgram,
};
