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
import { FunctionDef } from './function_def';
import {
    Invocation,
    DeviceSelector,
    InputParam,
} from './invocation';
import {
    BooleanExpression
} from './boolean_expression';
import {
    Expression,
    FunctionCallExpression,
    InvocationExpression,
    FilterExpression,
    ProjectionExpression,
    AliasExpression,
    SortExpression,
    IndexExpression,
    SliceExpression,
    AggregationExpression,
    MonitorExpression,
    ChainExpression
} from './expression';
import { Value } from './values';
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

/**
 * The base class of all ThingTalk query expressions.
 *
 * @deprecated This class is part of ThingTalk 1.0. Use {@link Ast.Expression} in ThingTalk 2.0.
 */
export abstract class Table extends Node {
    static VarRef : typeof VarRefTable;
    isVarRef ! : boolean;
    static Invocation : typeof InvocationTable;
    isInvocation ! : boolean;
    static Filter : typeof FilteredTable;
    isFilter ! : boolean;
    static Projection : typeof ProjectionTable;
    isProjection ! : boolean;
    static Compute : typeof ComputeTable;
    isCompute ! : boolean;
    static Alias : typeof AliasTable;
    isAlias ! : boolean;
    static Aggregation : typeof AggregationTable;
    isAggregation ! : boolean;
    static Sort : typeof SortedTable;
    isSort ! : boolean;
    static Index : typeof IndexTable;
    isIndex ! : boolean;
    static Slice : typeof SlicedTable;
    isSlice ! : boolean;
    static Join : typeof JoinTable;
    isJoin ! : boolean;

    schema : FunctionDef|null;

    /**
     * Construct a new table node.
     *
     * @param location - the position of this node in the source code
     * @param schema - type signature of the invoked function
     */
    constructor(location : SourceRange | null, schema : FunctionDef|null) {
        super(location);

        assert(schema === null || schema instanceof FunctionDef);
        this.schema = schema;
    }

    toSource() : TokenStream {
        throw new Error(`Legacy AST node cannot be converted to source, convert to Expression first`);
    }

    abstract toExpression(extra_in_params : InputParam[]) : Expression;

    abstract clone() : Table;

    /**
     * Iterate all slots (scalar value nodes) in this table.
     *
     * @param scope - available names for parameter passing
     * @deprecated Use {@link Table.iterateSlots2} instead.
     */
    abstract iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]>;

    /**
     * Iterate all slots (scalar value nodes) in this table.
     *
     * @param scope - available names for parameter passing
     */
    abstract iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]>;
}
Table.prototype.isVarRef = false;
Table.prototype.isInvocation = false;
Table.prototype.isFilter = false;
Table.prototype.isProjection = false;
Table.prototype.isCompute = false;
Table.prototype.isAlias = false;
Table.prototype.isAggregation = false;
Table.prototype.isSort = false;
Table.prototype.isIndex = false;
Table.prototype.isSlice = false;
Table.prototype.isJoin = false;

export class VarRefTable extends Table {
    name : string;
    in_params : InputParam[];

    constructor(location : SourceRange|null,
                name : string,
                in_params : InputParam[],
                schema : FunctionDef|null) {
        super(location, schema);

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    toExpression(extra_in_params : InputParam[]) {
        return new FunctionCallExpression(this.location, this.name,
            this.in_params.concat(extra_in_params), this.schema);
    }

    toSource() : TokenStream {
        return List.concat(this.name, '(', List.join(this.in_params.map((ip) => ip.toSource()), ','), ')');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitVarRefTable(this)) {
            for (const in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : VarRefTable {
        return new VarRefTable(
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
Table.VarRef = VarRefTable;
Table.VarRef.prototype.isVarRef = true;

export class InvocationTable extends Table {
    invocation : Invocation;

    constructor(location : SourceRange|null,
                invocation : Invocation,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(invocation instanceof Invocation);
        this.invocation = invocation;
    }

    toExpression(extra_in_params : InputParam[]) {
        const invocation = this.invocation.clone();
        invocation.in_params.push(...extra_in_params);
        return new InvocationExpression(this.location, invocation, this.schema);
    }

    toSource() : TokenStream {
        return this.invocation.toSource();
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitInvocationTable(this))
            this.invocation.visit(visitor);
        visitor.exit(this);
    }
    clone() : InvocationTable {
        return new InvocationTable(
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
Table.Invocation = InvocationTable;
Table.Invocation.prototype.isInvocation = true;

export class FilteredTable extends Table {
    table : Table;
    filter : BooleanExpression;

    constructor(location : SourceRange|null,
                table : Table,
                filter : BooleanExpression,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    toExpression(extra_in_params : InputParam[]) {
        return new FilterExpression(this.location, this.table.toExpression(extra_in_params), this.filter, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitFilteredTable(this)) {
            this.table.visit(visitor);
            this.filter.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : FilteredTable {
        return new FilteredTable(
            this.location,
            this.table.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.table.iterateSlots(scope);
        yield* this.filter.iterateSlots(this.table.schema, prim, newScope);
        return [prim, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.table.iterateSlots2(scope);
        yield* this.filter.iterateSlots2(this.table.schema, prim, newScope);
        return [prim, newScope];
    }
}
Table.Filter = FilteredTable;
Table.Filter.prototype.isFilter = true;
export class ProjectionTable extends Table {
    table : Table;
    args : string[];

    constructor(location : SourceRange|null,
                table : Table,
                args : string[],
                schema : FunctionDef|null) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(args));
        this.args = args;
    }

    toExpression(extra_in_params : InputParam[]) {
        return new ProjectionExpression(this.location, this.table.toExpression(extra_in_params), this.args, [], [], this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitProjectionTable(this))
            this.table.visit(visitor);
        visitor.exit(this);
    }

    clone() : ProjectionTable {
        return new ProjectionTable(
            this.location,
            this.table.clone(),
            this.args.map((a) => (a)),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, nestedScope] = yield* this.table.iterateSlots(scope);
        const newScope : ScopeMap = {};
        for (const name of this.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, nestedScope] = yield* this.table.iterateSlots2(scope);
        const newScope : ScopeMap = {};
        for (const name of this.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    }
}
Table.Projection = ProjectionTable;
Table.Projection.prototype.isProjection = true;

export class ComputeTable extends Table {
    table : Table;
    expression : Value;
    alias : string|null;
    type : Type|null;

    constructor(location : SourceRange|null,
                table : Table,
                expression : Value,
                alias : string|null,
                schema : FunctionDef|null,
                type : Type|null = null) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(expression instanceof Value);
        this.expression = expression;

        assert(alias === null || typeof alias === 'string');
        this.alias = alias;

        this.type = type;
    }

    toExpression(extra_in_params : InputParam[]) {
        return new ProjectionExpression(this.location, this.table.toExpression(extra_in_params), ['*'], [this.expression], [this.alias], this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitComputeTable(this)) {
            this.table.visit(visitor);
            this.expression.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : ComputeTable {
        return new ComputeTable(
            this.location,
            this.table.clone(),
            this.expression.clone(),
            this.alias,
            this.schema ? this.schema.clone() : null,
            this.type
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, innerScope] = yield* this.table.iterateSlots2(scope);
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, this.type as Type, this, 'compute', 'expression'));
        return [prim, innerScope];
    }
}
Table.Compute = ComputeTable;
Table.Compute.prototype.isCompute = true;

export class AliasTable extends Table {
    table : Table;
    name : string;

    constructor(location : SourceRange|null,
                table : Table,
                name : string,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(typeof name === 'string');
        this.name = name;
    }

    toExpression(extra_in_params : InputParam[]) {
        return new AliasExpression(this.location, this.table.toExpression(extra_in_params), this.name, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAliasTable(this))
            this.table.visit(visitor);
        visitor.exit(this);
    }

    clone() : AliasTable {
        return new AliasTable(
            this.location,
            this.table.clone(),
            this.name,
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots2(scope);
    }
}
Table.Alias = AliasTable;
Table.Alias.prototype.isAlias = true;

export class AggregationTable extends Table {
    table : Table;
    field : string;
    operator : string;
    alias : string|null;
    overload : Type[]|null;

    constructor(location : SourceRange|null,
                table : Table,
                field : string,
                operator : string,
                alias : string|null,
                schema : FunctionDef|null,
                overload : Type[]|null = null) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(typeof field === 'string');
        this.field = field;

        assert(typeof operator === 'string');
        this.operator = operator;

        assert(alias === null || typeof alias === 'string');
        this.alias = alias;

        this.overload = overload;
    }

    toExpression(extra_in_params : InputParam[]) {
        return new AggregationExpression(this.location, this.table.toExpression(extra_in_params), this.field, this.operator, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAggregationTable(this))
            this.table.visit(visitor);
        visitor.exit(this);
    }

    clone() : AggregationTable {
        return new AggregationTable(
            this.location,
            this.table.clone(),
            this.field,
            this.operator,
            this.alias,
            this.schema ? this.schema.clone() : null,
            this.overload
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots2(scope);
    }
}
Table.Aggregation = AggregationTable;
Table.Aggregation.prototype.isAggregation = true;

export class SortedTable extends Table {
    table : Table;
    field : string;
    direction : 'asc'|'desc';

    constructor(location : SourceRange|null,
                table : Table,
                field : string,
                direction : 'asc'|'desc',
                schema : FunctionDef|null) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(typeof field === 'string');
        this.field = field;

        assert(direction === 'asc' || direction === 'desc');
        this.direction = direction;
    }

    toExpression(extra_in_params : InputParam[]) {
        return new SortExpression(this.location, this.table.toExpression(extra_in_params),
            new Value.VarRef(this.field), this.direction, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitSortedTable(this))
            this.table.visit(visitor);
        visitor.exit(this);
    }

    clone() : SortedTable {
        return new SortedTable(
            this.location,
            this.table.clone(),
            this.field,
            this.direction,
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots2(scope);
    }
}
Table.Sort = SortedTable;
Table.Sort.prototype.isSort = true;

export class IndexTable extends Table {
    table : Table;
    indices : Value[];

    constructor(location : SourceRange|null,
                table : Table,
                indices : Value[],
                schema : FunctionDef|null) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(indices));
        this.indices = indices;
    }

    toExpression(extra_in_params : InputParam[]) {
        return new IndexExpression(this.location, this.table.toExpression(extra_in_params), this.indices, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitIndexTable(this)) {
            this.table.visit(visitor);
            for (const index of this.indices)
                index.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : IndexTable {
        return new IndexTable(
            this.location,
            this.table.clone(),
            this.indices.map((i) => i.clone()),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, innerScope] = yield* this.table.iterateSlots2(scope);
        for (let i = 0; i < this.indices.length; i++)
            yield* recursiveYieldArraySlots(new ArrayIndexSlot(prim, innerScope, Type.Number, this.indices, 'table.index', i));
        return [prim, innerScope];
    }
}
Table.Index = IndexTable;
Table.Index.prototype.isIndex = true;

export class SlicedTable extends Table {
    table : Table;
    base : Value;
    limit : Value;

    constructor(location : SourceRange|null,
                table : Table,
                base : Value,
                limit : Value,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(base instanceof Value);
        this.base = base;

        assert(limit instanceof Value);
        this.limit = limit;
    }

    toExpression(extra_in_params : InputParam[]) {
        return new SliceExpression(this.location, this.table.toExpression(extra_in_params), this.base, this.limit, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitSlicedTable(this)) {
            this.table.visit(visitor);
            this.base.visit(visitor);
            this.limit.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : SlicedTable {
        return new SlicedTable(
            this.location,
            this.table.clone(),
            this.base.clone(),
            this.limit.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, innerScope] = yield* this.table.iterateSlots2(scope);
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, Type.Number, this, 'slice', 'base'));
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, Type.Number, this, 'slice', 'limit'));
        return [prim, innerScope];
    }
}
Table.Slice = SlicedTable;
Table.Slice.prototype.isSlice = true;

export class JoinTable extends Table {
    lhs : Table;
    rhs : Table;
    in_params : InputParam[];

    constructor(location : SourceRange|null,
                lhs : Table,
                rhs : Table,
                in_params : InputParam[],
                schema : FunctionDef|null) {
        super(location, schema);

        assert(lhs instanceof Table);
        this.lhs = lhs;

        assert(rhs instanceof Table);
        this.rhs = rhs;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    toExpression(extra_in_params : InputParam[]) {
        // we need typechecking to implement this correctly, but typechecking
        // happens after the conversion so it is too late
        if (extra_in_params.length > 0)
            throw new Error(`Cannot carry extra_in_params across a join`);

        return new ChainExpression(this.location, [this.lhs.toExpression([]), this.rhs.toExpression(this.in_params)], this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitJoinTable(this)) {
            this.lhs.visit(visitor);
            this.rhs.visit(visitor);
            for (const in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : JoinTable {
        return new JoinTable(
            this.location,
            this.lhs.clone(),
            this.rhs.clone(),
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const [, leftScope] = yield* this.lhs.iterateSlots(scope);
        const [, rightScope] = yield* this.rhs.iterateSlots(scope);
        const newScope : ScopeMap = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [, leftScope] = yield* this.lhs.iterateSlots2(scope);
        const [, rightScope] = yield* this.rhs.iterateSlots2(scope);
        const newScope : ScopeMap = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    }
}
Table.Join = JoinTable;
Table.Join.prototype.isJoin = true;


/**
 * The base class of all ThingTalk stream expressions.
 *
 * @deprecated This class is part of ThingTalk 1.0. Use {@link Ast.Expression} in ThingTalk 2.0.
 */
export abstract class Stream extends Node {
    static VarRef : typeof VarRefStream;
    isVarRef ! : boolean;
    static Timer : typeof TimerStream;
    isTimer ! : boolean;
    static AtTimer : typeof AtTimerStream;
    isAtTimer ! : boolean;
    static Monitor : typeof MonitorStream;
    isMonitor ! : boolean;
    static EdgeNew : typeof EdgeNewStream;
    isEdgeNew ! : boolean;
    static EdgeFilter : typeof EdgeFilterStream;
    isEdgeFilter ! : boolean;
    static Filter : typeof FilteredStream;
    isFilter ! : boolean;
    static Projection : typeof ProjectionStream;
    isProjection ! : boolean;
    static Compute : typeof ComputeStream;
    isCompute ! : boolean;
    static Alias : typeof AliasStream;
    isAlias ! : boolean;
    static Join : typeof JoinStream;
    isJoin ! : boolean;

    schema : FunctionDef|null;

    /**
     * Construct a new stream node.
     *
     * @param location - the position of this node in the source code
     * @param schema - type signature of the stream expression
     */
    constructor(location : SourceRange|null,
                schema : FunctionDef|null) {
        super(location);

        assert(schema === null || schema instanceof FunctionDef);
        this.schema = schema;
    }

    toSource() : TokenStream {
        throw new Error(`Legacy AST node cannot be converted to source, convert to Expression first`);
    }

    abstract toExpression() : Expression;

    abstract clone() : Stream;

    /**
     * Iterate all slots (scalar value nodes) in this stream.
     *
     * @param scope - available names for parameter passing
     * @deprecated Use {@link Ast.Stream.iterateSlots2} instead.
     */
    abstract iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]>;

    /**
     * Iterate all slots (scalar value nodes) in this stream.
     *
     * @param scope - available names for parameter passing
     */
    abstract iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]>;
}
Stream.prototype.isVarRef = false;
Stream.prototype.isTimer = false;
Stream.prototype.isAtTimer = false;
Stream.prototype.isMonitor = false;
Stream.prototype.isEdgeNew = false;
Stream.prototype.isEdgeFilter = false;
Stream.prototype.isFilter = false;
Stream.prototype.isProjection = false;
Stream.prototype.isCompute = false;
Stream.prototype.isAlias = false;
Stream.prototype.isJoin = false;

export class VarRefStream extends Stream {
    name : string;
    in_params : InputParam[];

    constructor(location : SourceRange|null,
                name : string,
                in_params : InputParam[],
                schema : FunctionDef|null) {
        super(location, schema);

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    toExpression() {
        return new FunctionCallExpression(this.location, this.name, this.in_params, this.schema);
    }

    toSource() : TokenStream {
        return List.concat(this.name, '(', List.join(this.in_params.map((ip) => ip.toSource()), ','), ')');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitVarRefStream(this)) {
            for (const in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : VarRefStream {
        return new VarRefStream(
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
Stream.VarRef = VarRefStream;
Stream.VarRef.prototype.isVarRef = true;

export class TimerStream extends Stream {
    base : Value;
    interval : Value;
    frequency : Value|null;

    constructor(location : SourceRange|null,
                base : Value,
                interval : Value,
                frequency : Value|null,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(base instanceof Value);
        this.base = base;

        assert(interval instanceof Value);
        this.interval = interval;

        assert(frequency === null || frequency instanceof Value);
        this.frequency = frequency;
    }

    toExpression() {
        const args = [new InputParam(null, 'base', this.base),
                      new InputParam(null, 'interval', this.interval)];
        if (this.frequency)
            args.push(new InputParam(null, 'frequency', this.frequency));
        return new FunctionCallExpression(this.location, 'timer', args, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitTimerStream(this)) {
            this.base.visit(visitor);
            this.interval.visit(visitor);
            if (this.frequency !== null)
                this.frequency.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : TimerStream {
        return new TimerStream(
            this.location,
            this.base.clone(),
            this.interval.clone(),
            this.frequency ? this.frequency.clone() : null,
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        // no primitive here
        return [null, {}];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        // no primitive here
        yield* recursiveYieldArraySlots(new FieldSlot(null, scope, Type.Date, this, 'timer', 'base'));
        yield* recursiveYieldArraySlots(new FieldSlot(null, scope, new Type.Measure('ms'), this, 'timer', 'interval'));
        return [null, {}];
    }
}
Stream.Timer = TimerStream;
Stream.Timer.prototype.isTimer = true;

export class AtTimerStream extends Stream {
    time : Value[];
    expiration_date : Value|null;

    constructor(location : SourceRange|null,
                time : Value[],
                expiration_date : Value|null,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(Array.isArray(time));
        this.time = time;

        assert(expiration_date === null || expiration_date instanceof Value);
        this.expiration_date = expiration_date;
    }

    toExpression() {
        const in_params = [new InputParam(null, 'time', new Value.Array(this.time))];
        if (this.expiration_date)
            in_params.push(new InputParam(null, 'expiration_date', this.expiration_date));
        return new FunctionCallExpression(this.location, 'attimer', in_params, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAtTimerStream(this)) {
            for (const time of this.time)
                time.visit(visitor);
            if (this.expiration_date !== null)
                this.expiration_date.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : AtTimerStream {
        return new AtTimerStream(
            this.location,
            this.time.map((t) => t.clone()),
            this.expiration_date ? this.expiration_date.clone() : null,
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        // no primitive here
        return [null, {}];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        for (let i = 0; i < this.time.length; i++)
            yield* recursiveYieldArraySlots(new ArrayIndexSlot(null, scope, Type.Time, this.time, 'attimer.time', i));
        if (this.expiration_date !== null)
            yield* recursiveYieldArraySlots(new FieldSlot(null, scope, Type.Date, this, 'attimer', 'expiration_date'));
        return [null, {}];
    }
}
Stream.AtTimer = AtTimerStream;
Stream.AtTimer.prototype.isAtTimer = true;

export class MonitorStream extends Stream {
    table : Table;
    args : string[]|null;

    constructor(location : SourceRange|null,
                table : Table,
                args : string[]|null,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(args === null || Array.isArray(args));
        this.args = args;
    }

    toExpression() {
        return new MonitorExpression(this.location, this.table.toExpression([]), this.args, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitMonitorStream(this))
            this.table.visit(visitor);
        visitor.exit(this);
    }

    clone() : MonitorStream {
        return new MonitorStream(
            this.location,
            this.table.clone(),
            this.args ? this.args.map((a) => a) : null,
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.table.iterateSlots2(scope);
    }
}
Stream.Monitor = MonitorStream;
Stream.Monitor.prototype.isMonitor = true;

export class EdgeNewStream extends Stream {
    stream : Stream;

    constructor(location : SourceRange|null,
                stream : Stream,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;
    }

    toExpression() : never {
        throw new Error('`edge on new` is not supported in the new syntax');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitEdgeNewStream(this))
            this.stream.visit(visitor);
        visitor.exit(this);
    }

    clone() : EdgeNewStream {
        return new EdgeNewStream(
            this.location,
            this.stream.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.stream.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.stream.iterateSlots2(scope);
    }
}
Stream.EdgeNew = EdgeNewStream;
Stream.EdgeNew.prototype.isEdgeNew = true;

export class EdgeFilterStream extends Stream {
    stream : Stream;
    filter : BooleanExpression;

    constructor(location : SourceRange|null,
                stream : Stream,
                filter : BooleanExpression,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    toExpression() {
        return new FilterExpression(this.location, this.stream.toExpression(), this.filter, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitEdgeFilterStream(this)) {
            this.stream.visit(visitor);
            this.filter.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : EdgeFilterStream {
        return new EdgeFilterStream(
            this.location,
            this.stream.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.stream.iterateSlots(scope);
        yield* this.filter.iterateSlots(this.stream.schema, prim, newScope);
        return [prim, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.stream.iterateSlots2(scope);
        yield* this.filter.iterateSlots2(this.stream.schema, prim, newScope);
        return [prim, newScope];
    }
}
Stream.EdgeFilter = EdgeFilterStream;
Stream.EdgeFilter.prototype.isEdgeFilter = true;

export class FilteredStream extends Stream {
    stream : Stream;
    filter : BooleanExpression;

    constructor(location : SourceRange|null,
                stream : Stream,
                filter : BooleanExpression,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    toExpression() : Expression {
        // catch a common case that we can handle before bailing
        if (this.stream instanceof MonitorStream) {
            return new MonitorExpression(this.location,
                new FilterExpression(this.location,
                    this.stream.table.toExpression([]),
                    this.filter,
                    this.schema),
                this.stream.args,
                this.stream.schema);
        }

        throw new Error('stream filter is not supported in the new syntax (push the filter down inside the monitor)');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitFilteredStream(this)) {
            this.stream.visit(visitor);
            this.filter.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : FilteredStream {
        return new FilteredStream(
            this.location,
            this.stream.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.stream.iterateSlots(scope);
        yield* this.filter.iterateSlots(this.stream.schema, prim, newScope);
        return [prim, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.stream.iterateSlots2(scope);
        yield* this.filter.iterateSlots2(this.stream.schema, prim, newScope);
        return [prim, newScope];
    }
}
Stream.Filter = FilteredStream;
Stream.Filter.prototype.isFilter = true;

export class ProjectionStream extends Stream {
    stream : Stream;
    args : string[];

    constructor(location : SourceRange|null,
                stream : Stream,
                args : string[],
                schema : FunctionDef|null) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(Array.isArray(args));
        this.args = args;
    }

    toExpression() {
        return new ProjectionExpression(this.location, this.stream.toExpression(), this.args, [], [], this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitProjectionStream(this))
            this.stream.visit(visitor);
        visitor.exit(this);
    }

    clone() : ProjectionStream {
        return new ProjectionStream(
            this.location,
            this.stream.clone(),
            this.args.map((a) => a),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, nestedScope] = yield* this.stream.iterateSlots(scope);
        const newScope : ScopeMap = {};
        for (const name of this.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, nestedScope] = yield* this.stream.iterateSlots2(scope);
        const newScope : ScopeMap = {};
        for (const name of this.args)
            newScope[name] = nestedScope[name];
        return [prim, newScope];
    }
}
Stream.Projection = ProjectionStream;
Stream.Projection.prototype.isProjection = true;

export class ComputeStream extends Stream {
    stream : Stream;
    expression : Value;
    alias : string|null;
    type : Type|null;

    constructor(location : SourceRange|null,
                stream : Stream,
                expression : Value,
                alias : string|null,
                schema : FunctionDef|null,
                type : Type|null = null) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(expression instanceof Value);
        this.expression = expression;

        assert(alias === null || typeof alias === 'string');
        this.alias = alias;

        this.type = type;
    }

    toExpression() {
        return new ProjectionExpression(this.location, this.stream.toExpression(), [], [this.expression], [this.alias], this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitComputeStream(this)) {
            this.stream.visit(visitor);
            this.expression.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : ComputeStream {
        return new ComputeStream(
            this.location,
            this.stream.clone(),
            this.expression.clone(),
            this.alias,
            this.schema ? this.schema.clone() : null,
            this.type
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.stream.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, innerScope] = yield* this.stream.iterateSlots2(scope);
        yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, this.type as Type, this, 'compute', 'expression'));
        return [prim, innerScope];
    }
}
Stream.Compute = ComputeStream;
Stream.Compute.prototype.isCompute = true;

export class AliasStream extends Stream {
    stream : Stream;
    name : string;

    constructor(location : SourceRange|null,
                stream : Stream,
                name : string,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(typeof name === 'string');
        this.name = name;
    }

    toExpression() {
        return new AliasExpression(this.location, this.stream.toExpression(), this.name, this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAliasStream(this))
            this.stream.visit(visitor);
        visitor.exit(this);
    }

    clone() : AliasStream {
        return new AliasStream(
            this.location,
            this.stream.clone(),
            this.name,
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.stream.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.stream.iterateSlots2(scope);
    }
}
Stream.Alias = AliasStream;
Stream.Alias.prototype.isAlias = true;

export class JoinStream extends Stream {
    stream : Stream;
    table : Table
    in_params : InputParam[];

    constructor(location : SourceRange|null,
                stream : Stream,
                table : Table,
                in_params : InputParam[],
                schema : FunctionDef|null) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    toExpression() {
        const lhs = this.stream.toExpression();
        // flatten chain expressions, or typechecking will fail
        if (lhs instanceof ChainExpression)
            return new ChainExpression(this.location, [...lhs.expressions, this.table.toExpression(this.in_params)], this.schema);
        else
            return new ChainExpression(this.location, [lhs, this.table.toExpression(this.in_params)], this.schema);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitJoinStream(this)) {
            this.stream.visit(visitor);
            this.table.visit(visitor);
            for (const in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : JoinStream {
        return new JoinStream(
            this.location,
            this.stream.clone(),
            this.table.clone(),
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const [, leftScope] = yield* this.stream.iterateSlots(scope);
        const [, rightScope] = yield* this.table.iterateSlots(scope);
        const newScope = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [, leftScope] = yield* this.stream.iterateSlots2(scope);
        const [, rightScope] = yield* this.table.iterateSlots2(scope);
        const newScope = {};
        Object.assign(newScope, leftScope, rightScope);
        return [null, newScope];
    }
}
Stream.Join = JoinStream;
Stream.Join.prototype.isJoin = true;


/**
 * Base class for all expressions that invoke an action.
 *
 * @deprecated This class is part of ThingTalk 1.0. Use {@link Ast.Expression} in ThingTalk 2.0.
 */
export abstract class Action extends Node {
    static VarRef : typeof VarRefAction;
    isVarRef ! : boolean;
    static Invocation : typeof InvocationAction;
    isInvocation ! : boolean;
    static Notify : typeof NotifyAction;
    isNotify ! : boolean;

    /**
     * Type signature of this action.
     * This property is guaranteed not `null` after type-checking.
     */
    schema : FunctionDef|null;

    /**
     * Construct a new action expression node.
     *
     * @param location - the position of this node in the source code
     * @param schema - type signature of this action
     */
    constructor(location : SourceRange|null, schema : FunctionDef|null) {
        super(location);

        assert(schema === null || schema instanceof FunctionDef);
        this.schema = schema;
    }

    /**
     * Utility function to create a `notify` or `return` action.
     *
     * @param {string} [what=notify] - what action to create
     * @return {Ast.Action} the action node
     */
    static notifyAction(what : 'notify' = 'notify') : NotifyAction {
        return new NotifyAction(null, what, null);
    }

    abstract toExpression() : Expression;

    abstract clone() : Action;

    /**
     * Iterate all slots (scalar value nodes) in this action.
     *
     * @param scope - available names for parameter passing
     * @deprecated Use {@link Ast.Action.iterateSlots2} instead.
     */
    abstract iterateSlots(scope : ScopeMap) : Generator<OldSlot, void>;

    /**
     * Iterate all slots (scalar value nodes) in this action.
     *
     * @param scope - available names for parameter passing
     */
    abstract iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void>;
}
Action.prototype.isVarRef = false;
Action.prototype.isInvocation = false;
Action.prototype.isNotify = false;

/**
 * An invocation of a locally defined action (i.e. one defined with
 * a `let` statement).
 *
 */
export class VarRefAction extends Action {
    /**
     * The name of the action to invoke.
     */
    name : string;
    /**
     * The input parameters to pass.
     */
    in_params : InputParam[];

    /**
     * Construct a new var ref action.
     *
     * @param location - the position of this node in the source code
     * @param name - the name of the action to invoke
     * @param in_params - the input parameters to pass
     * @param schema - type signature of this action
     */
    constructor(location : SourceRange|null,
                name : string,
                in_params : InputParam[],
                schema : FunctionDef|null) {
        super(location, schema);

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    toExpression() {
        return new FunctionCallExpression(this.location, this.name, this.in_params, this.schema);
    }

    toSource() : TokenStream {
        return List.concat(this.name, '(', List.join(this.in_params.map((ip) => ip.toSource()), ','), ')');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitVarRefAction(this)) {
            for (const in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() : VarRefAction {
        return new VarRefAction(
            this.location,
            this.name,
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }

    toString() : string {
        return `VarRef(${this.name}, ${this.in_params.toString()}, )`;
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, void> {
        for (const in_param of this.in_params)
            yield [this.schema, in_param, this, scope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
        yield* iterateSlots2InputParams(this, scope);
    }
}
Action.VarRef = VarRefAction;
Action.VarRef.prototype.isVarRef = true;

/**
 * An invocation of an action in Thingpedia.
 *
 */
export class InvocationAction extends Action {
    /**
     * The actual invocation expression.
     */
    invocation : Invocation;

    /**
     * Construct a new invocation action.
     *
     * @param location - the position of this node in the source code
     * @param invocation - the function invocation
     * @param schema - type signature of this action
     */
    constructor(location : SourceRange|null,
                invocation : Invocation,
                schema : FunctionDef|null) {
        super(location, schema);

        assert(invocation instanceof Invocation);
        this.invocation = invocation;
    }

    toExpression() {
        return new InvocationExpression(this.location, this.invocation, this.schema);
    }

    toSource() : TokenStream {
        return this.invocation.toSource();
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitInvocationAction(this))
            this.invocation.visit(visitor);
        visitor.exit(this);
    }

    clone() : InvocationAction {
        return new InvocationAction(
            this.location,
            this.invocation.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, void> {
        yield* this.invocation.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.invocation.iterateSlots2(scope);
    }
}
Action.Invocation = InvocationAction;
Action.Invocation.prototype.isInvocation = true;

/**
 * A `notify`, `return` or `save` clause.
 *
 */
export class NotifyAction extends Action {
    name : 'notify';

    /**
     * Construct a new notify action.
     *
     * @param location - the position of this node in the source code
     * @param name - the clause name
     * @param schema - type signature of this action
     */
    constructor(location : SourceRange|null,
                name : 'notify',
                schema : FunctionDef|null = null) {
        super(location, schema);

        // we used to support "return" and "save", but those are gone
        // in new syntax so let's make sure we don't create ASTs for them
        // (or we'll lose information when we convert)
        assert(name === 'notify');
        this.name = name;
    }

    toExpression() : never {
        throw new Error(`notify actions no longer exist`);
    }

    toSource() : TokenStream {
        return List.singleton(this.name);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitNotifyAction(this);
        visitor.exit(this);
    }

    clone() : NotifyAction {
        return new NotifyAction(
            this.location, this.name,
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, void> {
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, void> {
    }
}
Action.Notify = NotifyAction;
Action.Notify.prototype.isNotify = true;
