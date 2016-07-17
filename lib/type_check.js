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
const Visitor = require('./visitor');

const typeUnify = Type.typeUnify;
const resolveTypeScope = Type.resolveTypeScope;
const getSchemaForSelector = Utils.getSchemaForSelector;

class TypeCheckExpressionVisitor extends Visitor.Expression {
    constructor(keywords, feedAccess, scope) {
        super();

        this._keywords = keywords;
        this._feedAccess = feedAccess;

        this.scope = scope;
    }

    visitConstant(ast) {
        return ast.type = Ast.typeForValue(ast.value);
    }

    visitVarRef(ast) {
        var name = ast.name;
        if (name === 'F' && this._feedAccess) {
            ast.isFeedAccess = true;
            return ast.type = Type.Feed;
        }
        if (name in this._keywords) {
            var decl = this._keywords[name];

            if (decl.feedAccess) {
                ast.isFeedKeywordAccess = true;
                var type = decl.type;
                return ast.type = Type.Map(Type.User, type);
            } else {
                ast.isKeywordAccess = true;
                return ast.type = decl.type;
            }
        } else {
            if (!(name in this.scope))
                throw new TypeError('Variable ' + name + ' is undefined');

            return ast.type = this.scope[name];
        }
    }

    visitMemberRef(ast) {
        var objectast = ast.object;
        var name = ast.name;
        var objecttype = typeUnify(this.visitExpression(objectast), Type.Object(null));

        var type;
        var schema = null;
        if (objecttype.isObject)
            schema = objecttype.schema;
        else if (objecttype.isUser)
            schema = { name: Type.String };
        else if (objecttype.isFeed)
            schema = { length: Type.Number };
        else
            throw new TypeError(); // should not unify with Type.Object

        if (schema !== null) {
            if (!(name in schema))
                throw new TypeError('Object has no field ' + name);
            type = schema[name];
        } else {
            type = Type.Any;
        }
        return ast.type = type;
    }

    visitFunctionCall(ast) {
        var name = ast.name;
        var argsast = ast.args;
        if (!(name in Builtin.Functions))
            throw new TypeError('Unknown function $' + name);

        var func = Builtin.Functions[name];
        var argstype = argsast.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        ast.pure = func.pure;

        for (var i = 0; i < func.types.length; i++) {
            var overload = func.types[i];
            var maxArgs = overload.length - 1;
            if ('minArgs' in func)
                var minArgs = func.minArgs;
            else
                var minArgs = maxArgs;
            if (argsast.length < minArgs || argsast.length > maxArgs)
                continue;
            try {
                var typeScope = {};
                argstype.forEach(function(type, idx) {
                    typeUnify(type, overload[idx], typeScope);
                });
                var funcop;
                if (Array.isArray(func.op))
                    funcop = func.op[i];
                else
                    funcop = func.op;
                var rettype = resolveTypeScope(overload[overload.length-1], typeScope);
                ast.type = rettype;
                ast.op = funcop;
                return ast.type;
            } catch(e) {
            }
        }

        throw new TypeError('Could not find a valid overload of $' + name + ' with ' + argsexp.length + ' arguments');
    }

    visitUnaryOp(ast) {
        var argast = ast.arg;
        var opcode = ast.opcode;
        var argtype = this.visitExpression(argast);
        var unop = Builtin.UnaryOps[opcode];
        ast.pure = unop.pure;
        var rettype, op;
        for (var i = 0; i < unop.types.length; i++) {
            try {
                var typeScope = {};
                argtype = typeUnify(argtype, unop.types[i][0], typeScope);
                rettype = unop.types[i][1];
                if (argtype.isMeasure && rettype.isMeasure)
                    rettype = typeUnify(argtype, rettype, typeScope);
                op = unop.op;
                break;
            } catch(e) {
            }
        }
        if (op === undefined)
            throw new TypeError('Could not find a valid overload for unary op ' + opcode);

        ast.type = rettype;
        ast.op = op;
        return ast.type;
    }

    visitBinaryOp(ast) {
        var lhsast = ast.lhs;
        var rhsast = ast.rhs;
        var opcode = ast.opcode;
        var lhstype = this.visitExpression(lhsast);
        var rhstype = this.visitExpression(rhsast);

        var binop = Builtin.BinaryOps[opcode];
        ast.pure = binop.pure;
        var rettype, op;
        for (var i = 0; i < binop.types.length; i++) {
            try {
                var typeScope = {};
                lhstype = typeUnify(lhstype, binop.types[i][0], typeScope);
                rhstype = typeUnify(rhstype, binop.types[i][1], typeScope);
                rettype = binop.types[i][2];
                if (lhstype.isMeasure && rhstype.isMeasure)
                    lhstype = typeUnify(lhstype, rhstype, typeScope);
                if (lhstype.isMeasure && rettype.isMeasure)
                    rettype = typeUnify(lhstype, rettype, typeScope);
                op = binop.op;
                break;
            } catch(e) {
            }
        }
        if (op === undefined)
            throw new TypeError('Could not find a valid overload for binary op ' + opcode);

        ast.type = rettype;
        ast.op = op;
        return ast.type;
    }

    visitTuple(ast) {
        var args = ast.args;
        var types = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);

        return ast.type = Type.Tuple(types);
    }

    visitArray(ast) {
        var args = ast.args;
        var argtypes = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        var type = Type.Any;
        argtypes.forEach(function(t) {
            type = typeUnify(type, t);
        });
        return ast.type = Type.Array(type);
    }
}

class TypeCheckInputVisitor extends Visitor.RulePart {
    constructor(schemas, globalScope, modules, keywordDecls, feedAccess, scope, forTrigger) {
        super();

        this._schemas = schemas;
        this._globalScope = globalScope;
        this._modules = modules;
        this._keywordDecls = keywordDecls;
        this._feedAccess = feedAccess;

        this._scope = scope;
        this._forTrigger = forTrigger;
    }

    typeCheckExpression(expression) {
        var visitor = new TypeCheckExpressionVisitor(this._keywordDecls,
                                                     this._feedAccess,
                                                     this._scope);
        return visitor.visitExpression(expression);
    }

    visitInvocation(ast) {
        var selector = ast.selector;
        var name = ast.name;
        var schema;
        if (this._forTrigger)
            schema = getSchemaForSelector(this._schemas, selector, name, this._scope, this._modules, 'events', 'triggers');
        else
            schema = getSchemaForSelector(this._schemas, selector, name, this._scope, this._modules, '', 'queries');

        return schema.then((schema) => {
            var params = ast.params;
            var triggerParams = [];
            var queryInputs = [];
            var paramfns = [];

            if (schema !== null) {
                if (params.length > schema.length)
                    throw new TypeError('Invalid number of parameters for trigger');
            } else {
                schema = params.map(() => Type.Any);
            }
            while (params.length < schema.length)
                params.push(Ast.Expression.Null);
            ast.schema = schema;

            params.forEach((param, i) => {
                if (param.isNull)
                    return;

                if (param.isVarRef && !(param.name in this._scope)) {
                    this._scope[param.name] = schema[i];
                    param.isUndefined = true;
                } else {
                    var argtype = this.typeCheckExpression(param);
                    schema[i] = typeUnify(schema[i], argtype);
                }
            });
        });
    }

    visitInvocations(invocations) {
        if (invocations.length > 1)
            throw new Error("Multiple invocations in a rule trigger or query are not allowed (use two rules or chain two queries)");
        if (invocations.length < 1 && !this._forTrigger)
            throw new Error("Query must include exactly one invocation");

        if (invocations.length > 0)
            return this.visitInvocation(invocations[0]);
        else
            return Q();
    }

    visitKeyword(ast) {
        var name = ast.keyword.name;
        var owner = ast.owner;
        var negative = ast.negative;

        var decl = this._keywordDecls[name];
        if (decl === undefined)
            throw new TypeError('Undeclared keyword ' + name);

        var feedAccess = decl.feedAccess;
        ast.keyword.feedAccess = feedAccess;
        ast.keyword.isTuple = decl.type.isTuple;
        ast.schema = decl.schema;
        if (owner !== null && !feedAccess)
            throw new TypeError('Invalid ownership operator on private keyword ' + name);
        if (owner === null && feedAccess)
            throw new TypeError('Missing ownership operator on feed-accessible keyword');
        if (owner !== null && owner !== 'self' &&
            (!(owner in this._scope) || !this._scope[owner].isUser))
            throw new TypeError('Invalid or unbound ownership operator ' + owner);

        var params = ast.params;

        if (!decl.type.isTuple)
            assert.strictEqual(decl.schema.length, 1);
        if (params.length !== decl.schema.length)
            throw new TypeError('Invalid number of parameters for keyword');

        params.forEach((param, i) => {
            if (param.isNull)
                return;
            if (param.isVarRef && !(param.name in this._scope)) {
                if (negative)
                    throw new TypeError('Unrestricted variable ' + param.name + ' cannot be used in negated keyword');
                this._scope[param.name] = decl.schema[i];
                param.isUndefined = true;
            } else {
                var type = this.typeCheckExpression(param, this._scope);
                decl.schema[i] = typeUnify(type, decl.schema[i]);
            }
        });
    }

    visitMemberBinding(ast) {
        var name = ast.name;
        if (name in this._scope)
            throw new TypeError('Name ' + name + ' is already in scope');
        this._scope[name] = Type.User;
    }

    visitRegex(ast) {
        var argsast = ast.expr.args;
        if (argsast.length <= 3)
            return this.visitCondition(ast);

        var argstypes = argsast.slice(0, 3).map(function(arg) {
            return this.typeCheckExpression(arg);
        }, this);
        typeUnify(argstypes[0], Type.String);
        typeUnify(argstypes[1], Type.String);
        typeUnify(argstypes[2], Type.String);

        var bindersast = argsast.slice(3);

        bindersast.forEach((binder, i) => {
            if (binder.isVarRef && !(binder.name in this._scope)) {
                this._scope[binder.name] = Type.String;
                binder.isUndefined = true;
            } else {
                var bindertype = this.typeCheckExpression(binder);
                typeUnify(bindertype, Type.String);
            }
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

        var arraytype = this.typeCheckExpression(argsast[0]);
        var type = null;
        try {
            type = typeUnify(arraytype, Type.Array(Type.Any));
        } catch(e) { }
        if (type === null) {
            try {
                type = typeUnify(arraytype, Type.Map(Type.Any, Type.Any));
            } catch(e) { }
        }
        if (type === null)
            throw new TypeError("Invalid first argument to $contains");
        argsast[0].type = type;

        var name = argsast[1].name;
        if (type.isArray) {
            this._scope[name] = type.elem;
            argsast[1].type = type.elem;
        } else {
            this._scope[name] = type.key;
            argsast[1].type = type.key;
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
        if (name in this._scope)
            throw new TypeError('Name ' + name + ' is already in scope');

        var type = this.typeCheckExpression(ast.expr);
        this._scope[name] = type;
    }

    visitCondition(ast) {
        var type = this.typeCheckExpression(ast.expr);
        typeUnify(type, Type.Boolean);
    }
}

class TypeCheckOutputVisitor extends Visitor.RulePart {
    constructor(schemas, globalScope, modules, keywordDecls, feedAccess, scope) {
        super();

        this._schemaRetriever = schemas;
        this._keywordDecls = keywordDecls;
        this._globalScope = globalScope;
        this._modules = modules;
        this._feedAccess = feedAccess;

        this._scope = scope;

        this.outputs = [];
    }

    typeCheckExpression(expression) {
        var visitor = new TypeCheckExpressionVisitor(this._keywordDecls,
                                                     this._feedAccess,
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
                invocation.schema = schema;

                var paramtypes = invocation.params.map(function(param) {
                    return this.typeCheckExpression(param);
                }, this);

                paramtypes.forEach(function(t, i) {
                    schema[i] = typeUnify(t, schema[i]);
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
        output.schema = decl.schema;

        var paramtypes = output.params.map(function(param) {
            return this.typeCheckExpression(param);
        }, this);

        var type = decl.type;
        var isTuple = decl.type.isTuple;
        if (paramtypes.length !== decl.schema.length) {
            if (paramtypes.length === 1) {
                isTuple = false;
                typeUnify(paramtypes[0], decl.type);
            } else {
                throw new TypeError('Invalid number of parameters for keyword');
            }
        } else {
            paramtypes.forEach(function(t, i) {
                decl.schema[i] = typeUnify(t, decl.schema[i]);
            });
        }
    }
}

module.exports = {
    Inputs: TypeCheckInputVisitor,
    Outputs: TypeCheckOutputVisitor
}
