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

const adt = require('adt');
const assert = require('assert');

const Ast = require('./ast');
const Type = require('./type');
const Builtin = require('./builtin');
const {makeIndex} = require('./utils');

function notifyAction() {
    return new Ast.Invocation(Ast.Selector.Builtin, 'notify', [], Builtin.Actions.notify);
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

function isRemote(obj) {
    if (!obj)
        return false;
    if (obj.selector.isDevice)
        return obj.selector.principal !== null;
    else
        return !!obj.__principal;
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

function factorPureRemoteActions(messaging, actions, sendrules) {
    var toRemove = new Set;
    actions.forEach((action) => {
        if (!isRemote(action))
            return;

        toRemove.add(action);
        // a pure action should result in nothing local and everything
        // sent out

        var toSend = new Ast.Program([], [], [
            new Ast.Statement.Command(null, [cloneRemote(action)])
        ], action.selector.principal);
        sendrules.push(toSend);
    });
    return actions.filter((a) => !toRemove.has(a));
}

function getSelf(messaging) {
    return Ast.Value.Entity(messaging.type + '-account:' + messaging.account, 'tt:contact', "me");
}

function makeSendSchema(sendFrom) {
    const args = ['__principal', '__program_id', '__flow', '__kindChannel'];
    const types = [Type.Entity('tt:contact_group'), Type.Entity('tt:program_id'), Type.Number, Type.Entity('tt:function')];
    const inReq = {
        __principal: Type.Entity('tt:contact_group'),
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
    return new Ast.FunctionDef('other',
        args, types, makeIndex(args),
        inReq, {}, {},
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
    for (let argname in receiveFrom.schema.out) {
        args.push(argname);
        let type = receiveFrom.schema.out[argname];
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
        {}, {});
    if (sendSchema)
        classdef.actions.send = sendSchema;
    if (receiveSchema)
        classdef.queries.receive = receiveSchema;
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

function findPrincipal(prim) {
    if (prim.selector.isDevice)
        return prim.selector.principal;
    else
        return prim.__principal.value;
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
    let principal = findPrincipal(trigger);
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
    let principal = findPrincipal(query);

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
    let principal = findPrincipal(action);

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

    if (!rule.stream && !rule.table) {
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
    newrules.push(new Ast.Statement.Rule(previous.trigger, previous.queries, rule.actions, rule.once, rule.table, rule.tableschema));
    return [newrules, sendrules];
}

function factorProgram(messaging, program) {
    var newrules = [];
    var newclasses = program.classes;
    var sendrules = [];
    var state = { token: 0 };

    program.rules.forEach((r) => {
        if (r.isDeclaration) {
            // XXX: ignore remote declarations
            newrules.push(r);
            return;
        }
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
    if (principal === null || lastPrimitive === null) {
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
        Ast.InputParam('__kindChannel', Ast.Value.Event('type'))
    ];
    for (let name in lastPrimitive.schema.out)
        sendInputs.push(Ast.InputParam(name, Ast.Value.VarRef(name)));
    action.selector = Ast.Selector.Device(localClass.name, null, null);
    action.channel = 'send';
    action.in_params = sendInputs;
    action.schema = sendSchema;

    let receiveInputs = [
        Ast.InputParam('__principal', makeSingleGroup(principal)),
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
    ourrules.push(ourrule);
}

function lowerReturnRule(state, messaging, newclasses, rule, principal, ourrules) {
    const lastPrimitive = rule.isRule ? rule.stream : rule.table;

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

function* iteratePrimitivesTable(table) {
    if (table.isVarRef) {
        // this will be handled when we visit the declaration
    } else if (table.isInvocation) {
        yield ['table', table.invocation];
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

function* iteratePrimitivesStream(stream) {
    if (stream.isVarRef) {
        // this will be handled when we visit the declaration
    } else if (stream.isTimer || stream.isAtTimer) {
        // no primitive here
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

function* iteratePrimitives(program) {
    for (let decl in program.declarations) {
        if (decl.type === 'table')
            yield* iteratePrimitivesTable(decl.value);
        else if (decl.type === 'stream')
            yield* iteratePrimitivesStream(decl.value);
    }
    for (let rule of program.rules) {
        if (rule.isRule)
            yield* iteratePrimitivesStream(rule.stream);
        else if (rule.isCommand && rule.table)
            yield* iteratePrimitivesTable(rule.table);
        yield* rule.actions.map((a) => ['action', a]);
    }
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
    if (prim.filter)
        filterRecurse(prim.filter);

    return [toFill, toConcretize];
}

module.exports = {
    notifyAction,
    primitiveProgram,
    declarationProgram,
    factorProgram,
    computeSlots,
    iteratePrimitives,
    iteratePrimitivesStream,
    iteratePrimitivesTable,
    iterateSlots,
    iterateSlotsFilter,
    lowerReturn
};
