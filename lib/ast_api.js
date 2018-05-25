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

const Ast = require('./ast');
const Type = require('./type');
const Builtin = require('./builtin');

const { makeIndex,
        isUnaryStreamToStreamOp,
        isUnaryTableToTableOp,
        isUnaryStreamToTableOp,
        isUnaryTableToStreamOp } = require('./utils');
const { optimizeFilter, optimizeProgram } = require('./optimize');
let { typeCheckFilter, typeCheckProgram, typeCheckPermissionRule } = require('./typecheck');

const ProgramProto = Object.getPrototypeOf(new Ast.Program([], [], [], null));
const PermissionRuleProto = Object.getPrototypeOf(new Ast.PermissionRule(Ast.BooleanExpression.True, Ast.PermissionFunction.Builtin, Ast.PermissionFunction.Builtin));
const InvocationProto = Object.getPrototypeOf(new Ast.Invocation(Ast.Selector.Builtin, 'notify', [], null));
const DeclarationProto = Object.getPrototypeOf(new Ast.Statement.Declaration('', 'action', {},
    new Ast.Invocation(Ast.Selector.Builtin, 'notify', [], null)));

// utilities

function notifyAction(what = 'notify') {
    return new Ast.Invocation(Ast.Selector.Builtin, what, [], Builtin.Actions.notify);
}
module.exports.notifyAction = notifyAction;

DeclarationProto.toProgram = function toProgram() {
    const nametoslot = {};

    let i = 0;
    for (let name in this.args)
        nametoslot[name] = i++;

    let program;
    if (this.type === 'action')
        program = new Ast.Program([], [], [new Ast.Statement.Command(null, [this.value.clone()])], null);
    else if (this.type === 'table')
        program = new Ast.Program([], [], [new Ast.Statement.Command(this.value.clone(), [notifyAction()])], null);
    else
        program = new Ast.Program([], [], [new Ast.Statement.Rule(this.value.clone(), [notifyAction()])], null);

    for (let [, slot] of program.iterateSlots()) {
        if (slot instanceof Ast.Selector)
            continue;
        if (slot.value.isVarRef && slot.value.name in nametoslot)
            slot.value.name = '__const_SLOT_' + nametoslot[slot.value.name];
    }

    return program;
};

// *** typechecking API ***

Ast.BooleanExpression.prototype.typecheck = function(schema, scope, schemas, classes, useMeta) {
    return typeCheckFilter(this, schema, scope, schemas, classes, useMeta);
};

Ast.Input.prototype.typecheck = function(schemas, getMeta = false) {
    if (this.isProgram)
        return typeCheckProgram(this, schemas, getMeta).then(() => this);
    else
        return typeCheckPermissionRule(this, schemas, getMeta).then(() => this);
};

// *** optimization API ***

Ast.BooleanExpression.prototype.optimize = function() {
    return optimizeFilter(this);
};
ProgramProto.optimize = function() {
    return optimizeProgram(this);
};

function isRemoteReceive(fn) {
    return (fn.selector.isDevice && fn.selector.kind === 'org.thingpedia.builtin.thingengine.remote' || fn.selector.kind.startsWith('__dyn_')) &&
        fn.channel === 'receive';
}
function isRemoteSend(fn) {
    return (fn.selector.isDevice && fn.selector.kind === 'org.thingpedia.builtin.thingengine.remote' || fn.selector.kind.startsWith('__dyn_')) &&
        fn.channel === 'send';
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

ProgramProto.convertToPermissionRule = function(principal, contactName) {
    let rule;
    if (this.rules.length > 1) {
        console.log('NOT IMPLEMENTED: cannot support more than one rule');
        return null;
    }
    rule = this.rules[0];

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
};

// *** slot iteration ***

InvocationProto.iterateSlots = function* iterateSlotsInputParams(scope) {
    yield [null, this.selector, this, null];
    for (let in_param of this.in_params)
        yield [this.schema, in_param, this, scope];
    return [this, makeScope(this)];
};

Ast.BooleanExpression.prototype.iterateSlots = function* iterateSlotsFilter(schema, prim, scope) {
    if (this.isTrue || this.isFalse)
        return;
    if (this.isAnd || this.isOr) {
        for (let op of this.operands)
            yield* op.iterateSlots(schema, prim, scope);
        return;
    }
    if (this.isNot) {
        yield* this.expr.iterateSlots(schema, prim, scope);
        return;
    }
    if (this.isExternal) {
        yield* InvocationProto.iterateSlots.call(this, scope);
        yield* this.filter.iterateSlots(this.schema, prim, makeScope(this));
    } else {
        yield [schema, this, prim, scope];
    }
};

Ast.Table.prototype.iterateSlots = function* iterateSlotsTable(scope) {
    if (this.isVarRef) {
        // this will be handled when we visit the declaration
        return [null, {}];
    } else if (this.isInvocation) {
        return yield* this.invocation.iterateSlots(scope);
    } else if (this.isFilter) {
        let [prim, newScope] = yield* this.table.iterateSlots(scope);
        yield* this.filter.iterateSlots(this.table.schema, prim, newScope);
        return [prim, newScope];
    } else if (this.isProjection) {
        let [prim, nestedScope] = yield* this.table.iterateSlots(scope);
        let newScope = {};
        for (let name of this.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    } else if (isUnaryTableToTableOp(this)) {
        return yield* this.table.iterateSlots(scope);
    } else if (isUnaryStreamToTableOp(this)) {
        return yield* this.stream.iterateSlots(scope);
    } else if (this.isJoin) {
        let [, leftScope] = yield* this.lhs.iterateSlots(scope);
        let [, rightScope] = yield* this.rhs.iterateSlots(scope);
        let newScope = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    } else {
        throw new TypeError("Can't handle " + this);
    }
};

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

Ast.Stream.prototype.iterateSlots = function* iterateSlotsStream(scope) {
    if (this.isVarRef) {
        // this will be handled when we visit the declaration
        return [null, {}];
    } else if (this.isTimer || this.isAtTimer) {
        // no primitive here
        return [null, {}];
    } else if (this.isFilter || this.isEdgeFilter) {
        let [prim, newScope] = yield* this.stream.iterateSlots(scope);
        yield* this.filter.iterateSlots(this.stream.schema, prim, newScope);
        return [prim, newScope];
    } else if (this.isProjection) {
        let [prim, nestedScope] = yield* this.stream.iterateSlots(scope);
        let newScope = {};
        for (let name of this.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    } else if (isUnaryStreamToStreamOp(this)) {
        return yield* this.stream.iterateSlots(scope);
    } else if (isUnaryTableToStreamOp(this)) {
        return yield* this.table.iterateSlots(scope);
    } else if (this.isJoin) {
        let [, leftScope] = yield* this.stream.iterateSlots(scope);
        let [, rightScope] = yield* this.table.iterateSlots(scope);
        let newScope = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    } else {
        throw new TypeError("Can't handle " + this);
    }
};

ProgramProto.iterateSlots = function* iterateSlots() {
    let scope = {};
    for (let decl of this.declarations)
        yield* decl.value.iterateSlots(scope);
    for (let rule of this.rules) {
        if (rule.isRule)
            [,scope] = yield* rule.stream.iterateSlots(scope);
        else if (rule.isCommand && rule.table)
            [,scope] = yield* rule.table.iterateSlots(scope);
        for (let action of rule.actions)
            yield* action.iterateSlots(scope);
    }
};

PermissionRuleProto.iterateSlots = function* iterateSlots() {
    yield* this.principal.iterateSlots(null, null, {});

    if (this.query.isSpecified)
        yield* this.query.filter.iterateSlots(this.query.schema, this.query, {});
    if (this.action.isSpecified)
        yield* this.action.filter.iterateSlots(this.action.schema, this.action, this.query.isSpecified ? this.query.schema.out : {});
};

// *** primitive iteration ***

ProgramProto.iteratePrimitives = function* iteratePrimitives() {
    for (let decl of this.declarations)
        yield* decl.iteratePrimitives();
    for (let rule of this.rules)
        yield* rule.iteratePrimitives();
};

Ast.Statement.prototype.iteratePrimitives = function* iteratePrimitivesRule() {
    if (this.isDeclaration) {
        switch (this.type) {
        case 'table':
        case 'stream':
            yield* this.value.iteratePrimitives();
            break;
        case 'action':
            yield ['action', this.value];
        }
    } else {
        if (this.isRule)
            yield* this.stream.iteratePrimitives();
        else if (this.isCommand && this.table)
            yield* this.table.iteratePrimitives();
        yield* this.actions.map((a) => ['action', a]);
    }
};

Ast.Stream.prototype.iteratePrimitives = function* iteratePrimitivesStream() {
    if (this.isVarRef) {
        // this will be handled when we visit the declaration
    } else if (this.isTimer || this.isAtTimer) {
        // no primitive here
    } else if (this.isFilter || this.isEdgeFilter) {
        yield* this.stream.iteratePrimitives();
        yield* this.filter.iteratePrimitives();
    } else if (isUnaryStreamToStreamOp(this)) {
        yield* this.stream.iteratePrimitives();
    } else if (isUnaryTableToStreamOp(this)) {
        yield* this.table.iteratePrimitives();
    } else if (this.isJoin) {
        yield* this.stream.iteratePrimitives();
        yield* this.table.iteratePrimitives();
    } else {
        throw new TypeError("Can't handle " + this);
    }
};

Ast.Table.prototype.iteratePrimitives = function* iteratePrimitivesTable() {
    if (this.isVarRef) {
        // this will be handled when we visit the declaration
    } else if (this.isInvocation) {
        yield ['table', this.invocation];
    } else if (this.isFilter) {
        yield* this.table.iteratePrimitives();
        yield* this.filter.iteratePrimitives();
    } else if (isUnaryTableToTableOp(this)) {
        yield* this.table.iteratePrimitives();
    } else if (isUnaryStreamToTableOp(this)) {
        yield* this.stream.iteratePrimitives();
    } else if (this.isJoin) {
        yield* this.lhs.iteratePrimitives();
        yield* this.rhs.iteratePrimitives();
    } else {
        throw new TypeError("Can't handle " + this);
    }
};

Ast.BooleanExpression.prototype.iteratePrimitives = function* iteratePrimitivesFilter() {
    if (this.isTrue || this.isTrue || this.isAtom)
        return;
    if (this.isNot) {
        yield* this.expr.iteratePrimitives();
        return;
    }
    if (this.isAnd || this.isOr) {
        for (let op of this.operands)
            yield* op.iteratePrimitives();
        return;
    }

    assert(this.isExternal);
    yield ['filter', this];
    yield* this.filter.iteratePrimitives();
};


// *** lowering API ***

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

ProgramProto.lowerReturn = function(messaging) {
    let ourrules = [];
    let state = { token: 0, messaging, ourrules, newclasses: this.classes };
    this.rules.forEach((r) => {
        lowerReturnRule(state, r, this.principal);
    });
    return ourrules;
};