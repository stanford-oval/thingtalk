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
const ExpressionCompilerVisitor = require('./expr_compiler');
const Visitor = require('./visitor');

const typeUnify = Type.typeUnify;
const resolveTypeScope = Type.resolveTypeScope;
const normalizeConstant = Utils.normalizeConstant;

module.exports = class OutputCompilerVisitor extends Visitor.RulePart {
    constructor(scope, currentKeywords) {
        super();

        this._currentKeywords = currentKeywords;
        this._scope = scope;

        this.outputs = [];
    }

    compileExpression(expression) {
        var visitor = new ExpressionCompilerVisitor(this._currentKeywords,
                                                    this._scope);
        return visitor.visitExpression(expression);
    }

    visitInvocation(invocation) {
        var params = invocation.params.map(function(param) {
            return this.compileExpression(param);
        }, this);

        var produce = function(env) {
            return params.map(function(p) {
                return p(env);
            });
        };

        this.outputs.push({
            action: {
                selector: invocation.selector,
                name: invocation.name
            },
            keyword: null,
            produce: produce
        });
    }

    visitKeyword(output) {
        var keyword = output.keyword;

        var params = output.params.map(function(param) {
            return this.compileExpression(param);
        }, this);

        var schema = output.schema;
        var isTuple = schema.length > 1;
        if (params.length !== schema.length)
            isTuple = false;

        var produce = function(env) {
            var v = params.map(function(p, i) {
                return p(env);
            });
            if (isTuple)
                return v;
            else
                return v[0];
        }

        this.outputs.push({
            action: null,
            keyword: keyword,
            produce: produce
        });
    }
}
