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
const Type = require('./type');
const Visitor = require('./visitor');
const Utils = require('./utils');

const normalizeConstant = Utils.normalizeConstant;

function jsToValue(type, value) {
    if (type.isBoolean)
        return Ast.Value.Boolean(value);
    else if (type.isString)
        return Ast.Value.String(value);
    else if (type.isNumber)
        return Ast.Value.Number(value);
    else if (type.isResource)
        return Ast.Value.Resource(value);
    else if (type.isMeasure)
        return Ast.Value.Measure(value, type.unit);
    else if (type.isEnum)
        return Ast.Value.Enum(value);
    else if (type.isPhoneNumber)
        return Ast.Value.PhoneNumber(value);
    else if (type.isEmailAddress)
        return Ast.Value.EmailAddress(value);
    else if (type.isURL)
        return Ast.Value.URL(value);
    else if (type.isHashtag)
        return Ast.Value.Hashtag(value);
    else if (type.isUsername)
        return Ast.Value.Username(value);
    else if (type.isTime) {
        var split = value.split(':');
        return Ast.Value.Time(parseInt(split[0], 10), parseInt(split[1], 10));
    } else if (type.isArray)
        return Ast.Value.Array(value.map((v) => jsToValue(type.elem, v)));
    else if (type.isMap)
        return null; // cannot handle constant map
    else if (type.isDate)
        return Ast.Value.Date(value);
    else if (type.isLocation)
        return Ast.Value.Location(value.x, value.y);
    else if (type.isTuple)
        return null; // cannot handle constant tuple
    else if (type.isUser)
        return null; // cannot handle constant user
    else if (type.isObject)
        return null; // cannot handle constant object
    else if (type.isModule)
        return null; // cannot handle constant module
    else
        return null;
}

function jsToConstant(type, value) {
    var astvalue = jsToValue(type, value);
    if (astvalue !== null) {
        var expr = Ast.Expression.Constant(astvalue);
        expr.type = type;
        return expr;
    } else {
        return null;
    }
}

class ExpressionConstProp extends Visitor.Expression {
    constructor(rebindings) {
        super();

        this._rebindings = {};
    }

    visitConstant(ast) {
        var value = ast.value;
        var normalized = normalizeConstant(value);
        return Ast.Expression.Constant(normalized);
    }

    visitVarRef(ast) {
        var name = ast.name;
        if (name in this._rebindings)
            return this._rebindings[name];
        else
            return ast;
    }

    visitMemberRef(ast) {
        var objectast = ast.object;
        var name = ast.name;
        var optimized = ast.object = this.visitExpression(objectast);
        if (!optimized.isConstant)
            return ast;

        var value = optimized.value.value;
        return jsToConstant(ast.type, value) || ast;
    }

    visitFunctionCall(ast) {
        var argsast = ast.args;
        var argsopt = ast.args = argsast.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        for (var argopt of argsopt) {
            if (!argopt.isConstant)
                return ast;
        }
        if (!ast.pure)
            return ast;
        var retval = ast.op.apply(null, argsopt.map((c) => Ast.valueToJS(c.value)));
        return jsToConstant(ast.type, retval) || ast;
    }

    visitUnaryOp(ast) {
        var argast = ast.arg;
        var argopt = ast.arg = this.visitExpression(argast);
        if (!argopt.isConstant || !ast.pure)
            return ast;
        var retval = ast.op(Ast.valueToJS(argopt.value))
        return jsToConstant(ast.type, retval) || ast;
    }

    visitBinaryOp(ast) {
        var lhsast = ast.lhs;
        var rhsast = ast.rhs;
        var lhsopt = ast.lhs = this.visitExpression(lhsast);
        var rhsopt = ast.rhs = this.visitExpression(rhsast);
        if (!lhsopt.isConstant || !rhsopt.isConstant || !ast.pure)
            return ast;

        var retval = ast.op(Ast.valueToJS(lhsopt.value),
                            Ast.valueToJS(rhsopt.value));
        return jsToConstant(ast.type, retval) || ast;
    }

    visitTuple(ast) {
        var args = ast.args;
        var argsopt = ast.args = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);

        // tuples cannot be constant (jsToConstant just fails)
        // so just return ast
        // we constant folded inside it anyway
        return ast;
    }

    visitArray(ast) {
        var args = ast.args;
        var argsopt = ast.args = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        for (var arg of argsopt) {
            if (!arg.isConstant)
                return ast;
        }
        var value = argsopt.map((c) => Ast.valueToJS(c.value));
        return jsToConstant(ast.type, value) || ast;
    }
}

class InputConstProp extends Visitor.RulePart {
    constructor(rebindings) {
        super();

        this._rebindings = rebindings;
    }

    constPropExpression(expression) {
        if (expression.isNull)
            return expression;

        var visitor = new ExpressionConstProp(this._rebindings);
        return visitor.visitExpression(expression);
    }

    visitInvocation(ast) {
        ast.params = ast.params.map((p) => this.constPropExpression(p));
    }

    visitMemberBinding(ast) {
        // nothing to do here
    }

    visitRegex(ast) {
        // we don't constant fold the whole regular expression, on the
        // assumption that it won't be particularly useful in practice
        // if we were to do that, we would need to flag this ast node
        // as introducing constant binders without doing anything, which
        // would confuse the compiler later on

        var argsast = ast.expr.args;
        if (argsast.length <= 3)
            return this.visitCondition(ast);
        ast.expr.args = argsast.map(function(arg) {
            return this.constPropExpression(arg);
        }, this);
    }

    visitContains(ast) {
        // see above for why don't do something smarter
        var argsast = ast.expr.args;
        ast.expr.args = argsast.map(function(arg) {
            return this.constPropExpression(arg);
        }, this);
    }

    visitBuiltinPredicate(ast) {
        if (ast.expr.name === 'regex')
            return this.visitRegex(ast);
        else if (ast.expr.name === 'contains')
            return this.visitContains(ast);
        else
            return this.visitCondition(ast);
    }

    visitBinding(ast) {
        var opt = this.constPropExpression(ast.expr);
        if (opt.isConstant)
            this._rebindings[ast.name] = opt;
        ast.expr = opt;
    }

    visitCondition(ast) {
        ast.expr = this.constPropExpression(ast.expr);
    }
}

class OutputConstProp extends Visitor.RulePart {
    constructor(rebindings) {
        super();

        this._rebindings = rebindings;
    }

    constPropExpression(expression) {
        if (expression.isNull)
            return expression;

        var visitor = new ExpressionConstProp(this._rebindings);
        return visitor.visitExpression(expression);
    }

    visitInvocation(ast) {
        ast.params = ast.params.map((p) => this.constPropExpression(p));
    }

    visitBinding(ast) {
        ast.expr = this.constPropExpression(ast.expr);
    }
}

module.exports = {
    Inputs: InputConstProp,
    Outputs: OutputConstProp,
}
