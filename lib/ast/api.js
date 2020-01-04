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
const { prettyprint,
        prettyprintExample,
        prettyprintFilterExpression,
        prettyprintDataset } = require('../prettyprint');

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
const {
    recursiveYieldArraySlots,
    makeScope,
    InputParamSlot,
    DeviceAttributeSlot,
    FilterSlot,
    ArrayIndexSlot,
    FieldSlot,
} = require('./slots');

const InvocationProto = Object.getPrototypeOf(new Ast.Invocation(Ast.Selector.Builtin, 'notify', [], null));
const DeclarationProto = Ast.Statement.Declaration.prototype;
const DatasetProto = Ast.Statement.Dataset.prototype;
const ExampleProto = Object.getPrototypeOf(new Ast.Example(-1, 'action', {}, new Ast.Action.VarRef('', [], null), [], [], {}));

const ProgramProto = Ast.Input.Program.prototype;

// utilities

/**
 * Utility function to create a `notify` or `return` action.
 *
 * @param {string} [what] - what action to create
 * @return {Ast.Action} the action node
 * @alias Ast.notifyAction
 */
function notifyAction(what = 'notify') {
    return new Ast.Action.Invocation(new Ast.Invocation(Ast.Selector.Builtin, what, [], Builtin.Actions[what]), Builtin.Actions[what]);
}
module.exports.notifyAction = notifyAction;

/**
 * Convert a manifest to a ThingTalk library.
 *
 * @param {string} kind - the class identifier
 * @param {Object} manifest - the manifest to convert
 * @return {Ast.Input.Library} the converted library
 * @deprecated Manifests are deprecated and should not be used. Use .tt files instead.
 * @alias Ast.fromManifest
 */
function fromManifest(kind, manifest) {
    return new Ast.Input.Meta([Ast.ClassDef.fromManifest(kind, manifest)], []);
}
module.exports.fromManifest = fromManifest;

/**
 * Convert a ThingTalk library to a manifest.
 *
 * @param {Ast.Input.Library} meta - the library to convert
 * @return {Object} the manifest
 * @deprecated Manifests are deprecated and should not be used. Use .tt files instead.
 * @alias Ast.toManifest
 */
function toManifest(meta) {
    assert(meta instanceof Ast.Input.Meta);
    return meta.classes[0].toManifest();
}
module.exports.toManifest = toManifest;

/**
 * Convert a declaration to a program.
 *
 * This will create a program that invokes the same code as the declaration value,
 * and will replace all parameters with slots.
 *
 * @return {Ast.Input.Program} the new program
 * @alias Ast.Statement.Declaration#toProgram
 */
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

    for (let slot of program.iterateSlots2()) {
        if (slot instanceof Ast.Selector)
            continue;
        recursiveHandleSlot(slot.get());
    }

    return program;
};

/**
 * Convert a dataset example to a program.
 *
 * This will create a program that invokes the same code as the example value,
 * and will replace all parameters with slots.
 *
 * @return {Ast.Input.Program} the new program
 * @alias Ast.Example#toProgram
 */
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

    for (let slot of program.iterateSlots2()) {
        if (slot instanceof Ast.Selector)
            continue;
        recursiveHandleSlot(slot.get());
    }

    return program;
};

/**
 * Convert this example to prettyprinted ThingTalk code.
 *
 * @param {string} [prefix] - prefix each output line with this string (for indentation)
 * @return {string} the prettyprinted code
 * @alias Ast.Example#prettyprint
 */
ExampleProto.prettyprint = function prettyprint(prefix = '') {
    return prettyprintExample(this, prefix);
};

/**
 * Convert this dataset to prettyprinted ThingTalk code.
 *
 * @param {string} [prefix] - prefix each output line with this string (for indentation)
 * @return {string} the prettyprinted code
 * @alias Ast.Dataset#prettyprint
 */
DatasetProto.prettyprint = function prettyprint(prefix = '') {
    return prettyprintDataset(this, prefix);
};

// *** typechecking API ***

/**
 * Typecheck this boolean expression.
 *
 * This method can be used to typecheck a boolean expression is isolation,
 * outside of a ThingTalk program.
 *
 * @param {Ast.ExpressionSignature} schema - the signature of the query expression this filter
 *                                           would be attached to
 * @param {null} scope - reserved, must be null
 * @param {SchemaRetriever} schemas - schema retriever object to retrieve Thingpedia information
 * @param {Object.<string,Ast.ClassDef>} classes - additional locally defined classes, overriding Thingpedia
 * @param {boolean} [useMeta=false] - retreive natural language metadata during typecheck
 * @alias Ast.BooleanExpression#typecheck
 */
Ast.BooleanExpression.prototype.typecheck = function(schema, scope, schemas, classes, useMeta) {
    return typeCheckFilter(this, schema, scope, schemas, classes, useMeta);
};

/**
 * Typecheck this ThingTalk input.
 *
 * This is the main API to typecheck a ThingTalk input.
 *
 * @param {SchemaRetriever} schemas - schema retriever object to retrieve Thingpedia information
 * @param {boolean} [getMeta=false] - retreive natural language metadata during typecheck
 * @alias Ast.Input#typecheck
 */
Ast.Input.prototype.typecheck = function(schemas, getMeta = false) {
    if (this.isBookkeeping)
        return typeCheckBookkeeping(this.intent, schemas, getMeta).then(() => this);
    if (this.isProgram)
        return typeCheckProgram(this, schemas, getMeta).then(() => this);
    else if (this.isPermissionRule)
        return typeCheckPermissionRule(this, schemas, getMeta).then(() => this);
    else if (this.isMeta)
        return typeCheckMeta(this, schemas, getMeta).then(() => this);
    else
        throw new Error('Invalid Input type');
};

/**
 * Typecheck this example.
 *
 * This method can be used to typecheck an example is isolation,
 * outside of a ThingTalk program. This is useful to typecheck a dataset
 * and discard examples that do not typecheck without failing the whole dataset.
 *
 * @param {SchemaRetriever} schemas - schema retriever object to retrieve Thingpedia information
 * @param {boolean} [getMeta=false] - retreive natural language metadata during typecheck
 * @alias Ast.Example#typecheck
 */
ExampleProto.typecheck = function(schemas, getMeta = false) {
    return typeCheckExample(this, schemas, {}, getMeta);
};

// *** prettyprinting API ***

/**
 * Convert this ThingTalk input to prettyprinted ThingTalk code.
 *
 * @param {string} [prefix] - prefix each output line with this string (for indentation)
 * @return {string} the prettyprinted code
 * @alias Ast.Input#prettyprint
 */
Ast.Input.prototype.prettyprint = function(short) {
    return prettyprint(this, short);
};
/**
 * Convert this boolean expression to prettyprinted ThingTalk code.
 *
 * @param {string} [prefix] - prefix each output line with this string (for indentation)
 * @return {string} the prettyprinted code
 * @alias Ast.BooleanExpression#prettyprint
 */
Ast.BooleanExpression.prototype.prettyprint = function() {
    return prettyprintFilterExpression(this);
};

// *** optimization API ***

/**
 * Optimize this boolean expression.
 *
 * Optimization removes redundant operations and converts ThingTalk to canonical form.
 *
 * @alias Ast.BooleanExpression#optimize
 */
Ast.BooleanExpression.prototype.optimize = function() {
    return optimizeFilter(this);
};
/**
 * Optimize this program.
 *
 * Optimization removes redundant operations and converts ThingTalk to canonical form.
 *
 * @alias Ast.Input.Program#optimize
 */
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
        filter.push(new Ast.BooleanExpression.Atom(inParam.name, '==', inParam.value));
    }
    filter = new Ast.BooleanExpression.And(filter);
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
            new Ast.BooleanExpression.And([inner.filter, table.filter]), inner.schema);
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

/**
 * Attempt to convert this program to an equivalent permission rule.
 *
 * @param {string} principal - the principal to use as source
 * @param {string|null} contactName - the display value for the principal
 * @return {Ast.Input.PermissionRule|null} the new permission rule, or `null` if conversion failed
 * @alias Ast.Input.Program#convertToPermissionRule
 */
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

    return new Ast.PermissionRule(new Ast.BooleanExpression.Atom(
        'source', '==',
        Ast.Value.Entity(principal, 'tt:contact', contactName)
    ), query, action);
};

// *** slot iteration ***

/**
 * Type used by the old slot iteration API.
 *
 * This is actually a tuple but jsdoc does not understand tuples.
 * @typedef Ast~OldSlot
 * @property {Ast.ExpressionSignature} 0 - the signature of the nearest primitive
 * @property {Ast.InputParam|Ast.BooleanExpression.Atom} 1 - the holder of the value
 * @property {Ast.Invocation} 2 - the nearest primitive
 * @property {Object.<string, Ast~SlotScopeItem>} 3 - available names for parameter passing
 * @generator
 * @deprecated Use {@link Ast~AbstractSlot} and the new slot iteration API
 */

/**
 * Iterate all slots (scalar value nodes) in this invocation.
 *
 * @alias Ast.Invocation#iterateSlots
 * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
 * @generator
 * @yields {Ast~OldSlot}
 * @deprecated Use {@link Ast.Invocation#iterateSlots2} instead.
 */
InvocationProto.iterateSlots = function* iterateSlotsInputParams(scope) {
    yield [null, this.selector, this, null];
    for (let in_param of this.in_params)
        yield [this.schema, in_param, this, scope];
    return [this, makeScope(this)];
};

function* iterateSlots2InputParams(prim, scope) {
    for (let in_param of prim.in_params) {
        const arg = prim.schema ? prim.schema.getArgument(in_param.name) : null;
        yield* recursiveYieldArraySlots(new InputParamSlot(prim, scope, arg, in_param));
    }
    return [prim, makeScope(prim)];
}

/**
 * Iterate all slots (scalar value nodes) in this invocation.
 *
 * @alias Ast.Invocation#iterateSlots2
 * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
 * @generator
 * @yields {Ast~AbstractSlot}
 */
InvocationProto.iterateSlots2 = function* iterateSlots2(scope) {
    if (this.selector.isDevice) {
        for (let attr of this.selector.attributes)
            yield new DeviceAttributeSlot(this, attr);

        // note that we yield the selector after the device attributes
        // this way, almond-dialog-agent will first ask any question to slot-fill
        // the device attributes (if somehow it needs to) and then use the chosen
        // device attributes to choose the device
        yield this.selector;
    }
    return yield* iterateSlots2InputParams(this, scope);
};

/**
 * Iterate all slots (scalar value nodes) in this action.
 *
 * @alias Ast.Action#iterateSlots
 * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
 * @generator
 * @yields {Ast~OldSlot}
 * @deprecated Use {@link Ast.Action#iterateSlots2} instead.
 */
Ast.Action.prototype.iterateSlots = function* iterateSlots(scope) {
    if (this.isInvocation) {
        yield* this.invocation.iterateSlots(scope);
    } else if (this.isVarRef) {
        for (let in_param of this.in_params)
            yield [this.schema, in_param, this, scope];
    }
};

/**
 * Iterate all slots (scalar value nodes) in this action.
 *
 * @alias Ast.Action#iterateSlots2
 * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
 * @generator
 * @yields {Ast~AbstractSlot}
 */
Ast.Action.prototype.iterateSlots2 = function* iterateSlots2(scope) {
    if (this.isInvocation)
        yield* this.invocation.iterateSlots2(scope);
    else if (this.isVarRef)
        yield* iterateSlots2InputParams(this, scope);
};

/**
 * Iterate all slots (scalar value nodes) in this boolean expression.
 *
 * @alias Ast.BooleanExpression#iterateSlots
 * @param {Ast.ExpressionSignature} schema - the signature of the query expression this filter is attached to
 * @param {Ast.Invocation} prim - the nearest primitive
 * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
 * @generator
 * @yields {Ast~OldSlot}
 * @deprecated Use {@link Ast.BooleanExpression#iterateSlots2} instead.
 */
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
        return;
    }
    if (this.isVarRef) {
        // TODO
        return;
    }
    if (this.isCompute) {
        // XXX this API cannot support Compute expressions
        return;
    }

    yield [schema, this, prim, scope];
};

/**
 * Iterate all slots (scalar value nodes) in this boolean expression.
 *
 * @alias Ast.BooleanExpression#iterateSlots2
 * @param {Ast.ExpressionSignature} schema - the signature of the query expression this filter is attached to
 * @param {Ast.Invocation} prim - the nearest primitive
 * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
 * @generator
 * @yields {Ast~AbstractSlot}
 */
Ast.BooleanExpression.prototype.iterateSlots2 = function* iterateSlots2(schema, prim, scope) {
    if (this.isTrue || this.isFalse)
        return;
    if (this.isAnd || this.isOr) {
        for (let op of this.operands)
            yield* op.iterateSlots2(schema, prim, scope);
        return;
    }
    if (this.isNot) {
        yield* this.expr.iterateSlots2(schema, prim, scope);
        return;
    }
    if (this.isCompute) {
        yield* recursiveYieldArraySlots(new FieldSlot(prim, scope, this.lhs.getType(), this, 'compute_filter', 'lhs'));
        yield* recursiveYieldArraySlots(new FieldSlot(prim, scope, this.rhs.getType(), this, 'compute_filter', 'rhs'));
        return;
    }
    if (this.isVarRef) {
        //TODO
        return;
    }
    if (this.isExternal) {
        yield this.selector;
        yield* iterateSlots2InputParams(this, scope);
        yield* this.filter.iterateSlots2(this.schema, this, makeScope(this));
    } else {
        const arg = schema ? schema.getArgument(this.name) : null;
        yield* recursiveYieldArraySlots(new FilterSlot(prim, scope, arg, this));
    }
};

/**
 * Iterate all slots (scalar value nodes) in this table.
 *
 * @alias Ast.Table#iterateSlots
 * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
 * @generator
 * @yields {Ast~OldSlot}
 * @deprecated Use {@link Ast.Table#iterateSlots2} instead.
 */
Ast.Table.prototype.iterateSlots = function* iterateSlotsTable(scope) {
    if (this.isVarRef) {
        for (let in_param of this.in_params)
            yield [this.schema, in_param, this, scope];
        return [this, makeScope(this)];
    } else if (this.isResultRef) {
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

/**
 * Iterate all slots (scalar value nodes) in this table.
 *
 * @alias Ast.Table#iterateSlots2
 * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
 * @generator
 * @yields {Ast~AbstractSlot}
 */
Ast.Table.prototype.iterateSlots2 = function* iterateSlots2(scope) {
    if (this.isVarRef) {
        return yield* iterateSlots2InputParams(this, scope);
    } else if (this.isResultRef) {
        const innerScope = makeScope(this);
        yield* recursiveYieldArraySlots(new FieldSlot(this, innerScope, Type.Number, this, 'result_ref', 'index'));
        return [this, innerScope];
    } else if (this.isInvocation) {
        return yield* this.invocation.iterateSlots2(scope);
    } else if (this.isFilter) {
        let [prim, newScope] = yield* this.table.iterateSlots2(scope);
        yield* this.filter.iterateSlots2(this.table.schema, prim, newScope);
        return [prim, newScope];
    } else if (this.isProjection) {
        let [prim, nestedScope] = yield* this.table.iterateSlots2(scope);
        if (nestedScope === null)
            return [prim, null];
        let newScope = {};
        for (let name of this.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    } else if (this.isIndex) {
        const [prim, innerScope] = yield* this.table.iterateSlots2(scope);
        for (let i = 0; i < this.indices.length; i++)
            yield* recursiveYieldArraySlots(new ArrayIndexSlot(prim, innerScope, Type.Number, this.indices, 'table.index', i));
        return [prim, innerScope];
    } else if (this.isSlice) {
        const [prim, innerScope] = yield* this.table.iterateSlots2(scope);
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, Type.Number, this, 'slice', 'base'));
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, Type.Number, this, 'slice', 'limit'));
        return [prim, innerScope];
    } else if (isUnaryTableToTableOp(this)) {
        return yield* this.table.iterateSlots2(scope);
    } else if (isUnaryStreamToTableOp(this)) {
        return yield* this.stream.iterateSlots2(scope);
    } else if (this.isJoin) {
        let [, leftScope] = yield* this.lhs.iterateSlots2(scope);
        let [, rightScope] = yield* this.rhs.iterateSlots2(scope);
        if (leftScope === null || rightScope === null)
            return [null, null];
        let newScope = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    } else {
        throw new TypeError("Can't handle " + this);
    }
};

/**
 * Iterate all slots (scalar value nodes) in this stream.
 *
 * @alias Ast.Stream#iterateSlots
 * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
 * @generator
 * @yields {Ast~OldSlot}
 * @deprecated Use {@link Ast.Stream#iterateSlots2} instead.
 */
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

/**
 * Iterate all slots (scalar value nodes) in this stream.
 *
 * @alias Ast.Stream#iterateSlots2
 * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
 * @generator
 * @yields {Ast~AbstractSlot}
 */
Ast.Stream.prototype.iterateSlots2 = function* iterateSlots2(scope) {
    if (this.isVarRef) {
        return yield* iterateSlots2InputParams(this, scope);
    } else if (this.isTimer) {
        // no primitive here
        yield* recursiveYieldArraySlots(new FieldSlot(null, scope, Type.Date, this, 'timer', 'base'));
        yield* recursiveYieldArraySlots(new FieldSlot(null, scope, Type.Measure('ms'), this, 'timer', 'interval'));
        return [null, {}];
    } else if (this.isAtTimer) {
        for (let i = 0; i < this.time.length; i++)
            yield* recursiveYieldArraySlots(new ArrayIndexSlot(null, scope, Type.Time, this.time, 'attimer.time', i));
        if (this.expiration_date !== null)
            yield* recursiveYieldArraySlots(new FieldSlot(null, scope, Type.Date, this, 'attimer', 'expiration_date'));
        return [null, {}];
    } else if (this.isWindow || this.isTimeSeries) {
        const [prim, innerScope] = this.stream.iterateSlots2(scope);
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, this.isWindow ? Type.Number : Type.Date, this, 'history', 'base'));
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, this.isWindow ? Type.Number : Type.Measure('ms'), this, 'history', 'delta'));
        return [prim, innerScope];
    } else if (this.isHistory || this.isSequence) {
        const [prim, innerScope] = this.table.iterateSlots2(scope);
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, this.isSequence ? Type.Number : Type.Date, this, 'history', 'base'));
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, this.isSequence ? Type.Number : Type.Measure('ms'), this, 'history', 'delta'));
        return [prim, innerScope];
    } else if (this.isFilter || this.isEdgeFilter) {
        let [prim, newScope] = yield* this.stream.iterateSlots2(scope);
        yield* this.filter.iterateSlots2(this.stream.schema, prim, newScope);
        return [prim, newScope];
    } else if (this.isProjection) {
        let [prim, nestedScope] = yield* this.stream.iterateSlots2(scope);
        if (nestedScope === null)
            return [prim, null];
        let newScope = {};
        for (let name of this.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    } else if (isUnaryStreamToStreamOp(this)) {
        return yield* this.stream.iterateSlots2(scope);
    } else if (isUnaryTableToStreamOp(this)) {
        return yield* this.table.iterateSlots2(scope);
    } else if (this.isJoin) {
        let [, leftScope] = yield* this.stream.iterateSlots2(scope);
        let [, rightScope] = yield* this.table.iterateSlots2(scope);
        if (leftScope === null || rightScope === null)
            return [null, null];
        let newScope = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    } else {
        throw new TypeError("Can't handle " + this);
    }
};

/**
 * Iterate all slots (scalar value nodes) in this example.
 *
 * @alias Ast.Example#iterateSlots
 * @generator
 * @yields {Ast~OldSlot}
 * @deprecated Use {@link Ast.Example#iterateSlots2} instead.
 */
ExampleProto.iterateSlots = function* iterateSlots() {
    yield* this.value.iterateSlots();
};

/**
 * Iterate all slots (scalar value nodes) in this example.
 *
 * @alias Ast.Example#iterateSlots2
 * @generator
 * @yields {Ast~AbstractSlot}
 */
ExampleProto.iterateSlots2 = function* iterateSlots2() {
    yield* this.value.iterateSlots2();
};

// *** primitive iteration ***

/**
 * Iterate all primitives (Thingpedia function invocations) in this example.
 *
 * @alias Ast.Example#iteratePrimitives
 * @param {boolean} includeVarRef - whether to include local function calls (VarRef nodes)
 *                                  in the iteration
 * @generator
 * @yields {Ast.Invocation}
 */
ExampleProto.iteratePrimitives = function* iterateExample(includeVarRef) {
    yield* this.value.iteratePrimitives(includeVarRef);
};

/**
 * Iterate all primitives (Thingpedia function invocations) in this stream.
 *
 * @alias Ast.Stream#iteratePrimitives
 * @param {boolean} includeVarRef - whether to include local function calls (VarRef nodes)
 *                                  in the iteration
 * @generator
 * @yields {Ast.Invocation}
 */
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

/**
 * Iterate all primitives (Thingpedia function invocations) in this table.
 *
 * @alias Ast.Table#iteratePrimitives
 * @param {boolean} includeVarRef - whether to include local function calls (VarRef nodes)
 *                                  in the iteration
 * @generator
 * @yields {Ast.Invocation}
 */
Ast.Table.prototype.iteratePrimitives = function* iteratePrimitivesTable(includeVarRef) {
    if (this.isVarRef) {
        if (includeVarRef)
            yield ['query', this];
    } else if (this.isResultRef) {
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

/**
 * Iterate all primitives (Thingpedia function invocations) in this action.
 *
 * @alias Ast.Action#iteratePrimitives
 * @param {boolean} includeVarRef - whether to include local function calls (VarRef nodes)
 *                                  in the iteration
 * @generator
 * @yields {Ast.Invocation}
 */
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

/**
 * Iterate all primitives (Thingpedia function invocations) in this boolean expression.
 *
 * @alias Ast.BooleanExpression#iteratePrimitives
 * @param {boolean} includeVarRef - whether to include local function calls (VarRef nodes)
 *                                  in the iteration
 * @generator
 * @yields {Ast.Invocation}
 */
Ast.BooleanExpression.prototype.iteratePrimitives = function* iteratePrimitivesFilter() {
    if (this.isTrue || this.isFalse || this.isAtom || this.isCompute)
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
    if (this.isVarRef) {
        // TODO
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
        new Ast.ArgumentDef(Ast.ArgDirection.IN_OPT, '__response', Type.String)
    ];
    for (let argname in sendFrom.schema.out)
        args.push(new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, argname, sendFrom.schema.out[argname]));
    return new Ast.FunctionDef('action', null, 'send', [], {}, args, {});
}
function makeReceiveSchema(receiveFrom) {
    const args = [
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, '__principal', Type.Entity('tt:contact')),
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, '__program_id', Type.Entity('tt:program_id')),
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, '__flow', Type.Number),
        new Ast.ArgumentDef(Ast.ArgDirection.OUT, '__kindChannel', Type.Entity('tt:function')),
        new Ast.ArgumentDef(Ast.ArgDirection.OUT, '__response', Type.String)
    ];
    for (let argname in receiveFrom.schema.out)
        args.push(new Ast.ArgumentDef(Ast.ArgDirection.OUT, argname, receiveFrom.schema.out[argname]));

    return new Ast.FunctionDef('query', null, 'receive', [], { is_list: true, is_monitorable: true}, args, {});
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
        new Ast.InputParam('__principal', getSelf(state.messaging, principal)),
        new Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        new Ast.InputParam('__flow',  Ast.Value.Number(token)),
        new Ast.InputParam('__kindChannel', Ast.Value.Event('type'))
    ];
    for (let name in lastPrimitive.schema.out)
        sendInputs.push(new Ast.InputParam(name, new Ast.Value.VarRef(name)));
    action.invocation.selector = new Ast.Selector.Device(localClass.name, null, null);
    action.invocation.channel = 'send';
    action.invocation.in_params = sendInputs;
    action.invocation.schema = sendSchema;
    action.schema = null;

    let receiveInputs = [
        new Ast.InputParam('__principal', principal),
        new Ast.InputParam('__program_id', Ast.Value.Event('program_id')),
        new Ast.InputParam('__flow',  Ast.Value.Number(token))
    ];
    let receiveTrigger = new Ast.Stream.Monitor(
        new Ast.Table.Invocation(
            new Ast.Invocation(new Ast.Selector.Device(toSendClass.name, null, null), 'receive', receiveInputs, receiveSchema),
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
