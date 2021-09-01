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
    ActionOp,
    RuleOp,
    QueryInvocationHints,
    BooleanExpressionOp,
    isUnaryStreamOp,
    isUnaryTableOp
} from './ops';
// YES there are two different modules called utils
// because of course
import { getDefaultProjection, getExpressionParameters } from './utils';
import ReduceOp, { SimpleAggregationType } from './reduceop';
import { ProjectionExpression } from '../ast';

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

function hasParameterPassing(expression : Ast.Expression) {
    for (const slot of expression.iterateSlots2({})) {
        if (slot instanceof Ast.DeviceSelector)
            continue;

        const value = slot.get();
        if (!(value instanceof Ast.VarRefValue))
            continue;

        if (!(value.name in slot.scope))
            return true;
    }

    return false;
}

// compile a table that is being monitored to a stream
function compileMonitorTableToOps(table : Ast.Expression,
                                  hints : QueryInvocationHints) : StreamOp {
    if (table instanceof Ast.FunctionCallExpression ||
        table instanceof Ast.AliasExpression)
        throw new NotImplementedError(String(table));

    if (table instanceof Ast.InvocationExpression) {
        // subscribe is optimistic, we still need EdgeNew
        return new StreamOp.EdgeNew(
            new StreamOp.InvokeSubscribe(table.invocation, table, hints),
            table
        );
    } else if (table instanceof Ast.FilterExpression) {
        const schema = table.schema;
        assert(schema);
        const hintsclone = hints.clone();
        addAll(hintsclone.projection, getExpressionParameters(table.filter, schema));
        hintsclone.filter = new Ast.BooleanExpression.And(null, [table.filter, hints.filter]);
        return new StreamOp.Filter(
            compileMonitorTableToOps(table.expression, hintsclone),
            compileBooleanExpressionToOp(table.filter),
            table
        );
    } else if (table instanceof Ast.ProjectionExpression) {
        // note: we must pass the inner schema to getExpressionParameters, not the outer (projected) one
        const schema = table.expression.schema;
        assert(schema);

        // see note in stream.isProjection later
        const effective = setIntersect(hints.projection, addMinimalProjection(table.args, schema));
        const hintsclone = hints.clone();
        hintsclone.projection = effective;

        const names = new Set(effective);
        // do a pass through the computations to compute the hints
        // we need to do this before recursing because the hints will be cloned by the recursion
        for (let i = 0; i < table.computations.length; i++)
            addAll(hintsclone.projection, getExpressionParameters(table.computations[i], schema));

        let streamop = compileMonitorTableToOps(table.expression, hintsclone);
        for (let i = 0; i < table.computations.length; i++) {
            const name = table.aliases[i] || getScalarExpressionName(table.computations[i]);
            streamop = new StreamOp.Map(streamop,
                new PointWiseOp.Compute(table.computations[i], name),
                table
            );
            names.add(name);
        }

        streamop = new StreamOp.Map(streamop, new PointWiseOp.Projection(names), table);

        // note the "edge new" operation here, because
        // the projection might cause fewer values to
        // be new
        return new StreamOp.EdgeNew(streamop, table);
    } else if (table instanceof Ast.SortExpression || table instanceof Ast.IndexExpression || table instanceof Ast.SliceExpression) {
        // sort, index and slice have no effect on monitor
        //
        // XXX is this correct?
        return compileMonitorTableToOps(table, hints);
    } else if (table instanceof Ast.AggregationExpression) {
        // discard the hints entirely across aggregation
        const newHints = new QueryInvocationHints(table.field === '*' ? new Set([]) : new Set([table.field]));

        // for an aggregation, we subscribe to the inner table
        // (ie react to all changes), then when the table changes
        // we fetch it completely again and compute the aggregation
        // note the "edge new" operation here, because
        // the aggregation might cause fewer values to
        // be new
        return new StreamOp.EdgeNew(new StreamOp.InvokeTable(
            compileMonitorTableToOps(table.expression, newHints),
            compileTableToOps(table, newHints),
            table
        ), table);
    } else if (table instanceof Ast.ChainExpression) {
        assert(table.expressions.length > 0);
        if (table.expressions.length === 1)
            return compileMonitorTableToOps(table.expressions[0], hints);

        let streamop = compileMonitorTableToOps(table.expressions[0], restrictHintsForJoin(hints, table.expressions[0].schema!));
        for (let i = 1; i < table.expressions.length; i++) {
            const rhs = table.expressions[i];
            if (!hasParameterPassing(rhs)) {
                // if there is no parameter passing, we can individually monitor
                // the two tables and return the union
                streamop = new StreamOp.EdgeNew(new StreamOp.Union(
                    streamop,
                    compileMonitorTableToOps(rhs, restrictHintsForJoin(hints, rhs.schema!)),
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
        }

        return streamop;
    } else {
        throw new TypeError();
    }
}

function findInputParam(invocation : Ast.FunctionCallExpression,
                        name : string) {
    for (const ip of invocation.in_params) {
        if (ip.name === name)
            return ip.value;
    }
    return undefined;
}

// compile a TT stream to a stream op and zero or more
// tableops
function compileStreamToOps(stream : Ast.Expression,
                            hints : QueryInvocationHints) : StreamOp {
    if (stream instanceof Ast.AliasExpression)
        throw new NotImplementedError(String(stream));

    if (stream instanceof Ast.FunctionCallExpression) {
        if (stream.name === 'timer') {
            const base = findInputParam(stream, 'base');
            const interval = findInputParam(stream, 'interval');
            const frequency = findInputParam(stream, 'frequency');
            return new StreamOp.Timer(base, interval!, frequency, stream);
        } else if (stream.name === 'attimer') {
            const time = findInputParam(stream, 'time');
            const expiration_date = findInputParam(stream, 'expiration_date');
            return new StreamOp.AtTimer(time!, expiration_date, stream);
        } else if (stream.name === 'ontimer') {
            const date = findInputParam(stream, 'date');
            return new StreamOp.OnTimer(date!, stream);
        } else {
            return new StreamOp.InvokeVarRef(stream.name, stream.in_params, stream, hints);
        }
    } else if (stream instanceof Ast.MonitorExpression) {
        const schema = stream.schema;
        assert(schema);
        const hintsclone = hints.clone();
        // if we're monitoring on specific fields, we can project on those fields
        // otherwise, we need to project on all output parameters
        if (stream.args)
            addAll(hintsclone.projection, stream.args);
        else
            addAll(hintsclone.projection, Object.keys(schema.out));
        return compileMonitorTableToOps(stream.expression, hintsclone);
    } else if (stream instanceof Ast.FilterExpression) {
        // NOTE: this code path is for a filter of a monitor, which is treated as an edge trigger
        // monitor of a filter (treated as a level trigger) is handled by compileMonitorTableToOps
        const schema = stream.schema;
        assert(schema);
        const hintsclone = hints.clone();
        addAll(hintsclone.projection, getExpressionParameters(stream.filter, schema));
        // NOTE: we don't lower the filter here, because if the subscribe applies the filter,
        // we don't notice the edge
        const op = compileStreamToOps(stream.expression, hintsclone);
        return new StreamOp.EdgeFilter(op, compileBooleanExpressionToOp(stream.filter), stream);
    } else if (stream instanceof Ast.ProjectionExpression) {
        // NOTE: there is a tricky case of nested projection that looks like
        // Projection(Filter(Projection(x, [a, b, c]), use(c)), [a, b])
        //
        // This is dangerous because the PointWiseOp.Projection will hard-apply
        // the projection, it won't be just a hint. Yet, it is ok
        // because all parameters that are used by the filter are added to the
        // projection hint.

        // note: we must pass the inner schema to getExpressionParameters, not the outer (projected) one
        const schema = stream.expression.schema;
        assert(schema);
        // see note in stream.isProjection later
        const effective = setIntersect(hints.projection, addMinimalProjection(stream.args, schema));
        const hintsclone = hints.clone();
        hintsclone.projection = effective;

        const names = new Set(effective);
        // do a pass through the computations to compute the hints
        // we need to do this before recursing because the hints will be cloned by the recursion
        for (let i = 0; i < stream.computations.length; i++)
            addAll(hintsclone.projection, getExpressionParameters(stream.computations[i], schema));

        let streamop = compileStreamToOps(stream.expression, hintsclone);
        for (let i = 0; i < stream.computations.length; i++) {
            const name = stream.aliases[i] || getScalarExpressionName(stream.computations[i]);
            streamop = new StreamOp.Map(streamop,
                new PointWiseOp.Compute(stream.computations[i], name),
                stream
            );
            names.add(name);
        }

        return new StreamOp.Map(streamop, new PointWiseOp.Projection(names), stream);
    } else if (stream instanceof Ast.ChainExpression) {
        assert(stream.expressions.length > 0);
        let streamop = compileStreamToOps(stream.expressions[0], restrictHintsForJoin(hints, stream.expressions[0].schema!));
        for (let i = 1; i < stream.expressions.length; i++) {
            const table = stream.expressions[i];
            const tableop = compileTableToOps(table, restrictHintsForJoin(hints, table.schema!));
            streamop = new StreamOp.Join(streamop, tableop, stream);
        }
        return streamop;
    } else {
        throw new TypeError();
    }
}

function compileTableToOps(table : Ast.Expression,
                           hints : QueryInvocationHints) : TableOp {
    if (table instanceof Ast.AliasExpression)
        throw new NotImplementedError(table.constructor.name);

    if (table instanceof Ast.FunctionCallExpression) {
        const compiled = new TableOp.InvokeVarRef(table.name, table.in_params, table, hints);
        compiled.device = null;
        compiled.handle_thingtalk = false;
        return compiled;
    } else if (table instanceof Ast.InvocationExpression) {
        const device = table.invocation.selector;
        assert(device instanceof Ast.DeviceSelector);
        const schema = table.schema;
        assert(schema instanceof Ast.FunctionDef);
        const handle_thingtalk = !!schema.getImplementationAnnotation<boolean>('handle_thingtalk');
        return new TableOp.InvokeGet(
            table.invocation,
            device,
            handle_thingtalk,
            table,
            hints
        );
    } else if (table instanceof Ast.FilterExpression) {
        const hintsclone = hints.clone();
        const schema = table.schema;
        assert(schema);
        addAll(hintsclone.projection, getExpressionParameters(table.filter, schema));
        hintsclone.filter = new Ast.BooleanExpression.And(null, [table.filter, hints.filter]);
        const compiled = compileTableToOps(table.expression, hintsclone);
        return new TableOp.Filter(
            compiled,
            compileBooleanExpressionToOp(table.filter),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.ProjectionExpression) {
        // note: we must pass the inner schema to getExpressionParameters, not the outer (projected) one
        const schema = table.expression.schema;
        assert(schema);
        // see note in stream.isProjection later
        const effective = setIntersect(hints.projection, addMinimalProjection(table.args, schema));
        const hintsclone = hints.clone();
        hintsclone.projection = effective;

        const names = new Set(effective);
        // do a pass through the computations to compute the hints
        // we need to do this before recursing because the hints will be cloned by the recursion
        for (let i = 0; i < table.computations.length; i++)
            addAll(hintsclone.projection, getExpressionParameters(table.computations[i], schema));

        const compiled = compileTableToOps(table.expression, hintsclone);
        let tableop = compiled;
        for (let i = 0; i < table.computations.length; i++) {
            const name = table.aliases[i] || getScalarExpressionName(table.computations[i]);
            tableop = new TableOp.Map(tableop,
                new PointWiseOp.Compute(table.computations[i], name),
                compiled.device,
                compiled.handle_thingtalk,
                table
            );
            names.add(name);
        }

        return new TableOp.Map(tableop,
            new PointWiseOp.Projection(names),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.AggregationExpression) {
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

        const compiled = compileTableToOps(table.expression, newHints);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.IndexExpression &&
               table.indices.length === 1 && table.indices[0] instanceof Ast.NumberValue &&
               table.expression instanceof Ast.SortExpression) {
        const hintsclone = hints.clone();

        // convert sort followed by a single index into argminmax
        const index = table.indices[0] as Ast.NumberValue;
        const inner = table.expression;
        let reduceop;
        if ((index.value === 1 || index.value === -1) && inner.value instanceof Ast.VarRefValue && !inner.value.name.includes('.')) {
            // common case of simple argmin/argmax
            let argminmaxop : 'argmin' | 'argmax';
            if ((index.value === 1 && inner.direction === 'asc') ||
                (index.value === -1 && inner.direction === 'desc'))
                argminmaxop = 'argmin';
            else
                argminmaxop = 'argmax';

            hintsclone.limit = 1;
            hintsclone.sort = [inner.value.name, inner.direction];
            reduceop = new ReduceOp.SimpleArgMinMax(argminmaxop, inner.value.name);
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
            if (inner.value instanceof Ast.VarRefValue && !inner.value.name.includes('.')) {
                hintsclone.limit = index.toJS();
                hintsclone.sort = [inner.value.name, inner.direction];
            } else {
                // clear both limit and sort if we're asked to sort by a complex value
                hintsclone.limit = undefined;
                hintsclone.sort = undefined;
            }
            reduceop = new ReduceOp.ComplexArgMinMax(argminmaxop, inner.value, index, new Ast.Value.Number(1));
        }

        const compiled = compileTableToOps(inner.expression, hintsclone);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.SliceExpression && table.expression instanceof Ast.SortExpression) {
        const inner = table.expression;
        // convert sort followed by a single slice into argminmax
        let argminmaxop : 'argmin' | 'argmax';
        if (inner.direction === 'asc')
            argminmaxop = 'argmin';
        else
            argminmaxop = 'argmax';
        const reduceop = new ReduceOp.ComplexArgMinMax(argminmaxop, inner.value, table.base, table.limit);

        const hintsclone = hints.clone();
        // across a slice, the limit hint becomes the base value + the limit value, if known,
        // (so a slice [2:3] would fetch 4 elements, and then discard the first one)
        // (note the off by one because the base is 1-based)
        //
        // NOTE: for correct operation, devices which implement hints MUST NOT
        // implement "limit" without implementing "sort"
        const base = table.base;
        const limit = table.limit;

        if (inner.value instanceof Ast.VarRefValue && !inner.value.name.includes('.')) {
            hintsclone.limit = base instanceof Ast.NumberValue && limit instanceof Ast.NumberValue ?
                (base.toJS() - 1 + limit.toJS()) : undefined;
            hintsclone.sort = [inner.value.name, inner.direction];
        } else {
            // clear both limit and sort if we're asked to sort by a complex value
            hintsclone.limit = undefined;
            hintsclone.sort = undefined;
        }

        const compiled = compileTableToOps(inner.expression, hintsclone);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.SortExpression) {
        const hintsclone = hints.clone();
        let reduceop;
        if (table.value instanceof Ast.VarRefValue && !table.value.name.includes('.')) {
            hintsclone.sort = [table.value.name, table.direction];
            reduceop = new ReduceOp.SimpleSort(table.value.name, table.direction);
        } else {
            hintsclone.sort = undefined;
            reduceop = new ReduceOp.ComplexSort(table.value, table.direction);
        }
        const compiled = compileTableToOps(table.expression, hintsclone);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.IndexExpression &&
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
        const compiled = compileTableToOps(table.expression, hintsclone);
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
    } else if (table instanceof Ast.IndexExpression) {
        // if the index is not constant, we just discard it
        const hintsclone = hints.clone();
        hintsclone.limit = undefined;
        const compiled = compileTableToOps(table.expression, hintsclone);
        return new TableOp.Reduce(
            compiled,
            new ReduceOp.ComplexIndex(table.indices),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.SliceExpression) {
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

        const compiled = compileTableToOps(table.expression, hintsclone);
        return new TableOp.Reduce(
            compiled,
            new ReduceOp.Slice(table.base, table.limit),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table instanceof Ast.ChainExpression) {
        assert(table.expressions.length > 0);
        if (table.expressions.length === 1)
            return compileTableToOps(table.expressions[0], hints);

        let tableop = compileTableToOps(table.expressions[0], restrictHintsForJoin(hints, table.expressions[0].schema!));
        for (let i = 1; i < table.expressions.length; i++) {
            const rhs = table.expressions[i];
            const rhsop = compileTableToOps(rhs, restrictHintsForJoin(hints, rhs.schema!));
            let device : Ast.DeviceSelector|null = null;
            let handle_thingtalk = false;
            if (tableop.device && rhsop.device) {
                device = sameDevice(tableop.device, rhsop.device) ? tableop.device : null;
                handle_thingtalk = sameDevice(tableop.device, rhsop.device) ? tableop.handle_thingtalk && rhsop.handle_thingtalk : false;
            }

            if (hasParameterPassing(rhs))
                tableop = new TableOp.NestedLoopJoin(tableop, rhsop, device, handle_thingtalk, table);
            else
                tableop = new TableOp.CrossJoin(tableop, rhsop, device, handle_thingtalk, table);
        }

        return tableop;
    } else if (table instanceof Ast.BooleanQuestionExpression) {
        const schema = table.expression.schema;
        assert(schema);
        const hintsclone = hints.clone();
        const compiled = compileTableToOps(table.expression, hintsclone);
        return new TableOp.Map(
            compiled, 
            new PointWiseOp.BooleanCompute(table.booleanExpression), 
            compiled.device, 
            compiled.handle_thingtalk, 
            table
        );
    } else if (table instanceof Ast.JoinExpression) {
        const lhsop = compileTableToOps(table.lhs, restrictHintsForJoin(hints, table.lhs.schema!));
        const rhsop = compileTableToOps(table.rhs, restrictHintsForJoin(hints, table.rhs.schema!));
        let device : Ast.DeviceSelector|null = null;
        let handle_thingtalk = false;
        if (lhsop.device && rhsop.device) {
            device = sameDevice(lhsop.device, rhsop.device) ? lhsop.device : null;
            handle_thingtalk = sameDevice(lhsop.device, rhsop.device) ? lhsop.handle_thingtalk && rhsop.handle_thingtalk : false;
        }
        return new TableOp.Join(lhsop, rhsop, device, handle_thingtalk, table);
    } else {
        throw new TypeError(table.constructor.name);
    }
}

function optimizeStreamOp(streamop : StreamOp, hasOutputAction : boolean) : StreamOp {
    // optimize edgenew of edgenew
    if (streamop instanceof StreamOp.EdgeNew && streamop.stream instanceof StreamOp.EdgeNew)
        return optimizeStreamOp(streamop.stream, hasOutputAction);

    // remove projection if there is no "notify;"
    if (!hasOutputAction && streamop instanceof StreamOp.Map &&
        streamop.op instanceof PointWiseOp.Projection)
        return optimizeStreamOp(streamop.stream, hasOutputAction);

    // optimize projection of projection
    if (streamop instanceof StreamOp.Map && streamop.op instanceof PointWiseOp.Projection) {
        const inner = streamop.stream;
        if (inner instanceof StreamOp.Map && inner.op instanceof PointWiseOp.Projection) {
            // bypass the inner projection, as the outer one subsumes it
            streamop.stream = optimizeStreamOp(inner.stream, hasOutputAction);
            return streamop;
        }
    }

    if (streamop instanceof StreamOp.InvokeTable ||
        streamop instanceof StreamOp.Join) {
        streamop.stream = optimizeStreamOp(streamop.stream, hasOutputAction);
        streamop.table = optimizeTableOp(streamop.table, hasOutputAction);
        return streamop;
    }

    if (isUnaryStreamOp(streamop)) {
        streamop.stream = optimizeStreamOp(streamop.stream, hasOutputAction);
        return streamop;
    }

    return streamop;
}
function optimizeTableOp(tableop : TableOp, hasOutputAction : boolean) : TableOp {
    // remove projection if there is no "notify;"
    if (!hasOutputAction && tableop instanceof TableOp.Map &&
        tableop.op instanceof PointWiseOp.Projection)
        return optimizeTableOp(tableop.table, hasOutputAction);

    // optimize projection of projection
    if (tableop instanceof TableOp.Map && tableop.op instanceof PointWiseOp.Projection) {
        const inner = tableop.table;
        if (inner instanceof TableOp.Map &&
            inner.op instanceof PointWiseOp.Projection) {
            // bypass the inner projection, as the outer one subsumes it
            tableop.table = optimizeTableOp(inner.table, hasOutputAction);
            return tableop;
        }
    }

    if (tableop instanceof TableOp.CrossJoin ||
        tableop instanceof TableOp.NestedLoopJoin) {
        tableop.lhs = optimizeTableOp(tableop.lhs, hasOutputAction);
        tableop.rhs = optimizeTableOp(tableop.rhs, hasOutputAction);
        return tableop;
    }

    if (isUnaryTableOp(tableop)) {
        tableop.table = optimizeTableOp(tableop.table, hasOutputAction);
        return tableop;
    }

    return tableop;
}

function compileActionToOps(action : Ast.Expression, projection : Set<string>, statementSchema : Ast.FunctionDef|null) {
    if (action instanceof Ast.InvocationExpression) {
        if (statementSchema) {
            for (const p of action.invocation.in_params)
                addAll(projection, getExpressionParameters(p.value, statementSchema));
        }
        return new ActionOp.InvokeDo(action.invocation, action);
    } else if (action instanceof Ast.FunctionCallExpression) {
        if (statementSchema) {
            for (const p of action.in_params)
                addAll(projection, getExpressionParameters(p.value, statementSchema));
        }
        return new ActionOp.InvokeVarRef(action.name, action.in_params, action);
    } else {
        throw new TypeError();
    }
}

// compile a rule/command statement to a RuleOp
function compileStatementToOp(statement : Ast.ExpressionStatement|Ast.ReturnStatement) : RuleOp {
    const expression = statement.expression instanceof Ast.ChainExpression ?
        statement.expression : new Ast.ChainExpression(null, [statement.expression], statement.expression.schema);
    const lastQuery = expression.lastQuery;
    const statementSchema = lastQuery ? lastQuery.schema : null;

    const hasDefaultProjection = statementSchema && statementSchema.default_projection && statementSchema.default_projection.length > 0;
    const default_projection = getDefaultProjection(statementSchema);
    const projection = new Set<string>();

    const action = expression.last;
    let actionop = null;
    let hasOutputAction;
    let queryExpression;
    if (action.schema!.functionType === 'action') {
        hasOutputAction = false;
        actionop = compileActionToOps(action, projection, statementSchema);
        if (expression.expressions.length > 0)
            queryExpression = new Ast.ChainExpression(null, expression.expressions.slice(0, -1), null);
        else
            queryExpression = null;
    } else {
        hasOutputAction = true;
        addAll(projection, default_projection);
        queryExpression = expression;
    }

    let streamop;
    if (expression.first.schema!.functionType === 'stream') {
        streamop = compileStreamToOps(queryExpression!, new QueryInvocationHints(projection));
        // if there is no #[default_projection] annotation, we don't bother with a projection operation,
        // the result will contain the right parameters already
        if (hasDefaultProjection) {
            streamop = new StreamOp.Map(
                streamop,
                new PointWiseOp.Projection(projection),
                new Ast.ProjectionExpression(null, queryExpression!, [...projection], [], [], queryExpression!.schema)
            );
        }
    } else if (queryExpression && queryExpression.expressions.length > 0) {
        let tableop = compileTableToOps(queryExpression, new QueryInvocationHints(projection));
        // if there is no #[default_projection] annotation, we don't bother with a projection operation,
        // the result will contain the right parameters already
        if (hasDefaultProjection) {
            const newtable = new ProjectionExpression(null, queryExpression, [...projection], [], [], queryExpression.schema);
            tableop = new TableOp.Map(
                tableop,
                new PointWiseOp.Projection(projection),
                tableop.device,
                tableop.handle_thingtalk,
                newtable
            );
            streamop = new StreamOp.Now(tableop, newtable);
        } else {
            streamop = new StreamOp.Now(tableop, queryExpression);
        }
    } else {
        streamop = null;
    }

    if (streamop)
        streamop = optimizeStreamOp(streamop, hasOutputAction);

    return new RuleOp(streamop, actionop, statement);
}

function compileBooleanExpressionToOp(expr : Ast.BooleanExpression) : BooleanExpressionOp {
    if (expr instanceof Ast.AtomBooleanExpression)
        return new BooleanExpressionOp.Atom(expr, new Ast.Value.VarRef(expr.name), expr.operator, expr.value, expr.overload);

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
        const table = new Ast.InvocationExpression(null, new Ast.Invocation(null,
            expr.selector, expr.channel, expr.in_params, expr.schema), expr.schema);
        const tableop = compileTableToOps(table, new QueryInvocationHints(new Set));
        const subquery = new Ast.ExistentialSubqueryBooleanExpression(null, table);

        return new BooleanExpressionOp.ExistentialSubquery(subquery, tableop);
    }

    if (expr instanceof Ast.ExistentialSubqueryBooleanExpression) {
        return new BooleanExpressionOp.ExistentialSubquery(
            expr,
            compileTableToOps(expr.subquery, new QueryInvocationHints(new Set))
        );
    }

    if (expr instanceof Ast.ComparisonSubqueryBooleanExpression) {
        assert(expr.rhs instanceof Ast.ProjectionExpression && expr.rhs.args.length + expr.rhs.computations.length === 1);
        let rhs, hints;
        if (expr.rhs.args.length) {
            rhs = expr.rhs.args[0];
            hints = new QueryInvocationHints(new Set(expr.rhs.args));
        } else {
            rhs = expr.rhs.aliases[0] || getScalarExpressionName(expr.rhs.computations[0]);
            hints = new QueryInvocationHints(new Set([rhs]));
        }
        const subquery = compileTableToOps(expr.rhs, hints);
        return new BooleanExpressionOp.ComparisonSubquery(
            expr,
            expr.lhs,
            expr.operator,
            new Ast.Value.VarRef(rhs),
            subquery,
            expr.overload
        );
    }

    if (expr === Ast.BooleanExpression.True || expr instanceof Ast.DontCareBooleanExpression)
        return BooleanExpressionOp.True;

    if (expr === Ast.BooleanExpression.False)
        return BooleanExpressionOp.False;

    if (expr instanceof Ast.ComputeBooleanExpression)
        return new BooleanExpressionOp.Atom(expr, expr.lhs, expr.operator, expr.rhs, expr.overload);

    throw new TypeError();
}

export {
    compileStatementToOp,
    compileStreamToOps,
    compileTableToOps,
    compileActionToOps,
    compileBooleanExpressionToOp
};
