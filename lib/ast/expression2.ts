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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import assert from 'assert';

import Node, { SourceRange } from './base';
import { ExpressionSignature } from './function_def';
import {
    Invocation,
    DeviceSelector,
    InputParam,
    BooleanExpression
} from './expression';
import * as legacy from './primitive';
import {
    Value,
    VarRefValue
} from './values';
import {
    iterateSlots2InputParams,
    recursiveYieldArraySlots,
    makeScope,
    ArrayIndexSlot,
    FieldSlot,
    AbstractSlot,
    OldSlot,
    ScopeMap,
    InvocationLike,
} from './slots';
import Type from '../type';
import NodeVisitor from './visitor';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';
import {
    SyntaxPriority,
    addParenthesis
} from './syntax_priority';
import { getScalarExpressionName } from '../utils';


/**
 * A stream, table, or action expression.
 */
export abstract class Expression extends Node {
    schema : ExpressionSignature|null;

    constructor(location : SourceRange|null,
                schema : ExpressionSignature|null) {
        super(location);
        this.schema = schema;
    }

    // syntactic priority of this expression (to emit the right parenthesis)
    abstract get priority() : SyntaxPriority;

    abstract toLegacy(into_params ?: InputParam[]) : legacy.Stream|legacy.Table|legacy.Action;
    abstract clone() : Expression;
    abstract toSource() : TokenStream;

    optimize() : Expression {
        return this;
    }

    /**
     * Iterate all slots (scalar value nodes) in this expression.
     *
     * @param scope - available names for parameter passing
     * @deprecated Use {@link Ast.Table#iterateSlots2} instead.
     */
    abstract iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]>;

    /**
     * Iterate all slots (scalar value nodes) in this expression.
     *
     * @param scope - available names for parameter passing
     */
    abstract iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]>;
}

// move parameter-passing from regular parameters to join parameters
// when converting back to the legacy AST nodes
function moveInputParams(in_params : InputParam[], into_params : InputParam[]) : InputParam[] {
    return in_params.filter((ip) => {
        if (ip.value.isVarRef || ip.value.isEvent) {
            into_params.push(ip);
            return false;
        } else {
            return true;
        }
    });
}

export class FunctionCallExpression extends Expression {
    name : string;
    in_params : InputParam[];

    constructor(location : SourceRange|null,
                name : string,
                in_params : InputParam[],
                schema : ExpressionSignature|null) {
        super(location, schema);

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Primary;
    }

    toString() : string {
        const in_params = this.in_params && this.in_params.length > 0 ? this.in_params.toString() : '';
        return `FunctionCallExpression(${this.name}, ${in_params})`;
    }

    toSource() : TokenStream {
        return List.concat(this.name, '(', List.join(this.in_params.map((ip) => ip.toSource()), ','), ')');
    }

    toLegacy(into_params : InputParam[] = []) : legacy.VarRefTable|legacy.VarRefStream|legacy.TimerStream|legacy.AtTimerStream|legacy.VarRefAction {
        const schema = this.schema!;
        if (schema.functionType === 'stream') {
            if (this.name === 'timer') {
                const base = this.in_params.find((ip) => ip.name === 'base')!;
                const interval = this.in_params.find((ip) => ip.name === 'interval')!;
                const frequency = this.in_params.find((ip) => ip.name === 'frequency');
                return new legacy.TimerStream(this.location, base.value, interval.value,
                    frequency ? frequency.value : null, this.schema);
            } else if (this.name === 'attimer') {
                const time = this.in_params.find((ip) => ip.name === 'time')!;
                const expiration_date = this.in_params.find((ip) => ip.name === 'expiration_date');
                let timevalue : Value[];
                if (time.value instanceof Value.Array)
                    timevalue = time.value.value;
                else
                    timevalue = [time.value];
                return new legacy.AtTimerStream(this.location, timevalue,
                    expiration_date ? expiration_date.value : null, this.schema);
            } else {
                return new legacy.VarRefStream(this.location, this.name, this.in_params, this.schema);
            }
        } else if (schema.functionType === 'query') {
            return new legacy.VarRefTable(this.location, this.name, moveInputParams(this.in_params, into_params), this.schema);
        } else {
            return new legacy.VarRefAction(this.location, this.name, this.in_params, this.schema);
        }
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitFunctionCallExpression(this)) {
            for (const in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : FunctionCallExpression {
        return new FunctionCallExpression(
            this.location,
            this.name,
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        for (const in_param of this.in_params)
            yield [this.schema, in_param, this, scope];
        return [this, makeScope(this)];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* iterateSlots2InputParams(this, scope);
    }
}

export class InvocationExpression extends Expression {
    invocation : Invocation;

    constructor(location : SourceRange|null,
                invocation : Invocation,
                schema : ExpressionSignature|null) {
        super(location, schema);

        assert(invocation instanceof Invocation);
        this.invocation = invocation;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        return this.invocation.toSource();
    }

    toLegacy(into_params : InputParam[] = []) : legacy.InvocationTable|legacy.InvocationAction {
        const schema = this.schema!;
        assert(schema.functionType !== 'stream');
        if (schema.functionType === 'query') {
            const clone = this.invocation.clone();
            clone.in_params = moveInputParams(clone.in_params, into_params);
            return new legacy.InvocationTable(this.location, clone, this.schema);
        } else {
            return new legacy.InvocationAction(this.location, this.invocation, this.schema);
        }
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitInvocationExpression(this))
            this.invocation.visit(visitor);
        visitor.exit(this);
    }
    clone() : InvocationExpression {
        return new InvocationExpression(
            this.location,
            this.invocation.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.invocation.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.invocation.iterateSlots2(scope);
    }
}

export class FilterExpression extends Expression {
    expression : Expression;
    filter : BooleanExpression;

    constructor(location : SourceRange|null,
                expression : Expression,
                filter : BooleanExpression,
                schema : ExpressionSignature|null) {
        super(location, schema);

        assert(expression instanceof Expression);
        this.expression = expression;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Filter;
    }

    toSource() : TokenStream {
        return List.concat(addParenthesis(this.priority, this.expression.priority,
            this.expression.toSource()), 'filter', this.filter.toSource());
    }

    toLegacy(into_params : InputParam[] = []) : legacy.FilteredTable|legacy.EdgeFilterStream {
        const schema = this.schema!;
        assert(schema.functionType !== 'action');
        if (schema.functionType === 'query')
            return new legacy.FilteredTable(this.location, this.expression.toLegacy(into_params) as legacy.Table, this.filter, this.schema);
        else
            return new legacy.EdgeFilterStream(this.location, this.expression.toLegacy(into_params) as legacy.Stream, this.filter, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitFilterExpression(this)) {
            this.expression.visit(visitor);
            this.filter.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : FilterExpression {
        return new FilterExpression(
            this.location,
            this.expression.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.expression.iterateSlots(scope);
        yield* this.filter.iterateSlots(this.expression.schema, prim, newScope);
        return [prim, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.expression.iterateSlots2(scope);
        yield* this.filter.iterateSlots2(this.expression.schema, prim, newScope);
        return [prim, newScope];
    }
}

export class MonitorExpression extends Expression {
    expression : Expression;
    args : string[]|null;

    constructor(location : SourceRange|null,
                expression : Expression,
                args : string[]|null,
                schema : ExpressionSignature|null) {
        super(location, schema);

        assert(expression instanceof Expression);
        this.expression = expression;

        assert(args === null || (Array.isArray(args) && args.length > 0));
        this.args = args;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        if (this.args === null) {
            return List.concat('monitor', '(', this.expression.toSource(), ')');
        } else {
            return List.concat('monitor', '(',
                List.join(this.args.map((a) => List.singleton(a)), ','),
                'of', this.expression.toSource(), ')');
        }
    }

    toLegacy(into_params : InputParam[] = []) : legacy.MonitorStream {
        const el = this.expression.toLegacy(into_params);
        assert(el instanceof legacy.Table);
        return new legacy.MonitorStream(this.location, el, this.args, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitMonitorExpression(this))
            this.expression.visit(visitor);
        visitor.exit(this);
    }

    clone() : MonitorExpression {
        return new MonitorExpression(
            this.location,
            this.expression.clone(),
            this.args ? this.args.map((a) => a) : null,
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.expression.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.expression.iterateSlots2(scope);
    }
}

export class ProjectionExpression extends Expression {
    expression : Expression;
    args : string[];
    computations : Value[];
    aliases : Array<string|null>;

    constructor(location : SourceRange|null,
                expression : Expression,
                args : string[],
                computations : Value[],
                aliases : Array<string|null>,
                schema : ExpressionSignature|null) {
        super(location, schema);

        assert(expression instanceof Expression);
        this.expression = expression;

        assert(Array.isArray(args));
        // if there is a *, it's the only name projected
        assert(args.every((x) => x !== '*') || args.length === 1);
        this.args = args;

        this.computations = computations;
        this.aliases = aliases;

        assert(this.args.length > 0 || this.computations.length > 0);
        assert(this.computations.length === this.aliases.length);
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Projection;
    }

    toSource() : TokenStream {
        const allprojections : TokenStream[] = this.args.map((a) => List.join(a.split('.').map((n) => List.singleton(n)), '.'));
        for (let i = 0; i < this.computations.length; i++) {
            const value = this.computations[i];
            const alias = this.aliases[i];
            if (alias)
                allprojections.push(List.concat(value.toSource(), 'as', alias));
            else
                allprojections.push(value.toSource());
        }

        return List.concat('[', List.join(allprojections, ','), ']', 'of',
            addParenthesis(this.priority, this.expression.priority, this.expression.toSource()));
    }

    toLegacy(into_params : InputParam[] = []) : legacy.Table|legacy.Stream {
        const schema = this.schema!;
        assert(schema.functionType !== 'action');

        const inner = this.expression.toLegacy(into_params);
        const names = this.args.slice();
        if (schema.functionType === 'query') {
            let table = inner as legacy.Table;
            if (this.computations.length > 0) {
                for (let i = 0; i < this.computations.length; i++) {
                    const value = this.computations[i];
                    const alias = this.aliases[i];
                    table = new legacy.ComputeTable(this.location, table, value, alias, table.schema);
                    names.push(alias || getScalarExpressionName(value));
                }
            }
            if (names[0] === '*')
                return table;
            return new legacy.ProjectionTable(this.location, table, names, this.schema);
        } else {
            let stream = inner as legacy.Stream;
            if (this.computations.length > 0) {
                for (let i = 0; i < this.computations.length; i++) {
                    const value = this.computations[i];
                    const alias = this.aliases[i];
                    stream = new legacy.ComputeStream(this.location, stream, value, alias, stream.schema);
                    names.push(alias || getScalarExpressionName(value));
                }
            }
            if (names[0] === '*')
                return stream;
            return new legacy.ProjectionStream(this.location, stream, names, this.schema);
        }
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitProjectionExpression(this))
            this.expression.visit(visitor);
        visitor.exit(this);
    }

    clone() : ProjectionExpression {
        return new ProjectionExpression(
            this.location,
            this.expression.clone(),
            this.args.slice(),
            this.computations.map((v) => v.clone()),
            this.aliases.slice(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, nestedScope] = yield* this.expression.iterateSlots(scope);
        const newScope : ScopeMap = {};
        for (const name of this.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, nestedScope] = yield* this.expression.iterateSlots2(scope);
        for (let i = 0; i < this.computations.length; i++)
            yield* recursiveYieldArraySlots(new ArrayIndexSlot(prim, nestedScope, this.computations[i].getType(), this.computations, 'computations', i));
        const newScope : ScopeMap = {};
        for (const name of this.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    }
}

export class AliasExpression extends Expression {
    expression : Expression;
    name : string;

    constructor(location : SourceRange|null,
                expression : Expression,
                name : string,
                schema : ExpressionSignature|null) {
        super(location, schema);

        assert(expression instanceof Expression);
        this.expression = expression;

        assert(typeof name === 'string');
        this.name = name;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Alias;
    }

    toSource() : TokenStream {
        return List.concat(addParenthesis(this.priority, this.expression.priority,
            this.expression.toSource()), 'as', this.name);
    }

    toLegacy(into_params : InputParam[] = []) : legacy.AliasTable|legacy.AliasStream {
        const el = this.expression.toLegacy(into_params);
        if (el instanceof legacy.Table) {
            return new legacy.AliasTable(this.location, el, this.name, this.schema);
        } else {
            assert(el instanceof legacy.Stream);
            return new legacy.AliasStream(this.location, el, this.name, this.schema);
        }
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAliasExpression(this))
            this.expression.visit(visitor);
        visitor.exit(this);
    }

    clone() : AliasExpression {
        return new AliasExpression(
            this.location,
            this.expression.clone(),
            this.name,
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.expression.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.expression.iterateSlots2(scope);
    }
}

export class AggregationExpression extends Expression {
    expression : Expression;
    field : string;
    operator : string;
    overload : Type[]|null;
    // TODO
    alias = null;

    constructor(location : SourceRange|null,
                expression : Expression,
                field : string,
                operator : string,
                schema : ExpressionSignature|null,
                overload : Type[]|null = null) {
        super(location, schema);

        assert(expression instanceof Expression);
        this.expression = expression;

        assert(typeof field === 'string');
        this.field = field;

        assert(typeof operator === 'string');
        this.operator = operator;

        this.overload = overload;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        if (this.field === '*') {
            return List.concat(this.operator, '(', this.expression.toSource(), ')');
        } else {
            const field = List.join(this.field.split('.').map((n) => List.singleton(n)), '.');
            return List.concat(this.operator, '(', field, 'of',
                this.expression.toSource(), ')');
        }
    }

    toLegacy(into_params : InputParam[] = []) : legacy.AggregationTable {
        const el = this.expression.toLegacy(into_params);
        assert(el instanceof legacy.Table);
        return new legacy.AggregationTable(this.location, el, this.field, this.operator, null, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAggregationExpression(this))
            this.expression.visit(visitor);
        visitor.exit(this);
    }

    clone() : AggregationExpression {
        return new AggregationExpression(
            this.location,
            this.expression.clone(),
            this.field,
            this.operator,
            this.schema ? this.schema.clone() : null,
            this.overload
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.expression.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.expression.iterateSlots2(scope);
    }
}

export class SortExpression extends Expression {
    expression : Expression;
    value : Value;
    direction : 'asc'|'desc';

    constructor(location : SourceRange|null,
                expression : Expression,
                value : Value,
                direction : 'asc'|'desc',
                schema : ExpressionSignature|null) {
        super(location, schema);

        assert(expression instanceof Expression);
        this.expression = expression;

        this.value = value;

        assert(direction === 'asc' || direction === 'desc');
        this.direction = direction;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Primary;
    }

    toSource() : TokenStream {
        return List.concat('sort', '(', this.value.toSource(), ' ', this.direction, 'of',
            this.expression.toSource(), ')');
    }

    toLegacy(into_params : InputParam[] = []) : legacy.SortedTable {
        const el = this.expression.toLegacy(into_params);
        assert(el instanceof legacy.Table);
        if (this.value instanceof VarRefValue) {
            return new legacy.SortedTable(this.location, el, this.value.name, this.direction, this.schema);
        } else {
            return new legacy.SortedTable(this.location,
                new legacy.ComputeTable(this.location, el, this.value, null, this.schema),
                getScalarExpressionName(this.value), this.direction, this.schema);
        }
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitSortExpression(this)) {
            this.expression.visit(visitor);
            this.value.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : SortExpression {
        return new SortExpression(
            this.location,
            this.expression.clone(),
            this.value.clone(),
            this.direction,
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.expression.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, innerScope] = yield* this.expression.iterateSlots2(scope);
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, Type.Number, this, 'sort', 'value'));
        return [prim, innerScope];
    }
}

export class IndexExpression extends Expression {
    expression : Expression;
    indices : Value[];

    constructor(location : SourceRange|null,
                expression : Expression,
                indices : Value[],
                schema : ExpressionSignature|null) {
        super(location, schema);

        assert(expression instanceof Expression);
        this.expression = expression;

        assert(Array.isArray(indices));
        this.indices = indices;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Index;
    }

    toSource() : TokenStream {
        return List.concat(addParenthesis(this.priority, this.expression.priority, this.expression.toSource()),
            '[', List.join(this.indices.map((i) => i.toSource()), ','), ']');
    }

    toLegacy(into_params : InputParam[] = []) : legacy.IndexTable {
        const el = this.expression.toLegacy(into_params);
        assert(el instanceof legacy.Table);
        return new legacy.IndexTable(this.location, el, this.indices, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitIndexExpression(this)) {
            this.expression.visit(visitor);
            for (const index of this.indices)
                index.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : IndexExpression {
        return new IndexExpression(
            this.location,
            this.expression.clone(),
            this.indices.map((i) => i.clone()),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.expression.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, innerScope] = yield* this.expression.iterateSlots2(scope);
        for (let i = 0; i < this.indices.length; i++)
            yield* recursiveYieldArraySlots(new ArrayIndexSlot(prim, innerScope, Type.Number, this.indices, 'expression.index', i));
        return [prim, innerScope];
    }
}

export class SliceExpression extends Expression {
    expression : Expression;
    base : Value;
    limit : Value;

    constructor(location : SourceRange|null,
                expression : Expression,
                base : Value,
                limit : Value,
                schema : ExpressionSignature|null) {
        super(location, schema);

        assert(expression instanceof Expression);
        this.expression = expression;

        assert(base instanceof Value);
        this.base = base;

        assert(limit instanceof Value);
        this.limit = limit;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Index;
    }

    toSource() : TokenStream {
        return List.concat(addParenthesis(this.priority, this.expression.priority, this.expression.toSource()),
            '[', this.base.toSource(), ':', this.limit.toSource(), ']');
    }

    toLegacy(into_params : InputParam[] = []) : legacy.SlicedTable {
        const el = this.expression.toLegacy(into_params);
        assert(el instanceof legacy.Table);
        return new legacy.SlicedTable(this.location, el, this.base, this.limit, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitSliceExpression(this)) {
            this.expression.visit(visitor);
            this.base.visit(visitor);
            this.limit.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : SliceExpression {
        return new SliceExpression(
            this.location,
            this.expression.clone(),
            this.base.clone(),
            this.limit.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.expression.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, innerScope] = yield* this.expression.iterateSlots2(scope);
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, Type.Number, this, 'slice', 'base'));
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, Type.Number, this, 'slice', 'limit'));
        return [prim, innerScope];
    }
}

/**
 * Evaluates a list of expressions, passing the result of the previous one
 * to the next.
 *
 * In syntax, the expressions are separated by "=>"
 */
export class ChainExpression extends Expression {
    expressions : Expression[];

    constructor(location : SourceRange|null,
                expressions : Expression[],
                schema : ExpressionSignature|null) {
        super(location, schema);

        assert(Array.isArray(expressions));
        this.expressions = expressions;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Chain;
    }

    get first() : Expression {
        return this.expressions[0];
    }

    set first(expr : Expression) {
        this.expressions[0] = expr;
    }

    get last() : Expression {
        return this.expressions[this.expressions.length-1];
    }

    set last(expr : Expression) {
        this.expressions[this.expressions.length-1] = expr;
    }

    get lastQuery() : Expression|null {
        const expressions = this.expressions;
        if (expressions.length === 1) {
            const single = expressions[0];
            if (single.schema!.functionType === 'action')
                return null;
            return single;
        } else {
            return expressions[expressions.length-2];
        }
    }

    setLastQuery(expr : Expression) {
        const expressions = this.expressions;
        if (expressions.length === 1) {
            const single = expressions[0];
            if (single.schema!.functionType === 'action')
                expressions.unshift(expr);
            else
                expressions[expressions.length-1] = expr;
        } else {
            expressions[expressions.length-2] = expr;
        }
    }

    toSource() : TokenStream {
        return List.join(this.expressions.map((exp) => exp.toSource()), '=>');
    }

    toLegacy(into_params : InputParam[] = []) : legacy.Stream|legacy.Table|legacy.Action {
        if (this.expressions.length === 1)
            return this.expressions[0].toLegacy(into_params);

        // note: schemas and parameter passing work differently in old thingtalk
        // table/stream join and new thingtalk chain expressions
        // so this is not a perfect conversion

        const first = this.expressions[0];
        if (first.schema!.functionType === 'stream') {
            const fl = first.toLegacy(into_params);
            assert(fl instanceof legacy.Stream);
            if (this.expressions.length > 2) {
                const newIntoParams : InputParam[] = [];
                const sl = this.expressions[1].toLegacy(newIntoParams);
                assert(sl instanceof legacy.Table);
                const rest : legacy.Table = this.expressions.slice(2).reduce((al, b) => {
                    const newIntoParams : InputParam[] = [];
                    const bl = b.toLegacy(newIntoParams);
                    assert(bl instanceof legacy.Table);

                    const joinParams = newIntoParams.filter((ip) => {
                        if (ip.value instanceof VarRefValue) {
                            if (al.schema!.hasArgument(ip.value.name)) {
                                return true;
                            } else {
                                into_params.push(ip);
                                return false;
                            }
                        } else { // $event
                            return true;
                        }
                    });
                    return new legacy.JoinTable(null, al, bl, joinParams, b.schema);
                }, sl);

                const joinParams = newIntoParams.filter((ip) => {
                    if (ip.value instanceof VarRefValue) {
                        if (fl.schema!.hasArgument(ip.value.name)) {
                            return true;
                        } else {
                            into_params.push(ip);
                            return false;
                        }
                    } else { // $event
                        return true;
                    }
                });
                return new legacy.JoinStream(this.location, fl, rest, joinParams, this.expressions[this.expressions.length-1].schema);
            } else {
                const newIntoParams : InputParam[] = [];
                const rest = this.expressions[1].toLegacy(newIntoParams);
                assert(rest instanceof legacy.Table);

                const joinParams = newIntoParams.filter((ip) => {
                    if (ip.value instanceof VarRefValue) {
                        if (fl.schema!.hasArgument(ip.value.name)) {
                            return true;
                        } else {
                            into_params.push(ip);
                            return false;
                        }
                    } else { // $event
                        return true;
                    }
                });
                return new legacy.JoinStream(this.location, fl, rest, joinParams, this.expressions[1].schema);
            }
        } else {
            const fl = this.expressions[0].toLegacy(into_params);
            assert(fl instanceof legacy.Table);
            return this.expressions.slice(1).reduce((al, b) => {
                const newIntoParams : InputParam[] = [];
                const bl = b.toLegacy(newIntoParams);
                assert(bl instanceof legacy.Table);

                const joinParams = newIntoParams.filter((ip) => {
                    if (ip.value instanceof VarRefValue) {
                        if (al.schema!.hasArgument(ip.value.name)) {
                            return true;
                        } else {
                            into_params.push(ip);
                            return false;
                        }
                    } else { // $event
                        return true;
                    }
                });
                return new legacy.JoinTable(null, al, bl, joinParams, b.schema);
            }, fl);
        }
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitChainExpression(this)) {
            for (const expr of this.expressions)
                expr.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : ChainExpression {
        return new ChainExpression(
            this.location,
            this.expressions.map((ex) => ex.clone()),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const newScope : ScopeMap = {};
        for (const expr of this.expressions) {
            [, scope] = yield* expr.iterateSlots(scope);
            Object.assign(newScope, scope);
        }
        return [null, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const newScope : ScopeMap = {};
        for (const expr of this.expressions) {
            [, scope] = yield* expr.iterateSlots2(scope);
            Object.assign(newScope, scope);
        }
        return [null, newScope];
    }
}
