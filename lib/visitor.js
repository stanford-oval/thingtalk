// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

class ExpressionVisitor {
    visitExpression(ast) {
        if (ast.isConstant)
            return this.visitConstant(ast);
        else if (ast.isVarRef)
            return this.visitVarRef(ast);
        else if (ast.isMemberRef)
            return this.visitMemberRef(ast);
        else if (ast.isFunctionCall)
            return this.visitFunctionCall(ast);
        else if (ast.isUnaryOp)
            return this.visitUnaryOp(ast);
        else if (ast.isBinaryOp)
            return this.visitBinaryOp(ast);
        else if (ast.isTuple)
            return this.visitTuple(ast);
        else if (ast.isArray)
            return this.visitArray(ast);
        else if (ast.isNull)
            throw new TypeError("Null expression is not allowed at this point");
        else
            throw new TypeError(String(ast));
    }
}

class RulePartVisitor {
    visitOrderedSync(inputs) {
        for (var input of inputs) {
            if (input.isInvocation)
                return this.visitInvocation(input);
            else if (input.isMemberBinding)
                return this.visitMemberBinding(input);
            else if (input.isKeyword)
                return this.visitKeyword(input);
            else if (input.isBuiltinPredicate)
                return this.visitBuiltinPredicate(input);
            else if (input.isBinding)
                return this.visitBinding(input);
            else if (input.isCondition)
                return this.visitCondition(input);
            else
                throw new TypeError(String(input));
        }
    }

    visitReorderSync(inputs) {
        // order invocation -> member binding -> keyword -> builtin predicates -> binding -> condition

        var invocations = [];
        var memberBindings = [];
        var keywordParts = [];
        var builtinPredicates = [];
        var bindings = [];
        var conditions = [];
        for (var input of inputs) {
            if (input.isInvocation)
                invocations.push(input);
            else if (input.isMemberBinding)
                memberBindings.push(input);
            else if (input.isKeyword)
                keywordParts.push(input);
            else if (input.isBuiltinPredicate)
                builtinPredicates.push(input);
            else if (input.isBinding)
                bindings.push(input);
            else if (input.isCondition)
                conditions.push(input);
            else
                throw new TypeError(String(input));
        }

        for (var input of invocations)
            this.visitInvocation(input);
        for (var input of memberBindings)
            this.visitMemberBinding(input);
        for (var input of keywordParts)
            this.visitKeyword(input);
        for (var input of builtinPredicates)
            this.visitBuiltinPredicate(input);
        for (var input of bindings)
            this.visitBinding(input);
        for (var input of conditions)
            this.visitCondition(input);
    }

    visitOrderedAsync(inputs) {
        return Q.all(inputs.map((input) => {
            if (input.isInvocation)
                return this.visitInvocation(input);
            else if (input.isMemberBinding)
                return this.visitMemberBinding(input);
            else if (input.isKeyword)
                return this.visitKeyword(input);
            else if (input.isBuiltinPredicate)
                return this.visitBuiltinPredicate(input);
            else if (input.isBinding)
                return this.visitBinding(input);
            else if (input.isCondition)
                return this.visitCondition(input);
            else
                throw new TypeError(String(input));
        }));
    }

    visitReorderAsync(inputs) {
        // order invocation -> member binding -> keyword -> builtin predicates -> binding -> condition

        var invocations = [];
        var memberBindings = [];
        var keywordParts = [];
        var builtinPredicates = [];
        var bindings = [];
        var conditions = [];
        for (var input of inputs) {
            if (input.isInvocation)
                invocations.push(input);
            else if (input.isMemberBinding)
                memberBindings.push(input);
            else if (input.isKeyword)
                keywordParts.push(input);
            else if (input.isBuiltinPredicate)
                builtinPredicates.push(input);
            else if (input.isBinding)
                bindings.push(input);
            else if (input.isCondition)
                conditions.push(input);
            else
                throw new TypeError(String(input));
        }

        return this.visitInvocations(invocations).then(() => {
            for (var input of memberBindings)
                this.visitMemberBinding(input);
            for (var input of keywordParts)
                this.visitKeyword(input);
            for (var input of builtinPredicates)
                this.visitBuiltinPredicate(input);
            for (var input of bindings)
                this.visitBinding(input);
            for (var input of conditions)
                this.visitCondition(input);
        });
    }
}

module.exports = {
    Expression: ExpressionVisitor,
    RulePart: RulePartVisitor
}
