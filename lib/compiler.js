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

        return {
            invocation: visitor.invocation,
            caller: fullInput
        };
    }

    compileActions(actions, scope) {
        var visitor = new OutputCompilerVisitor(scope,
                                                this._currentKeywords);
        visitor.visitOrderedSync(actions);
        return visitor.outputs;
    }

    typeCheckInputs(inputs, forTrigger, scope) {
        var visitor = new TypeCheck.Inputs(this._schemaRetriever,
                                           this._scope,
                                           this._modules,
                                           this._keywords,
                                           scope,
                                           forTrigger);
        return visitor.visitReorderAsync(inputs);
    }

    typeCheckActions(actions, scope) {
        var visitor = new TypeCheck.Outputs(this._schemaRetriever,
                                            this._scope,
                                            this._modules,
                                            this._keywords,
                                            scope);
        return visitor.visitOrderedAsync(actions);
    }

    _buildScope() {
        var scope = {};
        for (var name in this._scope)
            scope[name] = this._scope[name];
        return scope;
    }

    _typeCheckAll(trigger, queries, actions) {
        const scope = this._buildScope();

        return Q.try(() => {
            if (trigger !== null)
                return this.typeCheckInputs(trigger, true, scope);
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
            return this.typeCheckActions(actions, scope);
        });
    }

    _runConstantPropagation(trigger, queries, actions) {
        var rebindings = {};

        var visitor = new ConstProp.Inputs(rebindings);
        if (trigger !== null)
            visitor.visitReorderSync(trigger);
        queries.forEach((q) => visitor.visitReorderSync(q));

        visitor = new ConstProp.Outputs(rebindings);
        visitor.visitOrderedSync(actions);
    }

    _compileRuleOrCommand(trigger, queries, actions) {
        this._currentKeywords = new Set;

        this._runConstantPropagation(trigger, queries, actions);

        var scope = this._buildScope();
        var compiledInputs = trigger !== null ? this.compileInputs(trigger, true, scope) : null;
        var compiledQueries = queries.map((q) => this.compileInputs(q, false, scope));
        var compiledOutputs = this.compileActions(actions, scope);

        var retval = { inputs: compiledInputs, queries: compiledQueries, outputs: compiledOutputs };

        // turn keywords from a set into an array
        var keywordArray = Array.from(this._currentKeywords);
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
        return this._typeCheckAll(ast.trigger, ast.queries, ast.actions);
    }

    compileRule(ast) {
        return this._compileRuleOrCommand(ast.trigger, ast.queries, ast.actions);
    }

    verifyCommand(ast) {
        return this._typeCheckAll(null, ast.queries, ast.actions);
    }

    compileCommand(ast) {
        return this._compileRuleOrCommand(null, ast.queries, ast.actions);
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
        var name = ast.name;
        var decl = {
            type: ast.type
        };
        return decl;
    }

    compileCode(code) {
        return this.compileProgram(Grammar.parse(code));
    }

    verifyProgram(ast) {
        this._name = ast.name.name;
        ast.params.forEach(function(ast) {
            this._params[ast.name] = ast.type;
            this._scope[ast.name] = this._params[ast.name];
        }, this);
        ast.statements.forEach(function(stmt) {
            if (stmt.isComputeModule) {
                if (stmt.name in this._modules)
                    throw new TypeError('Duplicate declaration for module ' + stmt.name);
                if (stmt.name in this._scope)
                    throw new TypeError('Module declaration ' + stmt.name + ' aliases name in scope');
                this._modules[stmt.name] = this.verifyModule(stmt);
                this._scope[stmt.name] = Type.Module;
            } else if (stmt.isVarDecl) {
                if (stmt.name in this._keywords)
                    throw new TypeError('Duplicate declaration for keyword ' + stmt.name);
                if (stmt.name in this._scope)
                    throw new TypeError('Keyword declaration ' + stmt.name + ' aliases name in scope');
                this._keywords[stmt.name] = this.verifyVarDecl(stmt);
                this._scope[stmt.name] = this._keywords[stmt.name].type;
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

