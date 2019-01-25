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

const Ast = require('../ast');
const { NotImplementedError } = require('../errors');

const { PointWiseOp, StreamOp, TableOp, RuleOp } = require('./ops');
const ReduceOp = require('./reduceop');

// compile a table that is being monitored to a stream
function compileMonitorTableToOps(table) {
    if (table.isVarRef ||
        table.isWindow ||
        table.isTimeSeries ||
        table.isHistory ||
        table.isSequence ||
        table.isAlias)
        throw new NotImplementedError(table);

    if (table.isInvocation) {
        // subscribe is optimistic, we still need EdgeNew
        return new StreamOp.EdgeNew(new StreamOp.InvokeSubscribe(table.invocation, Ast.BooleanExpression.True));
    } else if (table.isFilter) {
        return new StreamOp.Filter(
            compileMonitorTableToOps(table.table),
            table.filter);
    } else if (table.isProjection) {
        // note the "edge new" operation here, because
        // the projection might cause fewer values to
        // be new
        return new StreamOp.EdgeNew(
            new StreamOp.Map(
                compileMonitorTableToOps(table.table),
                new PointWiseOp.Projection(table.args)
            ));
    } else if (table.isSort || table.isIndex || table.isSlice) {
        // sort, index and slice have no effect on monitor
        //
        // XXX is this correct?
        return compileMonitorTableToOps(table.table);
    } else if (table.isCompute) {
        // note the "edge new" operation here, because
        // the projection might cause fewer values to
        // be new
        return new StreamOp.EdgeNew(
            new StreamOp.Map(
                compileMonitorTableToOps(table.table),
                new PointWiseOp.Compute(table.expression)
            ));
    } else if (table.isAggregation) {
        // for an aggregation, we subscribe to the inner table
        // (ie react to all changes), then when the table changes
        // we fetch it completely again and compute the aggregation
        // note the "edge new" operation here, because
        // the aggregation might cause fewer values to
        // be new
        return new StreamOp.EdgeNew(new StreamOp.InvokeTable(
            compileMonitorTableToOps(table.table),
            compileTableToOps(table, [])
        ));
    } else if (table.isJoin) {
        if (table.in_params.length === 0) {
            // if there is no parameter passing, we can individually monitor
            // the two tables and return the union

            return new StreamOp.EdgeNew(new StreamOp.Union(
                compileMonitorTableToOps(table.lhs),
                compileMonitorTableToOps(table.rhs)));
        } else {
            // otherwise we need to subscribe to the left hand side, and
            // every time it fires, create/update a subscription to the
            // right hand side
            // this is VERY MESSY
            // so it's not implemented
            throw new NotImplementedError(table);
        }
    } else {
        throw new TypeError();
    }
}

// compile a TT stream to a stream op and zero or more
// tableops
function compileStreamToOps(stream) {
    if (stream.isAlias)
        throw new NotImplementedError(stream);

    if (stream.isVarRef) {
        return new StreamOp.InvokeVarRef(stream.name, stream.in_params);
    } else if (stream.isTimer) {
        return new StreamOp.Timer(stream.base, stream.interval);
    } else if (stream.isAtTimer) {
        return new StreamOp.AtTimer(stream.time);
    } else if (stream.isMonitor) {
        return compileMonitorTableToOps(stream.table);
    } else if (stream.isEdgeNew) {
        return new StreamOp.EdgeNew(
            compileStreamToOps(stream.stream));
    } else if (stream.isEdgeFilter) {
        return new StreamOp.EdgeFilter(
            compileStreamToOps(stream.stream),
            stream.filter);
    } else if (stream.isFilter) {
        return new StreamOp.Filter(
            compileStreamToOps(stream.stream),
            stream.filter);
    } else if (stream.isProjection) {
        return new StreamOp.Map(
            compileStreamToOps(stream.stream),
            new PointWiseOp.Projection(stream.args)
        );
    } else if (stream.isCompute) {
        return new StreamOp.Map(
            compileStreamToOps(stream.stream),
            new PointWiseOp.Compute(stream.expression)
        );
    } else if (stream.isJoin) {
        return new StreamOp.Join(
            compileStreamToOps(stream.stream),
            compileTableToOps(stream.table, stream.in_params)
        );
    } else {
        throw new TypeError();
    }
}

function compileTableToOps(table, extra_in_params) {
    if (table.isWindow ||
        table.isTimeSeries ||
        table.isHistory ||
        table.isSequence ||
        table.isAlias)
        throw new NotImplementedError(table);

    let schema = table.schema;
    if (schema.is_db) {
        return compileDBTableToOps(table, extra_in_params);
    } else if (table.isVarRef) {
        return new TableOp.InvokeVarRef(table.name, table.in_params.concat(extra_in_params));
    } else if (table.isInvocation) {
        return new TableOp.InvokeGet(table.invocation, extra_in_params, Ast.BooleanExpression.True);
    } else if (table.isFilter) {
        return new TableOp.Filter(
            compileTableToOps(table.table, extra_in_params),
            table.filter
        );
    } else if (table.isProjection) {
        return new TableOp.Map(
            compileTableToOps(table.table, extra_in_params),
            new PointWiseOp.Projection(table.args)
        );
    } else if (table.isCompute) {
        return new TableOp.Map(
            compileTableToOps(table.table, extra_in_params),
            new PointWiseOp.Compute(table.expression)
        );
    } else if (table.isAggregation) {
        let reduceop;
        if (table.operator === 'count' && table.field === '*')
            reduceop = new ReduceOp.Count;
        else if (table.operator === 'count')
            reduceop = new ReduceOp.CountDistinct(table.field);
        else if (table.operator === 'avg')
            reduceop = new ReduceOp.Average(table.field, table.schema.out[table.field]);
        else
            reduceop = new ReduceOp.SimpleAggregation(table.operator, table.field, table.schema.out[table.field]);

        return new TableOp.Reduce(
            compileTableToOps(table.table, extra_in_params),
            reduceop
        );
    } else if (table.isIndex && table.indices.length === 1 && table.indices[0].isNumber && table.table.isSort) {
        // convert sort followed by a single index into argminmax
        let reduceop;
        if (table.indices[0].value === 1 || table.indices[0].value === -1) {
            // common case of simple argmin/argmax
            let argminmaxop;
            if ((table.indices[0].value === 1 && table.table.direction === 'asc') ||
                (table.indices[0].value === -1 && table.table.direction === 'desc'))
                argminmaxop = 'argmin';
            else
                argminmaxop = 'argmax';
            reduceop = new ReduceOp.SimpleArgMinMax(argminmaxop, table.table.field);
        } else {
            let argminmaxop;
            if (table.table.direction === 'asc')
                argminmaxop = 'argmin';
            else
                argminmaxop = 'argmax';
            reduceop = new ReduceOp.ComplexArgMinMax(argminmaxop, table.table.field, table.indices[0], Ast.Value.Number(1));
        }

        return new TableOp.Reduce(
            compileTableToOps(table.table.table, extra_in_params),
            reduceop
        );
    } else if (table.isSlice && table.table.isSort) {
        // convert sort followed by a single slice into argminmax
        let argminmaxop;
        if (table.table.direction === 'asc')
            argminmaxop = 'argmin';
        else
            argminmaxop = 'argmax';
        let reduceop = new ReduceOp.ComplexArgMinMax(argminmaxop, table.table.field, table.base, table.limit);

        return new TableOp.Reduce(
            compileTableToOps(table.table.table, extra_in_params),
            reduceop
        );
    } else if (table.isSort) {
        return new TableOp.Reduce(
            compileTableToOps(table.table, extra_in_params),
            new ReduceOp.Sort(table.field, table.direction)
        );
    } else if (table.isIndex && table.indices.length === 1 && table.indices[0].isNumber && table.indices[0].value > 0) {
        return new TableOp.Reduce(
            compileTableToOps(table.table, extra_in_params),
            new ReduceOp.SimpleIndex(table.indices[0])
        );
    } else if (table.isIndex) {
        return new TableOp.Reduce(
            compileTableToOps(table.table, extra_in_params),
            new ReduceOp.ComplexIndex(table.indices)
        );
    } else if (table.isSlice) {
        return new TableOp.Reduce(
            compileTableToOps(table.table, extra_in_params),
            new ReduceOp.Slice(table.base, table.limit)
        );
    } else if (table.isArgMinMax) {
        let reduceop;
        if (table.base.isNumber && table.base.value === 1 &&
            table.limit.isNumber && table.limit.value === 1)
            reduceop = new ReduceOp.SimpleArgMinMax(table.operator, table.field);
        else
            reduceop = new ReduceOp.ComplexArgMinMax(table.operator, table.field, table.base, table.limit);

        return new TableOp.Reduce(
            compileTableToOps(table.table, extra_in_params),
            reduceop
        );
    } else if (table.isJoin) {
        if (table.in_params.length === 0) {
            return new TableOp.CrossJoin(
                compileTableToOps(table.lhs, extra_in_params),
                compileTableToOps(table.rhs, extra_in_params)
            );
        } else {
            let lhs_in_params = [];
            let rhs_in_params = [];
            for (let in_param of extra_in_params) {
                if (in_param.name in table.lhs.schema.inReq ||
                    in_param.name in table.lhs.schema.inOpt)
                    lhs_in_params.push(in_param);
                if (in_param.name in table.rhs.schema.inReq ||
                    in_param.name in table.rhs.schema.inOpt)
                    rhs_in_params.push(in_param);
            }

            return new TableOp.NestedLoopJoin(
                compileTableToOps(table.lhs, lhs_in_params),
                compileTableToOps(table.rhs, rhs_in_params.concat(table.in_params))
            );
        }
    } else {
        throw new TypeError();
    }
}

function compileDBTableToOps(table, extra_in_params) {
    throw new NotImplementedError(table);
}

function optimizeStreamOp(streamop) {
    return streamop;
}
/*function optimizeTableOp(tableop) {
    return tableop;
}*/

function optimizeLoop(what, optimizer) {
    let optimized = optimizer(what);
    if (optimized !== what)
        return optimizeLoop(optimized, optimizer);
    else
        return optimized;
}

// compile a rule/command statement to a RuleOp
function compileStatementToOp(statement) {
    let streamop;
    if (statement.isRule) {
        streamop = compileStreamToOps(statement.stream);
    } else if (statement.table) {
        let tableop = compileTableToOps(statement.table, []);
        streamop = new StreamOp.Join(StreamOp.Now, tableop);
    } else {
        streamop = StreamOp.Now;
    }
    streamop = optimizeLoop(streamop, optimizeStreamOp);

    return new RuleOp(streamop, statement.actions);
}

module.exports = {
    compileStatementToOp,
    compileStreamToOps,
    compileTableToOps
};
