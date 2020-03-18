// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Type = require('../type');
const { Value } = require('./values');
const {
    ArgumentDef,
    ArgDirection,
    FunctionDef
} = require('./function_def');
const {
    Selector,
    Invocation,
    InputParam
} = require('./expression');
const { Stream, Table, Action } = require('./primitive');
// we cannot unpack here, due to cyclic require()'s
const ClassDefAst = require('./class_def');
const ProgramAst = require('./program');

function makeToken(state) {
    return state.token++;
}

function getSelf(messaging, sendTo) {
    if (messaging.getSelf)
        return new Value.Entity(messaging.getSelf(sendTo.value), 'tt:contact', "me");
    else
        return new Value.Entity(messaging.type + '-account:' + messaging.account, 'tt:contact', "me");
}

function makeSendSchema(sendFrom, secondSendFrom) {
    const args = [
        new ArgumentDef(null, ArgDirection.IN_REQ, '__principal', Type.Entity('tt:contact')),
        new ArgumentDef(null, ArgDirection.IN_REQ, '__program_id', Type.Entity('tt:program_id')),
        new ArgumentDef(null, ArgDirection.IN_REQ, '__flow', Type.Number),
        new ArgumentDef(null, ArgDirection.IN_REQ, '__kindChannel', Type.Entity('tt:function')),
        new ArgumentDef(null, ArgDirection.IN_OPT, '__response', Type.String)
    ];
    for (let argname in sendFrom.schema.out)
        args.push(new ArgumentDef(null, ArgDirection.IN_REQ, argname, sendFrom.schema.out[argname]));
    return new FunctionDef(null, 'action', null, 'send', [], {}, args, {});
}
function makeReceiveSchema(receiveFrom) {
    const args = [
        new ArgumentDef(null, ArgDirection.IN_REQ, '__principal', Type.Entity('tt:contact')),
        new ArgumentDef(null, ArgDirection.IN_REQ, '__program_id', Type.Entity('tt:program_id')),
        new ArgumentDef(null, ArgDirection.IN_REQ, '__flow', Type.Number),
        new ArgumentDef(null, ArgDirection.OUT, '__kindChannel', Type.Entity('tt:function')),
        new ArgumentDef(null, ArgDirection.OUT, '__response', Type.String)
    ];
    for (let argname in receiveFrom.schema.out)
        args.push(new ArgumentDef(null, ArgDirection.OUT, argname, receiveFrom.schema.out[argname]));

    return new FunctionDef(null, 'query', null, 'receive', [], { is_list: true, is_monitorable: true}, args, {});
}

function makeDynamicClass(classes, sendSchema, receiveSchema) {
    var classdef = new ClassDefAst.ClassDef(null, '__dyn_' + classes.length, ['org.thingpedia.builtin.thingengine.remote'],
        {}, {});
    if (sendSchema)
        classdef.actions.send = sendSchema;
    if (receiveSchema)
        classdef.queries.receive = receiveSchema;
    classes.push(classdef);
    return classdef;
}

// note: this is similar to factorRemoteAction, but self/remote are flipped
// the "lowered" action is what will be shipped out as a blob, whereas ourrules is what
// we need to run locally to receive the results
//
// because we don't mess with queries, we never need to split something in more than one piece
// which drastically simplifies the implementation
function lowerReturnAction(state, action, lastPrimitive, principal) {
    if (!action.isNotify || action.name !== 'return')
        return action;
    if (principal === null || lastPrimitive === null) {
        action.name = 'notify';
        return action;
    }
    assert(lastPrimitive);

    let token = makeToken(state);
    let sendSchema = makeSendSchema(lastPrimitive);
    let receiveSchema = makeReceiveSchema(lastPrimitive);
    let localClass = makeDynamicClass(state.newclasses, sendSchema, null);
    let toSendClass = makeDynamicClass([], null, receiveSchema);

    let sendInputs = [
        new InputParam(null, '__principal', getSelf(state.messaging, principal)),
        new InputParam(null, '__program_id', new Value.Event('program_id')),
        new InputParam(null, '__flow', new Value.Number(token)),
        new InputParam(null, '__kindChannel', new Value.Event('type'))
    ];
    for (let name in lastPrimitive.schema.out)
        sendInputs.push(new InputParam(null, name, new Value.VarRef(name)));

    const newAction = new Action.Invocation(action.location,
        new Invocation(action.location,
            new Selector.Device(action.location, localClass.name, null, null),
            'send',
            sendInputs,
            sendSchema),
        null);

    let receiveInputs = [
        new InputParam(null, '__principal', principal),
        new InputParam(null, '__program_id', new Value.Event('program_id')),
        new InputParam(null, '__flow', new Value.Number(token))
    ];
    let receiveTrigger = new Stream.Monitor(
        null,
        new Table.Invocation(
            null,
            new Invocation(null,
                new Selector.Device(null, toSendClass.name, null, null),
                'receive', receiveInputs, receiveSchema),
        receiveSchema),
    null, receiveSchema);

    var ourrule = new ProgramAst.Program(null, [toSendClass], [], [
        new ProgramAst.Statement.Rule(null, receiveTrigger, [Action.notifyAction()])
    ], null);
    state.ourrules.push(ourrule);

    return newAction;
}

function lowerReturnRule(state, rule, principal) {
    const lastPrimitive = rule.isRule ? rule.stream : rule.table;

    rule.actions = rule.actions.map((action) => lowerReturnAction(state, action, lastPrimitive, principal));
}

module.exports = function lowerReturn(program, messaging) {
    let ourrules = [];
    let state = { token: 0, messaging, ourrules, newclasses: program.classes };
    program.rules.forEach((r) => {
        lowerReturnRule(state, r, program.principal);
    });
    return ourrules;
};
