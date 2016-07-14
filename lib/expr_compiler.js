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
const normalizeConstant = Utils.normalizeConstant;

module.exports = class ExpressionCompilerVisitor extends Visitor.Expression {
    constructor(keywords, feedAccess, currentKeywords, scope) {
        super();

        this._keywords = keywords;
        this._feedAccess = feedAccess;
        this._currentKeywords = currentKeywords;

        this.scope = scope;
    }

    visitConstant(value) {
        var normalized = normalizeConstant(value);
        var type = Ast.typeForValue(normalized);

        return [type, function() { return normalized.value; }];
    }

    visitVarRef(name) {
        if (name === 'F' && this._feedAccess) {
            return [Type.Feed, function(env) {
                return env.readFeed();
            }];
        }
        if (name in this._keywords) {
            var decl = this._keywords[name];
            this._currentKeywords.push(Ast.Keyword(name, decl.feedAccess));

            if (decl.feedAccess) {
                var type = decl.type;
                return [Type.Map(Type.User, type), function(env) {
                    return (new Immutable.Seq(env.readKeyword(name))).toKeyedSeq()
                        .map(function(value, key) {
                            return env.readFeedMember(key);
                        });
                }];
            } else {
                return [decl.type, function(env) {
                    return env.readKeyword(name);
                }];
            }
        } else {
            if (!(name in this.scope))
                throw new TypeError('Variable ' + name + ' is undefined');

            var type = this.scope[name];
            return [type, function(env) {
                return env.readVar(name);
            }];
        }
    }

    visitMemberRef(objectast, name) {
        var objectexp = this.visitExpression(objectast);
        var objecttype = typeUnify(objectexp[0], Type.Object(null));

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
        var objectop = objectexp[1];

        return [type, function(env) {
            var object = objectop(env);
            return env.readObjectProp(object, name);
        }];
    }

    visitFunctionCall(name, argsast) {
        if (!(name in Builtin.Functions))
            throw new TypeError('Unknown function $' + name);

        var func = Builtin.Functions[name];
        var argsexp = argsast.map(function(arg) {
            return this.visitExpression(arg);
        }, this);

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
                argsexp.forEach(function(exp, idx) {
                    var type = typeUnify(exp[0], overload[idx], typeScope);
                });
                var funcop;
                if (Array.isArray(func.op))
                    funcop = func.op[i];
                else
                    funcop = func.op;
                var rettype = resolveTypeScope(overload[overload.length-1], typeScope);
                return [rettype, function(env) {
                    var args = argsexp.map(function(exp) {
                        return exp[1](env);
                    });
                    return funcop.apply(null, args);
                }];
            } catch(e) {
            }
        }

        throw new TypeError('Could not find a valid overload of $' + name + ' with ' + argsexp.length + ' arguments');
    }

    visitUnaryOp(argast, opcode) {
        var argexp = this.visitExpression(argast);
        var unop = Builtin.UnaryOps[opcode];
        var argtype, rettype, op;
        for (var i = 0; i < unop.types.length; i++) {
            try {
                var typeScope = {};
                argtype = typeUnify(argexp[0], unop.types[i][0], typeScope);
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

        var argop = argexp[1];
        return [rettype, function(env) { return op(argop(env)); }];
    }

    visitBinaryOp(lhsast, rhsast, opcode) {
        var lhsexp = this.visitExpression(lhsast);
        var rhsexp = this.visitExpression(rhsast);

        var binop = Builtin.BinaryOps[opcode];
        var lhstype, rhstype, rettype, op;
        for (var i = 0; i < binop.types.length; i++) {
            try {
                var typeScope = {};
                lhstype = typeUnify(lhsexp[0], binop.types[i][0], typeScope);
                rhstype = typeUnify(rhsexp[0], binop.types[i][1], typeScope);
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

        var lhsop = lhsexp[1];
        var rhsop = rhsexp[1];
        return [rettype, function(env) { return op(lhsop(env), rhsop(env)); }];
    }

    visitTuple(args) {
        var argsexp = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        var types = argsexp.map(function(exp) {
            return exp[0];
        });
        var ops = argsexp.map(function(exp) {
            return exp[1];
        });

        return [Type.Tuple(types), function(env) {
            return ops.map(function(op) { return op(env); });
        }];
    }

    visitArray(args) {
        var argsexp = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        var type = Type.Any;
        argsexp.forEach(function(exp) {
            type = typeUnify(type, exp[0]);
        });
        var ops = argsexp.map(function(exp) {
            return exp[1];
        });

        return [Type.Array(type), function(env) {
            return ops.map(function(op) { return op(env); });
        }];
    }
}
