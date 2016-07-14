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
const Immutable = require('immutable');

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
const toJS = Utils.convertToJS;

module.exports = class OutputCompilerVisitor extends Visitor.RulePart {
    constructor(schemas, globalScope, modules, keywordDecls, feedAccess, currentKeywords, scope) {
        super();

        this._schemaRetriever = schemas;
        this._keywordDecls = keywordDecls;
        this._globalScope = globalScope;
        this._modules = modules;
        this._feedAccess = feedAccess;

        this._currentKeywords = currentKeywords;
        this._scope = scope;

        this.outputs = [];
    }

    compileExpression(expression) {
        var visitor = new ExpressionCompilerVisitor(this._keywordDecls,
                                                    this._feedAccess,
                                                    this._currentKeywords,
                                                    this._scope);
        return visitor.visitExpression(expression);
    }

    visitMemberBinding() {
        throw new Error('Invalid rule action, must be invocation or keyword');
    }
    visitCondition() {
        throw new Error('Invalid rule action, must be invocation or keyword');
    }
    visitBuiltinPredicate() {
        throw new Error('Invalid rule action, must be invocation or keyword');
    }
    visitBinding() {
        // this one would legitimately make sense, except
        // we can't implement it easily so ignore it for now
        throw new Error('Invalid rule action, must be invocation or keyword');
    }

    visitInvocation(invocation) {
        return Utils.getSchemaForSelector(this._schemaRetriever,
                                          invocation.selector,
                                          invocation.name,
                                          this._globalScope,
                                          this._modules,
                                          'functionSchemas',
                                          'actions')
            .then((schema) => {
                var type = Type.Tuple(schema);

                if (schema !== null) {
                    if (invocation.params.length < schema.length)
                        throw new TypeError('Invalid number of parameters for action');
                    if (invocation.params.length > schema.length)
                        invocation.params = invocation.params.slice(0, schema.length);
                } else {
                    schema = invocation.params.map(() => Type.Any);
                }

                var params = invocation.params.map(function(param) {
                    return this.compileExpression(param);
                }, this);

                params.forEach(function(p, i) {
                    schema[i] = typeUnify(p[0], schema[i]);
                });

                var produce = function(env) {
                    return params.map(function(p, i) {
                        return toJS(p[0], p[1](env));
                    });
                };

                this.outputs.push({
                    action: {
                        selector: invocation.selector,
                        name: invocation.name
                    },
                    keyword: null,
                    owner: null,
                    produce: produce
                });
            });
    }

    visitKeyword(output) {
        var keyword = output.keyword;
        var owner = output.owner;

        if (owner !== null && owner !== 'self')
            throw new TypeError('Invalid ownership operator for output (must be self)');

        if (!(keyword.name in this._keywordDecls))
            throw new TypeError('Undeclared keyword ' + keyword.name);

        var decl = this._keywordDecls[keyword.name];
        if (owner !== null && !decl.feedAccess)
            throw new TypeError('Invalid ownership operator on private keyword');
        if (owner === null && decl.feedAccess)
            throw new TypeError('Missing ownership operator on feed-accessible keyword');

        keyword.feedAccess = decl.feedAccess;

        var params = output.params.map(function(param) {
            return this.compileExpression(param);
        }, this);

        var type = decl.type;
        var isTuple = decl.type.isTuple;
        if (params.length !== decl.schema.length) {
            if (params.length === 1) {
                isTuple = false;
                typeUnify(params[0][0], decl.type);
            } else {
                throw new TypeError('Invalid number of parameters for keyword');
            }
        } else {
            params.forEach(function(p, i) {
                decl.schema[i] = typeUnify(p[0], decl.schema[i]);
            });
        }

        var produce = function(env) {
            var v = params.map(function(p) {
                return toJS(p[0], p[1](env));
            });
            if (isTuple)
                return v;
            else
                return v[0];
        }

        this.outputs.push({
            action: null,
            keyword: keyword,
            owner: owner,
            produce: produce
        });
    }
}
