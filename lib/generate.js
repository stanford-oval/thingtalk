// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Ast = require('./ast');
const Type = require('./type');
const Builtin = require('./builtin');

const { makeIndex,
        isUnaryStreamToStreamOp,
        isUnaryTableToTableOp,
        isUnaryStreamToTableOp,
        isUnaryTableToStreamOp } = require('./utils');
const { optimizeFilter, optimizeProgram } = require('./optimize');

function notifyAction() {
    return new Ast.Invocation(Ast.Selector.Builtin, 'notify', [], Builtin.Actions.notify);
}

function declarationProgram(declaration) {
    const nametoslot = {};

    let i = 0;
    for (let name in declaration.args)
        nametoslot[name] = i++;

    let program;
    if (declaration.type === 'action')
        program = new Ast.Program([], [], [new Ast.Statement.Command(null, [declaration.value.clone()])], null);
    else if (declaration.type === 'table')
        program = new Ast.Program([], [], [new Ast.Statement.Command(declaration.value.clone(), [notifyAction()])], null);
    else
        program = new Ast.Program([], [], [new Ast.Statement.Rule(declaration.value.clone(), [notifyAction()])], null);

    for (let [, slot] of iterateSlots(program)) {
        if (slot instanceof Ast.Selector)
            continue;
        if (slot.value.isVarRef && slot.value.name in nametoslot)
            slot.value.name = '__const_SLOT_' + nametoslot[slot.value.name];
    }

    return program;
}

function makeToken(state) {
    return state.token++;
}

function isRemoteAction(obj) {
    if (!obj || !obj.selector.isDevice)
        return false;
    return obj.selector.principal !== null;
}

function cloneRemoteFilter(ast) {
    if (ast.isTrue || ast.isFalse)
        return ast;
    if (ast.isAnd)
        return Ast.BooleanExpression.And(ast.operands.map(cloneRemoteFilter));
    if (ast.isOr)
        return Ast.BooleanExpression.Or(ast.operands.map(cloneRemoteFilter));
    if (ast.isNot)
        return Ast.BooleanExpression.Not(cloneRemoteFilter(ast.expr));
    if (ast.isExternal) {
        let in_params = [];
        for (let in_param of ast.in_params) {
            if (in_param.value.isUndefined)
                in_params.push(new Ast.InputParam(in_param.name, Ast.Value.Undefined(true)));
            else
                in_params.push(in_param);
        }
        return new Ast.BooleanExpression.External(ast.selector, ast.channel, in_params, cloneRemoteFilter(ast.filter), ast.schema);
    }
    if (ast.value.isUndefined)
        return new Ast.BooleanExpression.Atom(ast.filter.name, ast.filter.operator, Ast.Value.Undefined(true));
    return ast;
}

function cloneRemote(prim) {
    assert(prim.selector.isDevice);
    const in_params = prim.in_params.map((p) => p.value.isUndefined ? p.set({value: Ast.Value.Undefined(true)}) : p);
    const newSelector = new Ast.Selector.Device(prim.selector.kind, prim.selector.id || null, null);
    return new Ast.Invocation(newSelector, prim.channel, in_params, prim.schema);
}

function factorPureRemoteActions(state, actions) {
    var toRemove = new Set;
    actions.forEach((action) => {
        if (!isRemoteAction(action))
            return;

        toRemove.add(action);
        // a pure action should result in nothing local and everything
        // sent out

        var toSend = new Ast.Program([], [], [
            new Ast.Statement.Command(null, [cloneRemote(action)])
        ], action.selector.principal);
        state.sendrules.push(toSend);
    });
    return actions.filter((a) => !toRemove.has(a));
}

function getSelf(messaging) {
    return Ast.Value.Entity(messaging.type + '-account:' + messaging.account, 'tt:contact', "me");
}

function makeSendSchema(sendFrom, secondSendFrom) {
    const args = ['__principal', '__program_id', '__flow', '__kindChannel'];
    const types = [Type.Entity('tt:contact'), Type.Entity('tt:program_id'), Type.Number, Type.Entity('tt:function')];
    const inReq = {
        __principal: Type.Entity('tt:contact'),
        __program_id: Type.Entity('tt:program_id'),
        __flow: Type.Number,
        __kindChannel: Type.Entity('tt:function')
    };
    for (let argname in sendFrom.schema.out) {
        args.push(argname);
        let type = sendFrom.schema.out[argname];
        types.push(type);
        inReq[argname] = type;
    }
    if (secondSendFrom) {
        for (let argname in secondSendFrom.schema.out) {
            args.push(argname);
            let type = secondSendFrom.schema.out[argname];
            types.push(type);
            inReq[argname] = type;
        }
    }
    return new Ast.FunctionDef('other',
        args, types, makeIndex(args),
        inReq, {}, {},
        false, // is_list
        false, // is_monitorable
        '', // canonical
        '', // confirmation
        '', // confirmation_remote
        [], // argcanonicals
        [] // questions
    );
}
function makeReceiveSchema(receiveFrom, secondReceiveFrom) {
    let args = ['__principal', '__program_id', '__flow', '__kindChannel'];
    let types = [Type.Entity('tt:contact'), Type.Entity('tt:program_id'), Type.Number, Type.Entity('tt:function')];
    let inReq = {
        __principal: Type.Entity('tt:contact'),
        __program_id: Type.Entity('tt:program_id'),
        __flow: Type.Number,
    };
    let out = {
        __kindChannel: Type.Entity('tt:function'),
    };
    for (let argname in receiveFrom.schema.out) {
        args.push(argname);
        let type = receiveFrom.schema.out[argname];
        types.push(type);
        out[argname] = type;
    }
    if (secondReceiveFrom) {
        for (let argname in secondReceiveFrom.schema.out) {
            args.push(argname);
            let type = secondReceiveFrom.schema.out[argname];
            types.push(type);
            out[argname] = type;
        }
    }

    return new Ast.FunctionDef('other',
        args, types, makeIndex(args),
        inReq, {}, out,
        true, // is_list
        true, // is_monitorable
        '', // canonical
        '', // confirmation
        '', // confirmation_remote
        [], // argcanonicals
        [] // questions
    );
}

function makeDynamicClass(classes, sendSchema, receiveSchema) {
    var classdef = Ast.ClassDef('__dyn_' + classes.length, 'org.thingpedia.builtin.thingengine.remote',
        {}, {});
    if (sendSchema)
        classdef.actions.send = sendSchema;
    if (receiveSchema)
        classdef.queries.receive = receiveSchema;
    classes.push(classdef);
    return classdef;
}

/*function factorRemoteAction(state, messaging, action, previous, newclasses, sendrules) {
    if (!isRemoteAction(action))
        return;
    let token = makeToken(state);
    let principal = findPrincipal(action);

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
}*/

function getPrincipalsTable(table, into) {
    if (table.isVarRef) {
        if (table.principal !== null)
            into.add(table.principal.value);
        else
            into.add('$self');
    } else if (table.isInvocation) {
        if (table.invocation.selector.principal !== null)
            into.add(table.invocation.selector.principal.value);
        else
            into.add('$self');
    } else if (isUnaryStreamToTableOp(table)) {
        getPrincipalsStream(table.stream, into);
    } else if (isUnaryTableToTableOp(table)) {
        getPrincipalsTable(table.table, into);
    } else if (table.isJoin) {
        getPrincipalsTable(table.lhs, into);
        getPrincipalsTable(table.rhs, into);
    } else {
        throw new TypeError(`Unexpected table ${table}`);
    }
}

function getPrincipalsStream(stream, into) {
    if (stream.isVarRef) {
        if (stream.principal !== null)
            into.add(stream.principal.value);
        else
            into.add('$self');
    } else if (stream.isTimer || stream.isAtTimer) {
        // do nothing
    } else if (isUnaryStreamToStreamOp(stream)) {
        getPrincipalsStream(stream.stream, into);
    } else if (isUnaryTableToStreamOp(stream)) {
        getPrincipalsTable(stream.table, into);
    } else if (stream.isJoin) {
        getPrincipalsStream(stream.stream, into);
        getPrincipalsTable(stream.table, into);
    } else {
        throw new TypeError(`Unexpected stream ${stream}`);
    }
}

function cloneRemoteStream(stream) {
    if (stream.isVarRef)
        throw new Error('Cannot handle remote VarRef');
    if (stream.isTimer || stream.isAtTimer)
        return stream;
    if (stream.isFilter) {
        return new Ast.Stream.Filter(cloneRemoteStream(stream.stream),
            cloneRemoteFilter(stream.filter),
            stream.schema);
    }
    if (stream.isEdgeFilter) {
        return new Ast.Stream.EdgeFilter(cloneRemoteStream(stream.stream),
            cloneRemoteFilter(stream.filter),
            stream.schema);
    }

    if (isUnaryStreamToStreamOp(stream)) {
        let clone = stream.clone();
        clone.stream = cloneRemoteStream(stream.stream);
        return clone;
    }
    if (isUnaryTableToStreamOp(stream)) {
        let clone = stream.clone();
        clone.table = cloneRemoteTable(stream.table);
        return clone;
    }

    if (stream.isJoin)
        return new Ast.Stream.Join(cloneRemoteStream(stream.stream), cloneRemoteTable(stream.table), stream.in_params, stream.schema);

    throw new TypeError(`Unexpected stream ${stream}`);
}

function cloneRemoteTable(table) {
    if (table.isVarRef)
        throw new Error('Cannot handle remote VarRef');
    if (table.isInvocation)
        return new Ast.Table.Invocation(cloneRemote(table.invocation), table.schema);
    if (table.isFilter) {
        return new Ast.Table.Filter(cloneRemoteTable(table.table),
            cloneRemoteFilter(table.filter),
            table.schema);
    }

    if (isUnaryStreamToTableOp(table)) {
        let clone = table.clone();
        clone.stream = cloneRemoteStream(table.stream);
        return clone;
    }
    if (isUnaryTableToTableOp(table)) {
        let clone = table.clone();
        clone.stream = cloneRemoteTable(table.stream);
        return clone;
    }

    if (table.isJoin)
        return new Ast.Table.Join(cloneRemoteTable(table.lhs), cloneRemoteTable(table.rhs), table.in_params, table.schema);

    throw new TypeError(`Unexpected table ${table}`);
}

function makeRemoteAccess(state, tableOrStream, principal, forMonitor) {
    let token = makeToken(state);
    let sendSchema = makeSendSchema(tableOrStream);
    let receiveSchema = makeReceiveSchema(tableOrStream);
    let sendClass = makeDynamicClass([], sendSchema, null);
    let receiveClass = makeDynamicClass(state.newclasses, null, receiveSchema);

    let sendInputs = [
        Ast.InputParam('__principal', getSelf(state.messaging)),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow',  Ast.Value.Number(token)),
        Ast.InputParam('__kindChannel', Ast.Value.Event('type'))
    ];
    for (let name in tableOrStream.schema.out)
        sendInputs.push(Ast.InputParam(name, Ast.Value.VarRef(name)));

    let action = new Ast.Invocation(
        new Ast.Selector.Device(sendClass.name, null, null), 'send', sendInputs, sendSchema
    );
    let rule;
    if (tableOrStream instanceof Ast.Stream)
        rule = new Ast.Statement.Rule(cloneRemoteStream(tableOrStream), [action]);
    else if (forMonitor)
        rule = new Ast.Statement.Rule(Ast.Stream.Monitor(cloneRemoteTable(tableOrStream), null, tableOrStream.schema), [action]);
    else
        rule = new Ast.Statement.Command(cloneRemoteTable(tableOrStream), [action]);

    state.sendrules.push(new Ast.Program([sendClass], [], [rule], new Ast.Value.Entity(principal, 'tt:contact', null)));

    let receiveInputs = [
        Ast.InputParam('__principal', new Ast.Value.Entity(principal, 'tt:contact', null)),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow',  Ast.Value.Number(token))
    ];
    let receiveTable = new Ast.Table.Invocation(
        new Ast.Invocation(Ast.Selector.Device(receiveClass.name, null, null), 'receive', receiveInputs, receiveSchema),
    receiveSchema);

    if (tableOrStream instanceof Ast.Stream)
        return new Ast.Stream.Monitor(receiveTable, null, receiveTable.schema);
    else
        return tableOrStream;
}

function makeRemoteStreamJoinAccess(state, stream, table, principal, extraInParams) {
    let token1 = makeToken(state);
    let token2 = makeToken(state);

    let sendSchema = makeSendSchema(stream);
    let remoteReceiveSchema = makeReceiveSchema(stream);
    let sendClass = makeDynamicClass(state.newclasses, sendSchema, null);
    let remoteReceiveClass = makeDynamicClass([], null, remoteReceiveSchema);

    let remoteSendSchema = makeSendSchema(stream, table);
    let receiveSchema = makeReceiveSchema(stream, table);
    let remoteSendClass = makeDynamicClass([], remoteSendSchema, null);
    let receiveClass = makeDynamicClass(state.newclasses, null, receiveSchema);

    // first build the rule that will evaluate the lhs of the stream and send it over
    {
        let sendInputs = [
            Ast.InputParam('__principal', new Ast.Value.Entity(principal, 'tt:contact', null)),
            Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
            Ast.InputParam('__flow',  Ast.Value.Number(token1)),
            Ast.InputParam('__kindChannel', Ast.Value.Event('type'))
        ];
        for (let name in stream.schema.out)
            sendInputs.push(Ast.InputParam(name, Ast.Value.VarRef(name)));

        state.newrules.push(new Ast.Statement.Rule(stream, [new Ast.Invocation(
            Ast.Selector.Device(sendClass.name, null, null), 'send', sendInputs, sendSchema
        )]));
    }

    // then build the rule that will receive the data, evaluate the table and then send
    // us the results back
    {
        let receiveInputs = [
            Ast.InputParam('__principal', getSelf(state.messaging)),
            Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
            Ast.InputParam('__flow',  Ast.Value.Number(token1))
        ];

        let remoteReceive = new Ast.Stream.Monitor(
            new Ast.Table.Invocation(Ast.Selector.Device(remoteReceiveSchema.name, null, null), 'receive', receiveInputs, remoteReceiveSchema),
            null, remoteReceiveSchema
        );
        let remoteStream = new Ast.Stream.Join(remoteReceive, cloneRemoteTable(table), extraInParams, null);

        let sendInputs = [
            Ast.InputParam('__principal', getSelf(state.messaging)),
            Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
            Ast.InputParam('__flow',  Ast.Value.Number(token2)),
            Ast.InputParam('__kindChannel', Ast.Value.Event('type'))
        ];
        let rule = new Ast.Statement.Rule(remoteStream, [new Ast.Invocation(
            Ast.Selector.Device(remoteSendClass.name, null, null), 'send', sendInputs, sendSchema
        )]);

        state.sendrules.push(new Ast.Program([remoteReceiveClass, remoteSendClass], [], [rule], new Ast.Value.Entity(principal, 'tt:contact', null)));
    }

    // finally, build the stream that will receive the results back
    {
        let receiveInputs = [
            Ast.InputParam('__principal', new Ast.Value.Entity(principal, 'tt:contact', null)),
            Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
            Ast.InputParam('__flow',  Ast.Value.Number(token2))
        ];
        let receiveTable = new Ast.Table.Invocation(
            new Ast.Invocation(Ast.Selector.Device(receiveClass.name, null, null), 'receive', receiveInputs, receiveSchema),
        receiveSchema);
        new Ast.Stream.Monitor(receiveTable, null, receiveTable.schema);
    }
}

function factorTable(state, table, forMonitor, withMonitor, extraInParams) {
    const principals = new Set;
    getPrincipalsTable(table, principals);
    if (!isRemote(principals))
        return table;

    // if the entirety of the data is remote, ship it completely
    if (principals.size === 1) {
        let [principal] = principals;
        if (withMonitor)
            return makeRemoteStreamJoinAccess(state, withMonitor, table, principal, extraInParams);
        else
            return makeRemoteAccess(state, table, principal, forMonitor);
    }

    if (isUnaryTableToTableOp(table)) {
        table.table = factorTable(state, table.table, forMonitor, withMonitor, extraInParams);
        return table;
    }
    if (isUnaryStreamToTableOp(table)) {
        table.stream = factorStream(state, table.stream);
        return table;
    }

    /*if (table.isJoin) {
        table.lhs = factorTable(state, table, forMonitor, withMonitor, extraInParams);

        const rhsprincipals = new Set;
        getPrincipalsTable(table.rhs, rhsprincipals);
        if (!isRemote(rhsprincipals))
            return table;

        if (rhsprincipals.size === 1) {
            let [principal] = rhsprincipals;
            return makeRemoteStreamJoinAccess(state, stream, principal, stream.in_params);
        }

        stream.table = factorTable(state, stream.table, false, stream.stream, stream.in_params);
    }*/

    // sadly, the current streaming protocol is insufficient to support
    // New ThingTalk completely
    throw new Error(`XXX: Unimplemented table ${table}`);
}

function isRemote(principals) {
    if ((principals.size === 1 && principals.has('$self')) ||
        principals.size === 0)
        return false;
    else
        return true;
}

function factorStream(state, stream) {
    const principals = new Set;
    getPrincipalsStream(stream, principals);
    if (!isRemote(principals))
        return stream;

    // if the entirety of the data is remote, ship it completely
    if (principals.size === 1) {
        let [principal] = principals;
        return makeRemoteAccess(state, stream, principal, false);
    }

    if (stream.isMonitor) {
        // monitor of a table join (or some other complicated thing)
        // (otherwise we would have hit the previous, easy case)
        stream.table = factorTable(state, stream.table, true);
        return stream;
    }

    if (isUnaryStreamToStreamOp(stream)) {
        stream.stream = factorStream(state, stream.stream);
        return stream;
    }

    if (stream.isJoin) {
        stream.stream = factorStream(state, stream.stream);

        const rhsprincipals = new Set;
        getPrincipalsTable(stream.table, rhsprincipals);
        if (!isRemote(rhsprincipals))
            return stream;

        if (rhsprincipals.size === 1) {
            let [principal] = rhsprincipals;
            return makeRemoteStreamJoinAccess(state, stream, principal, stream.in_params);
        }

        stream.table = factorTable(state, stream.table, false, stream.stream, stream.in_params);
    }

    throw new TypeError(`Unexpected stream ${stream}`);
}

function factorRule(state, rule) {
    if (!rule.stream && !rule.table) {
        rule.actions = factorPureRemoteActions(state, rule.actions);
        if (rule.actions.length > 0)
            state.newrules.push(rule);
        return;
    }

    if (rule.stream)
        rule.stream = factorStream(state, rule.stream);
    else
        rule.table = factorTable(state, rule.table, false, null, []);
    state.newrules.push(rule);
}

function factorProgram(messaging, program) {
    var newrules = [];
    var newclasses = program.classes;
    var sendrules = [];
    var state = { token: 0, messaging, newrules, newclasses, sendrules };

    program.rules.forEach((r) => factorRule(state, r));
    if (newrules.length === 0)
        return [null, sendrules];
    else
        return [new Ast.Program(newclasses, program.declarations, newrules, null), sendrules];
}

// note: this is similar to factorRemoteAction, but self/remote are flipped
// the "lowered" action is what will be shipped out as a blob, whereas ourrules is what
// we need to run locally to receive the results
//
// because we don't mess with queries, we never need to split something in more than one piece
// which drastically simplifies the implementation
function lowerReturnAction(state, action, lastPrimitive, principal) {
    if (!action.selector.isBuiltin || action.channel !== 'return')
        return;
    if (principal === null || lastPrimitive === null) {
        action.channel = 'notify';
        return;
    }
    assert(lastPrimitive !== null);

    let token = makeToken(state);
    let sendSchema = makeSendSchema(lastPrimitive);
    let receiveSchema = makeReceiveSchema(lastPrimitive);
    let localClass = makeDynamicClass(state.newclasses, sendSchema, null);
    let toSendClass = makeDynamicClass([], null, receiveSchema);

    let sendInputs = [
        Ast.InputParam('__principal', getSelf(state.messaging)),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow',  Ast.Value.Number(token)),
        Ast.InputParam('__kindChannel', Ast.Value.Event('type'))
    ];
    for (let name in lastPrimitive.schema.out)
        sendInputs.push(Ast.InputParam(name, Ast.Value.VarRef(name)));
    action.selector = Ast.Selector.Device(localClass.name, null, null);
    action.channel = 'send';
    action.in_params = sendInputs;
    action.schema = sendSchema;

    let receiveInputs = [
        Ast.InputParam('__principal', principal),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow',  Ast.Value.Number(token))
    ];
    let receiveTrigger = new Ast.Stream.Monitor(
        new Ast.Table.Invocation(
            new Ast.Invocation(Ast.Selector.Device(toSendClass.name, null, null), 'receive', receiveInputs, receiveSchema),
        receiveSchema),
    null, receiveSchema);

    var ourrule = new Ast.Program([toSendClass], [], [
        Ast.Statement.Rule(receiveTrigger, [notifyAction()])
    ], null);
    state.ourrules.push(ourrule);
}

function lowerReturnRule(state, rule, principal) {
    const lastPrimitive = rule.isRule ? rule.stream : rule.table;

    rule.actions.forEach((action) => {
        lowerReturnAction(state, action, lastPrimitive, principal);
    });
}

function lowerReturn(messaging, program) {
    let ourrules = [];
    let state = { token: 0, messaging, ourrules, newclasses: program.classes };
    program.rules.forEach((r) => {
        lowerReturnRule(state, r, program.principal);
    });
    return ourrules;
}

function* iteratePrimitivesTable(table) {
    if (table.isVarRef) {
        // this will be handled when we visit the declaration
    } else if (table.isInvocation) {
        yield ['table', table.invocation];
    } else if (table.isFilter) {
        yield* iteratePrimitivesTable(table.table);
        yield* iteratePrimitivesFilter(table.filter);
    } else if (isUnaryTableToTableOp(table)) {
        yield* iteratePrimitivesTable(table.table);
    } else if (isUnaryStreamToTableOp(table)) {
        yield* iteratePrimitivesStream(table.stream);
    } else if (table.isJoin) {
        yield* iteratePrimitivesTable(table.lhs);
        yield* iteratePrimitivesTable(table.rhs);
    } else {
        throw new TypeError("Can't handle " + table);
    }
}

function* iteratePrimitivesFilter(filter) {
    if (filter.isTrue || filter.isTrue || filter.isAtom)
        return;
    if (filter.isNot) {
        yield* iteratePrimitivesFilter(filter.expr);
        return;
    }
    if (filter.isAnd || filter.isOr) {
        for (let op of filter.operands)
            yield* iteratePrimitivesFilter(op);
        return;
    }

    assert(filter.isExternal);
    yield ['filter', filter];
    yield* iteratePrimitivesFilter(filter.filter);
}

function* iteratePrimitivesStream(stream) {
    if (stream.isVarRef) {
        // this will be handled when we visit the declaration
    } else if (stream.isTimer || stream.isAtTimer) {
        // no primitive here
    } else if (stream.isFilter || stream.isEdgeFilter) {
        yield* iteratePrimitivesStream(stream.stream);
        yield* iteratePrimitivesFilter(stream.filter);
    } else if (isUnaryStreamToStreamOp(stream)) {
        yield* iteratePrimitivesStream(stream.stream);
    } else if (isUnaryTableToStreamOp(stream)) {
        yield* iteratePrimitivesTable(stream.table);
    } else if (stream.isJoin) {
        yield* iteratePrimitivesStream(stream.stream);
        yield* iteratePrimitivesTable(stream.table);
    } else {
        throw new TypeError("Can't handle " + stream);
    }
}

function* iteratePrimitivesRule(rule) {
    if (rule.isRule)
        yield* iteratePrimitivesStream(rule.stream);
    else if (rule.isCommand && rule.table)
        yield* iteratePrimitivesTable(rule.table);
    yield* rule.actions.map((a) => ['action', a]);
}

function* iteratePrimitives(program) {
    for (let decl in program.declarations) {
        if (decl.type === 'table')
            yield* iteratePrimitivesTable(decl.value);
        else if (decl.type === 'stream')
            yield* iteratePrimitivesStream(decl.value);
    }
    for (let rule of program.rules)
        yield* iteratePrimitivesRule(rule);
}

function* iterateSlotsInputParams(invocation, scope) {
    yield [null, invocation.selector, invocation, null];
    for (let in_param of invocation.in_params)
        yield [invocation.schema, in_param, invocation, scope];
    return [invocation, makeScope(invocation)];
}

function* iterateSlotsFilter(schema, expr, prim, scope) {
    if (expr.isTrue || expr.isFalse)
        return;
    if (expr.isAnd || expr.isOr) {
        for (let op of expr.operands)
            yield* iterateSlotsFilter(schema, op, prim, scope);
        return;
    }
    if (expr.isNot) {
        yield* iterateSlotsFilter(schema, expr.expr, prim, scope);
        return;
    }
    if (expr.isExternal) {
        yield* iterateSlotsInputParams(expr, scope);
        yield* iterateSlotsFilter(expr.schema, expr.filter, prim, makeScope(expr));
    } else {
        yield [schema, expr, prim, scope];
    }
}

function* iterateSlotsTable(table, scope) {
    if (table.isVarRef) {
        // this will be handled when we visit the declaration
        return [null, {}];
    } else if (table.isInvocation) {
        return yield* iterateSlotsInputParams(table.invocation, scope);
    } else if (table.isFilter) {
        let [prim, newScope] = yield* iterateSlotsTable(table.table);
        yield* iterateSlotsFilter(table.table.schema, table.filter, prim, newScope);
        return [prim, newScope];
    } else if (table.isProjection) {
        let [prim, nestedScope] = yield* iterateSlotsTable(table.table);
        let newScope = {};
        for (let name of table.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    } else if (isUnaryTableToTableOp(table)) {
        return yield* iterateSlotsTable(table.table);
    } else if (isUnaryStreamToTableOp(table)) {
        return yield* iterateSlotsStream(table.stream);
    } else if (table.isJoin) {
        let [, leftScope] = yield* iterateSlotsTable(table.lhs);
        let [, rightScope] = yield* iterateSlotsTable(table.rhs);
        let newScope = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    } else {
        throw new TypeError("Can't handle " + table);
    }
}

function makeScope(invocation) {
    // make out parameters available in the "scope", which puts
    // them as possible options for a later slot fill
    const schema = invocation.schema;
    const scope = {};
    for (let argname in schema.out) {
        let index = schema.index[argname];
        let argcanonical = schema.argcanonicals[index] || argname;
        scope[argname] = {
            value: Ast.Value.VarRef(argname),
            type: schema.out[argname],
            argcanonical: argcanonical,
            kind: invocation.selector.kind
        };
    }
    scope['$event'] = {
        value: Ast.Value.Event(null),
        type: Type.String,
    };
    return scope;
}

function* iterateSlotsStream(stream, scope) {
    if (stream.isVarRef) {
        // this will be handled when we visit the declaration
        return [null, {}];
    } else if (stream.isTimer || stream.isAtTimer) {
        // no primitive here
        return [null, {}];
    } else if (stream.isFilter) {
        let [prim, newScope] = yield* iterateSlotsStream(stream.stream);
        yield* iterateSlotsFilter(stream.stream.schema, stream.filter, prim, newScope);
        return [prim, newScope];
    } else if (stream.isEdgeFilter) {
        let [prim, newScope] = yield* iterateSlotsStream(stream.stream);
        yield* iterateSlotsFilter(stream.stream.schema, stream.filter, prim, newScope);
        return [prim, newScope];
    } else if (stream.isProjection) {
        let [prim, nestedScope] = yield* iterateSlotsStream(stream.stream);
        let newScope = {};
        for (let name of stream.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    } else if (isUnaryStreamToStreamOp(stream)) {
        return yield* iterateSlotsStream(stream.stream);
    } else if (isUnaryTableToStreamOp(stream)) {
        return yield* iterateSlotsTable(stream.table);
    } else if (stream.isJoin) {
        let [, leftScope] = yield* iterateSlotsStream(stream.stream);
        let [, rightScope] = yield* iterateSlotsTable(stream.table);
        let newScope = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    } else {
        throw new TypeError("Can't handle " + stream);
    }
}

function* iterateSlots(program) {
    let scope = {};
    for (let decl in program.declarations) {
        if (decl.type === 'table')
            yield* iterateSlotsTable(decl.value, scope);
        else if (decl.type === 'stream')
            yield* iterateSlotsStream(decl.value, scope);
        else if (decl.type === 'action')
            yield* iterateSlotsInputParams(decl.value, scope);
    }
    for (let rule of program.rules) {
        if (rule.isRule)
            [,scope] = yield* iterateSlotsStream(rule.stream, scope);
        else if (rule.isCommand && rule.table)
            [,scope] = yield* iterateSlotsTable(rule.table, scope);
        for (let action of rule.actions)
            yield* iterateSlotsInputParams(action, scope);
    }
}

function convertPrimitiveToPermission(prim) {
    if (prim === null || isRemoteSend(prim) || isRemoteReceive(prim) || prim.selector.isBuiltin)
        return Ast.PermissionFunction.Builtin;

    let filter = [];
    for (let inParam of prim.in_params) {
        if (inParam.value.isUndefined)
            continue;
        filter.push(Ast.BooleanExpression.Atom(inParam.name, '==', inParam.value));
    }
    filter = Ast.BooleanExpression.And(filter);
    return new Ast.PermissionFunction.Specified(prim.selector.kind, prim.channel, filter, prim.schema);
}

function convertTableToPermissionFunction(table) {
    if (table.isInvocation)
        return convertPrimitiveToPermission(table.invocation);

    if (table.isFilter) {
        let inner = convertTableToPermissionFunction(table.table);
        if (!inner)
            return inner;
        return new Ast.PermissionFunction.Specified(inner.kind, inner.channel,
            Ast.BooleanExpression.And([inner.filter, table.filter]), inner.schema);
    }

    if (table.isProjection || table.isAlias || table.isCompute)
        return convertTableToPermissionFunction(table.table);

    if (table.isJoin) {
        console.log('NOT IMPLEMENTED: cannot support more than one permission primitive');
        return null;
    }

    console.log(`NOT IMPLEMENTED: converting table ${table} to permission function`);
    return null;
}

function convertStreamToPermissionFunction(stream) {
    if (stream.isMonitor)
        return convertTableToPermissionFunction(stream.table);
    if (stream.isProjection || stream.isAlias || stream.isCompute)
        return convertStreamToPermissionFunction(stream.stream);

    if (stream.isFilter || stream.isEdgeFilter) {
        let inner = convertStreamToPermissionFunction(stream.stream);
        if (!inner)
            return inner;
        return new Ast.PermissionFunction.Specified(inner.kind, inner.channel,
            Ast.BooleanExpression.And([inner.filter, stream.filter]), inner.schema);
    }

    if (stream.isJoin) {
        console.log('NOT IMPLEMENTED: cannot support more than one permission primitive');
        return null;
    }

    console.log(`NOT IMPLEMENTED: converting stream ${stream} to permission function`);
    return null;
}

function convertProgramToPermissionRule(principal, contactName, program) {
    let rule;
    if (program.rules.length > 1) {
        console.log('NOT IMPLEMENTED: cannot support more than one rule');
        return null;
    }
    rule = program.rules[0];

    let query = null;
    if (rule.stream)
        query = convertStreamToPermissionFunction(rule.stream);
    else if (rule.table)
        query = convertTableToPermissionFunction(rule.table);
    else
        query = Ast.PermissionFunction.Builtin;
    if (rule.actions.length > 1) {
        console.log('NOT IMPLEMENTED: cannot support more than one action');
        return null;
    }
    const action = convertPrimitiveToPermission(rule.actions[0]);
    if (query.isSpecified)
        query.filter = optimizeFilter(query.filter);
    if (action.isSpecified)
        action.filter = optimizeFilter(action.filter);

    return new Ast.PermissionRule(Ast.BooleanExpression.Atom(
        'source', '==',
        Ast.Value.Entity(principal, 'tt:contact', contactName)
    ), query, action);
}

function isRemoteReceive(fn) {
    return (fn.selector.isDevice && fn.selector.kind === 'org.thingpedia.builtin.thingengine.remote' || fn.selector.kind.startsWith('__dyn_')) &&
        fn.channel === 'receive';
}
function isRemoteSend(fn) {
    return (fn.selector.isDevice && fn.selector.kind === 'org.thingpedia.builtin.thingengine.remote' || fn.selector.kind.startsWith('__dyn_')) &&
        fn.channel === 'send';
}

module.exports = {
    notifyAction,
    declarationProgram,

    // iteration/slot-filling API
    iteratePrimitives,
    iteratePrimitivesRule,
    iteratePrimitivesStream,
    iteratePrimitivesTable,
    iterateSlots,
    iterateSlotsTable,
    iterateSlotsStream,
    iterateSlotsFilter,

    // factoring API
    factorProgram,
    lowerReturn,

    // recursive utilities
    isUnaryTableToTableOp,
    isUnaryStreamToTableOp,
    isUnaryStreamToStreamOp,
    isUnaryTableToStreamOp,

    // policy API
    convertProgramToPermissionRule,

    // optimization
    optimizeFilter,
    optimizeProgram
};
