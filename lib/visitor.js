// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

module.exports = class ExpressionVisitor {
    visitExpression(ast) {
        if (ast.isConstant)
            return this.visitConstant(ast.value);
        else if (ast.isVarRef)
            return this.visitVarRef(ast.name);
        else if (ast.isMemberRef)
            return this.visitMemberRef(ast.object, ast.name);
        else if (ast.isFunctionCall)
            return this.visitFunctionCall(ast.name, ast.args);
        else if (ast.isUnaryOp)
            return this.visitUnaryOp(ast.arg, ast.opcode);
        else if (ast.isBinaryOp)
            return this.visitBinaryOp(ast.lhs, ast.rhs, ast.opcode);
        else if (ast.isTuple)
            return this.visitTuple(ast.args);
        else if (ast.isArray)
            return this.visitArray(ast.args);
        else if (ast.isNull)
            throw new TypeError("Null expression is not allowed at this point");
        else
            throw new TypeError(String(ast));
    }
}

