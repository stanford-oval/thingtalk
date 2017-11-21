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

const Ast = require('./ast');
const Type = require('./type');
const Builtin = require('./builtin');
const {makeIndex} = require('./utils');

function notifyAction() {
    return new Ast.RulePart(Ast.Selector.Builtin, 'notify', [], Ast.BooleanExpression.True, [], Builtin.Actions.notify, null);
}

function primitiveProgram(primType, prim, principal = null) {
    var rule;
    if (primType === 'trigger')
        rule = new Ast.Rule(prim, [], [notifyAction()], false, null, null);
    else if (primType === 'query')
        rule = new Ast.Rule(null, [prim], [notifyAction()], false, null, null);
    else if (primType === 'action')
        rule = new Ast.Rule(null, [], [prim], false, null, null);
    return new Ast.Program('AlmondGenerated', [], [], [rule], principal);
}

function makeToken(state) {
    return state.token++;
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
        if (ast.isExternal) {
            let in_params = [];
            for (let in_param of ast.in_params) {
                if (in_param.value.isUndefined)
                    in_params.push(new Ast.InputParam(in_param.name, Ast.Value.Undefined(true)));
                else
                    in_params.push(in_param);
            }
            return new Ast.BooleanExpression.External(ast.selector, ast.channel, in_params, mapFilter(ast.filter), ast.schema);
        }
        if (ast.filter.value.isUndefined)
            return new Ast.BooleanExpression.Atom(Ast.Filter(ast.filter.name, ast.filter.operator, Ast.Value.Undefined(true)));
        return ast;
    }
    let ast = new Ast.RulePart(new Ast.Selector.Device(prim.selector.kind, null, null), prim.channel, in_params, mapFilter(prim.filter),
        prim.out_params, prim.schema, null);
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
            new Ast.Rule(null, [], [cloneRemote(action)], false, null, null)
        ], action.selector.principal);
        sendrules.push(toSend);
    });
    return actions.filter((a) => !toRemove.has(a));
}

function getSelf(messaging) {
    return Ast.Value.Entity(messaging.type + '-account:' + messaging.account, 'tt:contact', "me");
}


function makeSendSchema(sendFrom) {
    let args = ['__principal', '__program_id', '__flow', '__kindChannel'];
    let types = [Type.Entity('tt:contact_group'), Type.Entity('tt:program_id'), Type.Number, Type.Entity('tt:function')];
    let inReq = {
        __principal: Type.Entity('tt:contact_group'),
        __program_id: Type.Entity('tt:program_id'),
        __flow: Type.Number,
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
    let args = ['__principal', '__program_id', '__flow', '__kindChannel'];
    let types = [Type.Entity('tt:contact_group'), Type.Entity('tt:program_id'), Type.Number, Type.Entity('tt:function')];
    let inReq = {
        __principal: Type.Entity('tt:contact_group'),
        __program_id: Type.Entity('tt:program_id'),
        __flow: Type.Number,
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

function makeSingleGroup(principal) {
    if (principal.type === 'tt:contact' || principal.type === 'tt:contact_name')
        return Ast.Value.Array([principal]);
    else
        return principal;
}

function factorRemoteTrigger(state, messaging, trigger, newclasses, sendrules) {
    trigger.__kindChannel = 'trigger:' + trigger.selector.kind + ':' + trigger.channel;
    if (!isRemote(trigger))
        return;

    let token = makeToken(state);

    // a trigger is transformed in a trigger rule (remote) that
    // sends the data, and a receive rule (local) that continues on

    let sendSchema = makeSendSchema(trigger);
    let receiveSchema = makeReceiveSchema(trigger);
    let localClass = makeDynamicClass(newclasses, null, receiveSchema);
    let toSendClass = makeDynamicClass([], sendSchema, null);
    let triggerClone = cloneRemote(trigger);

    let sendInputs = [
        Ast.InputParam('__principal', makeSingleGroup(getSelf(messaging))),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow', Ast.Value.Number(token)),
        Ast.InputParam('__kindChannel', Ast.Value.Event('type'))]
         .concat(adjustInputParams(trigger.in_params))
         .concat(trigger.out_params.map((p) => Ast.InputParam(p.value, Ast.Value.VarRef(p.name))));
    let sendAction = new Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'send',
        sendInputs, Ast.BooleanExpression.True, [], sendSchema, null);
    let receiveInputs = [
        Ast.InputParam('__principal', makeSingleGroup(trigger.selector.principal)),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow', Ast.Value.Number(token)),
    ];
    let principal = trigger.selector.principal;
    trigger.selector = Ast.Selector.Device(localClass.name, null, null);
    trigger.channel = 'receive';
    trigger.in_params = receiveInputs;
    trigger.schema = receiveSchema;

    var toSend = new Ast.Program('AlmondGenerated', [], [toSendClass], [
        new Ast.Rule(triggerClone, [], [sendAction], false, null, null)
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

function factorRemoteQuery(state, messaging, query, previous, newrules, newclasses, sendrules) {
    query.__kindChannel = 'query:' + query.selector.kind + ':' + query.channel;
    if (!isRemote(query)) {
        previous.queries.push(query);
        return;
    }

    let token1 = makeToken(state), token2 = makeToken(state);
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
            Ast.InputParam('__principal', makeSingleGroup(principal)),
            Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
            Ast.InputParam('__flow',  Ast.Value.Number(token1)),
            Ast.InputParam('__kindChannel', Ast.Value.Event('type'))]
            .concat(adjustInputParams(lastPrimitive.in_params))
            .concat(lastPrimitive.out_params.map((p) => Ast.InputParam(p.value, Ast.Value.VarRef(p.name))));
        let sendAction = new Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'send',
            sendInputs, Ast.BooleanExpression.True, [], sendSchema, null);

        let receiveInputs = [
            Ast.InputParam('__principal', makeSingleGroup(getSelf(messaging))),
            Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
            Ast.InputParam('__flow',  Ast.Value.Number(token1))
        ];
        let receiveOutputs = lastPrimitive.out_params;
        let receiveTrigger = new Ast.RulePart(Ast.Selector.Device(localClass.name, null, null), 'receive',
            receiveInputs, Ast.BooleanExpression.True, receiveOutputs, receiveSchema, null);
        toSendTrigger = receiveTrigger;

        newrules.push(Ast.Rule(previous.trigger, previous.queries.slice(), [sendAction], false, null, null));
    }

    // then we run the query and send the result
    {
        let sendSchema = makeSendSchema(query);
        let receiveSchema = makeReceiveSchema(query);
        let localClass = makeDynamicClass(newclasses, null, receiveSchema);
        let toSendClass = makeDynamicClass(toSendClasses, sendSchema, null);

        let sendInputs = [
            Ast.InputParam('__principal', makeSingleGroup(getSelf(messaging))),
            Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
            Ast.InputParam('__flow',  Ast.Value.Number(token2)),
            Ast.InputParam('__kindChannel', Ast.Value.Event('type'))]
            .concat(adjustInputParams(query.in_params))
            .concat(query.out_params.map((p) => Ast.InputParam(p.value, Ast.Value.VarRef(p.name))));
        let sendAction = new Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'send',
            sendInputs, Ast.BooleanExpression.True, [], sendSchema, null);

        let receiveInputs = [
            Ast.InputParam('__principal', makeSingleGroup(principal)),
            Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
            Ast.InputParam('__flow',  Ast.Value.Number(token2))
        ];
        let receiveOutputs = query.out_params;
        let receiveTrigger = new Ast.RulePart(Ast.Selector.Device(localClass.name, null, null), 'receive',
            receiveInputs, Ast.BooleanExpression.True, receiveOutputs, receiveSchema, null);
        receiveTrigger.__kindChannel = query.___kindChannel;

        var toSend = new Ast.Program('AlmondGenerated', [], toSendClasses, [
            new Ast.Rule(toSendTrigger, [cloneRemote(query)], [sendAction], false, null, null)
        ], principal);
        sendrules.push(toSend);

        previous.trigger = receiveTrigger;
        previous.queries = [];
    }
}

function factorRemoteAction(state, messaging, action, previous, newclasses, sendrules) {
    if (!isRemote(action))
        return;
    let token = makeToken(state);
    let principal = action.selector.principal;

    let lastPrimitive = getLast(previous);
    assert(lastPrimitive !== null);

    let sendSchema = makeSendSchema(lastPrimitive);
    let receiveSchema = makeReceiveSchema(lastPrimitive);
    let localClass = makeDynamicClass(newclasses, sendSchema, null);
    let toSendClass = makeDynamicClass([], null, receiveSchema);

    var actionClone = cloneRemote(action);

    let sendInputs = [
        Ast.InputParam('__principal', makeSingleGroup(principal)),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow',  Ast.Value.Number(token)),
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
        Ast.InputParam('__principal', makeSingleGroup(getSelf(messaging))),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow',  Ast.Value.Number(token))
    ];
    let receiveOutputs = lastPrimitive.out_params;
    let receiveTrigger = new Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'receive',
        receiveInputs, Ast.BooleanExpression.True, receiveOutputs, receiveSchema, null);

    var toSend = new Ast.Program('AlmondGenerated', [], [toSendClass], [
        new Ast.Rule(receiveTrigger, [], [actionClone], false, null, null)
    ], principal);
    sendrules.push(toSend);
}

function factorRule(state, messaging, newclasses, rule) {
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
        factorRemoteTrigger(state, messaging, rule.trigger, newclasses, sendrules);
    let previous = PartialRule(rule.trigger, []);
    rule.queries.forEach((query) => {
        factorRemoteQuery(state, messaging, query, previous, newrules, newclasses, sendrules);
    });
    rule.actions.forEach((action) => {
        factorRemoteAction(state, messaging, action, previous, newclasses, sendrules);
    });

    // flush any remaining rule pieces after transforming the queries
    newrules.push(new Ast.Rule(previous.trigger, previous.queries, rule.actions, rule.once, rule.table, rule.tableschema));
    return [newrules, sendrules];
}

function factorProgram(messaging, program) {
    var newrules = [];
    var newclasses = program.classes;
    var sendrules = [];
    var state = { token: 0 };

    program.rules.forEach((r) => {
        let [subnewrules, subsendrules] = factorRule(state, messaging, newclasses, r);
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
function lowerReturnAction(state, messaging, action, lastPrimitive, principal, newclasses, ourrules) {
    if (!action.selector.isBuiltin || action.channel !== 'return')
        return;
    if (principal === null) {
        action.channel = 'notify';
        return;
    }

    let token = makeToken(state);
    assert(lastPrimitive !== null);

    let sendSchema = makeSendSchema(lastPrimitive);
    let receiveSchema = makeReceiveSchema(lastPrimitive);
    let localClass = makeDynamicClass(newclasses, sendSchema, null);
    let toSendClass = makeDynamicClass([], null, receiveSchema);

    let sendInputs = [
        Ast.InputParam('__principal', makeSingleGroup(getSelf(messaging))),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow',  Ast.Value.Number(token)),
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
        Ast.InputParam('__principal', makeSingleGroup(principal)),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow',  Ast.Value.Number(token))
    ];
    let receiveOutputs = lastPrimitive.out_params;
    let receiveTrigger = new Ast.RulePart(Ast.Selector.Device(toSendClass.name, null, null), 'receive',
        receiveInputs, Ast.BooleanExpression.True, receiveOutputs, receiveSchema, null);

    var ourrule = new Ast.Program('AlmondGenerated', [], [toSendClass], [
        Ast.Rule(receiveTrigger, [], [notifyAction()], false, null, null)
    ], null);
    ourrules.push(ourrule);
}

function lowerReturnRule(state, messaging, newclasses, rule, principal, ourrules) {
    let lastPrimitive = rule.trigger;
    if (rule.queries.length > 0)
        lastPrimitive = rule.queries[rule.queries.length-1];

    rule.actions.forEach((action) => {
        lowerReturnAction(state, messaging, action, lastPrimitive, principal, newclasses, ourrules);
    });
}

function lowerReturn(messaging, program) {
    let ourrules = [];
    let state = { token: 0 };
    program.rules.forEach((r) => {
        lowerReturnRule(state, messaging, program.classes, r, program.principal, ourrules);
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
        if (expr.isExternal) {
            for (let inParam of expr.in_params) {
                if (inParam.value.isUndefined && inParam.value.local)
                    toFill.push(inParam);
                else if (!inParam.value.isConcrete())
                    toConcretize.push(inParam);
            }
            return filterRecurse(expr.filter);
        } else {
            let filter = expr.filter;
            let value = filter.value;
            if (value.isUndefined && value.local)
                toFill.push(filter);
            else if (!value.isConcrete())
                toConcretize.push(filter);
            return undefined;
        }
    }
    filterRecurse(prim.filter);

    return [toFill, toConcretize];
}

module.exports = {
    notifyAction,
    primitiveProgram,
    factorProgram,
    computeSlots,
    lowerReturn
};
