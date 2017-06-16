// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Ast = require('./ast');

function optimizeFilter(expr) {
    if (expr.isTrue || expr.isFalse)
        return expr;
    if (expr.isAnd) {
        let lhs = optimizeFilter(expr.lhs);
        let rhs = optimizeFilter(expr.rhs);
        if (lhs.equals(rhs))
            return lhs;
        if (lhs.isTrue)
            return rhs;
        if (rhs.isTrue)
            return lhs;
        return Ast.BooleanExpression.And(lhs, rhs);
    }
    if (expr.isOr) {
        let lhs = optimizeFilter(expr.lhs);
        let rhs = optimizeFilter(expr.rhs);
        if (lhs.equals(rhs))
            return lhs;
        if (lhs.isFalse)
            return rhs;
        if (rhs.isFalse)
            return lhs;
        return Ast.BooleanExpression.Or(lhs, rhs);
    }
    if (expr.isNot) {
        let subexpr = optimizeFilter(expr.expr);
        if (subexpr.isTrue)
            return Ast.BooleanExpression.False;
        if (subexpr.isFalse)
            return Ast.BooleanExpression.True;
        return Ast.BooleanExpression.Not(subexpr);
    }
    return expr;
}

function optimizeRule(rule) {
    if (rule.trigger)
        rule.trigger.filter = optimizeFilter(rule.trigger.filter);
    if (rule.trigger.filter.isFalse)
        return null;
    for (let query of rule.queries) {
        query.filter = optimizeFilter(query.filter);
        if (query.filter.isFalse)
            return null;
    }
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

module.exports = optimizeProgram;
