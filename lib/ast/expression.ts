// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Silei Xu <silei@cs.stanford.edu>

import assert from 'assert';

import Node, { SourceRange } from './base';
import NodeVisitor from './visitor';
import { ClassDef } from './class_def';
import { ExpressionSignature } from './function_def';
import { Value } from './values';

import { prettyprintFilterExpression } from '../prettyprint';
import * as Typechecking from '../typecheck';
import * as Optimizer from '../optimize';
import SchemaRetriever from '../schema';
import {
    iterateSlots2InputParams,
    recursiveYieldArraySlots,
    makeScope,
    DeviceAttributeSlot,
    FilterSlot,
    FieldSlot,
    AbstractSlot,
    OldSlot,
    ScopeMap,
    InvocationLike
} from './slots';

/**
 * Base class of all expressions that select a device.
 *
 * Selectors correspond to the `@`-device part of the ThingTalk code,
 * up to but not including the function name.
 *
 * @alias Ast.Selector
 * @extends Ast~Node
 * @property {boolean} isDevice - true if this is an instance of {@link Ast.Selector.Device}
 * @property {boolean} isBuiltin - true if this is {@link Ast.Selector.Builtin}
 */
export abstract class Selector extends Node {
    static Device : any;
    isDevice ! : boolean;
    static Builtin : any;
    isBuiltin ! : boolean;

    abstract clone() : Selector;
    abstract equals(other : Selector) : boolean;
}
Selector.prototype.isDevice = false;
Selector.prototype.isBuiltin = false;

/**
 * A selector that maps to one or more devices in Thingpedia.
 *
 * @alias Ast.Selector.Device
 * @extends Ast.Selector
 */
export class DeviceSelector extends Selector {
    kind : string;
    id : string|null;
    principal : null;
    attributes : InputParam[];
    all : boolean;

    /**
     * Construct a new device selector.
     *
     * @param location - the position of this node in the source code
     * @param kind - the Thingpedia class ID
     * @param id - the unique ID of the device being selected, or null
     *                           to select devices according to the attributes, or
     *                           all devices if no attributes are specified
     * @param principal - reserved/deprecated, must be `null`
     * @param attributes - other attributes used to select a device, if ID is unspecified
     * @param [all=false] - operate on all devices that match the attributes, instead of
     *                                having the user choose
     */
    constructor(location : SourceRange|null,
                kind : string,
                id : string|null,
                principal : null,
                attributes : InputParam[] = [],
                all = false) {
        super(location);

        assert(typeof kind === 'string');
        this.kind = kind;

        assert(typeof id === 'string' || id === null);
        this.id = id;

        assert(principal === null);
        this.principal = principal;

        this.attributes = attributes;

        this.all = all;
    }

    clone() : DeviceSelector {
        const attributes = this.attributes.map((attr) => attr.clone());
        return new DeviceSelector(this.location, this.kind, this.id, this.principal, attributes, this.all);
    }

    equals(other : Selector) : boolean {
        return other instanceof DeviceSelector &&
            this.kind === other.kind &&
            this.id === other.id &&
            arrayEquals(this.attributes, other.attributes) &&
            this.all === other.all;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDeviceSelector(this)) {
            for (const attr of this.attributes)
                attr.visit(visitor);
        }
        visitor.exit(this);
    }

    toString() : string {
        return `Device(${this.kind}, ${this.id ? this.id : ''}, )`;
    }
}
DeviceSelector.prototype.isDevice = true;
Selector.Device = DeviceSelector;

export class BuiltinSelector extends Selector {
    constructor() {
        super(null);
    }

    clone() : BuiltinSelector {
        return this;
    }

    equals(other : Selector) : boolean {
        return this === other;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitBuiltinSelector(this);
        visitor.exit(this);
    }

    toString() : string {
        return 'Builtin';
    }
}
BuiltinSelector.prototype.isBuiltin = true;

/**
 * A selector that maps the builtin `notify`, `return` and `save` functions.
 *
 * This is a singleton, not a class.
 *
 * @alias Ast.Selector.Builtin
 * @readonly
 */
Selector.Builtin = new BuiltinSelector();

/**
 * AST node corresponding to an input parameter passed to a function.
 *
 * @alias Ast.InputParam
 * @extends Ast~Node
 * @property {boolean} isInputParam - true
 */
export class InputParam extends Node {
    isInputParam = true;
    name : string;
    value : Value;

    /**
     * Construct a new input parameter node.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the input argument name
     * @param {Ast.Value} value - the value being passed
     */
    constructor(location : SourceRange|null,
                name : string,
                value : Value) {
        super(location);

        assert(typeof name === 'string');
        /**
         * The input argument name.
         * @type {string}
         * @readonly
         */
        this.name = name;

        assert(value instanceof Value);
        /**
         * The value being passed.
         * @type {Ast.Value}
         * @readonly
         */
        this.value = value;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitInputParam(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    clone() : InputParam {
        return new InputParam(this.location, this.name, this.value.clone());
    }

    equals(other : InputParam) : boolean {
        return this.name === other.name &&
            this.value.equals(other.value);
    }

    toString() : string {
        return `InputParam(${this.name}, ${this.value})`;
    }
}

/**
 * An invocation of a ThingTalk function.
 *
 * @alias Ast.Invocation
 * @extends Ast~Node
 */
export class Invocation extends Node {
    isInvocation = true;
    selector : Selector;
    channel : string;
    in_params : InputParam[];
    schema : ExpressionSignature|null;

    /**
     * Construct a new invocation.
     *
     * @param location - the position of this node in the source code
     * @param {Ast.Selector} selector - the selector choosing where the function is invoked
     * @param {string} channel - the function name
     * @param {Ast.InputParam[]} in_params - input parameters passed to the function
     * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
     * @property {boolean} isInvocation - true
     */
    constructor(location : SourceRange|null,
                selector : Selector,
                channel : string,
                in_params : InputParam[],
                schema : ExpressionSignature|null) {
        super(location);

        assert(selector instanceof Selector);
        /**
         * The selector choosing where the function is invoked.
         * @type {Ast.Selector}
         * @readonly
         */
        this.selector = selector;

        assert(typeof channel === 'string');

        /**
         * The function name being invoked.
         * @type {string}
         * @readonly
         */
        this.channel = channel;

        assert(Array.isArray(in_params));
        /**
         * The input parameters passed to the function.
         * @type {Ast.InputParam[]}
         * @readonly
         */
        this.in_params = in_params;

        assert(schema === null || schema instanceof ExpressionSignature);
        /**
         * Type signature of the invoked function (not of the invocation itself).
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.ExpressionSignature|null}
         */
        this.schema = schema;
    }

    clone() : Invocation {
        return new Invocation(
            this.location,
            this.selector.clone(),
            this.channel,
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone(): null
        );
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitInvocation(this)) {
            this.selector.visit(visitor);
            for (const in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }

    toString() : string {
        const in_params = this.in_params && this.in_params.length > 0 ? this.in_params.toString() : '';
        return `Invocation(${this.selector.toString()}, ${this.channel}, ${in_params}, )`;
    }

    /**
     * Iterate all slots (scalar value nodes) in this invocation.
     *
     * @param scope - available names for parameter passing
     * @deprecated Use {@link Ast.Invocation#iterateSlots2} instead.
     */
    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike, ScopeMap]> {
        yield [null, this.selector, this, {}];
        for (const in_param of this.in_params)
            yield [this.schema, in_param, this, scope];
        return [this, makeScope(this)];
    }

    /**
     * Iterate all slots (scalar value nodes) in this invocation.
     *
     * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
     * @yields {Ast~AbstractSlot}
     */
    *iterateSlots2(scope : ScopeMap) : Generator<Selector|AbstractSlot, [InvocationLike, ScopeMap]> {
        if (this.selector instanceof DeviceSelector) {
            for (const attr of this.selector.attributes)
                yield new DeviceAttributeSlot(this, attr);

            // note that we yield the selector after the device attributes
            // this way, almond-dialog-agent will first ask any question to slot-fill
            // the device attributes (if somehow it needs to) and then use the chosen
            // device attributes to choose the device
            yield this.selector;
        }
        return yield* iterateSlots2InputParams(this, scope);
    }
}

/**
 * An expression that computes a boolean predicate.
 * This AST node is used in filter expressions.
 *
 * @class
 * @alias Ast.BooleanExpression
 * @extends Ast~Node
 * @abstract
 * @property {boolean} isBooleanExpression - true
 * @property {boolean} isAnd - true if this is an instance of {@link Ast.BooleanExpression.And}
 * @property {boolean} isOr - true if this is an instance of {@link Ast.BooleanExpression.Or}
 * @property {boolean} isAtom - true if this is an instance of {@link Ast.BooleanExpression.Atom}
 * @property {boolean} isNot - true if this is an instance of {@link Ast.BooleanExpression.Not}
 * @property {boolean} isExternal - true if this is an instance of {@link Ast.BooleanExpression.External}
 * @property {boolean} isTrue - true if this is {@link Ast.BooleanExpression.True}
 * @property {boolean} isFalse - true if this is {@link Ast.BooleanExpression.False}
 * @property {boolean} isCompute - true if this is {@link Ast.BooleanExpression.Compute}
 */
export abstract class BooleanExpression extends Node {
    static And : any;
    isAnd ! : boolean;
    static Or : any;
    isOr ! : boolean;
    static Atom : any;
    isAtom ! : boolean;
    static Not : any;
    isNot ! : boolean;
    static External : any;
    isExternal ! : boolean;
    static True : any;
    isTrue ! : boolean;
    static False : any;
    isFalse ! : boolean;
    static Compute : any;
    isCompute ! : boolean;
    static DontCare : any;
    isDontCare ! : boolean;

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
    typecheck(schema : ExpressionSignature,
              scope : null,
              schemas : SchemaRetriever,
              classes : { [key : string] : ClassDef },
              useMeta : boolean) : Promise<this> {
        return Typechecking.typeCheckFilter(this, schema, scope, schemas, classes, useMeta);
    }

    /**
     * Convert this boolean expression to prettyprinted ThingTalk code.
     *
     * @param {string} [prefix] - prefix each output line with this string (for indentation)
     * @return {string} the prettyprinted code
     * @alias Ast.BooleanExpression#prettyprint
     */
    prettyprint() : string {
        return prettyprintFilterExpression(this);
    }

    optimize() : BooleanExpression {
        return Optimizer.optimizeFilter(this);
    }

    abstract clone() : BooleanExpression;
    abstract equals(other : BooleanExpression) : boolean;

    /**
     * Iterate all slots (scalar value nodes) in this boolean expression.
     *
     * @deprecated Use {@link Ast.BooleanExpression#iterateSlots2} instead.
     */
    abstract iterateSlots(schema : ExpressionSignature|null,
                          prim : InvocationLike|null,
                          scope : ScopeMap) : Generator<OldSlot, void>;

    /**
     * Iterate all slots (scalar value nodes) in this boolean expression.
     */
    abstract iterateSlots2(schema : ExpressionSignature|null,
                           prim : InvocationLike|null,
                           scope : ScopeMap) : Generator<Selector|AbstractSlot, void>;
}
BooleanExpression.prototype.isAnd = false;
BooleanExpression.prototype.isOr = false;
BooleanExpression.prototype.isAtom = false;
BooleanExpression.prototype.isNot = false;
BooleanExpression.prototype.isExternal = false;
BooleanExpression.prototype.isTrue = false;
BooleanExpression.prototype.isFalse = false;
BooleanExpression.prototype.isCompute = false;
BooleanExpression.prototype.isDontCare = false;

interface EqualsComparable {
    equals(x : unknown) : boolean;
}

function arrayEquals<T extends EqualsComparable>(a1 : T[], a2 : T[]) : boolean {
    if (a1 === a2)
        return true;
    if (a1.length !== a2.length)
        return false;
    for (let i = 0; i < a1.length; i++) {
        if (!a1[i].equals(a2[i]))
            return false;
    }
    return true;
}

/**
 * A conjunction boolean expression (ThingTalk operator `&&`)
 * @alias Ast.BooleanExpression.And
 * @extends Ast.BooleanExpression
 */
export class AndBooleanExpression extends BooleanExpression {
    /**
     * The expression operands.
     */
    operands : BooleanExpression[];

    /**
     * Construct a new And expression.
     *
     * @param location - the position of this node in the source code
     * @param operands - the expression operands
     */
    constructor(location : SourceRange|null, operands : BooleanExpression[]) {
        super(location);

        assert(Array.isArray(operands));
        this.operands = operands;
    }

    equals(other : BooleanExpression) : boolean {
        return other instanceof AndBooleanExpression &&
            arrayEquals(this.operands, other.operands);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAndBooleanExpression(this)) {
            for (const operand of this.operands)
                operand.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : AndBooleanExpression {
        return new AndBooleanExpression(
            this.location,
            this.operands.map((operand) => operand.clone())
        );
    }

    *iterateSlots(schema : ExpressionSignature|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        for (const op of this.operands)
            yield* op.iterateSlots(schema, prim, scope);
    }

    *iterateSlots2(schema : ExpressionSignature|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<Selector|AbstractSlot, void> {
        for (const op of this.operands)
            yield* op.iterateSlots2(schema, prim, scope);
    }
}
BooleanExpression.And = AndBooleanExpression;
BooleanExpression.And.prototype.isAnd = true;
/**
 * A disjunction boolean expression (ThingTalk operator `||`)
 * @alias Ast.BooleanExpression.Or
 * @extends Ast.BooleanExpression
 */
export class OrBooleanExpression extends BooleanExpression {
    /**
     * The expression operands.
     */
    operands : BooleanExpression[];

    /**
     * Construct a new Or expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.BooleanExpression[]} operands - the expression operands
     */
    constructor(location : SourceRange|null, operands : BooleanExpression[]) {
        super(location);

        assert(Array.isArray(operands));
        this.operands = operands;
    }

    equals(other : BooleanExpression) : boolean {
        return other instanceof OrBooleanExpression &&
            arrayEquals(this.operands, other.operands);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitOrBooleanExpression(this)) {
            for (const operand of this.operands)
                operand.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : OrBooleanExpression {
        return new OrBooleanExpression(
            this.location,
            this.operands.map((operand) => operand.clone())
        );
    }

    *iterateSlots(schema : ExpressionSignature|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        for (const op of this.operands)
            yield* op.iterateSlots(schema, prim, scope);
    }

    *iterateSlots2(schema : ExpressionSignature|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<Selector|AbstractSlot, void> {
        for (const op of this.operands)
            yield* op.iterateSlots2(schema, prim, scope);
    }
}
BooleanExpression.Or = OrBooleanExpression;
BooleanExpression.Or.prototype.isOr = true;
/**
 * A comparison expression (predicate atom)
 * @alias Ast.BooleanExpression.Atom
 * @extends Ast.BooleanExpression
 */
export class AtomBooleanExpression extends BooleanExpression {
    name : string;
    operator : string;
    value : Value;

    /**
     * Construct a new atom boolean expression.
     *
     * @param location - the position of this node in the source code
     * @param name - the parameter name to compare
     * @param operator - the comparison operator
     * @param value - the value being compared against
     */
    constructor(location : SourceRange|null,
                name : string,
                operator : string,
                value : Value) {
        super(location);

        assert(typeof name === 'string');
        /**
         * The parameter name to compare.
         * @type {string}
         * @readonly
         */
        this.name = name;

        assert(typeof operator === 'string');
        /**
         * The comparison operator.
         * @type {string}
         * @readonly
         */
        this.operator = operator;

        assert(value instanceof Value);
        /**
          * The value being compared against.
          * @type {Ast.Value}
          * @readonly
          */
        this.value = value;
    }

    equals(other : BooleanExpression) : boolean {
        return other instanceof AtomBooleanExpression &&
            this.name === other.name &&
            this.operator === other.operator &&
            this.value.equals(other.value);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAtomBooleanExpression(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    clone() : AtomBooleanExpression {
        return new AtomBooleanExpression(
            this.location,
            this.name, this.operator, this.value.clone()
        );
    }

    toString() : string {
        return `Atom(${this.name}, ${this.operator}, ${this.value})`;
    }

    *iterateSlots(schema : ExpressionSignature|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        yield [schema, this, prim, scope];
    }

    *iterateSlots2(schema : ExpressionSignature|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<Selector|AbstractSlot, void> {
        const arg = (schema ? schema.getArgument(this.name) : null) || null;
        yield* recursiveYieldArraySlots(new FilterSlot(prim, scope, arg, this));
    }
}
BooleanExpression.Atom = AtomBooleanExpression;
BooleanExpression.Atom.prototype.isAtom = true;
/**
 * A negation boolean expression (ThingTalk operator `!`)
 * @alias Ast.BooleanExpression.Not
 * @extends Ast.BooleanExpression
 */
export class NotBooleanExpression extends BooleanExpression {
    expr : BooleanExpression;

    /**
     * Construct a new Not expression.
     *
     * @param location - the position of this node in the source code
     * @param expr - the expression being negated
     */
    constructor(location : SourceRange|null, expr : BooleanExpression) {
        super(location);

        assert(expr instanceof BooleanExpression);
        /**
         * The expression being negated.
         * @type {Ast.BooleanExpression}
         * @readonly
         */
        this.expr = expr;
    }

    equals(other : BooleanExpression) : boolean {
        return other instanceof NotBooleanExpression &&
            this.expr.equals(other.expr);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitNotBooleanExpression(this))
            this.expr.visit(visitor);
        visitor.exit(this);
    }

    clone() : NotBooleanExpression {
        return new NotBooleanExpression(this.location, this.expr.clone());
    }

    *iterateSlots(schema : ExpressionSignature|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        yield* this.expr.iterateSlots(schema, prim, scope);
    }

    *iterateSlots2(schema : ExpressionSignature|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<Selector|AbstractSlot, void> {
        yield* this.expr.iterateSlots2(schema, prim, scope);
    }
}
BooleanExpression.Not = NotBooleanExpression;
BooleanExpression.Not.prototype.isNot = true;

/**
 * A boolean expression that calls a Thingpedia query function
 * and filters the result.
 *
 * The boolean expression is true if at least one result from the function
 * call satisfies the filter.
 *
 * @alias Ast.BooleanExpression.External
 * @extends Ast.BooleanExpression
 */
export class ExternalBooleanExpression extends BooleanExpression {
    selector : Selector;
    channel : string;
    in_params : InputParam[];
    filter : BooleanExpression;
    schema : ExpressionSignature|null;

    /**
     * Construct a new external boolean expression.
     *
     * @param {Ast.Selector.Device} selector - the selector choosing where the function is invoked
     * @param {string} channel - the function name
     * @param {Ast.InputParam[]} in_params - input parameters passed to the function
     * @param {Ast.BooleanExpression} filter - the filter to apply on the invocation's results
     * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
     */
    constructor(location : SourceRange|null,
                selector : Selector,
                channel : string,
                in_params : InputParam[],
                filter : BooleanExpression,
                schema : ExpressionSignature|null) {
        super(location);

        assert(selector instanceof Selector);
        /**
         * The selector choosing where the function is invoked.
         * @type {Ast.Selector}
         * @readonly
         */
        this.selector = selector;

        assert(typeof channel === 'string');
        /**
         * The function name being invoked.
         * @type {string}
         * @readonly
         */
        this.channel = channel;

        assert(Array.isArray(in_params));
        /**
         * The input parameters passed to the function.
         * @type {Ast.InputParam[]}
         * @readonly
         */
        this.in_params = in_params;

        assert(filter instanceof BooleanExpression);
        /**
         * The predicate to apply on the invocation's results.
         * @type {Ast.BooleanExpression}
         * @readonly
         */
        this.filter = filter;

        assert(schema === null || schema instanceof ExpressionSignature);
        /**
         * Type signature of the invoked function (not of the boolean expression itself).
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.ExpressionSignature|null}
         */
        this.schema = schema;
    }

    toString() : string {
        return `External(${this.selector}, ${this.channel}, ${this.in_params}, ${this.filter})`;
    }

    equals(other : BooleanExpression) : boolean {
        return other instanceof ExternalBooleanExpression &&
            this.selector.equals(other.selector) &&
            this.channel === other.channel &&
            arrayEquals(this.in_params, other.in_params) &&
            this.filter.equals(other.filter);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitExternalBooleanExpression(this)) {
            this.selector.visit(visitor);
            for (const in_param of this.in_params)
                in_param.visit(visitor);
            this.filter.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : ExternalBooleanExpression {
        return new ExternalBooleanExpression(
            this.location,
            this.selector.clone(),
            this.channel,
            this.in_params.map((p) => p.clone()),
            this.filter.clone(),
            this.schema ? this.schema.clone(): null
        );
    }

    *iterateSlots(schema : ExpressionSignature|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        yield* Invocation.prototype.iterateSlots.call(this, scope);
        yield* this.filter.iterateSlots(this.schema, prim, makeScope(this));
    }

    *iterateSlots2(schema : ExpressionSignature|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<Selector|AbstractSlot, void> {
        yield this.selector;
        yield* iterateSlots2InputParams(this, scope);
        yield* this.filter.iterateSlots2(this.schema, this, makeScope(this));
    }
}
BooleanExpression.External = ExternalBooleanExpression;
BooleanExpression.External.prototype.isExternal = true;

/**
 * A boolean expression that expresses that the user does not care about a specific parameter.
 *
 * It is essentially the same as "true", but it has a parameter attached to it.
 */
export class DontCareBooleanExpression extends BooleanExpression {
    name : string;

    constructor(location : SourceRange|null, name : string) {
        super(location);
        assert(typeof name === 'string');
        this.name = name;
    }

    equals(other : BooleanExpression) : boolean {
        return other instanceof DontCareBooleanExpression && this.name === other.name;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitDontCareBooleanExpression(this);
        visitor.exit(this);
    }

    clone() : DontCareBooleanExpression {
        return new DontCareBooleanExpression(this.location, this.name);
    }

    *iterateSlots(schema : ExpressionSignature|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
    }
    *iterateSlots2(schema : ExpressionSignature|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<Selector|AbstractSlot, void> {
    }
}
BooleanExpression.DontCare = DontCareBooleanExpression;
DontCareBooleanExpression.prototype.isDontCare = true;

export class TrueBooleanExpression extends BooleanExpression {
    constructor() {
        super(null);
    }

    equals(other : BooleanExpression) : boolean {
        return this === other;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitTrueBooleanExpression(this);
        visitor.exit(this);
    }

    clone() : TrueBooleanExpression {
        return this;
    }

    *iterateSlots(schema : ExpressionSignature|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
    }
    *iterateSlots2(schema : ExpressionSignature|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<Selector|AbstractSlot, void> {
    }
}
TrueBooleanExpression.prototype.isTrue = true;
/**
 * The constant `true` boolean expression.
 *
 * This is a singleton, not a class.
 * @alias Ast.BooleanExpression.True
 * @type {Ast.BooleanExpression}
 * @readonly
 */
BooleanExpression.True = new TrueBooleanExpression();

export class FalseBooleanExpression extends BooleanExpression {
    constructor() {
        super(null);
    }

    equals(other : BooleanExpression) : boolean {
        return this === other;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitFalseBooleanExpression(this);
        visitor.exit(this);
    }

    clone() : FalseBooleanExpression {
        return this;
    }

    *iterateSlots(schema : ExpressionSignature|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
    }
    *iterateSlots2(schema : ExpressionSignature|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<Selector|AbstractSlot, void> {
    }
}
FalseBooleanExpression.prototype.isFalse = true;
/**
 * The constant `false` boolean expression.
 *
 * This is a singleton, not a class.
 * @alias Ast.BooleanExpression.False
 * @type {Ast.BooleanExpression}
 * @readonly
 */
BooleanExpression.False = new FalseBooleanExpression();

/**
 * A boolean expression that computes a scalar expression and then does a comparison
 *
 * @alias Ast.BooleanExpression.Compute
 * @extends Ast.BooleanExpression
 */
export class ComputeBooleanExpression extends BooleanExpression {
    lhs : Value;
    operator : string;
    rhs : Value;

    /**
     * Construct a new compute boolean expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.ScalarExpression} lhs - the scalar expression to compute
     * @param {string} operator - the comparison operator
     * @param {Ast.Value} value - the value being compared against
     */
    constructor(location : SourceRange|null,
                lhs : Value,
                operator : string,
                rhs : Value) {
        super(location);

        assert(lhs instanceof Value);
        /**
         * The scalar expression being compared.
         *
         * @type {Ast.ScalarExpression}
         * @readonly
         */
        this.lhs = lhs;

        assert(typeof operator === 'string');
        /**
         * The comparison operator.
         *
         * @type {string}
         * @readonly
         */
        this.operator = operator;

        assert(rhs instanceof Value);
        /**
         * The value being compared against.
         *
         * @type {Ast.Value}
         * @readonly
         */
        this.rhs = rhs;
    }

    equals(other : BooleanExpression) : boolean {
        return other instanceof ComputeBooleanExpression &&
            this.lhs.equals(other.lhs) &&
            this.operator === other.operator &&
            this.rhs.equals(other.rhs);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitComputeBooleanExpression(this)) {
            this.lhs.visit(visitor);
            this.rhs.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : ComputeBooleanExpression {
        return new ComputeBooleanExpression(
            this.location,
            this.lhs.clone(),
            this.operator,
            this.rhs.clone()
        );
    }

    *iterateSlots(schema : ExpressionSignature|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        // XXX this API cannot support Compute expressions
    }

    *iterateSlots2(schema : ExpressionSignature|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<Selector|AbstractSlot, void> {
        yield* recursiveYieldArraySlots(new FieldSlot(prim, scope, this.lhs.getType(), this, 'compute_filter', 'lhs'));
        yield* recursiveYieldArraySlots(new FieldSlot(prim, scope, this.rhs.getType(), this, 'compute_filter', 'rhs'));
    }

    toString() : string {
        return `Compute(${this.lhs}, ${this.operator}, ${this.rhs})`;
    }
}
BooleanExpression.Compute = ComputeBooleanExpression;
BooleanExpression.Compute.prototype.isCompute = true;
