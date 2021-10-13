// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

import * as Ast from '../ast';
import Type from "../type";

import ReduceOp from './reduceop';

// Low-level ThingTalk operations
// Each ThingTalk AST node can be implemented in terms of these low-level ops
// Each of these ops can be compiled into JS code individually

// PointWiseOp : operates on each produced tuple
export class PointWiseOp {
}

export namespace PointWiseOp {
export class Projection extends PointWiseOp {
    constructor(public args : Set<string>) {
        super();
    }

    toString() {
        return `PointWiseOp.Projection(${this.args})`;
    }
}

export class Compute extends PointWiseOp {
    constructor(public expression : Ast.Value,
                public alias : string) {
        super();
    }

    toString() {
        return `PointWiseOp.Compute(${this.expression} as ${this.alias})`;
    }
}

export class BooleanCompute extends PointWiseOp {
    constructor(public booleanExpression : Ast.BooleanExpression) {
        super();
    }

    toString() {
        return `PointWiseOp.BooleanCompute(${this.booleanExpression})`;
    }
}
}

type SortHint = [string, 'asc'|'desc'];
export class QueryInvocationHints {
    projection : Set<string>;
    filter : Ast.BooleanExpression;
    sort : SortHint|undefined;
    limit : number|undefined;

    constructor(projection : Set<string>,
                filter = Ast.BooleanExpression.True,
                sort ?: SortHint,
                limit ?: number) {
        assert(filter instanceof Ast.BooleanExpression);
        assert(sort === undefined || Array.isArray(sort));
        assert(projection instanceof Set);
        assert(limit === undefined || typeof limit === 'number');

        this.filter = filter;
        this.sort = sort;
        this.projection = projection;
        this.limit = limit;
    }

    clone() : QueryInvocationHints {
        return new QueryInvocationHints(new Set(this.projection), this.filter, this.sort, this.limit);
    }
}

/**
 * A low-level operation on streams
 */
export abstract class StreamOp {
    abstract ast : Ast.Expression|null;
}

export namespace StreamOp {
export class Now extends StreamOp {
    constructor(public table : TableOp,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.Now(${this.table})`;
    }
}

export class InvokeVarRef extends StreamOp {
    constructor(public name : string,
                public in_params : Ast.InputParam[],
                public ast : Ast.Expression,
                public hints : QueryInvocationHints) {
        super();
    }

    toString() {
        return `StreamOp.InvokeVarRef(${this.name}, ${this.in_params.map((ip) => ip.prettyprint()).join(', ')})`;
    }
}

export class InvokeSubscribe extends StreamOp {
    constructor(public invocation : Ast.Invocation,
                public ast : Ast.Expression,
                public hints : QueryInvocationHints) {
        super();
    }

    toString() {
        return `StreamOp.InvokeSubscribe(${this.invocation.prettyprint()})`;
    }
}

export class Timer extends StreamOp {
    constructor(public base : Ast.Value|undefined,
                public interval : Ast.Value,
                public frequency : Ast.Value|undefined,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.Timer(${this.base}, ${this.interval}, ${this.frequency})`;
    }
}

export class AtTimer extends StreamOp {
    constructor(public time : Ast.Value,
                public expiration_date : Ast.Value|undefined,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.AtTimer(${this.time}, ${this.expiration_date})`;
    }
}

export class OnTimer extends StreamOp {
    constructor(public date : Ast.Value,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.OnTimer(${this.date})`;
    }
}

export class Filter extends StreamOp {
    constructor(public stream : StreamOp,
                public filter : BooleanExpressionOp,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.Filter(${this.stream}, ${this.filter})`;
    }
}

export class Map extends StreamOp {
    constructor(public stream : StreamOp,
                public op : PointWiseOp,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.Map(${this.stream}, ${this.op})`;
    }
}

export class EdgeNew extends StreamOp {
    constructor(public stream : StreamOp,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.EdgeNew(${this.stream})`;
    }
}

export class EdgeFilter extends StreamOp {
    constructor(public stream : StreamOp,
                public filter : BooleanExpressionOp,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.EdgeFilter(${this.stream}, ${this.filter})`;
    }
}

export class Union extends StreamOp {
    constructor(public lhs : StreamOp,
                public rhs : StreamOp,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.Union(${this.lhs}, ${this.rhs})`;
    }
}

/**
  When the stream fires, get the whole table (ignore the stream).
  This is used to implement certain "monitor(table)" where the
  table needs to be recomputed on subscribe.
 */
export class InvokeTable extends StreamOp {
    constructor(public stream : StreamOp,
                public table : TableOp,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.InvokeTable(${this.stream}, ${this.table})`;
    }
}

/**
 * When the stream fires, get the whole table and join it.
 */
export class Join extends StreamOp {
    constructor(public stream : StreamOp,
                public table : TableOp,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `StreamOp.Join(${this.stream}, ${this.table})`;
    }
}
}

type UnaryStreamOp = StreamOp.Filter | StreamOp.Map | StreamOp.EdgeFilter | StreamOp.EdgeNew;
export function isUnaryStreamOp(op : StreamOp) : op is UnaryStreamOp {
    return op instanceof StreamOp.Filter ||
        op instanceof StreamOp.Map ||
        op instanceof StreamOp.EdgeFilter ||
        op instanceof StreamOp.EdgeNew;
}

/**
 * A low-level operation on an in-memory table.
 */
export abstract class TableOp {
    handle_thingtalk = false;
    abstract device : Ast.DeviceSelector|null;
    abstract ast : Ast.Expression;
}

export namespace TableOp {
export class InvokeVarRef extends TableOp {
    device = null;

    constructor(public name : string,
                public in_params : Ast.InputParam[],
                public ast : Ast.Expression,
                public hints : QueryInvocationHints) {
        super();
    }

    toString() {
        return `TableOp.InvokeVarRef(${this.name}, ${this.in_params.map((ip) => ip.prettyprint())})`;
    }
}

export class InvokeGet extends TableOp {
    constructor(public invocation : Ast.Invocation,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Expression,
                public hints : QueryInvocationHints) {
        super();
    }

    toString() {
        return `TableOp.InvokeGet(${this.invocation.prettyprint()})`;
    }
}

export class Filter extends TableOp {
    constructor(public table : TableOp,
                public filter : BooleanExpressionOp,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `TableOp.Filter(${this.table}, ${this.filter})`;
    }
}

export class Map extends TableOp {
    constructor(public table : TableOp,
                public op : PointWiseOp,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `TableOp.Map(${this.table}, ${this.op})`;
    }
}

export class Reduce extends TableOp {
    constructor(public table : TableOp,
                public op : ReduceOp<unknown>,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `TableOp.Reduce(${this.table}, ${this.op})`;
    }
}

export class Join extends TableOp {
    constructor(public lhs : TableOp,
                public rhs : TableOp,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `TableOp.Join(${this.lhs}, ${this.rhs})`;
    }
}

export class CrossJoin extends TableOp {
    constructor(public lhs : TableOp,
                public rhs : TableOp,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `TableOp.CrossJoin(${this.lhs}, ${this.rhs})`;
    }
}

export class NestedLoopJoin extends TableOp {
    constructor(public lhs : TableOp,
                public rhs : TableOp,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `TableOp.NestedLoopJoin(${this.lhs}, ${this.rhs})`;
    }
}
}

type UnaryTableOp = TableOp.Filter | TableOp.Map | TableOp.Reduce;
export function isUnaryTableOp(op : TableOp) : op is UnaryTableOp {
    return op instanceof TableOp.Filter ||
        op instanceof TableOp.Map ||
        op instanceof TableOp.Reduce;
}

export abstract class ActionOp {

}

export namespace ActionOp {
export class InvokeDo extends ActionOp {
    constructor(public invocation : Ast.Invocation,
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `ActionOp.InvokeDo(${this.invocation.prettyprint()})`;
    }
}

export class InvokeVarRef extends ActionOp {
    constructor(public name : string,
                public in_params : Ast.InputParam[],
                public ast : Ast.Expression) {
        super();
    }

    toString() {
        return `ActionOp.InvokeVarRef(${this.name}, ${this.in_params.map((ip) => ip.prettyprint())})`;
    }
}
}

/**
 * The overall structure of the rule.
 * This reflects the overall "when => get* => do" structure of ThingTalk
 * which is what it optimizes for.
 */
export class RuleOp {
    constructor(public stream : StreamOp|null,
                public action : ActionOp|null,
                public ast : Ast.ExpressionStatement|Ast.ReturnStatement) {
    }

    toString() {
        return `RuleOp(${this.stream}, ${this.action})`;
    }
}

export abstract class BooleanExpressionOp {
    static True : ConstantBooleanExpressionOp;
    static False : ConstantBooleanExpressionOp;

    public ast : Ast.BooleanExpression;

    protected constructor(ast : Ast.BooleanExpression) {
        this.ast = ast;
    }
}

class ConstantBooleanExpressionOp extends BooleanExpressionOp {
    constructor(public readonly value : boolean) {
        super(value ? Ast.BooleanExpression.True : Ast.BooleanExpression.False);
    }

    toString() {
        return `BooleanExpressionOp.Constant(${this.value})`;
    }
}
BooleanExpressionOp.True = new ConstantBooleanExpressionOp(true);
BooleanExpressionOp.False = new ConstantBooleanExpressionOp(false);

export namespace BooleanExpressionOp {
export class And extends BooleanExpressionOp {
    constructor(ast : Ast.AndBooleanExpression,
                public operands : BooleanExpressionOp[]) {
        super(ast);
    }

    toString() {
        return `BooleanExpressionOp.And(${this.operands.join(', ')})`;
    }
}

export class Or extends BooleanExpressionOp {
    constructor(ast : Ast.OrBooleanExpression,
                public operands : BooleanExpressionOp[]) {
        super(ast);
    }

    toString() {
        return `BooleanExpressionOp.Or(${this.operands.join(', ')})`;
    }
}

export class Not extends BooleanExpressionOp {
    constructor(ast : Ast.NotBooleanExpression,
                public expr : BooleanExpressionOp) {
        super(ast);
    }

    toString() {
        return `BooleanExpressionOp.Not(${this.expr})`;
    }
}

export class Atom extends BooleanExpressionOp {
    constructor(ast : Ast.AtomBooleanExpression|Ast.ComputeBooleanExpression,
                public lhs : Ast.Value,
                public operator : string,
                public rhs : Ast.Value,
                public overload : Type[]|null) {
        super(ast);
    }

    toString() {
        return `BooleanExpressionOp.Atom(${this.lhs}, ${this.operator}, ${this.rhs})`;
    }
}

export class ExistentialSubquery extends BooleanExpressionOp {
    constructor(ast : Ast.ExistentialSubqueryBooleanExpression,
                public subquery : TableOp) {
        super(ast);
    }

    toString() {
        return `BooleanExpressionOp.ExistentialSubquery(${this.subquery})`;
    }
}

export class ComparisonSubquery extends BooleanExpressionOp {
    constructor(ast : Ast.ComparisonSubqueryBooleanExpression,
                public lhs : Ast.Value,
                public operator : string,
                public rhs : Ast.Value,
                public subquery : TableOp,
                public overload : Type[]|null) {
        super(ast);
    }

    toString() {
        return `BooleanExpressionOp.ComparisonSubquery(${this.lhs}, ${this.operator}, ${this.rhs}, ${this.subquery})`;
    }
}
}
