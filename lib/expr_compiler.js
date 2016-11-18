// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const adt = require('adt');
const assert = require('assert');

const Ast = require('./ast');
const Grammar = require('./grammar');
const Type = require('./type');
const Internal = require('./internal');
const Builtin = require('./builtin');
const Utils = require('./utils');
const Visitor = require('./visitor');

const normalizeConstant = Utils.normalizeConstant;

module.exports = class ExpressionCompilerVisitor extends Visitor.Expression {
    constructor(currentKeywords, scope) {
        super();

        this._currentKeywords = currentKeywords;
        this.scope = scope;
    }

    visitConstant(ast) {
        var value = ast.value;
        var normalized = normalizeConstant(value);
        var jsform = Ast.valueToJS(normalized);

        return function() { return jsform; }
    }

    visitVarRef(ast) {
        var name = ast.name;
        if (!(name in this.scope)) {
            // this is caught by InputCompiler to figure out
            // what can be passed as input to the trigger/query
            // and what needs to be evaluated afterwards
            throw new TypeError(name + ' is not in scope');
        }

        if (ast.isKeywordAccess) {
            this._currentKeywords.add(name);
            return function(env) {
                return env.readKeyword(name);
            }
        } else {
            return function(env) {
                return env.readVar(name);
            }
        }
    }

    visitMemberRef(ast) {
        var objectast = ast.object;
        var name = ast.name;
        var objectop = this.visitExpression(objectast);
        return function(env) {
            var object = objectop(env);
            return env.readObjectProp(object, name);
        };
    }

    visitFunctionCall(ast) {
        var argsast = ast.args;
        var argsop = argsast.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        var funcop = ast.op;

        return function(env) {
            var args = argsop.map(function(op) {
                return op(env);
            });
            if (ast.passEnv)
                args.push(env);
            return funcop.apply(null, args);
        }
    }

    visitUnaryOp(ast) {
        var argast = ast.arg;
        var argop = this.visitExpression(argast);
        var unop = ast.op;
        return function(env) { return unop(argop(env)); };
    }

    visitBinaryOp(ast) {
        var lhsast = ast.lhs;
        var rhsast = ast.rhs;
        var lhsop = this.visitExpression(lhsast);
        var rhsop = this.visitExpression(rhsast);
        var binop = ast.op;
        return function(env) { return binop(lhsop(env), rhsop(env)); };
    }

    visitTuple(ast) {
        var args = ast.args;
        var ops = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        return function(env) {
            return ops.map(function(op) { return op(env); });
        };
    }

    visitArray(ast) {
        var args = ast.args;
        var ops = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        return function(env) {
            return ops.map(function(op) { return op(env); });
        };
    }
}
