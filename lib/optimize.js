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
    if (expr.isTrue || expr.isFalse)
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
        return Ast.BooleanExpression.And(operands);
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
        return Ast.BooleanExpression.Or(operands);
    }
    if (expr.isNot) {
        let subexpr = optimizeFilter(expr.expr);
        if (subexpr.isTrue)
            return Ast.BooleanExpression.False;
        if (subexpr.isFalse)
            return Ast.BooleanExpression.True;
        return Ast.BooleanExpression.Not(subexpr);
    }
    if (expr.isExternal) {
        let subfilter = optimizeFilter(expr.filter);
        if (subfilter.isFalse)
            return Ast.BooleanExpression.False;
        // NOTE: it does not hold that if subfilter is True
        // the whole expression is true, because the invocation
        // might return no results!
        return new Ast.BooleanExpression.External(expr.selector, expr.channel, expr.in_params, subfilter, expr.schema);
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

function optimizeStream(stream) {
    if (stream.isVarRef || stream.isTimer || stream.isAtTimer)
        return stream;

    if (stream.isMonitor) {
        let table = optimizeTable(stream.table);
        if (!table)
            return null;
        stream.table = table;
        return stream;
    }

    if (stream.isFilter) {
        stream.filter = optimizeFilter(stream.filter);
        // handle constant filters
        if (stream.filter.isTrue)
            return optimizeStream(stream.stream);
        if (stream.filter.isFalse)
            return null;
        // compress filter of filter
        if (stream.stream.isFilter) {
            stream.filter = optimizeFilter(Ast.BooleanExpression.And([stream.filter, stream.stream.filter]));
            stream.stream = stream.stream.stream;
            return optimizeStream(stream);
        }

        // switch filter of monitor to monitor of filter
        if (stream.stream.isMonitor) {
            let newstream = new Ast.Stream.Monitor(
                new Ast.Table.Filter(stream.stream.table, stream.filter, stream.stream.table.schema),
                stream.stream.args,
                stream.stream.schema
            );
            return optimizeStream(newstream);
        }

        // switch filter of project to project of filter
        if (stream.stream.isProjection) {
            return optimizeStream(new Ast.Stream.Projection(
                new Ast.Stream.Filter(stream.stream.stream, stream.filter, stream.stream.stream.schema),
                stream.stream.args,
                stream.stream.schema
            ));
        }
    } else if (stream.isEdgeNew) {
        // collapse edge new of monitor or edge new of edge new
        if (stream.stream.isMonitor || stream.stream.isEdgeNew)
            return optimizeStream(stream.stream);
    } else if (stream.isEdgeFilter) {
        stream.filter = optimizeFilter(stream.filter);
        // handle constant filters
        // we don't optimize the isTrue case here: "edge on true" means only once
        if (stream.filter.isFalse)
            return null;
    }

    if (isUnaryStreamToStreamOp(stream)) {
        let inner = optimizeStream(stream.stream);
        if (!inner)
            return null;
        stream.stream = inner;
        return stream;
    }

    if (stream.isJoin) {
        let lhs = optimizeStream(stream.stream);
        if (!lhs)
            return null;
        let rhs = optimizeTable(stream.table);
        if (!rhs)
            return null;
        stream.stream = lhs;
        stream.table = rhs;
        return stream;
    }

    return stream;
}

function optimizeTable(table) {
    if (table.isVarRef || table.isInvocation)
        return table;

    if (table.isFilter) {
        table.filter = optimizeFilter(table.filter);
        // handle constant filters
        if (table.filter.isTrue)
            return optimizeTable(table.table);
        if (table.filter.isFalse)
            return null;
        // compress filter of filter
        if (table.table.isFilter) {
            table.filter = optimizeFilter(Ast.BooleanExpression.And([table.filter, table.table.filter]));
            table.table = table.table.table;
            return optimizeTable(table);
        }

        // switch filter of project to project of filter
        if (table.table.isProjection) {
            return optimizeTable(new Ast.Table.Projection(
                new Ast.Table.Filter(table.table.table, table.filter, table.table.table.schema),
                table.table.args,
                table.table.schema
            ));
        }
    }

    if (isUnaryTableToTableOp(table)) {
        let inner = optimizeTable(table.table);
        if (!inner)
            return null;
        table.table = inner;
        return table;
    }
    if (isUnaryStreamToTableOp(table)) {
        let inner = optimizeStream(table.stream);
        if (!inner)
            return null;
        table.stream = inner;
        return table;
    }

    if (table.isJoin) {
        let lhs = optimizeTable(table.lhs);
        if (!lhs)
            return null;
        let rhs = optimizeTable(table.rhs);
        if (!rhs)
            return null;
        table.lhs = lhs;
        table.rhs = rhs;
        return table;
    }

    return table;
}

function optimizeRule(rule) {
    if (rule.stream) {
        rule.stream = optimizeStream(rule.stream);
        if (!rule.stream)
            return null;
    } else if (rule.table) {
        rule.table = optimizeTable(rule.table);
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
        let newrule = optimizeRule(rule);
        if (newrule)
            rules.push(newrule);
    });
    program.rules = rules;
    if (program.rules.length === 0)
        return null;
    else
        return program;
}

module.exports = {
    optimizeProgram,
    optimizeFilter
};
