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
const InputCompilerVisitor = require('./input_compiler');

const typeUnify = Type.typeUnify;

module.exports = class AppCompiler {
    constructor() {
        this._warnings = [];

        this._name = undefined;
        this._params = {};
        this._keywords = {};
        this._outs = {};
        this._modules = {};
        this._rules = [];
        this._commands = [];

        this._scope = {};

        this._schemaRetriever = null;
    }

    setSchemaRetriever(schemaRetriever) {
        this._schemaRetriever = schemaRetriever;
    }

    get warnings() {
        return this._warnings;
    }

    _warn(msg) {
        this._warnings.push(msg);
    }

    get name() {
        return this._name;
    }

    get feedAccess() {
        return this._feedAccess;
    }

    get params() {
        return this._params;
    }

    get rules() {
        return this._rules;
    }

    get commands() {
        return this._commands;
    }

    get modules() {
        return this._modules;
    }

    get keywords() {
        return this._keywords;
    }

    get outs() {
        return this._outs;
    }

    getKeywordDecl(k) {
        if (!(k in this._keywords))
            throw new Error('Invalid keyword name ' + k);
        return this._keywords[k];
    }

    compileExpression(expression, scope) {
        var visitor = new ExpressionCompilerVisitor(this._keywords, this._feedAccess,
                                                    this._currentKeywords, scope);
        return visitor.visitExpression(expression);
    }

    compileInputs(inputs, forTrigger, scope) {
        var visitor = new InputCompilerVisitor(this._schemaRetriever,
                                               this._scope,
                                               this._modules,
                                               this._keywords,
                                               this._feedAccess,
                                               scope,
                                               this._currentKeywords,
                                               forTrigger);
        return visitor.visitReorderSequence(inputs).then(() => {
            var inputFunctions = visitor.inputFunctions;

            function fullInput(env, cont) {
                function next(i) {
                    if (i === inputFunctions.length) {
                        return cont();
                    } else {
                        return inputFunctions[i](env, function() {
                            return next(i+1);
                        });
                    }
                }

                return next(0);
            }

            var memberBindings = visitor.memberBindings;
            var memberBindingKeywords = visitor.memberBindingKeywords;
            var memberCaller;
            if (memberBindings.length < 0) {
                // fast path simple case with no shared keywords
                memberCaller = fullInput;
            } else {
                memberCaller = function memberCaller(env, cont) {
                    if (forTrigger && env.changedMember !== null) {
                        // fix bindings that use keywords that changed
                        //
                        // so for A[m1], B[m1], C[m2], if A[0] changes
                        // we fix m1 to 0 and let m2 vary, because A is in m1's memberBindingKeywords
                        // we don't fix m2 to 0 and let m1 vary, because C did not change
                        //
                        // for A[m1], A[m2], if A[0] changes
                        // first we fix m1 to 0 and let m2 vary,
                        // then we fix m2 to 0 and let m1 vary
                        for (var binding of memberBindings) {
                            if (memberBindingKeywords[binding].indexOf(env.changedKeyword) != -1) {
                                env.fixedMemberBinding = binding;
                                return fullInput(env, cont);
                            }
                        }
                    } else {
                        env.fixedMemberBinding = null;
                        return fullInput(env, cont);
                    }
                }
            }

            return {
                invocation: visitor.invocation,
                keywords: visitor.keywords,
                caller: memberCaller
            };
        });
    }

    compileOneOutput(output, scope) {
        var params = output.params.map(function(param) {
            return this.compileExpression(param, scope);
        }, this);

        if (!output.isInvocation && !output.isKeyword)
            throw new Error("Invalid rule output (must be invocation or keyword)");

        var action = null;
        var keyword = null;
        var owner = null;
        var type = null;
        var isTuple = true;
        return Q.try(function() {
            if (output.isInvocation) {
                action = { selector: output.selector,
                           name: output.name,
                           params: [] };

                return Utils.getSchemaForSelector(this._schemaRetriever, output.selector, output.name, this._scope, this._modules, 'functionSchemas', 'actions')
                    .then(function(schema) {
                    type = Type.Tuple(schema);

                    if (schema !== null) {
                        if (params.length < schema.length)
                            throw new TypeError('Invalid number of parameters for action');

                        params.forEach(function(p, i) {
                            typeUnify(p[0], schema[i]);
                        });
                    }
                });
            } else {
                keyword = output.keyword;
                owner = output.owner;

                if (owner !== null && owner !== 'self')
                    throw new TypeError('Invalid ownership operator for output (must be self)');

                if (!(keyword.name in this._keywords))
                    throw new TypeError('Undeclared keyword ' + keyword.name);

                var decl = this._keywords[keyword.name];
                if (owner !== null && !decl.feedAccess)
                    throw new TypeError('Invalid ownership operator on private keyword');
                if (owner === null && decl.feedAccess)
                    throw new TypeError('Missing ownership operator on feed-accessible keyword');

                keyword.feedAccess = decl.feedAccess;
                type = decl.type;
                isTuple = decl.type.isTuple;
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
            }
        }.bind(this)).then(function() {
            function toJS(type, value) {
                if (value === null)
                    return null;
                if (type.isArray) {
                    if (value instanceof Immutable.List) {
                        return value.map(function(v) {
                            return toJS(type.elem, v);
                        }).toArray();
                    } else {
                        return value;
                    }
                } else if (type.isMap) {
                    if (value instanceof Immutable.Map) {
                        return value.entrySeq().map(function(t) {
                            var k = t[0];
                            var v = t[1];
                            return [toJS(type.key, k), toJS(type.value, v)];
                        }).toArray();
                    } else {
                        return value;
                    }
                } else if (type.isTuple) {
                    if (type.schema !== null) {
                        return value.map(function(v, i) {
                            return toJS(type.schema[i], v);
                        });
                    } else {
                        return value;
                    }
                } else {
                    return value;
                }
            }

            return {
                action: action,
                keyword: keyword,
                owner: owner,
                produce: function(env) {
                    var v = params.map(function(p) {
                        return p[1](env);
                    });
                    if (isTuple)
                        return toJS(type, v);
                    else
                        return toJS(type, v[0]);
                }
            };
        }.bind(this));
    }

    compileOutputs(outputs, scope) {
        return Q.all(outputs.map(function(out) {
            return this.compileOneOutput(out, scope);
        }, this));
    }

    compileRule(ast) {
        this._currentKeywords = [];

        var inputs = ast.sequence[0].slice();
        var outputs = ast.sequence[ast.sequence.length-1].slice();
        var queries = ast.sequence.slice(1, ast.sequence.length-1).map(function(x) { return x.slice(); });

        var scope = {};
        for (var name in this._scope)
            scope[name] = this._scope[name];
        if (this._feedAccess)
            scope.self = Type.User;
        return this.compileInputs(inputs, true, scope).then(function(compiledInputs) {
            var compiledQueries = [];
            function compileQueryLoop(i) {
                if (i === queries.length)
                    return Q();
                return this.compileInputs(queries[i], false, scope).then(function(compiledQuery) {
                    compiledQueries.push(compiledQuery);
                    return compileQueryLoop.call(this, i+1);
                }.bind(this));
            }
            return compileQueryLoop.call(this, 0).then(function() {
                return this.compileOutputs(outputs, scope);
            }.bind(this)).then(function(compiledOutputs) {
                var retval = { inputs: compiledInputs, queries: compiledQueries, outputs: compiledOutputs };

                this._currentKeywords.forEach(function(kw) {
                    kw.watched = false;
                    if (kw.name in compiledInputs.keywords) {
                        compiledInputs.keywords[kw.name].owner = null;
                        kw.owner = null;
                    } else {
                        compiledInputs.keywords[kw.name] = kw;
                    }
                });

                // turn keywords from an object into an array
                var keywordArray = [];
                for (var name in compiledInputs.keywords)
                    keywordArray.push(compiledInputs.keywords[name]);
                compiledInputs.keywords = keywordArray;

                /*console.log('*** dump scope ***');
                for (var name in scope)
                    console.log('scope[' + name + ']: ' + scope[name]);
                */

                return retval;
            }.bind(this));
        }.bind(this));
    }

    compileCommand(ast) {
        this._currentKeywords = [];

        var outputs = ast.sequence[ast.sequence.length-1].slice();
        var queries = ast.sequence.slice(0, ast.sequence.length-1).map(function(x) { return x.slice(); });

        var scope = {};
        for (var name in this._scope)
            scope[name] = this._scope[name];
        if (this._feedAccess)
            scope.self = Type.User;
        var compiledQueries = [];
        function compileQueryLoop(i) {
            if (i === queries.length)
                return Q();
            return this.compileInputs(queries[i], false, scope).then(function(compiledQuery) {
                compiledQueries.push(compiledQuery);
                return compileQueryLoop.call(this, i+1);
            }.bind(this));
        }
        return compileQueryLoop.call(this, 0).then(() => {
            return this.compileOutputs(outputs, scope);
        }).then((compiledOutputs) => {
            var retval = { queries: compiledQueries, outputs: compiledOutputs };
            var keywords = {};

            this._currentKeywords.forEach(function(kw) {
                kw.watched = false;
                if (kw.name in keywords) {
                    keywords[kw.name].owner = null;
                    kw.owner = null;
                } else {
                    keywords[kw.name] = kw;
                }
            });

            // turn keywords from an object into an array
            var keywordArray = [];
            for (var name in keywords)
                keywordArray.push(keywords[name]);
            retval.keywords = keywordArray;

            return retval;
        });
    }

    compileModule(ast) {
        var module = { events: {}, functions: {}, functionSchemas: {} };
        var scope = {};

        ast.statements.forEach(function(stmt) {
            if (stmt.name in scope || stmt.name in this._scope)
                throw new TypeError("Declaration " + stmt.name + " shadows existing name");
            if (stmt.isEventDecl) {
                var event = stmt.params.map(function(p) {
                    return p.type;
                });
                module.events[stmt.name] = event;
                scope[stmt.name] = event;
            } else if (stmt.isFunctionDecl) {
                var names = stmt.params.map(function(p) {
                    return p.name;
                });
                var types = stmt.params.map(function(p) {
                    return p.type;
                });

                module.functions[stmt.name] = { params: names, schema: types, code: stmt.code };
                module.functionSchemas[stmt.name] = types;
                scope[stmt.name] = module.functions[stmt.name];
            } else {
                throw new TypeError();
            }
        }, this);

        return module;
    }

    compileVarDecl(ast) {
        var name = ast.name.name;
        var decl = {
            feedAccess: ast.name.feedAccess,
            extern: ast.extern,
            out: ast.out || ast.extern,
            type: ast.type,
            schema: null
        };
        if (decl.feedAccess && !this._feedAccess)
            throw new TypeError("Feed-accessible keyword declared in non feed-parametric program");
        if (ast.type.isTuple)
            decl.schema = decl.type.schema;
        else
            decl.schema = [ast.type];

        return decl;
    }

    compileCode(code) {
        return this.compileProgram(Grammar.parse(code));
    }

    compileProgram(ast) {
        this._name = ast.name.name;
        this._feedAccess = ast.name.feedAccess;
        ast.params.forEach(function(ast) {
            this._params[ast.name] = ast.type;
            this._scope[ast.name] = this._params[ast.name];
        }, this);
        if (this._feedAccess) {
            this._params['F'] = Type.Feed;
            this._scope['F'] = Type.Feed;
        }

        ast.statements.forEach(function(stmt) {
            if (stmt.isComputeModule) {
                if (stmt.name in this._modules)
                    throw new TypeError('Duplicate declaration for module ' + stmt.name);
                if (stmt.name in this._scope)
                    throw new TypeError('Module declaration ' + stmt.name + ' aliases name in scope');
                this._modules[stmt.name] = this.compileModule(stmt);
                this._scope[stmt.name] = Type.Module;
            } else if (stmt.isVarDecl) {
                if (stmt.name.name in this._keywords)
                    throw new TypeError('Duplicate declaration for keyword ' + stmt.name.name);
                if (stmt.name.name in this._scope)
                    throw new TypeError('Keyword declaration ' + stmt.name.name + ' aliases name in scope');
                this._keywords[stmt.name.name] = this.compileVarDecl(stmt);
                if (this._keywords[stmt.name.name].out)
                    this._outs[stmt.name.name] = this._keywords[stmt.name.name].type;
                this._scope[stmt.name.name] = this._keywords[stmt.name.name].type;
            }
        }, this);

        ast.statements.forEach(function(stmt) {
            if (stmt.isRule) {
                this._rules.push(this.compileRule(stmt));
            } else if (stmt.isCommand) {
                this._commands.push(this.compileCommand(stmt));
            }
        }, this);

        return Q.all([Q.all(this._rules), Q.all(this._commands)]);
    }
}

