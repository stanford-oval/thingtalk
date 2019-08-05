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

function sameDevice(lhs, rhs) {
    if (lhs.isBuiltin && rhs.isBuiltin)
        return true;
    if (lhs.isBuiltin || rhs.isBuiltin)
        return false;
    if (lhs.kind !== rhs.kind)
        return false;
    if (lhs.id !== rhs.id)
        return false;
    if (lhs.principal !== rhs.principal)
        return false;
    return true;
}

// compile a table that is being monitored to a stream
function compileMonitorTableToOps(stream) {
    let table = stream.table;
    if (table.isVarRef ||
        table.isWindow ||
        table.isTimeSeries ||
        table.isHistory ||
        table.isSequence ||
        table.isAlias)
        throw new NotImplementedError(table);

    if (table.isInvocation) {
        // subscribe is optimistic, we still need EdgeNew
        return new StreamOp.EdgeNew(
            new StreamOp.InvokeSubscribe(table.invocation, Ast.BooleanExpression.True, table),
            stream
        );
    } else if (table.isFilter) {
        let newstream = stream.clone();
        newstream.table = table.table;
        return new StreamOp.Filter(
            compileMonitorTableToOps(newstream),
            table.filter,
            stream
        );
    } else if (table.isProjection) {
        // note the "edge new" operation here, because
        // the projection might cause fewer values to
        // be new
        let newstream = stream.clone();
        newstream.table = table.table;
        return new StreamOp.EdgeNew(
            new StreamOp.Map(
                compileMonitorTableToOps(newstream),
                new PointWiseOp.Projection(table.args),
                stream
            ),
            stream
        );
    } else if (table.isSort || table.isIndex || table.isSlice) {
        // sort, index and slice have no effect on monitor
        //
        // XXX is this correct?
        let newstream = stream.clone();
        newstream.table = table.table;
        return compileMonitorTableToOps(newstream);
    } else if (table.isCompute) {
        // note the "edge new" operation here, because
        // the projection might cause fewer values to
        // be new
        let newstream = stream.clone();
        newstream.table = table.table;
        return new StreamOp.EdgeNew(
            new StreamOp.Map(
                compileMonitorTableToOps(newstream),
                new PointWiseOp.Compute(table.expression),
                stream
            ),
            stream
        );
    } else if (table.isAggregation) {
        // for an aggregation, we subscribe to the inner table
        // (ie react to all changes), then when the table changes
        // we fetch it completely again and compute the aggregation
        // note the "edge new" operation here, because
        // the aggregation might cause fewer values to
        // be new
        let newstream = stream.clone();
        newstream.table = table.table;
        return new StreamOp.EdgeNew(new StreamOp.InvokeTable(
            compileMonitorTableToOps(newstream),
            compileTableToOps(table, []),
            stream
        ), stream);
    } else if (table.isJoin) {
        if (table.in_params.length === 0) {
            // if there is no parameter passing, we can individually monitor
            // the two tables and return the union
            return new StreamOp.EdgeNew(new StreamOp.Union(
                compileMonitorTableToOps(new Ast.Stream.Monitor(table.lhs, null, null)),
                compileMonitorTableToOps(new Ast.Stream.Monitor(table.rhs, null, null)),
                stream),
                stream
            );
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
        return new StreamOp.InvokeVarRef(stream.name, stream.in_params, stream);
    } else if (stream.isTimer) {
        return new StreamOp.Timer(stream.base, stream.interval, stream);
    } else if (stream.isAtTimer) {
        return new StreamOp.AtTimer(stream.time, stream.expiration_date, stream);
    } else if (stream.isMonitor) {
        return compileMonitorTableToOps(stream);
    } else if (stream.isEdgeNew) {
        return new StreamOp.EdgeNew(
            compileStreamToOps(stream.stream),
            stream
        );
    } else if (stream.isEdgeFilter) {
        return new StreamOp.EdgeFilter(
            compileStreamToOps(stream.stream),
            stream.filter,
            stream
        );
    } else if (stream.isFilter) {
        return new StreamOp.Filter(
            compileStreamToOps(stream.stream),
            stream.filter,
            stream
        );
    } else if (stream.isProjection) {
        return new StreamOp.Map(
            compileStreamToOps(stream.stream),
            new PointWiseOp.Projection(stream.args),
            stream
        );
    } else if (stream.isCompute) {
        return new StreamOp.Map(
            compileStreamToOps(stream.stream),
            new PointWiseOp.Compute(stream.expression),
            stream
        );
    } else if (stream.isJoin) {
        return new StreamOp.Join(
            compileStreamToOps(stream.stream),
            compileTableToOps(stream.table, stream.in_params),
            stream
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

    if (table.isVarRef) {
        return new TableOp.InvokeVarRef(table.name, table.in_params.concat(extra_in_params), table);
    } else if (table.isResultRef) {
        return new TableOp.ReadResult(table.kind + ':' + table.channel, table.index, table.schema, table);
    } else if (table.isInvocation) {
        const device = table.invocation.selector;
        const handle_thingtalk = table.schema.annotations['handle_thingtalk'] ? table.schema.annotations['handle_thingtalk'].value : false;
        return new TableOp.InvokeGet(
            table.invocation,
            extra_in_params,
            Ast.BooleanExpression.True,
            device,
            handle_thingtalk,
            table
        );
    } else if (table.isFilter) {
        const compiled = compileTableToOps(table.table, extra_in_params);
        return new TableOp.Filter(
            compiled,
            table.filter,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table.isProjection) {
        const compiled = compileTableToOps(table.table, extra_in_params);
        return new TableOp.Map(
            compiled,
            new PointWiseOp.Projection(table.args),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table.isCompute) {
        const compiled = compileTableToOps(table.table, extra_in_params);
        return new TableOp.Map(
            compiled,
            new PointWiseOp.Compute(table.expression),
            compiled.device,
            compiled.handle_thingtalk,
            table
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

        const compiled = compileTableToOps(table.table, extra_in_params);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
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

        const compiled = compileTableToOps(table.table.table, extra_in_params);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table.isSlice && table.table.isSort) {
        // convert sort followed by a single slice into argminmax
        let argminmaxop;
        if (table.table.direction === 'asc')
            argminmaxop = 'argmin';
        else
            argminmaxop = 'argmax';
        let reduceop = new ReduceOp.ComplexArgMinMax(argminmaxop, table.table.field, table.base, table.limit);

        const compiled = compileTableToOps(table.table.table, extra_in_params);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table.isSort) {
        const compiled = compileTableToOps(table.table, extra_in_params);
        return new TableOp.Reduce(
            compiled,
            new ReduceOp.Sort(table.field, table.direction),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table.isIndex && table.indices.length === 1 && table.indices[0].isNumber && table.indices[0].value > 0) {
        const compiled = compileTableToOps(table.table, extra_in_params);
        return new TableOp.Reduce(
            compiled,
            new ReduceOp.SimpleIndex(table.indices[0]),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table.isIndex) {
        const compiled = compileTableToOps(table.table, extra_in_params);
        return new TableOp.Reduce(
            compiled,
            new ReduceOp.ComplexIndex(table.indices),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table.isSlice) {
        const compiled = compileTableToOps(table.table, extra_in_params);
        return new TableOp.Reduce(
            compiled,
            new ReduceOp.Slice(table.base, table.limit),
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table.isArgMinMax) {
        let reduceop;
        if (table.base.isNumber && table.base.value === 1 &&
            table.limit.isNumber && table.limit.value === 1)
            reduceop = new ReduceOp.SimpleArgMinMax(table.operator, table.field);
        else
            reduceop = new ReduceOp.ComplexArgMinMax(table.operator, table.field, table.base, table.limit);

        const compiled = compileTableToOps(table.table, extra_in_params);
        return new TableOp.Reduce(
            compiled,
            reduceop,
            compiled.device,
            compiled.handle_thingtalk,
            table
        );
    } else if (table.isJoin) {
        if (table.in_params.length === 0) {
            const lhs = compileTableToOps(table.lhs, extra_in_params);
            const rhs = compileTableToOps(table.rhs, extra_in_params);
            const invocation = sameDevice(lhs.device, rhs.device) ? lhs.device : null;
            const handle_thingtalk = sameDevice(lhs.device, rhs.device) ? lhs.handle_thingtalk && rhs.handle_thingtalk : false;

            return new TableOp.CrossJoin(lhs, rhs, invocation, handle_thingtalk, table);
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

            const lhs = compileTableToOps(table.lhs, lhs_in_params);
            const rhs = compileTableToOps(table.rhs, rhs_in_params.concat(table.in_params));
            const device = sameDevice(lhs.device, rhs.device) ? lhs.device : null;
            const handle_thingtalk = sameDevice(lhs.device, rhs.device) ? lhs.handle_thingtalk && rhs.handle_thingtalk : false;

            return new TableOp.NestedLoopJoin(lhs, rhs, device, handle_thingtalk, table);
        }
    } else {
        throw new TypeError();
    }
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

function getDefaultProjection(statement) {
    let stream;
    if (statement.isRule)
        stream = statement.stream;
    else if (statement.table)
        stream = statement.table;
    if (stream && stream.schema && stream.schema.default_projection)
        return stream.schema.default_projection;
    return [];
}

// compile a rule/command statement to a RuleOp
function compileStatementToOp(statement) {
    let default_projection = getDefaultProjection(statement);
    let args = [];
    if (default_projection.length > 0) {
        statement.actions.forEach((action) => {
            if (action.isInvocation && action.invocation.selector.isBuiltin) {
                args = args.concat(default_projection);
            } else {
                action.invocation.in_params.forEach((p) => {
                    if (p.value.isVarRef)
                        args.push(p.value.name);
                });
            }
        });
    }
    args = [...new Set(args)];
    let streamop;
    if (statement.isRule) {
        streamop = compileStreamToOps(statement.stream);
        if (args.length > 0) {
            let schema = statement.stream.schema;
            schema = schema.filterArguments((a) => a.is_input || args.includes(a.name));
            streamop = new StreamOp.Map(
                streamop,
                new PointWiseOp.Projection(args),
                new Ast.Stream.Projection(statement.stream, args, schema)
            );
        }
    } else if (statement.table) {
        let tableop = compileTableToOps(statement.table, []);
        if (args.length > 0) {
            let schema = statement.table.schema.clone();
            schema = schema.filterArguments((a) => a.is_input || args.includes(a.name));
            let newtable = new Ast.Table.Projection(statement.table, args, schema);
            tableop = new TableOp.Map(
                tableop,
                new PointWiseOp.Projection(args),
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

    streamop = optimizeLoop(streamop, optimizeStreamOp);

    return new RuleOp(streamop, statement.actions, statement);
}

module.exports = {
    compileStatementToOp,
    compileStreamToOps,
    compileTableToOps
};
