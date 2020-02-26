// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const Ast = require('./ast');

const { isUnaryStreamToStreamOp,
        isUnaryTableToTableOp,
        isUnaryStreamToTableOp } = require('./utils');

function flattenAnd(expr) {
    let flattened = [];
    if (expr.isAnd) {
        for (let op of expr.operands) {
            let operands = flattenAnd(op);
            operands.forEach((op) => assert(op instanceof Ast.BooleanExpression));
            for (let subop of operands)
                flattened.push(subop);
        }
    } else {
        flattened.push(expr);
    }
    return flattened;
}

function flattenOr(expr) {
    let flattened = [];
    if (expr.isOr) {
        for (let op of expr.operands) {
            let operands = flattenOr(op);
            operands.forEach((op) => assert(op instanceof Ast.BooleanExpression));
            for (let subop of operands)
                flattened.push(subop);
        }
    } else {
        flattened.push(expr);
    }
    return flattened;
}

function optimizeFilter(expr) {
    if (expr.isTrue || expr.isFalse || expr.isDontCare)
        return expr;
    if (expr.isAnd) {
        let operands = flattenAnd(expr).map((o) => optimizeFilter(o)).filter((o) => !o.isTrue);
        operands.forEach((op) => assert(op instanceof Ast.BooleanExpression));
        for (let o of operands) {
            if (o.isFalse)
                return Ast.BooleanExpression.False;
        }
        if (operands.length === 0)
            return Ast.BooleanExpression.True;
        if (operands.length === 1)
            return operands[0];
        return new Ast.BooleanExpression.And(expr.location, operands);
    }
    if (expr.isOr) {
        let operands = flattenOr(expr).map((o) => optimizeFilter(o)).filter((o) => !o.isFalse);
        operands.forEach((op) => assert(op instanceof Ast.BooleanExpression));
        for (let o of operands) {
            if (o.isTrue)
                return Ast.BooleanExpression.True;
        }
        if (operands.length === 0)
            return Ast.BooleanExpression.False;
        if (operands.length === 1)
            return operands[0];

        // convert "x == foo || x == bar" to "x in_array [foo, bar]"
        // and "x =~ foo || x =~ bar" to "x in_array~ [foo, bar]"
        let equalityFilters = {};
        let likeFilters = {};
        let otherFilters = [];
        for (let operand of operands) {
            if (operand.isAtom) {
                if (operand.operator === '==') {
                    if (operand.name in equalityFilters)
                        equalityFilters[operand.name].push(operand.value);
                    else
                        equalityFilters[operand.name] = [operand.value];
                } else if (operand.operator === '=~') {
                    if (operand.name in likeFilters)
                        likeFilters[operand.name].push(operand.value);
                    else
                        likeFilters[operand.name] = [operand.value];
                } else {
                    otherFilters.push(operand);
                }
            } else {
                otherFilters.push(operand);
            }
        }
        for (let eqParam in equalityFilters) {
            if (equalityFilters[eqParam].length > 1) {
                otherFilters.push(new Ast.BooleanExpression.Atom(expr.location, eqParam, 'in_array',
                    new Ast.Value.Array(equalityFilters[eqParam])));
            } else {
                otherFilters.push(new Ast.BooleanExpression.Atom(expr.location, eqParam, '==', equalityFilters[eqParam][0]));
            }
        }
        for (let eqParam in likeFilters) {
            if (likeFilters[eqParam].length > 1) {
                otherFilters.push(new Ast.BooleanExpression.Atom(expr.location, eqParam, 'in_array~',
                    new Ast.Value.Array(likeFilters[eqParam])));
            } else {
                otherFilters.push(new Ast.BooleanExpression.Atom(expr.location, eqParam, '=~', likeFilters[eqParam][0]));
            }
        }

        return new Ast.BooleanExpression.Or(expr.location, otherFilters);
    }
    if (expr.isNot) {
        if (expr.expr.isNot) // double negation
            return optimizeFilter(expr.expr.expr);

        let subexpr = optimizeFilter(expr.expr);
        if (subexpr.isTrue)
            return Ast.BooleanExpression.False;
        if (subexpr.isFalse)
            return Ast.BooleanExpression.True;
        return new Ast.BooleanExpression.Not(expr.location, subexpr);
    }
    if (expr.isExternal) {
        let subfilter = optimizeFilter(expr.filter);
        if (subfilter.isFalse)
            return new Ast.BooleanExpression.False;
        // NOTE: it does not hold that if subfilter is True
        // the whole expression is true, because the invocation
        // might return no results!
        return new Ast.BooleanExpression.External(expr.location, expr.selector,
            expr.channel, expr.in_params, subfilter, expr.schema);
    }
    if (expr.isCompute) {
        // TODO
        return expr;
    }
    if (expr.isVarRef) {
        // TODO
        return expr;
    }

    let lhs = expr.name;
    let rhs = expr.value;
    let op = expr.operator;
    if (rhs.isVarRef && rhs.name === lhs) {
        // x = x , x =~ x , x >= x, x <= x
        if (op === '==' || op === '=~' || op === '>=' || op === '<=')
            return Ast.BooleanExpression.True;
    }
    return expr;
}

function optimizeStream(stream, allow_projection=true) {
    if (stream.isVarRef || stream.isTimer || stream.isAtTimer)
        return stream;

    if (stream.isProjection) {
        if (!allow_projection)
            return optimizeStream(stream.stream, allow_projection);

        const optimized = optimizeStream(stream.stream, allow_projection);
        if (!optimized)
            return null;

        // collapse projection of projection
        if (optimized.isProjection) {
            return new Ast.Stream.Projection(stream.location, optimized.stream,
                stream.args, stream.schema);
        }
        return new Ast.Stream.Projection(stream.location, optimized, stream.args, stream.schema);
    }

    if (stream.isMonitor) {
        // always allow projection inside a monitor, because the projection affects which parameters we monitor
        let table = optimizeTable(stream.table, true);
        if (!table)
            return null;

        // convert monitor of a projection to a projection of a monitor
        if (table.isProjection) {
            const newMonitor = new Ast.Stream.Monitor(table.location, table.table, stream.args || table.args, stream.schema);

            if (allow_projection)
                return new Ast.Stream.Projection(table.location, newMonitor, table.args, stream.schema);
            else
                return newMonitor;
        }

        stream.table = table;
        return stream;
    }

    if (stream.isFilter) {
        stream.filter = optimizeFilter(stream.filter);
        // handle constant filters
        if (stream.filter.isTrue)
            return optimizeStream(stream.stream, allow_projection);
        if (stream.filter.isFalse)
            return null;
        // compress filter of filter
        if (stream.stream.isFilter) {
            stream.filter = optimizeFilter(Ast.BooleanExpression.And([stream.filter, stream.stream.filter]));
            stream.stream = stream.stream.stream;
            return optimizeStream(stream, allow_projection);
        }

        // switch filter of monitor to monitor of filter
        if (stream.stream.isMonitor) {
            let newstream = new Ast.Stream.Monitor(
                stream.location,
                new Ast.Table.Filter(stream.location, stream.stream.table, stream.filter, stream.stream.table.schema),
                stream.stream.args,
                stream.stream.schema
            );
            return optimizeStream(newstream, allow_projection);
        }

        // switch filter of project to project of filter
        if (stream.stream.isProjection) {
            if (allow_projection) {
                return optimizeStream(new Ast.Stream.Projection(
                    stream.location,
                    new Ast.Stream.Filter(stream.location,
                        stream.stream.stream, stream.filter, stream.stream.stream.schema),
                    stream.stream.args,
                    stream.stream.schema
                ), allow_projection);
            } else {
                return optimizeStream(new Ast.Stream.Filter(
                    stream.location,
                    stream.stream.stream,
                    stream.filter,
                    stream.stream.stream.schema
                ), allow_projection);
            }
        }
    } else if (stream.isEdgeNew) {
        // collapse edge new of monitor or edge new of edge new
        if (stream.stream.isMonitor || stream.stream.isEdgeNew)
            return optimizeStream(stream.stream, allow_projection);
    } else if (stream.isEdgeFilter) {
        stream.filter = optimizeFilter(stream.filter);
        // handle constant filters
        // we don't optimize the isTrue case here: "edge on true" means only once
        if (stream.filter.isFalse)
            return null;
    }

    if (isUnaryStreamToStreamOp(stream)) {
        let inner = optimizeStream(stream.stream, allow_projection);
        if (!inner)
            return null;
        stream.stream = inner;
        return stream;
    }

    if (stream.isJoin) {
        let lhs = optimizeStream(stream.stream, allow_projection);
        if (!lhs)
            return null;
        let rhs = optimizeTable(stream.table, allow_projection);
        if (!rhs)
            return null;
        stream.stream = lhs;
        stream.table = rhs;
        return stream;
    }

    return stream;
}

function optimizeTable(table, allow_projection=true) {
    if (table.isVarRef || table.isInvocation)
        return table;

    if (table.isProjection) {
        if (!allow_projection)
            return optimizeTable(table.table);
        if (table.table.isAggregation)
            return optimizeTable(table.table);

        const optimized = optimizeTable(table.table, allow_projection);
        if (!optimized)
            return null;

        // collapse projection of projection
        if (optimized.isProjection)
            return new Ast.Table.Projection(table.location, optimized.table, table.args, table.schema);
        return new Ast.Table.Projection(table.location, optimized, table.args, table.schema);
    }


    if (table.isFilter) {
        table.filter = optimizeFilter(table.filter);
        // handle constant filters
        if (table.filter.isTrue)
            return optimizeTable(table.table, allow_projection);
        if (table.filter.isFalse)
            return null;
        // compress filter of filter
        if (table.table.isFilter) {
            table.filter = optimizeFilter(new Ast.BooleanExpression.And(table.filter.location,
                [table.filter, table.table.filter]));
            table.table = table.table.table;
            return optimizeTable(table, allow_projection);
        }

        // switch filter of project to project of filter
        if (table.table.isProjection) {
            if (allow_projection) {
                return new Ast.Table.Projection(
                    table.location,
                    optimizeTable(new Ast.Table.Filter(
                        table.table.location,
                        table.table.table,
                        table.filter,
                        table.table.table.schema),
                    allow_projection),
                    table.table.args,
                    table.table.schema
                );
            } else {
                return optimizeTable(new Ast.Table.Filter(
                    table.location,
                    table.table.table,
                    table.filter,
                    table.table.table.schema
                ), allow_projection);
            }
        }
    }

    if (table.isIndex && table.indices.length === 1 && table.indices[0].isArray)
        table.indices = table.indices[0].value;

    // turn a slice with a constant limit of 1 to an index
    if (table.isSlice && table.limit.isNumber && table.limit.value === 1)
        return optimizeTable(new Ast.Table.Index(table.location, table.table, [table.base], table.table.schema), allow_projection);

    if (isUnaryTableToTableOp(table)) {
        let inner = optimizeTable(table.table, allow_projection);
        if (!inner)
            return null;
        table.table = inner;
        return table;
    }
    if (isUnaryStreamToTableOp(table)) {
        let inner = optimizeStream(table.stream, allow_projection);
        if (!inner)
            return null;
        table.stream = inner;
        return table;
    }

    if (table.isJoin) {
        let lhs = optimizeTable(table.lhs, allow_projection);
        if (!lhs)
            return null;
        let rhs = optimizeTable(table.rhs, allow_projection);
        if (!rhs)
            return null;
        table.lhs = lhs;
        table.rhs = rhs;
        return table;
    }

    return table;
}

function optimizeRule(rule) {
    assert(rule instanceof Ast.Statement, rule);
    let allow_projection = false;
    // projectino is only allowed when the actions include notify/return
    if (rule.actions.some((a) => a.isNotify))
        allow_projection = true;
    if (rule.stream) {
        rule.stream = optimizeStream(rule.stream, allow_projection);
        if (!rule.stream)
            return null;
    } else if (rule.table) {
        rule.table = optimizeTable(rule.table, allow_projection);
        if (!rule.table)
            return null;
    }
    if (!rule.actions.length)
        return null;
    return rule;
}

function optimizeProgram(program) {
    let rules = [];
    program.rules.forEach((rule) => {
        if (rule.isAssignment) {
            rules.push(rule);
        } else {
            let newrule = optimizeRule(rule);
            if (newrule)
                rules.push(newrule);
        }
    });
    program.rules = rules;
    if (program.rules.length === 0 && program.declarations.length === 0 && Object.keys(program.classes).length === 0 && program.oninputs.length === 0)
        return null;
    else
        return program;
}

module.exports = {
    optimizeRule,
    optimizeProgram,
    optimizeFilter
};
