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
import { FunctionDef } from './function_def';
import { Value } from './values';
import { Expression, FilterExpression, InvocationExpression, ProjectionExpression } from './expression';

import Type from '../type';
import * as Optimizer from '../optimize';
import {
    iterateSlots2InputParams,
    recursiveYieldArraySlots,
    makeScope,
    FilterSlot,
    FieldSlot,
    AbstractSlot,
    OldSlot,
    ScopeMap,
    InvocationLike
} from './slots';
import {
    DeviceSelector,
    Invocation,
    InputParam
} from './invocation';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';
import { UnserializableError } from "../utils/errors";
import {
    SyntaxPriority,
    addParenthesis
} from './syntax_priority';
import arrayEquals from './array_equals';

/**
 * An expression that computes a boolean predicate.
 * This AST node is used in filter expressions.
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
    static ExistentialSubquery : any;
    isExistentialSubquery ! : boolean;
    static ComparisonSubquery : any;
    isComparisonSubquery ! : boolean;
    /**
     * The constant `true` boolean expression.
     *
     * This is a singleton, not a class.
     */
    static True : BooleanExpression;
    isTrue ! : boolean;
    /**
     * The constant `false` boolean expression.
     *
     * This is a singleton, not a class.
     */
    static False : BooleanExpression;
    isFalse ! : boolean;
    static Compute : any;
    isCompute ! : boolean;
    static DontCare : any;
    isDontCare ! : boolean;
    static PropertyPath : any;
    isPropertyPath ! : boolean;

    optimize() : BooleanExpression {
        return Optimizer.optimizeFilter(this);
    }

    abstract get priority() : SyntaxPriority;

    abstract clone() : BooleanExpression;
    abstract equals(other : BooleanExpression) : boolean;
    abstract toLegacy() : BooleanExpression;

    /**
     * Iterate all slots (scalar value nodes) in this boolean expression.
     *
     * @deprecated Use {@link Ast.BooleanExpression.iterateSlots2} instead.
     */
    abstract iterateSlots(schema : FunctionDef|null,
                          prim : InvocationLike|null,
                          scope : ScopeMap) : Generator<OldSlot, void>;

    /**
     * Iterate all slots (scalar value nodes) in this boolean expression.
     */
    abstract iterateSlots2(schema : FunctionDef|null,
                           prim : InvocationLike|null,
                           scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void>;
}
BooleanExpression.prototype.isAnd = false;
BooleanExpression.prototype.isOr = false;
BooleanExpression.prototype.isAtom = false;
BooleanExpression.prototype.isNot = false;
BooleanExpression.prototype.isExternal = false;
BooleanExpression.prototype.isExistentialSubquery = false;
BooleanExpression.prototype.isComparisonSubquery = false;
BooleanExpression.prototype.isTrue = false;
BooleanExpression.prototype.isFalse = false;
BooleanExpression.prototype.isCompute = false;
BooleanExpression.prototype.isDontCare = false;
BooleanExpression.prototype.isPropertyPath = false;

/**
 * A conjunction boolean expression (ThingTalk operator `&&`)
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

    get priority() : SyntaxPriority {
        return SyntaxPriority.And;
    }

    toSource() : TokenStream {
        return List.join(this.operands.map((op) => addParenthesis(this.priority, op.priority, op.toSource())), '&&');
    }

    toLegacy() : AndBooleanExpression {
        return new AndBooleanExpression(null, this.operands.map((op) => op.toLegacy()));
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

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        for (const op of this.operands)
            yield* op.iterateSlots(schema, prim, scope);
    }

    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
        for (const op of this.operands)
            yield* op.iterateSlots2(schema, prim, scope);
    }
}
BooleanExpression.And = AndBooleanExpression;
BooleanExpression.And.prototype.isAnd = true;
/**
 * A disjunction boolean expression (ThingTalk operator `||`)
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

    get priority() : SyntaxPriority {
        return SyntaxPriority.Or;
    }

    toSource() : TokenStream {
        return List.join(this.operands.map((op) => addParenthesis(this.priority, op.priority, op.toSource())), '||');
    }

    toLegacy() : OrBooleanExpression {
        return new OrBooleanExpression(null, this.operands.map((op) => op.toLegacy()));
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

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        for (const op of this.operands)
            yield* op.iterateSlots(schema, prim, scope);
    }

    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
        for (const op of this.operands)
            yield* op.iterateSlots2(schema, prim, scope);
    }
}
BooleanExpression.Or = OrBooleanExpression;
BooleanExpression.Or.prototype.isOr = true;

const INFIX_COMPARISON_OPERATORS = new Set(['==', '>=', '<=', '>', '<', '=~', '~=']);

/**
 * A comparison expression (predicate atom)
 */
export class AtomBooleanExpression extends BooleanExpression {
    /**
     * The parameter name to compare.
     */
    name : string;
    /**
     * The comparison operator.
     */
    operator : string;
    /**
      * The value being compared against.
      */
    value : Value;
    overload : Type[]|null;

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
                value : Value,
                overload : Type[]|null) {
        super(location);

        assert(typeof name === 'string');
        this.name = name;

        assert(typeof operator === 'string');
        this.operator = operator;

        assert(value instanceof Value);
        this.value = value;

        this.overload = overload;
    }

    get priority() : SyntaxPriority {
        return INFIX_COMPARISON_OPERATORS.has(this.operator) ? SyntaxPriority.Comp : SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        const name = List.join(this.name.split('.').map((n) => List.singleton(n)), '.');

        if (INFIX_COMPARISON_OPERATORS.has(this.operator)) {
            return List.concat(name, this.operator,
                addParenthesis(SyntaxPriority.Add, this.value.priority, this.value.toSource()));
        } else {
            return List.concat(this.operator, '(', name, ',', this.value.toSource(), ')');
        }
    }

    toLegacy() : AtomBooleanExpression {
        return this;
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
            this.name,
            this.operator,
            this.value.clone(),
            this.overload
        );
    }

    toString() : string {
        return `Atom(${this.name}, ${this.operator}, ${this.value})`;
    }

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        yield [schema, this, prim, scope];
    }

    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
        const arg = (schema ? schema.getArgument(this.name) : null) || null;
        yield* recursiveYieldArraySlots(new FilterSlot(prim, scope, arg, this));
    }
}
BooleanExpression.Atom = AtomBooleanExpression;
BooleanExpression.Atom.prototype.isAtom = true;
/**
 * A negation boolean expression (ThingTalk operator `!`)
 */
export class NotBooleanExpression extends BooleanExpression {
    /**
     * The expression being negated.
     */
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
        this.expr = expr;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Not;
    }

    toSource() : TokenStream {
        return List.concat('!', addParenthesis(this.priority, this.expr.priority, this.expr.toSource()));
    }

    toLegacy() : NotBooleanExpression {
        return new NotBooleanExpression(null, this.expr.toLegacy());
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

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        yield* this.expr.iterateSlots(schema, prim, scope);
    }

    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
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
 * @deprecated Use {@link ComparisonSubqueryBooleanExpression} or {@link ExistentialSubqueryBooleanExpression} instead.
 */
export class ExternalBooleanExpression extends BooleanExpression {
    /**
     * The selector choosing where the function is invoked.
     */
    selector : DeviceSelector;
    /**
     * The function name being invoked.
     */
    channel : string;
    /**
     * The input parameters passed to the function.
     */
    in_params : InputParam[];
    /**
     * The predicate to apply on the invocation's results.
     */
    filter : BooleanExpression;
    /**
     * Type signature of the invoked function.
     * This property is guaranteed not `null` after type-checking.
     */
    schema : FunctionDef|null;
    __effectiveSelector : DeviceSelector|null = null;

    /**
     * Construct a new external boolean expression.
     *
     * @param {Ast.Selector.Device} selector - the selector choosing where the function is invoked
     * @param {string} channel - the function name
     * @param {Ast.InputParam[]} in_params - input parameters passed to the function
     * @param {Ast.BooleanExpression} filter - the filter to apply on the invocation's results
     * @param {Ast.FunctionDef|null} schema - type signature of the invoked function
     */
    constructor(location : SourceRange|null,
                selector : DeviceSelector,
                channel : string,
                in_params : InputParam[],
                filter : BooleanExpression,
                schema : FunctionDef|null) {
        super(location);

        assert(selector instanceof DeviceSelector);
        this.selector = selector;

        assert(typeof channel === 'string');
        this.channel = channel;

        assert(Array.isArray(in_params));
        this.in_params = in_params;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;

        assert(schema === null || schema instanceof FunctionDef);
        this.schema = schema;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        const inv = new Invocation(null, this.selector, this.channel, this.in_params, this.schema);
        return List.concat('any', '(', inv.toSource(), 'filter', this.filter.toSource(), ')');
    }

    toString() : string {
        return `External(${this.selector}, ${this.channel}, ${this.in_params}, ${this.filter})`;
    }

    toLegacy() : ExternalBooleanExpression {
        return this;
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

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        yield* Invocation.prototype.iterateSlots.call(this, scope);
        yield* this.filter.iterateSlots(this.schema, prim, makeScope(this));
    }

    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
        yield this.selector;
        yield* iterateSlots2InputParams(this, scope);
        yield* this.filter.iterateSlots2(this.schema, this, makeScope(this));
    }
}
BooleanExpression.External = ExternalBooleanExpression;
BooleanExpression.External.prototype.isExternal = true;

/**
 * A boolean expression that calls a Thingpedia query function
 * and filters the result.
 *
 * The boolean expression is true if at least one result from the function
 * call satisfies the filter.
 *
 */
export class ExistentialSubqueryBooleanExpression extends BooleanExpression {
    subquery : Expression;

    /**
     * Construct a new existential subquery boolean expression.
     *
     * @param location
     * @param subquery: the query used for check existence of result
     */
    constructor(location : SourceRange|null,
                subquery : Expression) {
        super(location);
        this.subquery = subquery;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        return List.concat('any', '(', this.subquery.toSource(), ')');
    }

    toString() : string {
        return `ExistentialSubquery(${this.subquery})`;
    }

    toLegacy() : ExternalBooleanExpression {
        if (this.subquery instanceof FilterExpression && this.subquery.expression instanceof InvocationExpression) {
            const invocation = this.subquery.expression.invocation;
            return new ExternalBooleanExpression(
                null,
                invocation.selector,
                invocation.channel,
                invocation.in_params,
                this.subquery.filter.toLegacy(),
                this.subquery.schema
            );
        }
        throw new UnserializableError('Existential Subquery');
    }

    equals(other : BooleanExpression) : boolean {
        return other instanceof ExistentialSubqueryBooleanExpression &&
            this.subquery.equals(other.subquery);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitExistentialSubqueryBooleanExpression(this))
            this.subquery.visit(visitor);
        visitor.exit(this);
    }

    clone() : ExistentialSubqueryBooleanExpression {
        return new ExistentialSubqueryBooleanExpression(
            this.location,
            this.subquery.clone()
        );
    }

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        yield* this.subquery.iterateSlots(scope);
    }

    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.subquery.iterateSlots2(scope);
    }
}
BooleanExpression.ExistentialSubquery = ExistentialSubqueryBooleanExpression;
BooleanExpression.ExistentialSubquery.prototype.isExistentialSubquery = true;

/**
 * A boolean expression that calls a Thingpedia query function
 * and compares the result with another value.
 *
 */
export class ComparisonSubqueryBooleanExpression extends BooleanExpression {
    lhs : Value;
    rhs : Expression;
    operator : string;
    overload : Type[]|null;

    /**
     * Construct a new comparison subquery boolean expression.
     *
     * @param location
     * @param lhs - the parameter name to compare
     * @param operator - the comparison operator
     * @param rhs - a projection subquery which returns one field
     * @param overload - type overload
     */
    constructor(location : SourceRange|null,
                lhs : Value,
                operator : string,
                rhs : Expression,
                overload : Type[]|null) {
        super(location);

        this.lhs =lhs;
        this.rhs = rhs;
        this.operator = operator;
        this.overload = overload;
    }

    get priority() : SyntaxPriority {
        return INFIX_COMPARISON_OPERATORS.has(this.operator) ? SyntaxPriority.Comp : SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        if (INFIX_COMPARISON_OPERATORS.has(this.operator))
            return List.concat(addParenthesis(SyntaxPriority.Add, this.lhs.priority, this.lhs.toSource()), this.operator, 'any', '(', this.rhs.toSource(), ')');
        else
            return List.concat(this.operator, '(', this.lhs.toSource(), ',', 'any', '(', this.rhs.toSource(), ')', ')');
    }

    toString() : string {
        return `ComparisonSubquery(${this.lhs}, ${this.operator}, ${this.rhs})`;
    }

    toLegacy() : ExternalBooleanExpression {
        if (this.rhs instanceof ProjectionExpression && this.rhs.args.length + this.rhs.computations.length === 1) {
            const expr = this.rhs.expression;
            if (expr instanceof FilterExpression && expr.expression instanceof InvocationExpression) {
                const invocation = expr.expression.invocation;
                const extraFilter = new ComputeBooleanExpression(
                    null,
                    this.lhs,
                    this.operator,
                    this.rhs.args.length ? new Value.VarRef(this.rhs.args[0]) : this.rhs.computations[0]
                );
                const filter = new AndBooleanExpression(null, [expr.filter.toLegacy(), extraFilter]);
                return new ExternalBooleanExpression(
                    null,
                    invocation.selector,
                    invocation.channel,
                    invocation.in_params,
                    filter,
                    invocation.schema
                );
            }
        }
        throw new UnserializableError('Comparison Subquery');
    }

    equals(other : BooleanExpression) : boolean {
        return other instanceof ComparisonSubqueryBooleanExpression &&
            this.lhs.equals(other.lhs) &&
            this.operator === other.operator &&
            this.rhs.equals(other.rhs);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitComparisonSubqueryBooleanExpression(this)) {
            this.lhs.visit(visitor);
            this.rhs.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : ComparisonSubqueryBooleanExpression {
        return new ComparisonSubqueryBooleanExpression(
            this.location,
            this.lhs.clone(),
            this.operator,
            this.rhs.clone(),
            this.overload
        );
    }

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        // XXX this API cannot support comparison subquery expressions
    }

    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
        const [resolvedLhs, ] = this.overload || [null, null];
        yield* recursiveYieldArraySlots(new FieldSlot(prim, scope, resolvedLhs || this.lhs.getType(), this, 'comparison_subquery_filter', 'lhs'));
        yield* this.rhs.iterateSlots2(scope);
    }
}
BooleanExpression.ComparisonSubquery = ComparisonSubqueryBooleanExpression;
BooleanExpression.ComparisonSubquery.prototype.isComparisonSubquery = true;

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

    get priority() : SyntaxPriority {
        return SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        return List.concat('true', '(', this.name, ')');
    }

    toLegacy() : DontCareBooleanExpression {
        return this;
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

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
    }
    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
    }
}
BooleanExpression.DontCare = DontCareBooleanExpression;
DontCareBooleanExpression.prototype.isDontCare = true;

export class TrueBooleanExpression extends BooleanExpression {
    constructor() {
        super(null);
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        return List.singleton('true');
    }

    toLegacy() : TrueBooleanExpression {
        return this;
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

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
    }
    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
    }
}
TrueBooleanExpression.prototype.isTrue = true;
BooleanExpression.True = new TrueBooleanExpression();

export class FalseBooleanExpression extends BooleanExpression {
    constructor() {
        super(null);
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        return List.singleton('false');
    }

    toLegacy() : FalseBooleanExpression {
        return this;
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

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
    }
    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
    }
}
FalseBooleanExpression.prototype.isFalse = true;
BooleanExpression.False = new FalseBooleanExpression();

/**
 * A boolean expression that computes a scalar expression and then does a comparison
 *
 */
export class ComputeBooleanExpression extends BooleanExpression {
    /**
     * The scalar expression being compared.
     */
    lhs : Value;
    /**
     * The comparison operator.
     */
    operator : string;
    /**
     * The value being compared against.
     */
    rhs : Value;
    overload : Type[]|null;

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
                rhs : Value,
                overload : Type[]|null = null) {
        super(location);

        assert(lhs instanceof Value);
        this.lhs = lhs;

        assert(typeof operator === 'string');
        this.operator = operator;

        assert(rhs instanceof Value);
        this.rhs = rhs;

        this.overload = overload;
    }

    get priority() : SyntaxPriority {
        return INFIX_COMPARISON_OPERATORS.has(this.operator) ? SyntaxPriority.Comp : SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        if (INFIX_COMPARISON_OPERATORS.has(this.operator)) {
            return List.concat(
                // force parenthesis around constants on the LHS of the filter, because it will be ambiguous otherwise
                this.lhs.isConstant() ?
                    List.concat('(', this.lhs.toSource(), ')') :
                    addParenthesis(SyntaxPriority.Add, this.lhs.priority, this.lhs.toSource()),
                this.operator,
                addParenthesis(SyntaxPriority.Add, this.rhs.priority, this.rhs.toSource()));
        } else {
            return List.concat(this.operator, '(', this.lhs.toSource(), ',', this.rhs.toSource(), ')');
        }
    }

    toLegacy() : ComputeBooleanExpression {
        return this;
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
            this.rhs.clone(),
            this.overload
        );
    }

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        // XXX this API cannot support Compute expressions
    }

    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
        const [resolvedLhs, resolvedRhs] = this.overload || [null, null];
        yield* recursiveYieldArraySlots(new FieldSlot(prim, scope, resolvedLhs || this.lhs.getType(), this, 'compute_filter', 'lhs'));
        yield* recursiveYieldArraySlots(new FieldSlot(prim, scope, resolvedRhs || this.rhs.getType(), this, 'compute_filter', 'rhs'));
    }

    toString() : string {
        return `Compute(${this.lhs}, ${this.operator}, ${this.rhs})`;
    }
}
BooleanExpression.Compute = ComputeBooleanExpression;
BooleanExpression.Compute.prototype.isCompute = true;

export class PropertyPathElement extends Node {
    property : string;
    quantifier ?: '+'|'*'|'?';

    constructor(property : string, quantifier ?: '+'|'*'|'?') {
        super();
        this.property = property;
        this.quantifier = quantifier;
    }
    
    equals(other : PropertyPathElement) {
        return this.property === other.property && this.quantifier === other.quantifier;
    }

    clone() : PropertyPathElement {
        return new PropertyPathElement(this.property, this.quantifier);
    }

    toSource() : TokenStream {
        return this.quantifier ? List.concat(this.property, this.quantifier) : List.singleton(this.property);
    }

    toString() {
        return this.quantifier ? this.property + this.quantifier : this.property;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitPropertyPathElement(this);
        visitor.exit(this);
    }
}

export type PropertyPathSequence = PropertyPathElement[];

/**
 * A boolean expression with SPARQL-style property path
 * this is only meaningful for knowledge graph such as wikidata 
 */
export class PropertyPathBooleanExpression extends BooleanExpression {
    /**
     * The parameter name to compare.
     */
    path : PropertyPathSequence;
    /**
     * The comparison operator.
     */
    operator : string;
    /**
      * The value being compared against.
      */
    value : Value;
    overload : Type[]|null;

    /**
     * Construct a new atom boolean expression.
     *
     * @param location - the position of this node in the source code
     * @param path - the property path to compare
     * @param operator - the comparison operator
     * @param value - the value being compared against
     */
    constructor(location : SourceRange|null,
                path : PropertyPathSequence,
                operator : string,
                value : Value,
                overload : Type[]|null) {
        super(location);

        this.path = path;

        assert(typeof operator === 'string');
        this.operator = operator;

        assert(value instanceof Value);
        this.value = value;

        this.overload = overload;
    }

    get priority() : SyntaxPriority {
        return INFIX_COMPARISON_OPERATORS.has(this.operator) ? SyntaxPriority.Comp : SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        const path = List.join(this.path.map((elem) => elem.toSource()), '/');

        if (INFIX_COMPARISON_OPERATORS.has(this.operator)) {
            return List.concat('<', path, '>', this.operator,
                addParenthesis(SyntaxPriority.Add, this.value.priority, this.value.toSource()));
        } else {
            return List.concat(this.operator, '(', '<', path, '>' , ',', this.value.toSource(), ')');
        }
    }

    toLegacy() : BooleanExpression {
        throw new UnserializableError('Property path boolean expression');
    }

    equals(other : BooleanExpression) : boolean {
        return other instanceof PropertyPathBooleanExpression &&
            arrayEquals(this.path, other.path) &&
            this.operator === other.operator &&
            this.value.equals(other.value);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitPropertyPathBooleanExpression(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    clone() : PropertyPathBooleanExpression {
        return new PropertyPathBooleanExpression(
            this.location,
            this.path.map((elem) => elem.clone()),
            this.operator,
            this.value.clone(),
            this.overload
        );
    }

    toString() : string {
        return `PropertyPath(${this.path.map((elem) => elem.toString()).join('/')}, ${this.operator}, ${this.value})`;
    }

    *iterateSlots(schema : FunctionDef|null,
                  prim : InvocationLike|null,
                  scope : ScopeMap) : Generator<OldSlot, void> {
        // TODO
    }

    *iterateSlots2(schema : FunctionDef|null,
                   prim : InvocationLike|null,
                   scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
        // TODO
    }
}
BooleanExpression.PropertyPath = PropertyPathBooleanExpression;
BooleanExpression.PropertyPath.prototype.ifPropertyPath = true;