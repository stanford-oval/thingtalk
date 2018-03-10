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

    return expr;
    /*
    let lhs = expr.lhs;
    let rhs = expr.rhs;
    let op = expr.operator;
    if (rhs.isVarRef && rhs.name === lhs) {
        // x = x , x =~ x , x >= x, x <= x
        if (op === '==' || op === '=~' || op === '>=' || op === '<=')
            return Ast.BooleanExpression.True;
        else // x > x, x < x
            return Ast.BooleanExpression.False;
    }
    return expr;
    */
}

// TODO
/*
function optimizeRule(rule) {
    if (rule.trigger) {
        rule.trigger.filter = optimizeFilter(rule.trigger.filter);
        if (rule.trigger.filter.isFalse)
            return null;
    }
    for (let query of rule.queries) {
        query.filter = optimizeFilter(query.filter);
        if (query.filter.isFalse)
            return null;
    }
    if (!rule.actions.length)
        return null;
    return rule;
}
*/

// TODO
function optimizeProgram(program) {
    return program;
    /*
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
        return program;*/
}

module.exports = {
    optimizeProgram,
    optimizeFilter
};
