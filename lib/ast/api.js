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

const Ast = require('.');
const Type = require('../type');
const Builtin = require('../builtin/defs');
const { prettyprint, prettyprintExample, prettyprintFilterExpression } = require('../prettyprint');

const { isUnaryStreamToStreamOp,
        isUnaryTableToTableOp,
        isUnaryStreamToTableOp,
        isUnaryTableToStreamOp } = require('../utils');
const { optimizeFilter, optimizeProgram } = require('../optimize');
let { typeCheckFilter,
      typeCheckProgram,
      typeCheckExample,
      typeCheckPermissionRule,
      typeCheckMeta,
      typeCheckBookkeeping } = require('../typecheck');

const InvocationProto = Object.getPrototypeOf(new Ast.Invocation(Ast.Selector.Builtin, 'notify', [], null));
const DeclarationProto = Ast.Statement.Declaration.prototype;
const ExampleProto = Object.getPrototypeOf(new Ast.Example(-1, 'action', {}, new Ast.Action.VarRef('', [], null), [], [], {}));

const ProgramProto = Ast.Input.Program.prototype;

// utilities

function notifyAction(what = 'notify') {
    return new Ast.Action.Invocation(new Ast.Invocation(Ast.Selector.Builtin, what, [], Builtin.Actions[what]), Builtin.Actions[what]);
}
module.exports.notifyAction = notifyAction;

function fromManifest(kind, manifest) {
    return new Ast.Input.Meta([Ast.ClassDef.fromManifest(kind, manifest)], []);
}
module.exports.fromManifest = fromManifest;

function toManifest(meta) {
    assert(meta instanceof Ast.Input.Meta);
    return meta.classes[0].toManifest();
}
module.exports.toManifest = toManifest;

DeclarationProto.toProgram = function toProgram() {
    const nametoslot = {};

    let i = 0;
    for (let name in this.args)
        nametoslot[name] = i++;

    let program;
    if (this.type === 'action')
        program = new Ast.Program([], [], [new Ast.Statement.Command(null, [this.value.clone()])], null);
    else if (this.type === 'query')
        program = new Ast.Program([], [], [new Ast.Statement.Command(this.value.clone(), [notifyAction()])], null);
    else
        program = new Ast.Program([], [], [new Ast.Statement.Rule(this.value.clone(), [notifyAction()])], null);

    function recursiveHandleSlot(value) {
        if (value.isVarRef && value.name in nametoslot) {
            value.name = '__const_SLOT_' + nametoslot[value.name];
        } else if (value.isArray) {
            for (let v of value.value)
                recursiveHandleSlot(v);
        }
    }

    for (let [, slot] of program.iterateSlots()) {
        if (slot instanceof Ast.Selector)
            continue;
        recursiveHandleSlot(slot.value);
    }

    return program;
};

ExampleProto.toProgram = function toProgram() {
    const nametoslot = {};

    let i = 0;
    for (let name in this.args)
        nametoslot[name] = i++;

    let program;
    if (this.type === 'action')
        program = new Ast.Program([], [], [new Ast.Statement.Command(null, [this.value.clone()])], null);
    else if (this.type === 'query')
        program = new Ast.Program([], [], [new Ast.Statement.Command(this.value.clone(), [notifyAction()])], null);
    else if (this.type === 'stream')
        program = new Ast.Program([], [], [new Ast.Statement.Rule(this.value.clone(), [notifyAction()])], null);
    else
        program = this.value.clone();

    function recursiveHandleSlot(value) {
        if (value.isVarRef && value.name in nametoslot) {
            value.name = '__const_SLOT_' + nametoslot[value.name];
        } else if (value.isArray) {
            for (let v of value.value)
                recursiveHandleSlot(v);
        }
    }

    for (let [, slot] of program.iterateSlots()) {
        if (slot instanceof Ast.Selector)
            continue;
        recursiveHandleSlot(slot.value);
    }

    return program;
};

ExampleProto.prettyprint = function prettyprint(prefix = '') {
    return prettyprintExample(this, prefix);
};

// *** typechecking API ***

Ast.BooleanExpression.prototype.typecheck = function(schema, scope, schemas, classes, useMeta) {
    return typeCheckFilter(this, schema, scope, schemas, classes, useMeta);
};

Ast.Input.prototype.typecheck = function(schemas, getMeta = false) {
    if (this.isBookkeeping)
        return typeCheckBookkeeping(this.intent).then(() => this);
    if (this.isProgram)
        return typeCheckProgram(this, schemas, getMeta).then(() => this);
    else if (this.isPermissionRule)
        return typeCheckPermissionRule(this, schemas, getMeta).then(() => this);
    else if (this.isMeta)
        return typeCheckMeta(this, schemas, getMeta).then(() => this);
    else
        throw new Error('Invalid Input type');
};

ExampleProto.typecheck = function(schemas, getMeta = false) {
    return typeCheckExample(this, schemas, {}, getMeta);
};

// *** prettyprinting API ***

Ast.Input.prototype.prettyprint = function(short) {
    return prettyprint(this, short);
};
Ast.BooleanExpression.prototype.prettyprint = function() {
    return prettyprintFilterExpression(this);
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

function convertActionToPermission(action) {
    if (action.isInvocation)
        return convertPrimitiveToPermission(action.invocation);

    console.log(`NOT IMPLEMENTED: converting action ${action} to permission function`);
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
    const action = convertActionToPermission(rule.actions[0]);
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

Ast.Action.prototype.iterateSlots = function* iterateSlots(scope) {
    if (this.isInvocation) {
        yield* this.invocation.iterateSlots(scope);
    } else if (this.isVarRef) {
        for (let in_param of this.in_params)
            yield [this.schema, in_param, this, scope];
    }
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
        for (let in_param of this.in_params)
            yield [this.schema, in_param, this, scope];
        return [this, makeScope(this)];
    } else if (this.isInvocation) {
        return yield* this.invocation.iterateSlots(scope);
    } else if (this.isFilter) {
        let [prim, newScope] = yield* this.table.iterateSlots(scope);
        yield* this.filter.iterateSlots(this.table.schema, prim, newScope);
        return [prim, newScope];
    } else if (this.isProjection) {
        let [prim, nestedScope] = yield* this.table.iterateSlots(scope);
        if (nestedScope === null)
            return [prim, null];
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
        if (leftScope === null || rightScope === null)
            return [null, null];
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
    if (!schema)
        return null;
    const scope = {};
    for (let argname in schema.out) {
        let index = schema.index[argname];
        let argcanonical = schema.argcanonicals[index] || argname;
        scope[argname] = {
            value: Ast.Value.VarRef(argname),
            type: schema.out[argname],
            argcanonical: argcanonical,
            kind: invocation.isVarRef ? null : invocation.selector.kind
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
        for (let in_param of this.in_params)
            yield [this.schema, in_param, this, scope];
        return [this, makeScope(this)];
    } else if (this.isTimer || this.isAtTimer) {
        // no primitive here
        return [null, {}];
    } else if (this.isFilter || this.isEdgeFilter) {
        let [prim, newScope] = yield* this.stream.iterateSlots(scope);
        yield* this.filter.iterateSlots(this.stream.schema, prim, newScope);
        return [prim, newScope];
    } else if (this.isProjection) {
        let [prim, nestedScope] = yield* this.stream.iterateSlots(scope);
        if (nestedScope === null)
            return [prim, null];
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
        if (leftScope === null || rightScope === null)
            return [null, null];
        let newScope = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    } else {
        throw new TypeError("Can't handle " + this);
    }
};

ExampleProto.iterateSlots = function* iterateSlots() {
    yield* this.value.iterateSlots();
};

// *** primitive iteration ***
ExampleProto.iteratePrimitives = function* iterateExample(includeVarRef) {
    yield* this.value.iteratePrimitives(includeVarRef);
};

Ast.Stream.prototype.iteratePrimitives = function* iteratePrimitivesStream(includeVarRef) {
    if (this.isVarRef) {
        if (includeVarRef)
            yield ['stream', this];
    } else if (this.isTimer || this.isAtTimer) {
        // no primitive here
    } else if (this.isFilter || this.isEdgeFilter) {
        yield* this.stream.iteratePrimitives(includeVarRef);
        yield* this.filter.iteratePrimitives();
    } else if (isUnaryStreamToStreamOp(this)) {
        yield* this.stream.iteratePrimitives(includeVarRef);
    } else if (isUnaryTableToStreamOp(this)) {
        yield* this.table.iteratePrimitives(includeVarRef);
    } else if (this.isJoin) {
        yield* this.stream.iteratePrimitives(includeVarRef);
        yield* this.table.iteratePrimitives(includeVarRef);
    } else {
        throw new TypeError("Can't handle " + this);
    }
};

Ast.Table.prototype.iteratePrimitives = function* iteratePrimitivesTable(includeVarRef) {
    if (this.isVarRef) {
        if (includeVarRef)
            yield ['query', this];
    } else if (this.isInvocation) {
        yield ['query', this.invocation];
    } else if (this.isFilter) {
        yield* this.table.iteratePrimitives(includeVarRef);
        yield* this.filter.iteratePrimitives();
    } else if (isUnaryTableToTableOp(this)) {
        yield* this.table.iteratePrimitives(includeVarRef);
    } else if (isUnaryStreamToTableOp(this)) {
        yield* this.stream.iteratePrimitives(includeVarRef);
    } else if (this.isJoin) {
        yield* this.lhs.iteratePrimitives(includeVarRef);
        yield* this.rhs.iteratePrimitives(includeVarRef);
    } else {
        throw new TypeError("Can't handle " + this);
    }
};

Ast.Action.prototype.iteratePrimitives = function* iteratePrimitivesAction(includeVarRef) {
    if (this.isVarRef) {
        if (includeVarRef)
            yield ['action', this];
    } else if (this.isInvocation) {
        yield ['action', this.invocation];
    } else {
        throw new TypeError("Can't handle " + this);
    }
};

Ast.BooleanExpression.prototype.iteratePrimitives = function* iteratePrimitivesFilter() {
    if (this.isTrue || this.isFalse || this.isAtom)
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

function getSelf(messaging, sendTo) {
    if (messaging.getSelf)
        return Ast.Value.Entity(messaging.getSelf(sendTo.value), 'tt:contact', "me");
    else
        return Ast.Value.Entity(messaging.type + '-account:' + messaging.account, 'tt:contact', "me");
}

function makeSendSchema(sendFrom, secondSendFrom) {
    const args = [
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, '__principal', Type.Entity('tt:contact')),
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, '__program_id', Type.Entity('tt:program_id')),
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, '__flow', Type.Number),
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, '__kindChannel', Type.Entity('tt:function')),
    ];
    for (let argname in sendFrom.schema.out)
        args.push(new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, argname, sendFrom.schema.out[argname]));
    return new Ast.FunctionDef('action', 'send', args, false, false);
}
function makeReceiveSchema(receiveFrom) {
    const args = [
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, '__principal', Type.Entity('tt:contact')),
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, '__program_id', Type.Entity('tt:program_id')),
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, '__flow', Type.Number),
        new Ast.ArgumentDef(Ast.ArgDirection.OUT, '__kindChannel', Type.Entity('tt:function')),
    ];
    for (let argname in receiveFrom.schema.out)
        args.push(new Ast.ArgumentDef(Ast.ArgDirection.OUT, argname, receiveFrom.schema.out[argname]));
    return new Ast.FunctionDef('query', 'receive', args, true, true);
}

function makeDynamicClass(classes, sendSchema, receiveSchema) {
    var classdef = new Ast.ClassDef('__dyn_' + classes.length, ['org.thingpedia.builtin.thingengine.remote'],
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
    if (!action.isInvocation || !action.invocation.selector.isBuiltin || action.invocation.channel !== 'return')
        return;
    if (principal === null || lastPrimitive === null) {
        action.invocation.channel = 'notify';
        return;
    }
    assert(lastPrimitive);

    let token = makeToken(state);
    let sendSchema = makeSendSchema(lastPrimitive);
    let receiveSchema = makeReceiveSchema(lastPrimitive);
    let localClass = makeDynamicClass(state.newclasses, sendSchema, null);
    let toSendClass = makeDynamicClass([], null, receiveSchema);

    let sendInputs = [
        Ast.InputParam('__principal', getSelf(state.messaging, principal)),
        Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        Ast.InputParam('__flow',  Ast.Value.Number(token)),
        Ast.InputParam('__kindChannel', Ast.Value.Event('type'))
    ];
    for (let name in lastPrimitive.schema.out)
        sendInputs.push(Ast.InputParam(name, Ast.Value.VarRef(name)));
    action.invocation.selector = Ast.Selector.Device(localClass.name, null, null);
    action.invocation.channel = 'send';
    action.invocation.in_params = sendInputs;
    action.invocation.schema = sendSchema;
    action.schema = null;

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
        new Ast.Statement.Rule(receiveTrigger, [notifyAction()])
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
