// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import assert from 'assert';

import Type from '../type';
import {
    Value,
    EntityValue
} from './values';
import {
    ArgumentDef,
    ArgDirection,
    FunctionDef
} from './function_def';
import {
    DeviceSelector,
    Invocation,
    InputParam
} from './expression';
import { Stream, Table, Action, NotifyAction } from './primitive';
import { ClassDef } from './class_def';
import { Rule, Command, Program, Statement } from './program';

export interface Messaging {
    getSelf(x : string) : string;
    type : string;
    account : string;
}
interface ConversionState {
    token : number;
    messaging : Messaging;
    ourrules : Program[];
    newclasses : ClassDef[];
}

function makeToken(state : ConversionState) : number {
    return state.token++;
}

function getSelf(messaging : Messaging, sendTo : EntityValue) : EntityValue {
    if (messaging.getSelf)
        return new Value.Entity(messaging.getSelf(sendTo.value as string), 'tt:contact', "me");
    else
        return new Value.Entity(messaging.type + '-account:' + messaging.account, 'tt:contact', "me");
}

function makeSendSchema(sendFrom : Stream|Table) : FunctionDef {
    const args = [
        new ArgumentDef(null, ArgDirection.IN_REQ, '__principal', new Type.Entity('tt:contact')),
        new ArgumentDef(null, ArgDirection.IN_REQ, '__program_id', new Type.Entity('tt:program_id')),
        new ArgumentDef(null, ArgDirection.IN_REQ, '__flow', Type.Number),
        new ArgumentDef(null, ArgDirection.IN_REQ, '__kindChannel', new Type.Entity('tt:function')),
        new ArgumentDef(null, ArgDirection.IN_OPT, '__response', Type.String)
    ];
    for (const arg of sendFrom.schema!.iterateArguments()) {
        if (arg.is_input)
            continue;
        args.push(new ArgumentDef(null, ArgDirection.IN_REQ, arg.name, arg.type));
    }
    return new FunctionDef(null, 'action', null, 'send', [], { is_list: false, is_monitorable: false}, args, {});
}
function makeReceiveSchema(receiveFrom : Stream|Table) : FunctionDef {
    const args = [
        new ArgumentDef(null, ArgDirection.IN_REQ, '__principal', new Type.Entity('tt:contact')),
        new ArgumentDef(null, ArgDirection.IN_REQ, '__program_id', new Type.Entity('tt:program_id')),
        new ArgumentDef(null, ArgDirection.IN_REQ, '__flow', Type.Number),
        new ArgumentDef(null, ArgDirection.OUT, '__kindChannel', new Type.Entity('tt:function')),
        new ArgumentDef(null, ArgDirection.OUT, '__response', Type.String)
    ];
    for (const arg of receiveFrom.schema!.iterateArguments()) {
        if (arg.is_input)
            continue;
        args.push(new ArgumentDef(null, ArgDirection.OUT, arg.name, arg.type));
    }

    return new FunctionDef(null, 'query', null, 'receive', [], { is_list: true, is_monitorable: true}, args, {});
}

function makeDynamicClass(classes : ClassDef[],
                          sendSchema : FunctionDef|null,
                          receiveSchema : FunctionDef|null) : ClassDef {
    const classdef = new ClassDef(null, '__dyn_' + classes.length, ['org.thingpedia.builtin.thingengine.remote'],
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
function lowerReturnAction(state : ConversionState,
                           action : Action,
                           lastPrimitive : Stream|Table,
                           principal : EntityValue) : Action {
    if (!(action instanceof NotifyAction) || action.name !== 'return')
        return action;
    if (principal === null || lastPrimitive === null) {
        action.name = 'notify';
        return action;
    }
    assert(lastPrimitive);

    const token = makeToken(state);
    const sendSchema = makeSendSchema(lastPrimitive);
    const receiveSchema = makeReceiveSchema(lastPrimitive);
    const localClass = makeDynamicClass(state.newclasses, sendSchema, null);
    const toSendClass = makeDynamicClass([], null, receiveSchema);

    const sendInputs = [
        new InputParam(null, '__principal', getSelf(state.messaging, principal)),
        new InputParam(null, '__program_id', new Value.Event('program_id')),
        new InputParam(null, '__flow', new Value.Number(token)),
        new InputParam(null, '__kindChannel', new Value.Event('type'))
    ];
    for (const arg of lastPrimitive.schema!.iterateArguments()) {
        if (arg.is_input)
            continue;
        sendInputs.push(new InputParam(null, arg.name, new Value.VarRef(arg.name)));
    }

    const newAction = new Action.Invocation(action.location,
        new Invocation(action.location,
            new DeviceSelector(action.location, localClass.name, null, null),
            'send',
            sendInputs,
            sendSchema),
        null);

    const receiveInputs = [
        new InputParam(null, '__principal', principal),
        new InputParam(null, '__program_id', new Value.Event('program_id')),
        new InputParam(null, '__flow', new Value.Number(token))
    ];
    const receiveTrigger = new Stream.Monitor(
        null,
        new Table.Invocation(
            null,
            new Invocation(null,
                new DeviceSelector(null, toSendClass.name, null, null),
                'receive', receiveInputs, receiveSchema),
        receiveSchema),
    null, receiveSchema);

    const ourrule = new Program(null, [toSendClass], [], [
        new Statement.Rule(null, receiveTrigger, [Action.notifyAction()])
    ], null);
    state.ourrules.push(ourrule);

    return newAction;
}

function lowerReturnRule(state : ConversionState, rule : Rule|Command, principal : EntityValue) {
    const lastPrimitive = (rule instanceof Rule ? rule.stream : rule.table) as Stream|Table;

    rule.actions = rule.actions.map((action) => lowerReturnAction(state, action, lastPrimitive, principal));
}

export default function lowerReturn(program : Program, messaging : Messaging) : Program[] {
    const ourrules : Program[] = [];
    const state = { token: 0, messaging, ourrules, newclasses: program.classes };
    program.rules.forEach((r : Statement) => {
        lowerReturnRule(state, r as Rule|Command, program.principal as EntityValue);
    });
    return ourrules;
}
