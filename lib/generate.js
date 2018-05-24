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

function notifyAction(what = 'notify') {
    return new Ast.Invocation(Ast.Selector.Builtin, what, [], Builtin.Actions.notify);
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

function factorProgram(messaging, program) {
    console.log('factorProgram is deprecated, please remove it');
    return [program, []];
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
    for (let decl of program.declarations) {
        if (decl.type === 'table')
            yield* iteratePrimitivesTable(decl.value);
        else if (decl.type === 'stream')
            yield* iteratePrimitivesStream(decl.value);
        else if (decl.type === 'action')
            yield ['action', decl.value];
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
    if (prim === null || prim.selector.isBuiltin || isRemoteSend(prim) || isRemoteReceive(prim))
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
