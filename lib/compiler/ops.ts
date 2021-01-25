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
    static Projection : typeof ProjectionPointWiseOp;
    static Compute : typeof ComputePointWiseOp;
}

export class ProjectionPointWiseOp extends PointWiseOp {
    constructor(public args : Set<string>) {
        super();
    }
}
PointWiseOp.Projection = ProjectionPointWiseOp;

export class ComputePointWiseOp extends PointWiseOp {
    constructor(public expression : Ast.Value,
                public alias : string) {
        super();
    }
}
PointWiseOp.Compute = ComputePointWiseOp;

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
    static Now : NowStreamOp;
    static InvokeVarRef : typeof InvokeVarRefStreamOp;
    static InvokeSubscribe : typeof InvokeSubscribeStreamOp;
    static InvokeTable : typeof InvokeTableStreamOp;
    static Timer : typeof TimerStreamOp;
    static AtTimer : typeof AtTimerStreamOp;
    static Filter : typeof FilterStreamOp;
    static Map : typeof MapStreamOp;
    static EdgeNew : typeof EdgeNewStreamOp;
    static EdgeFilter : typeof EdgeFilterStreamOp;
    static Union : typeof UnionStreamOp;
    static Join : typeof JoinStreamOp;

    abstract ast : Ast.Stream|Ast.Table|null;
}

export class NowStreamOp extends StreamOp {
    ast = null;
}
StreamOp.Now = new NowStreamOp;

export class InvokeVarRefStreamOp extends StreamOp {
    constructor(public name : string,
                public in_params : Ast.InputParam[],
                public ast : Ast.Stream,
                public hints : QueryInvocationHints) {
        super();
    }
}
StreamOp.InvokeVarRef = InvokeVarRefStreamOp;

export class InvokeSubscribeStreamOp extends StreamOp {
    constructor(public invocation : Ast.Invocation,
                public ast : Ast.Table,
                public hints : QueryInvocationHints) {
        super();
    }
}
StreamOp.InvokeSubscribe = InvokeSubscribeStreamOp;

export class TimerStreamOp extends StreamOp {
    constructor(public base : Ast.Value,
                public interval : Ast.Value,
                public frequency : Ast.Value|null,
                public ast : Ast.Stream) {
        super();
    }
}
StreamOp.Timer = TimerStreamOp;

export class AtTimerStreamOp extends StreamOp {
    constructor(public time : Ast.Value[],
                public expiration_date : Ast.Value|null,
                public ast : Ast.Stream) {
        super();
    }
}
StreamOp.AtTimer = AtTimerStreamOp;

export class FilterStreamOp extends StreamOp {
    constructor(public stream : StreamOp,
                public filter : BooleanExpressionOp,
                public ast : Ast.Stream|Ast.Table) {
        super();
    }
}
StreamOp.Filter = FilterStreamOp;

export class MapStreamOp extends StreamOp {
    constructor(public stream : StreamOp,
                public op : PointWiseOp,
                public ast : Ast.Stream|Ast.Table) {
        super();
    }
}
StreamOp.Map = MapStreamOp;

export class EdgeNewStreamOp extends StreamOp {
    constructor(public stream : StreamOp,
                public ast : Ast.Stream|Ast.Table) {
        super();
    }
}
StreamOp.EdgeNew = EdgeNewStreamOp;

export class EdgeFilterStreamOp extends StreamOp {
    constructor(public stream : StreamOp,
                public filter : BooleanExpressionOp,
                public ast : Ast.Stream|Ast.Table) {
        super();
    }
}
StreamOp.EdgeFilter = EdgeFilterStreamOp;

export class UnionStreamOp extends StreamOp {
    constructor(public lhs : StreamOp,
                public rhs : StreamOp,
                public ast : Ast.Stream|Ast.Table) {
        super();
    }
}
StreamOp.Union = UnionStreamOp;

/**
  When the stream fires, get the whole table (ignore the stream).
  This is used to implement certain "monitor(table)" where the
  table needs to be recomputed on subscribe.
 */
export class InvokeTableStreamOp extends StreamOp {
    constructor(public stream : StreamOp,
                public table : TableOp,
                public ast : Ast.Table) {
        super();
    }
}
StreamOp.InvokeTable = InvokeTableStreamOp;

/**
 * When the stream fires, get the whole table and join it.
 */
export class JoinStreamOp extends StreamOp {
    constructor(public stream : StreamOp,
                public table : TableOp,
                public ast : Ast.Stream|Ast.Table) {
        super();
    }
}
StreamOp.Join = JoinStreamOp;

type UnaryStreamOp = FilterStreamOp | MapStreamOp | EdgeFilterStreamOp | EdgeNewStreamOp;
export function isUnaryStreamOp(op : StreamOp) : op is UnaryStreamOp {
    return op instanceof FilterStreamOp ||
        op instanceof MapStreamOp ||
        op instanceof EdgeFilterStreamOp ||
        op instanceof EdgeNewStreamOp;
}

/**
 * A low-level operation on an in-memory table.
 */
export abstract class TableOp {
    static InvokeVarRef : typeof InvokeVarRefTableOp;
    static InvokeGet : typeof InvokeGetTableOp;
    static Filter : typeof FilterTableOp;
    static Map : typeof MapTableOp;
    static Reduce : typeof ReduceTableOp;
    static Sort : typeof SortTableOp;
    static CrossJoin : typeof CrossJoinTableOp;
    static NestedLoopJoin : typeof NestedLoopJoinTableOp;

    handle_thingtalk = false;
    abstract device : Ast.DeviceSelector|null;
    abstract ast : Ast.Table;
}

export class InvokeVarRefTableOp extends TableOp {
    device = null;

    constructor(public name : string,
                public in_params : Ast.InputParam[],
                public ast : Ast.Table,
                public hints : QueryInvocationHints) {
        super();
    }
}
TableOp.InvokeVarRef = InvokeVarRefTableOp;

export class InvokeGetTableOp extends TableOp {
    constructor(public invocation : Ast.Invocation,
                public extra_in_params : Ast.InputParam[],
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Table,
                public hints : QueryInvocationHints) {
        super();
    }
}
TableOp.InvokeGet = InvokeGetTableOp;

export class FilterTableOp extends TableOp {
    constructor(public table : TableOp,
                public filter : BooleanExpressionOp,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Table) {
        super();
    }
}
TableOp.Filter = FilterTableOp;

export class MapTableOp extends TableOp {
    constructor(public table : TableOp,
                public op : PointWiseOp,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Table) {
        super();
    }
}
TableOp.Map = MapTableOp;

export class ReduceTableOp extends TableOp {
    constructor(public table : TableOp,
                public op : ReduceOp<unknown>,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Table) {
        super();
    }
}
TableOp.Reduce = ReduceTableOp;

export class SortTableOp extends TableOp {
    constructor(public table : TableOp,
                public field : string,
                public direction : 'asc'|'desc',
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Table) {
        super();
    }
}
TableOp.Sort = SortTableOp;

export class CrossJoinTableOp extends TableOp {
    constructor(public lhs : TableOp,
                public rhs : TableOp,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Table) {
        super();
    }
}
TableOp.CrossJoin = CrossJoinTableOp;

export class NestedLoopJoinTableOp extends TableOp {
    constructor(public lhs : TableOp,
                public rhs : TableOp,
                public device : Ast.DeviceSelector|null,
                public handle_thingtalk : boolean,
                public ast : Ast.Table) {
        super();
    }
}
TableOp.NestedLoopJoin = NestedLoopJoinTableOp;

type UnaryTableOp = FilterTableOp | MapTableOp | ReduceTableOp | SortTableOp;
export function isUnaryTableOp(op : TableOp) : op is UnaryTableOp {
    return op instanceof FilterTableOp ||
        op instanceof MapTableOp ||
        op instanceof ReduceTableOp ||
        op instanceof SortTableOp;
}

/**
 * The overall structure of the rule.
 * This reflects the overall "when => get* => do" structure of ThingTalk
 * which is what it optimizes for.
 */
export class RuleOp {
    constructor(public stream : StreamOp,
                public actions : Ast.Action[],
                public ast : Ast.Statement) {
    }
}

export abstract class BooleanExpressionOp {
    static And : typeof AndBooleanExpressionOp;
    static Or : typeof OrBooleanExpressionOp;
    static Not : typeof NotBooleanExpressionOp;
    static Atom : typeof AtomBooleanExpressionOp;
    static External : typeof ExternalBooleanExpressionOp;
    static ComparisonSubquery : typeof ComparisonSubqueryBooleanExpressionOp;
    static True : TrueBooleanExpressionOp;
    static False : FalseBooleanExpressionOp;
    static Compute : typeof ComputeBooleanExpressionOp;
    static DontCare : typeof DontCareBooleanExpressionOp;

    public ast : Ast.BooleanExpression;

    protected constructor(ast : Ast.BooleanExpression) {
        this.ast = ast;
    }
}

export class AndBooleanExpressionOp extends BooleanExpressionOp {
    constructor(ast : Ast.AndBooleanExpression,
                public operands : BooleanExpressionOp[]) {
        super(ast);
    }
}
BooleanExpressionOp.And = AndBooleanExpressionOp;

export class OrBooleanExpressionOp extends BooleanExpressionOp {
    constructor(ast : Ast.OrBooleanExpression,
                public operands : BooleanExpressionOp[]) {
        super(ast);
    }
}
BooleanExpressionOp.Or = OrBooleanExpressionOp;

export class NotBooleanExpressionOp extends BooleanExpressionOp {
    constructor(ast : Ast.NotBooleanExpression,
                public expr : BooleanExpressionOp) {
        super(ast);
    }
}
BooleanExpressionOp.Not = NotBooleanExpressionOp;

export class AtomBooleanExpressionOp extends BooleanExpressionOp {
    constructor(ast : Ast.AtomBooleanExpression,
                public name : string,
                public operator : string,
                public value : Ast.Value,
                public overload : Type[]|null){
        super(ast);
    }
}
BooleanExpressionOp.Atom = AtomBooleanExpressionOp;

export class ExternalBooleanExpressionOp extends BooleanExpressionOp {
    constructor(ast : Ast.ExternalBooleanExpression,
                public selector : Ast.DeviceSelector,
                public channel : string,
                public in_parms : Ast.InputParam[],
                public filter : BooleanExpressionOp,
                public schema : Ast.FunctionDef|null,
                public __effectiveSelector : Ast.DeviceSelector|null) {
        super(ast);
    }
}
BooleanExpressionOp.External = ExternalBooleanExpressionOp;

export class ComparisonSubqueryBooleanExpressionOp extends BooleanExpressionOp {
    constructor(ast : Ast.ComparisonSubqueryBooleanExpression,
                public value : Ast.Value,
                public operator : string,
                public name : string,
                public subquery : TableOp,
                public overload : Type[]|null) {
        super(ast);
    }
}
BooleanExpressionOp.ComparisonSubquery = ComparisonSubqueryBooleanExpressionOp;

export class TrueBooleanExpressionOp extends BooleanExpressionOp {
    constructor(ast : Ast.TrueBooleanExpression) {
        super(ast);
    }
}
BooleanExpressionOp.True = new TrueBooleanExpressionOp(Ast.BooleanExpression.True);

export class FalseBooleanExpressionOp extends BooleanExpressionOp {
    constructor(ast : Ast.FalseBooleanExpression) {
        super(ast);
    }
}
BooleanExpressionOp.False = new FalseBooleanExpressionOp(Ast.BooleanExpression.False);

export class ComputeBooleanExpressionOp extends BooleanExpressionOp {
    constructor(ast : Ast.ComputeBooleanExpression,
                public lhs : Ast.Value,
                public operator : string,
                public rhs : Ast.Value,
                public overload : Type[]|null) {
        super(ast);
    }
}
BooleanExpressionOp.Compute = ComputeBooleanExpressionOp;

export class DontCareBooleanExpressionOp extends BooleanExpressionOp {
    constructor(ast : Ast.DontCareBooleanExpression,
                public name : string) {
        super(ast);
    }
}
BooleanExpressionOp.DontCare = DontCareBooleanExpressionOp;
