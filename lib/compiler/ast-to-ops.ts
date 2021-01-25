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
import { NotImplementedError } from '../utils/errors';
import { getScalarExpressionName } from '../utils';

import {
    PointWiseOp,
    StreamOp,
    TableOp,
    RuleOp,
    QueryInvocationHints,
    BooleanExpressionOp
} from './ops';
import * as Ops from './ops';
// YES there are two different modules called utils
// because of course
import { getDefaultProjection, getExpressionParameters } from './utils';
import ReduceOp, { SimpleAggregationType } from './reduceop';

function sameDevice(lhs : Ast.DeviceSelector, rhs : Ast.DeviceSelector) : boolean {
    if (lhs.kind !== rhs.kind)
        return false;
    if (lhs.id !== rhs.id)
        return false;
    if (lhs.principal !== rhs.principal)
        return false;
    return true;
}


function addAll<T>(set : Set<T>, values : Iterable<T>) : Set<T> {
    for (const v of values)
        set.add(v);
    return set;
}

function setIntersect<T>(one : Set<T>, two : Set<T>) : Set<T> {
    const intersection = new Set<T>();
    for (const el of one) {
        if (two.has(el))
            intersection.add(el);
    }
    return intersection;
}

function addMinimalProjection(args : Iterable<string>, schema : Ast.FunctionDef) : Set<string> {
    const argset = new Set<string>(args);
    addAll(argset, schema.minimal_projection as string[]);
    return argset;
}

/**
 * Lower the query invocation hints for one side of the join.
 *
 * This is a limited best-effort operation. optimize.js includes a more
 * thorough handling of filters and projections, which also affects
 * the JS compiled code.
 */
function restrictHintsForJoin(hints : QueryInvocationHints,
                              schema : Ast.FunctionDef) : QueryInvocationHints {
    // start with a clean slate (no sort, no index)
    const clone = new QueryInvocationHints(new Set);
    for (const arg of hints.projection) {
        if (schema.hasArgument(arg))
            clone.projection.add(arg);
    }
    clone.filter = (function recursiveHelper(expr : Ast.BooleanExpression) {
        if (expr.isTrue || expr.isFalse)
            return expr;
        if (expr instanceof Ast.DontCareBooleanExpression) // dont care about dontcares
            return Ast.BooleanExpression.True;

        if (expr instanceof Ast.AtomBooleanExpression) {
            // bail (convert to `true`) if:
            // - the filter left-hand-side is not defined in this branch of the join
            // - or any part of the right-hand-side uses a parameter not defined in this
            //   branch of the join

            if (!schema.hasArgument(expr.name))
                return Ast.BooleanExpression.True;

            const pnames = getExpressionParameters(expr.value, schema);
            for (const pname of pnames) {
                if (!schema.hasArgument(pname))
                    return Ast.BooleanExpression.True;
            }

            return expr;
        }

        // ignore everything else
        return Ast.BooleanExpression.True;
    })(hints.filter);

    return clone;
}

// compile a table that is being monitored to a stream
function compileMonitorTableToOps(table : Ast.Table,
                                  hints : QueryInvocationHints) : StreamOp {
    if (table instanceof Ast.VarRefTable ||
        table instanceof Ast.AliasTable)
        throw new NotImplementedError(String(table));

    if (table instanceof Ast.InvocationTable) {
        // subscribe is optimistic, we still need EdgeNew
        return new StreamOp.EdgeNew(
            new StreamOp.InvokeSubscribe(table.invocation, table, hints),
            table
        );
    } else if (table instanceof Ast.FilteredTable) {
        const schema = table.schema;
        assert(schema);
        const hintsclone = hints.clone();
        addAll(hintsclone.projection, getExpressionParameters(table.filter, schema));
        hintsclone.filter = new Ast.BooleanExpression.And(null, [table.filter, hints.filter]);
        return new StreamOp.Filter(
            compileMonitorTableToOps(table.table, hintsclone),
            compileBooleanExpressionToOp(table.filter),
            table
        );
    } else if (table instanceof Ast.ProjectionTable) {
        const schema = table.schema;
        assert(schema);
        // see note in stream.isProjection later
        const effective = setIntersect(hints.projection, addMinimalProjection(table.args, schema));
        const hintsclone = hints.clone();
        hintsclone.projection = effective;

        // note the "edge new" operation here, because
        // the projection might cause fewer values to
        // be new
        return new StreamOp.EdgeNew(
            new StreamOp.Map(
                compileMonitorTableToOps(table.table, hintsclone),
                new PointWiseOp.Projection(effective),
                table
            ),
            table
        );
    } else if (table instanceof Ast.SortedTable || table instanceof Ast.IndexTable || table instanceof Ast.SlicedTable) {
        // sort, index and slice have no effect on monitor
        //
        // XXX is this correct?
        return compileMonitorTableToOps(table, hints);
    } else if (table instanceof Ast.ComputeTable) {
        const schema = table.schema;
        assert(schema);
        const hintsclone = hints.clone();
        addAll(hintsclone.projection, getExpressionParameters(table.expression, schema));
        // note the "edge new" operation here, because
        // the projection might cause fewer values to
        // be new
        return new StreamOp.EdgeNew(
            new StreamOp.Map(
                compileMonitorTableToOps(table.table, hintsclone),
                new PointWiseOp.Compute(table.expression, table.alias || getScalarExpressionName(table.expression)),
                table
            ),
            table
        );
    } else if (table instanceof Ast.AggregationTable) {
        // discard the hints entirely across aggregation
        const newHints = new QueryInvocationHints(table.field === '*' ? new Set([]) : new Set([table.field]));

        // for an aggregation, we subscribe to the inner table
        // (ie react to all changes), then when the table changes
        // we fetch it completely again and compute the aggregation
        // note the "edge new" operation here, because
        // the aggregation might cause fewer values to
        // be new
        return new StreamOp.EdgeNew(new StreamOp.InvokeTable(
            compileMonitorTableToOps(table.table, newHints),
            compileTableToOps(table, [], newHints),
            table
        ), table);
    } else if (table instanceof Ast.JoinTable) {
        const lhsschema = table.lhs.schema;
        assert(lhsschema);
        const rhsschema = table.rhs.schema;
        assert(rhsschema);

        if (table.in_params.length === 0) {
            // if there is no parameter passing, we can individually monitor
            // the two tables and return the union
            return new StreamOp.EdgeNew(new StreamOp.Union(
                compileMonitorTableToOps(table.lhs, restrictHintsForJoin(hints, lhsschema)),
                compileMonitorTableToOps(table.rhs, restrictHintsForJoin(hints, rhsschema)),
                table),
                table
            );
        } else {
            // otherwise we need to subscribe to the left hand side, and
            // every time it fires, create/update a subscription to the
            // right hand side
            // this is VERY MESSY
            // so it's not implemented
            throw new NotImplementedError(String(table));
        }
    } else {
        throw new TypeError();
    }
}

// compile a TT stream to a stream op and zero or more
// tableops
function compileStreamToOps(stream : Ast.Stream,
                            hints : QueryInvocationHints) : StreamOp {
    if (stream instanceof Ast.AliasStream)
        throw new NotImplementedError(String(stream));

    if (stream instanceof Ast.VarRefStream) {
        return new StreamOp.InvokeVarRef(stream.name, stream.in_params, stream, hints);
    } else if (stream instanceof Ast.TimerStream) {
        return new StreamOp.Timer(stream.base, stream.interval, stream.frequency, stream);
    } else if (stream instanceof Ast.AtTimerStream) {
        return new StreamOp.AtTimer(stream.time, stream.expiration_date, stream);
    } else if (stream instanceof Ast.MonitorStream) {
        const schema = stream.schema;
        assert(schema);
        const hintsclone = hints.clone();
        // if we're monitoring on specific fields, we can project on those fields
        // otherwise, we need to project on all output parameters
        if (stream.args)
            addAll(hintsclone.projection, stream.args);
        else
            addAll(hintsclone.projection, Object.keys(schema.out));
        return compileMonitorTableToOps(stream.table, hintsclone);
    } else if (stream instanceof Ast.EdgeNewStream) {
        const op = compileStreamToOps(stream.stream, hints);
        return new StreamOp.EdgeNew(op, stream);
    } else if (stream instanceof Ast.EdgeFilterStream) {
        const schema = stream.schema;
        assert(schema);
        const hintsclone = hints.clone();
        addAll(hintsclone.projection, getExpressionParameters(stream.filter, schema));
        // NOTE: we don't lower the filter here, because if the subscribe applies the filter,
        // we don't notice the edge
        //
        // we do it for StreamFilter, because Filter(Monitor) === Monitor(Filter)
        const op = compileStreamToOps(stream.stream, hintsclone);
        return new StreamOp.EdgeFilter(op, compileBooleanExpressionToOp(stream.filter), stream);
    } else if (stream instanceof Ast.FilteredStream) {
        const schema = stream.schema;
        assert(schema);
        const hintsclone = hints.clone();
        addAll(hintsclone.projection, getExpressionParameters(stream.filter, schema));
        hintsclone.filter = new Ast.BooleanExpression.And(null, [stream.filter, hints.filter]);
        const op = compileStreamToOps(stream.stream, hintsclone);
        return new StreamOp.Filter(op, compileBooleanExpressionToOp(stream.filter), stream);
    } else if (stream instanceof Ast.ProjectionStream) {
        // NOTE: there is a tricky case of nested projection that looks like
        // Projection(Filter(Projection(x, [a, b, c]), use(c)), [a, b])
        //
        // This is dangerous because the PointWiseOp.Projection will hard-apply
        // the projection, it won't be just a hint. Yet, it is ok
        // because all parameters that are used by the filter are added to the
        // projection hint.
        const schema = stream.schema;
        assert(schema);
        const effective = setIntersect(hints.projection, addMinimalProjection(stream.args, schema));
        const hintsclone = hints.clone();
        hintsclone.projection = effective;
        const op = compileStreamToOps(stream.stream, hintsclone);
        return new StreamOp.Map(op, new PointWiseOp.Projection(effective), stream);
    } else if (stream instanceof Ast.ComputeStream) {
        const hintsclone = hints.clone();
        const schema = stream.schema;
        assert(schema);
        addAll(hintsclone.projection, getExpressionParameters(stream.expression, schema));
        const op = compileStreamToOps(stream.stream, hintsclone);
        return new StreamOp.Map(op, new PointWiseOp.Compute(stream.expression,
            stream.alias || getScalarExpressionName(stream.expression)), stream);
    } else if (stream instanceof Ast.JoinStream) {
        const streamschema = stream.stream.schema;
        assert(streamschema);
        const tableschema = stream.table.schema;
        assert(tableschema);
        const streamOp = compileStreamToOps(stream.stream, restrictHintsForJoin(hints, streamschema));
        const tableOp = compileTableToOps(stream.table, stream.in_params, restrictHintsForJoin(hints, tableschema));
        return new StreamOp.Join(streamOp, tableOp, stream);
    } else {
        throw new TypeError();
    }
}

function compileTableToOps(table : Ast.Table,
                           extra_in_params : Ast.InputParam[],
                           hints : QueryInvocationHints) : TableOp {
    if (table instanceof Ast.AliasTable)
        throw new NotImplementedError(String(table));

    if (table instanceof Ast.VarRefTable) {
        const compiled = new TableOp.InvokeVarRef(table.name, table.in_params.concat(extra_in_params), table, hints);
        compiled.device = null;
        compiled.handle_thingtalk = false;
        return compiled;
    } else if (table instanceof Ast.InvocationTable) {
        const device = table.invocation.selector;
        assert(device instanceof Ast.DeviceSelector);
        const schema = table.schema;
        assert(schema instanceof Ast.FunctionDef);
        const handle_thingtalk = !!schema.getImplementationAnnotation<boolean>('handle_thingtalk');
        return new TableOp.InvokeGet(
            table.invocation,
            extra_in_params,
            device,
            handle_thingtalk,
            table,
            hints
        );
    } else if (table instanceof Ast.FilteredTable) {
        const hintsclone = hints.clone();
        const schema = table.schema;
        assert(schema);
        addAll(hintsclone.projection, getExpressionParameters(table.filter, schema));
        hintsclone.filter = new Ast.BooleanExpression.And(null, [table.filter, hints.filter]);
        const compiled = compileTableToOps(table.table, extra_in_params, hintsclone);
        return new TableOp.Filter(
            compiled,
            compileBooleanExpressionToOp(table.filter),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.ProjectionTable) {
        const schema = table.schema;
        assert(schema);
        // see note above (for stream.isProjection) for this operation
        const effective = setIntersect(hints.projection, addMinimalProjection(table.args, schema));
        const hintsclone = hints.clone();
        hintsclone.projection = effective;

        const compiled = compileTableToOps(table.table, extra_in_params, hintsclone);
        return new TableOp.Map(
            compiled,
            new PointWiseOp.Projection(effective),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.ComputeTable) {
        const hintsclone = hints.clone();
        const schema = table.schema;
        assert(schema);
        addAll(hintsclone.projection, getExpressionParameters(table.expression, schema));
        const compiled = compileTableToOps(table.table, extra_in_params, hintsclone);
        return new TableOp.Map(
            compiled,
            new PointWiseOp.Compute(table.expression,
                table.alias || getScalarExpressionName(table.expression)),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.AggregationTable) {
        // discard the hints entirely across aggregation
        const newHints = new QueryInvocationHints(table.field === '*' ? new Set([]) : new Set([table.field]));

        const schema = table.schema;
        assert(schema);
        let reduceop;
        if (table.operator === 'count' && table.field === '*')
            reduceop = new ReduceOp.Count;
        else if (table.operator === 'count')
            reduceop = new ReduceOp.CountDistinct(table.field);
        else if (table.operator === 'avg')
            reduceop = new ReduceOp.Average(table.field, schema.out[table.field]);
        else
            reduceop = new ReduceOp.SimpleAggregation(table.operator as SimpleAggregationType, table.field, schema.out[table.field]);

        const compiled = compileTableToOps(table.table, extra_in_params, newHints);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.IndexTable &&
               table.indices.length === 1 && table.indices[0] instanceof Ast.NumberValue &&
               table.table instanceof Ast.SortedTable) {
        const hintsclone = hints.clone();

        // convert sort followed by a single index into argminmax
        const index = table.indices[0] as Ast.NumberValue;
        const inner = table.table as Ast.SortedTable;
        let reduceop;
        if (index.value === 1 || index.value === -1) {
            // common case of simple argmin/argmax
            let argminmaxop : 'argmin' | 'argmax';
            if ((index.value === 1 && inner.direction === 'asc') ||
                (index.value === -1 && inner.direction === 'desc'))
                argminmaxop = 'argmin';
            else
                argminmaxop = 'argmax';

            hintsclone.limit = 1;
            hintsclone.sort = [inner.field, inner.direction];
            reduceop = new ReduceOp.SimpleArgMinMax(argminmaxop, inner.field);
        } else {
            let argminmaxop : 'argmin' | 'argmax';
            if (inner.direction === 'asc')
                argminmaxop = 'argmin';
            else
                argminmaxop = 'argmax';

            // across an index, the limit hint becomes the index value, if known,
            // (so an index [3] would fetch 3 elements)
            //
            // NOTE: for correct operation, devices which implement hints MUST NOT
            // implement "limit" without implementing "sort"
            hintsclone.limit = index.toJS();
            hintsclone.sort = [inner.field, inner.direction];
            reduceop = new ReduceOp.ComplexArgMinMax(argminmaxop, inner.field, index, new Ast.Value.Number(1));
        }

        const compiled = compileTableToOps(inner.table, extra_in_params, hintsclone);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.SlicedTable && table.table instanceof Ast.SortedTable) {
        const inner = table.table as Ast.SortedTable;
        // convert sort followed by a single slice into argminmax
        let argminmaxop : 'argmin' | 'argmax';
        if (inner.direction === 'asc')
            argminmaxop = 'argmin';
        else
            argminmaxop = 'argmax';
        const reduceop = new ReduceOp.ComplexArgMinMax(argminmaxop, inner.field, table.base, table.limit);

        const hintsclone = hints.clone();
        // across a slice, the limit hint becomes the base value + the limit value, if known,
        // (so a slice [2:3] would fetch 4 elements, and then discard the first one)
        // (note the off by one because the base is 1-based)
        //
        // NOTE: for correct operation, devices which implement hints MUST NOT
        // implement "limit" without implementing "sort"
        const base = table.base;
        const limit = table.limit;

        hintsclone.limit = base instanceof Ast.NumberValue && limit instanceof Ast.NumberValue ?
            (base.toJS() - 1 + limit.toJS()) : undefined;
        hintsclone.sort = [inner.field, inner.direction];

        const compiled = compileTableToOps(inner.table, extra_in_params, hintsclone);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.SortedTable) {
        const hintsclone = hints.clone();
        hintsclone.sort = [table.field, table.direction];
        const compiled = compileTableToOps(table.table, extra_in_params, hintsclone);
        return new TableOp.Reduce(
            compiled,
            new ReduceOp.Sort(table.field, table.direction),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.IndexTable &&
               table.indices.length === 1 &&
               table.indices[0] instanceof Ast.NumberValue &&
               (table.indices[0] as Ast.NumberValue).value > 0) {
        // across an index, the limit hint becomes the index value, if known,
        // (so an index [3] would fetch 3 elements)
        //
        // NOTE: for correct operation, devices which implement hints MUST NOT
        // implement "limit" without implementing "sort"
        const index = table.indices[0] as Ast.NumberValue;
        const hintsclone = hints.clone();
        hintsclone.limit = index.toJS();
        const compiled = compileTableToOps(table.table, extra_in_params, hintsclone);
        if (compiled instanceof TableOp.Reduce) {
            // simple index doesn't work if the inner table is a reduce, because
            // it relies on breaking out of the loop, and there might not be a loop
            return new TableOp.Reduce(
                compiled,
                new ReduceOp.ComplexIndex(table.indices),
                compiled.device,
                compiled.handle_thingtalk,
                table
            );
        } else {
            return new TableOp.Reduce(
                compiled,
                new ReduceOp.SimpleIndex(index),
                compiled.device,
                compiled.handle_thingtalk,
                table
            );
        }
    } else if (table instanceof Ast.IndexTable) {
        // if the index is not constant, we just discard it
        const hintsclone = hints.clone();
        hintsclone.limit = undefined;
        const compiled = compileTableToOps(table.table, extra_in_params, hintsclone);
        return new TableOp.Reduce(
            compiled,
            new ReduceOp.ComplexIndex(table.indices),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.SlicedTable) {
        const hintsclone = hints.clone();
        // across a slice, the limit hint becomes the base value + the limit value, if known,
        // (so a slice [2:3] would fetch 4 elements, and then discard the first one)
        // (note the off by one because the base is 1-based)
        //
        // NOTE: for correct operation, devices which implement hints MUST NOT
        // implement "limit" without implementing "sort"
        const base = table.base;
        const limit = table.limit;

        hintsclone.limit = base instanceof Ast.NumberValue && limit instanceof Ast.NumberValue ?
            (base.toJS() - 1 + limit.toJS()) : undefined;

        const compiled = compileTableToOps(table.table, extra_in_params, hintsclone);
        return new TableOp.Reduce(
            compiled,
            new ReduceOp.Slice(table.base, table.limit),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.JoinTable) {
        const lhsschema = table.lhs.schema;
        assert(lhsschema);
        const rhsschema = table.rhs.schema;
        assert(rhsschema);

        if (table.in_params.length === 0) {
            const lhs = compileTableToOps(table.lhs, extra_in_params, restrictHintsForJoin(hints, lhsschema));
            const rhs = compileTableToOps(table.rhs, extra_in_params, restrictHintsForJoin(hints, rhsschema));
            let invocation : Ast.DeviceSelector|null = null;
            let handle_thingtalk = false;
            if (lhs.device && rhs.device) {
                invocation = sameDevice(lhs.device, rhs.device) ? lhs.device : null;
                handle_thingtalk = sameDevice(lhs.device, rhs.device) ? lhs.handle_thingtalk && rhs.handle_thingtalk : false;
            }

            return new TableOp.CrossJoin(lhs, rhs, invocation, handle_thingtalk, table);
        } else {
            const lhs_in_params = [];
            const rhs_in_params = [];
            for (const in_param of extra_in_params) {
                if (in_param.name in lhsschema.inReq ||
                    in_param.name in lhsschema.inOpt)
                    lhs_in_params.push(in_param);
                if (in_param.name in rhsschema.inReq ||
                    in_param.name in rhsschema.inOpt)
                    rhs_in_params.push(in_param);
            }

            const lhs = compileTableToOps(table.lhs, lhs_in_params, restrictHintsForJoin(hints, lhsschema));
            const rhs = compileTableToOps(table.rhs, rhs_in_params.concat(table.in_params), restrictHintsForJoin(hints, rhsschema));
            let device : Ast.DeviceSelector|null = null;
            let handle_thingtalk = false;
            if (lhs.device && rhs.device) {
                device = sameDevice(lhs.device, rhs.device) ? lhs.device : null;
                handle_thingtalk = sameDevice(lhs.device, rhs.device) ? lhs.handle_thingtalk && rhs.handle_thingtalk : false;
            }

            return new TableOp.NestedLoopJoin(lhs, rhs, device, handle_thingtalk, table);
        }
    } else {
        throw new TypeError();
    }
}

function optimizeStreamOp(streamop : StreamOp, hasOutputAction : boolean) : StreamOp {
    // optimize edgenew of edgenew
    if (streamop instanceof Ops.EdgeNewStreamOp && streamop.stream instanceof Ops.EdgeNewStreamOp)
        return optimizeStreamOp(streamop.stream, hasOutputAction);

    // remove projection if there is no "notify;"
    if (!hasOutputAction && streamop instanceof Ops.MapStreamOp &&
        streamop.op instanceof Ops.ProjectionPointWiseOp)
        return optimizeStreamOp(streamop.stream, hasOutputAction);

    // optimize projection of projection
    if (streamop instanceof Ops.MapStreamOp && streamop.op instanceof Ops.ProjectionPointWiseOp) {
        const inner = streamop.stream;
        if (inner instanceof Ops.MapStreamOp && inner.op instanceof Ops.ProjectionPointWiseOp) {
            // bypass the inner projection, as the outer one subsumes it
            streamop.stream = optimizeStreamOp(inner.stream, hasOutputAction);
            return streamop;
        }
    }

    if (streamop instanceof Ops.InvokeTableStreamOp ||
        streamop instanceof Ops.JoinStreamOp) {
        streamop.stream = optimizeStreamOp(streamop.stream, hasOutputAction);
        streamop.table = optimizeTableOp(streamop.table, hasOutputAction);
        return streamop;
    }

    if (Ops.isUnaryStreamOp(streamop)) {
        streamop.stream = optimizeStreamOp(streamop.stream, hasOutputAction);
        return streamop;
    }

    return streamop;
}
function optimizeTableOp(tableop : TableOp, hasOutputAction : boolean) : TableOp {
    // remove projection if there is no "notify;"
    if (!hasOutputAction && tableop instanceof Ops.MapTableOp &&
        tableop.op instanceof Ops.ProjectionPointWiseOp)
        return optimizeTableOp(tableop.table, hasOutputAction);

    // optimize projection of projection
    if (tableop instanceof Ops.MapTableOp && tableop.op instanceof Ops.ProjectionPointWiseOp) {
        const inner = tableop.table;
        if (inner instanceof Ops.MapTableOp &&
            inner.op instanceof Ops.ProjectionPointWiseOp) {
            // bypass the inner projection, as the outer one subsumes it
            tableop.table = optimizeTableOp(inner.table, hasOutputAction);
            return tableop;
        }
    }

    if (tableop instanceof Ops.CrossJoinTableOp ||
        tableop instanceof Ops.NestedLoopJoinTableOp) {
        tableop.lhs = optimizeTableOp(tableop.lhs, hasOutputAction);
        tableop.rhs = optimizeTableOp(tableop.rhs, hasOutputAction);
        return tableop;
    }

    if (Ops.isUnaryTableOp(tableop)) {
        tableop.table = optimizeTableOp(tableop.table, hasOutputAction);
        return tableop;
    }

    return tableop;
}

function getStatementSchema(statement : Ast.Rule|Ast.Command) : Ast.FunctionDef|null {
    if (statement instanceof Ast.Rule)
        return statement.stream.schema;
    else if (statement.table)
        return statement.table.schema;
    else
        return null;
}

// compile a rule/command statement to a RuleOp
function compileStatementToOp(statement : Ast.Rule|Ast.Command) : RuleOp {
    const statementSchema = getStatementSchema(statement);

    const hasDefaultProjection = statementSchema && statementSchema.default_projection && statementSchema.default_projection.length > 0;
    const default_projection = getDefaultProjection(statementSchema);
    const projection = new Set<string>();

    let hasOutputAction = false;
    if (statementSchema) {
        statement.actions.forEach((action : Ast.Action) => {
            if (action instanceof Ast.NotifyAction) {
                hasOutputAction = true;
                addAll(projection, default_projection);
            } else if (action instanceof Ast.InvocationAction) {
                action.invocation.in_params.forEach((p : Ast.InputParam) => {
                    addAll(projection, getExpressionParameters(p.value, statementSchema!));
                });
            } else {
                assert(action instanceof Ast.VarRefAction);
                action.in_params.forEach((p : Ast.InputParam) => {
                    addAll(projection, getExpressionParameters(p.value, statementSchema!));
                });
            }
        });
    }

    let streamop;
    if (statement instanceof Ast.Rule) {
        streamop = compileStreamToOps(statement.stream, new QueryInvocationHints(projection));
        // if there is no #[default_projection] annotation, we don't bother with a projection operation,
        // the result will contain the right parameters already
        if (hasDefaultProjection) {
            streamop = new StreamOp.Map(
                streamop,
                new PointWiseOp.Projection(projection),
                new Ast.Stream.Projection(null, statement.stream, [...projection], statement.stream.schema)
            );
        }
    } else if (statement.table) {
        let tableop = compileTableToOps(statement.table, [], new QueryInvocationHints(projection));
        // if there is no #[default_projection] annotation, we don't bother with a projection operation,
        // the result will contain the right parameters already
        if (hasDefaultProjection) {
            const newtable = new Ast.Table.Projection(null, statement.table, [...projection], statement.table.schema);
            tableop = new TableOp.Map(
                tableop,
                new PointWiseOp.Projection(projection),
                tableop.device,
                tableop.handle_thingtalk,
                newtable
            );
            streamop = new StreamOp.Join(StreamOp.Now, tableop, newtable);
        } else {
            streamop = new StreamOp.Join(StreamOp.Now, tableop, statement.table);
        }
    } else {
        streamop = StreamOp.Now;
    }

    streamop = optimizeStreamOp(streamop, hasOutputAction);

    return new RuleOp(streamop, statement.actions, statement);
}

function compileBooleanExpressionToOp(expr : Ast.BooleanExpression) : BooleanExpressionOp {
    if (expr instanceof Ast.AtomBooleanExpression)
        return new BooleanExpressionOp.Atom(expr, expr.name, expr.operator, expr.value, expr.overload);

    if (expr instanceof Ast.NotBooleanExpression)
        return new BooleanExpressionOp.Not(expr, compileBooleanExpressionToOp(expr.expr));

    if (expr instanceof Ast.AndBooleanExpression) {
        return new BooleanExpressionOp.And(
            expr,
            expr.operands.map((operand) => compileBooleanExpressionToOp(operand))
        );
    }

    if (expr instanceof Ast.OrBooleanExpression) {
        return new BooleanExpressionOp.Or(
            expr,
            expr.operands.map((operand) => compileBooleanExpressionToOp(operand))
        );
    }

    if (expr instanceof Ast.ExternalBooleanExpression) {
        return new BooleanExpressionOp.External(
            expr,
            expr.selector,
            expr.channel,
            expr.in_params,
            compileBooleanExpressionToOp(expr.filter),
            expr.schema,
            expr.__effectiveSelector
        );
    }

    if (expr instanceof Ast.ComparisonSubqueryBooleanExpression) {
        assert(expr.rhs instanceof Ast.ProjectionExpression && expr.rhs.args.length === 1);
        return new BooleanExpressionOp.ComparisonSubquery(
            expr,
            expr.lhs,
            expr.operator,
            expr.rhs.args[0],
            compileTableToOps(
                expr.rhs.toLegacy() as Ast.Table,
                [],
                new QueryInvocationHints(new Set((expr.rhs as Ast.ProjectionExpression).args))
            ),
            expr.overload
        );
    }

    if (expr === Ast.BooleanExpression.True)
        return BooleanExpressionOp.True;

    if (expr === Ast.BooleanExpression.False)
        return BooleanExpressionOp.False;

    if (expr instanceof Ast.ComputeBooleanExpression)
        return new BooleanExpressionOp.Compute(expr, expr.lhs, expr.operator, expr.rhs, expr.overload);

    if (expr instanceof Ast.DontCareBooleanExpression)
        return new BooleanExpressionOp.DontCare(expr, expr.name);


    throw new TypeError();
}

export {
    compileStatementToOp,
    compileStreamToOps,
    compileTableToOps,
    compileBooleanExpressionToOp
};
