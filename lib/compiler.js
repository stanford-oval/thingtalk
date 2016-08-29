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
const TypeCheck = require('./type_check');
const ConstProp = require('./constant_prop');
const InputCompilerVisitor = require('./input_compiler');
const OutputCompilerVisitor = require('./output_compiler');

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

    compileInputs(inputs, forTrigger, scope) {
        var visitor = new InputCompilerVisitor(this._params,
                                               scope,
                                               this._currentKeywords,
                                               forTrigger);
        visitor.visitReorderSync(inputs);
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
    }

    compileOutputs(outputs, scope) {
        var visitor = new OutputCompilerVisitor(scope,
                                                this._currentKeywords);
        visitor.visitOrderedSync(outputs);
        return visitor.outputs;
    }

    typeCheckInputs(inputs, forTrigger, scope) {
        var visitor = new TypeCheck.Inputs(this._schemaRetriever,
                                           this._scope,
                                           this._modules,
                                           this._keywords,
                                           this._feedAccess,
                                           scope,
                                           forTrigger);
        return visitor.visitReorderAsync(inputs);
    }

    typeCheckOutputs(outputs, scope) {
        var visitor = new TypeCheck.Outputs(this._schemaRetriever,
                                            this._scope,
                                            this._modules,
                                            this._keywords,
                                            this._feedAccess,
                                            scope);
        return visitor.visitOrderedAsync(outputs);
    }

    _buildScope() {
        var scope = {};
        for (var name in this._scope)
            scope[name] = this._scope[name];
        if (this._feedAccess)
            scope.self = Type.User;
        return scope;
    }

    _lowerBuiltins(ast) {
        for (var seq of ast.sequence) {
            for (var part of seq) {
                if (!part.isInvocation)
                    continue;
                if (!part.selector.isBuiltin)
                    continue;
                if (part.selector.name === 'at') {
                    part.name = part.selector.name;
                    part.selector = Ast.Selector.GlobalName('builtin');
                } else if (part.selector.name === 'logger') {
                    part.name = 'debug_log';
                    part.selector = Ast.Selector.GlobalName('builtin');
                }
            }
        }
    }

    _typeCheckAll(inputs, outputs, queries) {
        const scope = this._buildScope();

        return Q.try(() => {
            if (inputs !== null)
                return this.typeCheckInputs(inputs, true, scope);
            else
                return null;
        }).then(() => {
            function typeCheckQueryLoop(i) {
                if (i === queries.length)
                    return Q();
                return this.typeCheckInputs(queries[i], false, scope).then(function() {
                    return typeCheckQueryLoop.call(this, i+1);
                }.bind(this));
            }
            return typeCheckQueryLoop.call(this, 0);
        }).then(() => {
            return this.typeCheckOutputs(outputs, scope);
        });
    }

    _runConstantPropagation(inputs, outputs, queries) {
        var rebindings = {};

        var visitor = new ConstProp.Inputs(rebindings);
        if (inputs !== null)
            visitor.visitReorderSync(inputs);
        queries.forEach((q) => visitor.visitReorderSync(q));

        visitor = new ConstProp.Outputs(rebindings);
        visitor.visitOrderedSync(outputs);
    }

    _compileRuleOrCommand(inputs, outputs, queries) {
        this._currentKeywords = [];

        this._runConstantPropagation(inputs, outputs, queries);

        var scope = this._buildScope();
        var compiledInputs = inputs !== null ? this.compileInputs(inputs, true, scope) : null;
        var compiledQueries = queries.map((q) => this.compileInputs(q, false, scope));
        var compiledOutputs = this.compileOutputs(outputs, scope);

        var retval = { inputs: compiledInputs, queries: compiledQueries, outputs: compiledOutputs };

        var keywords = compiledInputs !== null ? compiledInputs.keywords : {}
        this._currentKeywords.forEach((kw) => {
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
        if (compiledInputs !== null)
            compiledInputs.keywords = keywordArray;
        else
            retval.keywords = keywordArray;

        /*console.log('*** dump scope ***');
          for (var name in scope)
              console.log('scope[' + name + ']: ' + scope[name]);
        */

        return retval;
    }

    verifyRule(ast) {
        var inputs, outputs, queries;

        this._lowerBuiltins(ast);

        inputs = ast.sequence[0].slice();
        outputs = ast.sequence[ast.sequence.length-1].slice();
        queries = ast.sequence.slice(1, ast.sequence.length-1).map(function(x) { return x.slice(); });
        return this._typeCheckAll(inputs, outputs, queries);
    }

    compileRule(ast) {
        var inputs, outputs, queries;

        inputs = ast.sequence[0].slice();
        outputs = ast.sequence[ast.sequence.length-1].slice();
        queries = ast.sequence.slice(1, ast.sequence.length-1).map(function(x) { return x.slice(); });
        return this._compileRuleOrCommand(inputs, outputs, queries);
    }

    verifyCommand(ast) {
        var inputs, outputs, queries;

        inputs = null;
        outputs = ast.sequence[ast.sequence.length-1].slice();
        queries = ast.sequence.slice(0, ast.sequence.length-1).map(function(x) { return x.slice(); });
        return this._typeCheckAll(inputs, outputs, queries);
    }

    compileCommand(ast) {
        var inputs, outputs, queries;

        inputs = null;
        outputs = ast.sequence[ast.sequence.length-1].slice();
        queries = ast.sequence.slice(0, ast.sequence.length-1).map(function(x) { return x.slice(); });
        return this._compileRuleOrCommand(inputs, outputs, queries);
    }

    verifyModule(ast) {
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

    verifyVarDecl(ast) {
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

    verifyProgram(ast) {
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
                this._modules[stmt.name] = this.verifyModule(stmt);
                this._scope[stmt.name] = Type.Module;
            } else if (stmt.isVarDecl) {
                if (stmt.name.name in this._keywords)
                    throw new TypeError('Duplicate declaration for keyword ' + stmt.name.name);
                if (stmt.name.name in this._scope)
                    throw new TypeError('Keyword declaration ' + stmt.name.name + ' aliases name in scope');
                this._keywords[stmt.name.name] = this.verifyVarDecl(stmt);
                if (this._keywords[stmt.name.name].out)
                    this._outs[stmt.name.name] = this._keywords[stmt.name.name].type;
                this._scope[stmt.name.name] = this._keywords[stmt.name.name].type;
            }
        }, this);

        var rules = [], commands = [];
        ast.statements.forEach(function(stmt) {
            if (stmt.isRule) {
                rules.push(this.verifyRule(stmt));
            } else if (stmt.isCommand) {
                commands.push(this.verifyCommand(stmt));
            }
        }, this);

        return Q.all(rules.concat(commands));
    }

    compileProgram(ast) {
        return this.verifyProgram(ast).then(() => {
            ast.statements.forEach(function(stmt) {
                if (stmt.isRule) {
                    this._rules.push(this.compileRule(stmt));
                } else if (stmt.isCommand) {
                    this._commands.push(this.compileCommand(stmt));
                }
            }, this);
        });
    }
}

