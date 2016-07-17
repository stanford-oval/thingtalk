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
const getSchemaForSelector = Utils.getSchemaForSelector;

function makeInvocationParamAccess(i, forTrigger) {
    if (forTrigger) {
        return function(env) {
            return env.triggerValue[i];
        }
    } else {
        return function(env) {
            return env.queryValue[i];
        }
    }
}
function makeKeywordParamAccess(name, i) {
    return function(env, value) {
        return value[i];
    }
}

module.exports = class InputCompilerVisitor extends Visitor.RulePart {
    constructor(appParamScope, scope, currentKeywords, forTrigger) {
        super();

        this._appParamScope = appParamScope;
        this._currentKeywords = currentKeywords;
        this._scope = scope;
        this._forTrigger = forTrigger;

        this.invocation = null;
        this.inputFunctions = [];
        this.memberBindings = [];
        this.memberBindingKeywords = {};
        this.keywords = {};
    }

    compileExpression(expression, scope) {
        var visitor = new ExpressionCompilerVisitor(this._currentKeywords,
                                                    scope);
        return visitor.visitExpression(expression);
    }

    visitInvocation(ast) {
        var selector = ast.selector;
        var name = ast.name;
        var schema = ast.schema;
        var params = ast.params;
        var triggerParams = [];
        var queryInputs = [];
        var paramfns = [];

        // record the scope before invoking the trigger/query
        // this is the set of variables we can pass as
        // channelParams
        // in case of queries, the initial scope includes all
        // variables currently in scope, that is, local variables,
        // keywords, app params and F/self
        // (technically compute modules too, but those should not
        // type check)
        // in case of triggers, the initial scope includes only
        // app params and F, because that's what TriggerRunner is able
        // to deal with
        // (self should be an easy addition, but I'm not sure it's
        // so important)
        var initialScope = {};
        if (this._forTrigger)
            Object.assign(initialScope, this._appParamScope);
        else
            Object.assign(initialScope, this._scope);

        params.forEach((param, i) => {
            var paramop = makeInvocationParamAccess(i, this._forTrigger);
            if (param.isNull) {
                triggerParams.push(undefined);
                queryInputs.push(() => undefined);
            } else if (param.isVarRef && param.isUndefined) {
                this._scope[param.name] = schema[i];
                triggerParams.push(undefined);
                queryInputs.push(() => undefined);

                paramfns.push(function(env) {
                    env.setVar(name, paramop(env));
                    return true;
                });
            } else {
                // try compiling using the initial scope
                // if that succeeds, we know we can pass this value as input
                // to the query (or the trigger)
                // otherwise, this expression is using some variable defined
                // by the query itself, and so needs to be checked after the
                // query is done
                var op = null;
                if (param.isConstant || param.isVarRef || !this._forTrigger) {
                    try {
                        var op = this.compileExpression(param, initialScope);
                        triggerParams.push(param);
                        queryInputs.push(op);
                    } catch(e) {
                        console.log('Compiling in initial scope failed: ' + e.message);
                        var op = this.compileExpression(param, this._scope);
                        triggerParams.push(undefined);
                        queryInputs.push(() => undefined);
                    }
                } else {
                    throw new TypeError('Invalid argument to input invocation (must be variable or constant)');
                }
                paramfns.push(function(env) {
                    return Builtin.equality(paramop(env), op(env));
                });
            }
        });

        var fullValueCheck;
        if (this._forTrigger)
            fullValueCheck = function(env) { return env.triggerValue !== null; }
        else
            fullValueCheck = function(env) { return env.queryInput !== null && env.queryValue !== null; }

        function invocationIsTrue(env) {
            if (!fullValueCheck(env))
                return false;

            for (var fn of paramfns) {
                if (!fn(env))
                    return false;
            }
            return true;
        }

        this.invocation = {
            selector: selector,
            name: name
        };
        if (this._forTrigger)
            this.invocation.params = triggerParams;
        else
            this.invocation.params = queryInputs;
        this.inputFunctions.push(function(env, cont) {
            if (invocationIsTrue(env))
                return cont();
        });
    }

    visitKeyword(ast) {
        var name = ast.keyword.name;
        var owner = ast.owner;
        var negative = ast.negative;
        var schema = ast.schema;

        if (this._forTrigger)
            ast.keyword.watched = true;
        else
            this._currentKeywords.push(ast.keywords);

        var params = ast.params;
        var paramfns = [];

        params.forEach((param, i) => {
            if (param.isNull)
                return;
            var paramop = makeKeywordParamAccess(name, i);
            if (param.isVarRef && param.isUndefined) {
                this._scope[param.name] = schema[i];
                paramfns.push(function(env, value) {
                    env.setVar(param.name, paramop(env, value));
                    return true;
                });
            } else {
                var op = this.compileExpression(param, this._scope);
                paramfns.push(function(env, value) {
                    return Builtin.equality(paramop(env, value), op(env));
                });
            }
        });

        var feedAccess = ast.keyword.feedAccess;
        function getKeywordValue(env) {
            // self is special! we punch through the RemoteKeyword to access the
            // local portion only, and avoid a bunch of setup messages on the feed
            // note that we rely on compileInput monkey-patching the Keyword AST object
            // to check if the owner value was nullified or not, but we use owner
            // to access the member binding

            var value;
            if (feedAccess && ast.keyword.owner !== 'self')
                value = env.readKeyword(name)[env.getMemberBinding(owner)];
            else
                value = env.readKeyword(name);
            if (value === undefined)
                throw new TypeError('Keyword ' + ast.keyword.name + (feedAccess ? '-F' : '') + ' is undefined?');
            if (value === null)
                return null;
            if (!ast.keyword.isTuple)
                value = [value];
            return value;
        }

        function keywordIsTrue(env) {
            var value = getKeywordValue(env);
            if (value === null)
                return false;

            for (var fn of paramfns) {
                if (!fn(env, value))
                    return false;
            }
            return true;
        }

        var keywordCaller;
        if (negative) {
            keywordCaller = function keywordCaller(env, cont) {
                if (!keywordIsTrue(env))
                    return cont();
            };
        } else {
            keywordCaller = function keywordCaller(env, cont) {
                if (keywordIsTrue(env))
                    return cont();
            }
        }

        // XXX: find a better way than monkey-patching an ADT
        ast.keyword.owner = ast.owner;

        if (ast.keyword.feedAccess && ast.owner !== 'self')
            this.memberBindingKeywords[ast.owner].push(ast.keyword.name);

        // check if this keyword was already accessed in this rule,
        // and avoid adding it again
        if (ast.keyword.name in this.keywords) {
            console.log('Duplicate keyword ' + ast.keyword.name + ' in rule');
            // merge owners
            if (ast.keyword.owner !== this.keywords[ast.keyword.name].owner) {
                this.keywords[ast.keyword.name].owner = null;
                ast.keyword.owner = null;
            }
        } else {
            this.keywords[ast.keyword.name] = ast.keyword;
        }

        this.inputFunctions.push(keywordCaller);
    }

    visitMemberBinding(ast) {
        var name = ast.name;
        this._scope[name] = Type.User;
        this.memberBindings.push(name);
        this.memberBindingKeywords[name] = [];

        this.inputFunctions.push(function(env, cont) {
            var members = env.getFeedMembers();
            if (name === env.fixedMemberBinding) {
                env.setMemberBinding(name, env.changedMember);
                env.setVar(name, members[env.changedMember]);
                return cont();
            } else {
                members.forEach(function(member, j) {
                    env.setMemberBinding(name, j);
                    env.setVar(name, member);
                    return cont();
                });
            }
        });
    }

    visitRegex(ast) {
        var argsast = ast.expr.args;
        if (argsast.length <= 3)
            return this.visitCondition(ast);

        var argsexp = argsast.slice(0, 3).map(function(arg) {
            return this.compileExpression(arg, this._scope);
        }, this);
        var strOp = argsexp[0];
        var regexStrOp = argsexp[1];
        var flagOp = argsexp[2];

        var regexpOp;
        if (argsast[1].isConstant && argsast[2].isConstant) {
            var regexp = new RegExp(regexStrOp(), flagOp());
            regexpOp = function() {
                return regexp;
            }
        } else {
            regexpOp = function(env) {
                return new RegExp(regexStrOp(env), flagOp(env));
            }
        }

        var bindersast = argsast.slice(3);
        var binderops = new Array(bindersast.length);

        bindersast.forEach((binder, i) => {
            if (binder.isVarRef && binder.isUndefined) {
                this._scope[binder.name] = Type.String;
                binderops[i] = function(env, group) {
                    env.setVar(binder.name, group);
                    return true;
                }
            } else {
                var binderop = this.compileExpression(binder, this._scope);
                binderops[i] = function(env, group) {
                    return group === binderop(env);
                }
            }
        });

        this.inputFunctions.push(function(env, cont) {
            var regex = regexpOp(env);
            var str = strOp(env);
            var exec = regex.exec(str);
            if (exec === null)
                return;
            for (var i = 0; i < binderops.length; i++) {
                var group = exec[i+1] || '';
                if (!binderops[i](env, group))
                    return;
            }
            return cont();
        });
    }

    visitContains(ast) {
        var argsast = ast.expr.args;
        if (argsast.length !== 2) {
            throw new TypeError("Function contains does not accept " +
                                argsast.length + " arguments");
        }
        if (!argsast[1].isVarRef || argsast[1].name in this._scope)
            return this.visitCondition(ast);

        var arrayop = this.compileExpression(argsast[0], this._scope);
        var name = argsast[1].name;
        var type = argsast[0].type;
        if (type.isArray) {
            this._scope[name] = type.elem;
            this.inputFunctions.push(function(env, cont) {
                var array = arrayop(env);
                array.forEach(function(elem) {
                    env.setVar(name, elem);
                    cont();
                });
            });
        } else if (type.isMap) {
            this._scope[name] = type.key;
            this.inputFunctions.push(function(env, cont) {
                var map = arrayop(env);
                if (!(map instanceof Immutable.Map))
                    map = new Immutable.Map(map);
                return map.forEach(function(value, key) {
                    env.setVar(name, key);
                    cont();
                });
            });
        } else {
            throw new TypeError();
        }
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
        var name = ast.name;
        var expr = this.compileExpression(ast.expr, this._scope);
        this._scope[name] = ast.type;
        this.inputFunctions.push(function(env, cont) {
            env.setVar(name, expr(env));
            return cont();
        });
    }

    visitCondition(ast) {
        var op = this.compileExpression(ast.expr, this._scope);
        this.inputFunctions.push(function(env, cont) {
            if (op(env))
                return cont();
        });
    }
}
