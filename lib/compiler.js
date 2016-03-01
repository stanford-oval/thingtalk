// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const lang = require('lang');
const adt = require('adt');
const assert = require('assert');
const Immutable = require('immutable');

const Ast = require('./ast');
const Grammar = require('./grammar');
const Type = require('./type');
const Internal = require('./internal');
const Builtin = require('./builtin');

function typeUnify(t1, t2, typeScope) {
    if (!typeScope)
        typeScope = {};

    if (typeof t1 === 'string' && typeof t2 === 'string') {
        if (t1 in typeScope && t2 in typeScope)
            return typeUnify(typeScope[t1], typeScope[t2], typeScope);
        if (t1 in typeScope)
            return typeScope[t2] = typeScope[t1];
        else if (t2 in typeScope)
            return typeScope[t1] = typeScope[t2];
        else
            return typeScope[t1] = typeScope[t2] = Type.Any;
    }
    if (typeof t1 === 'string') {
        if (t1 in typeScope)
            t1 = typeScope[t1];
        else
            return t1 = typeScope[t1] = t2;
    }
    if (typeof t2 === 'string') {
        if (t2 in typeScope)
            t2 = typeScope[t2];
        else
            return t2 = typeScope[t2] = t1;
    }
    // this will also check that the units match for two measures
    if (t1.equals(t2))
        return t1;
    if (t1.isAny)
        return t2;
    else if (t2.isAny)
        return t1;
    else if (t1.isMeasure && t1.unit == '' && t2.isMeasure)
        return t2;
    else if (t2.isMeasure && t2.unit == '' && t1.isMeasure)
        return t1;
    else if (t1.isObject && t2.isObject && t1.schema === null)
        return t2;
    else if (t1.isObject && t2.isObject && t2.schema === null)
        return t2;
    else if (t1.isObject && t2.isFeed && t1.schema === null)
        return t2;
    else if (t2.isObject && t1.isFeed && t2.schema === null)
        return t1;
    else if (t1.isObject && t2.isUser && t1.schema === null)
        return t2;
    else if (t2.isObject && t1.isUser && t2.schema === null)
        return t1;
    else if (t1.isTuple && t2.isTuple && t1.schema === null)
        return t2;
    else if (t1.isTuple && t2.isTuple && t2.schema === null)
        return t1;
    else if (t1.isTuple && t2.isTuple && t1.schema.length === t2.schema.length) {
        var mapped = new Array(t1.schema.length);
        for (var i = 0; i < t1.schema.length; i++)
            mapped[i] = typeUnify(t1.schema[i], t2.schema[i], typeScope);
        return Type.Tuple(mapped);
    }
    else if (t1.isArray && t2.isArray)
        return Type.Array(typeUnify(t1.elem, t2.elem, typeScope));
    else if (t1.isMap && t2.isMap)
        return Type.Map(typeUnify(t1.key, t2.key, typeScope),
                        typeUnify(t1.value, t2.value, typeScope));
    else
        throw new TypeError('Cannot unify ' + t1 + ' and ' + t2);
}

// this is a little sketchy because we modify a type defined in another module
// but it's ok because index.js always includes everything
Type.compatible = function(t1, t2) {
    try {
        typeUnify(t1, t2);
        return true;
    } catch(e) {
        return false;
    }
}

function resolveTypeScope(type, typeScope) {
    if (typeof type === 'string') {
        if (type in typeScope)
            return resolveTypeScope(typeScope[type], typeScope);
        else
            return Type.Any;
    }

    if (type.isArray)
        return Type.Array(resolveTypeScope(type.elem, typeScope));
    else if (type.isMap)
        return Type.Map(resolveTypeScope(type.key, typeScope),
                        resolveTypeScope(type.value, typeScope));
    else if (type.isTuple && type.schema !== null)
        return Type.Tuple(type.schema.map(function(t) { return resolveTypeScope(t, typeScope); }));
    else
        return type;
}

module.exports = new lang.Class({
    Name: 'AppCompiler',

    _init: function() {
        this._warnings = [];

        this._name = undefined;
        this._params = {};
        this._keywords = {};
        this._outs = {};
        this._modules = {};
        this._rules = [];

        this._scope = {};

        this._schemaRetriever = null;
    },

    setSchemaRetriever: function(schemaRetriever) {
        this._schemaRetriever = schemaRetriever;
    },

    get warnings() {
        return this._warnings;
    },

    _warn: function(msg) {
        this._warnings.push(msg);
    },

    get name() {
        return this._name;
    },

    get feedAccess() {
        return this._feedAccess;
    },

    get params() {
        return this._params;
    },

    get rules() {
        return this._rules;
    },

    get modules() {
        return this._modules;
    },

    get keywords() {
        return this._keywords;
    },

    get outs() {
        return this._outs;
    },

    getKeywordDecl: function(k) {
        if (!(k in this._keywords))
            throw new Error('Invalid keyword name ' + k);
        return this._keywords[k];
    },

    normalizeConstant: function(value) {
        if (value.isMeasure) {
            var baseunit = Internal.UnitsToBaseUnit[value.unit];
            if (baseunit === undefined)
                throw new TypeError("Invalid unit " + value.unit);
            var transform = Internal.UnitsTransformToBaseUnit[value.unit];
            var type = Type.Measure(baseunit);
            var transformed;
            if (typeof transform == 'function')
                transformed = transform(value.value);
            else
                transformed = value.value * transform;
            return Ast.Value.Measure(transformed, baseunit);
        } else {
            return value;
        }
    },

    compileConstant: function(value) {
        var normalized = this.normalizeConstant(value);

        var type;
        if (normalized.isBoolean)
            type = Type.Boolean;
        else if (normalized.isString)
            type = Type.String;
        else if (normalized.isNumber)
            type = Type.Number;
        else if (normalized.isMeasure)
            type = Type.Measure(normalized.unit);

        return [type, function() { return normalized.value; }];
    },

    compileVarRef: function(name, scope) {
        if (name === 'F' && this._feedAccess) {
            return [Type.Feed, function(env) {
                return env.readFeed();
            }];
        }
        if (name in this._keywords) {
            var decl = this._keywords[name];
            if (decl.feedAccess)
                throw new TypeError('Keyword ' + name + ' is feed accessible, must use -F syntax');
            var type = decl.type;

            this._currentKeywords.push(Ast.Keyword(name, false));
            return [decl.type, function(env) {
                return env.readKeyword(name);
            }];
        } else {
            if (!(name in scope))
                throw new TypeError('Variable ' + name + ' is unrestricted');

            var type = scope[name];
            return [type, function(env) {
                return env.readVar(name);
            }];
        }
    },

    compileMemberRef: function(objectast, name, scope) {
        var objectexp = this.compileExpression(objectast, scope);
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
    },

    compileFeedKeywordRef: function(name, scope) {
        if (name in this._keywords) {
            var decl = this._keywords[name];
            if (!decl.feedAccess)
                throw new TypeError('Keyword ' + name + ' is not feed accessible');

            this._currentKeywords.push(Ast.Keyword(name, true));
            var type = decl.type;
            return [Type.Map(Type.User, type), function(env) {
                return (new Immutable.Seq(env.readKeyword(name))).toKeyedSeq()
                    .map(function(value, key) {
                        return env.readFeedMember(key);
                    });
            }];
        } else {
            throw new TypeError(name + ' does not name a feed-accessible keyword');
        }
    },

    compileFunctionCall: function(name, argsast, scope) {
        if (!(name in Builtin.Functions))
            throw new TypeError('Unknown function $' + name);

        var func = Builtin.Functions[name];
        var argsexp = argsast.map(function(arg) {
            return this.compileExpression(arg, scope);
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
    },

    compileUnaryOp: function(argast, opcode, scope) {
        var argexp = this.compileExpression(argast, scope);
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
    },

    compileBinaryOp: function(lhsast, rhsast, opcode, scope) {
        var lhsexp = this.compileExpression(lhsast, scope);
        var rhsexp = this.compileExpression(rhsast, scope);

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
    },

    compileTuple: function(args, scope) {
        var argsexp = args.map(function(arg) {
            return this.compileExpression(arg, scope);
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
    },

    compileArray: function(args, scope) {
        var argsexp = args.map(function(arg) {
            return this.compileExpression(arg, scope);
        }, this);
        type = Type.Any;
        argsexp.forEach(function(exp) {
            type = typeUnify(type, exp[0]);
        });
        var ops = argsexp.map(function(exp) {
            return exp[1];
        });

        return [Type.Array(type), function(env) {
            return ops.map(function(op) { return op(env); });
        }];
    },

    compileExpression: function(ast, scope) {
        if (ast.isConstant)
            return this.compileConstant(ast.value, scope);
        else if (ast.isVarRef)
            return this.compileVarRef(ast.name, scope);
        else if (ast.isFeedKeywordRef)
            return this.compileFeedKeywordRef(ast.name, scope);
        else if (ast.isMemberRef)
            return this.compileMemberRef(ast.object, ast.name, scope);
        else if (ast.isFunctionCall)
            return this.compileFunctionCall(ast.name, ast.args, scope);
        else if (ast.isUnaryOp)
            return this.compileUnaryOp(ast.arg, ast.opcode, scope);
        else if (ast.isBinaryOp)
            return this.compileBinaryOp(ast.lhs, ast.rhs, ast.opcode, scope);
        else if (ast.isTuple)
            return this.compileTuple(ast.args, scope);
        else if (ast.isArray)
            return this.compileArray(ast.args, scope);
        else
            throw new TypeError(String(ast));
    },

    compileInputKeyword: function(ast, scope) {
        var name = ast.keyword.name;
        var feedAccess = ast.keyword.feedAccess;
        var owner = ast.owner;
        var negative = ast.negative;

        var decl = this._keywords[name];
        if (decl === undefined)
            throw new TypeError('Undeclared keyword ' + name);
        if (feedAccess !== decl.feedAccess)
            throw new TypeError('Inconsistent use of keyword feed specifier');
        if (owner !== null && !feedAccess)
            throw new TypeError('Invalid ownership operator on private keyword ' + name);
        if (owner === null && feedAccess)
            throw new TypeError('Missing ownership operator on feed-accessible keyword');
        if (owner !== null && owner !== 'self' &&
            (!(owner in scope) || !scope[owner].isUser))
            throw new TypeError('Invalid or unbound ownership operator ' + owner);

        var params = ast.params;
        var binders = {};
        var equalities = [];
        var reflections = [];
        var constchecks = [];

        if (!decl.type.isTuple)
            assert.strictEqual(decl.schema.length, 1);
        if (params.length !== decl.schema.length)
            throw new TypeError('Invalid number of parameters for keyword');

        for (var i = 0; i < params.length; i++) {
            var param = params[i];
            if (param.isNull)
                continue;
            if (param.isBinder) {
                if (param.name in scope) {
                    if (scope[param.name].isFeed)
                        continue;
                    if (decl.type.isTuple) {
                        decl.schema[i] = scope[param.name] = typeUnify(scope[param.name], decl.schema[i]);
                    } else {
                        var unified = scope[param.name] = typeUnify(scope[param.name], decl.type);
                        decl.type = unified;
                        decl.schema = [decl.type];
                    }
                    if (param.name in binders)
                        reflections.push([i, binders[param.name]]);
                    else
                        equalities.push([i, param.name]);
                } else {
                    if (negative)
                        throw new TypeError('Unrestricted variable ' + param.name + ' cannot be used in negated keyword');
                    binders[param.name] = i;
                    scope[param.name] = decl.schema[i];
                }
            } else {
                var constexpr = this.compileConstant(param.value);
                if (decl.type.isTuple) {
                    decl.schema[i] = typeUnify(constexpr[0], decl.schema[i]);
                } else {
                    var unified = typeUnify(constexpr[0], decl.type);
                    decl.type = unified;
                    decl.schema = [decl.type];
                }
                constchecks.push([i, constexpr[1]()]);
            }
        }
        if (!decl.type.isTuple)
            assert.strictEqual(reflections.length, 0);

        function keywordIsTrue(env, value) {
            if (value === null)
                return false;

            if (!decl.type.isTuple) {
                for (var i = 0; i < equalities.length; i++) {
                    var equal = equalities[i];
                    if (!Builtin.equality(value,
                                          env.readVar(equal[1])))
                        return false;
                }
                for (var i = 0; i < constchecks.length; i++) {
                    var constcheck = constchecks[i];
                    if (!Builtin.equality(value,
                                          constcheck[1]))
                        return false;
                }

                return true;
            } else {
                for (var i = 0; i < equalities.length; i++) {
                    var equal = equalities[i];
                    if (!Builtin.equality(value[equal[0]],
                                          env.readVar(equal[1])))
                        return false;
                }
                for (var i = 0; i < constchecks.length; i++) {
                    var constcheck = constchecks[i];
                    if (!Builtin.equality(value[constcheck[0]],
                                          constcheck[1]))
                        return false;
                }
                for (var i = 0; i < reflections.length; i++) {
                    var refl = reflections[i];
                    if (!Builtin.equality(value[refl[0]], value[refl[1]]))
                        return false;
                }

                return true;
            }
        }

        function getKeywordValue(env) {
            // self is special! we punch through the RemoteKeyword to access the
            // local portion only, and avoid a bunch of setup messages on the feed
            // note that we rely on compileInput monkey-patching the Keyword AST object
            // to check if the owner value was nullified or not, but we use owner
            // to access the member binding

            if (feedAccess && ast.keyword.owner !== 'self')
                return env.readKeyword(name)[env.getMemberBinding(owner)];
            else
                return env.readKeyword(name);
        }

        ast.keyword.watched = true;

        return [ast.keyword, ast.owner, function(env, cont) {
            var value = getKeywordValue(env);
            if (value === undefined)
                throw new TypeError('Keyword ' + ast.keyword.name + (feedAccess ? '-F' : '') + ' is undefined?');

            if (negative) {
                if (!keywordIsTrue(env, value))
                    cont();
            } else {
                if (keywordIsTrue(env, value)) {
                    if (!decl.type.isTuple) {
                        for (var name in binders)
                            env.setVar(name, value);
                    } else {
                        for (var name in binders)
                            env.setVar(name, value[binders[name]]);
                    }
                    cont();
                }
            }
        }];
    },

    _getSchema: function(kind, where, name) {
        if (this._schemaRetriever === null)
            return Q(null);

        return this._schemaRetriever.getSchema(kind).then(function(fullSchema) {
            if (fullSchema === null)
                return Q(null);

            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name].map(function(typeString) {
                return Type.fromString(typeString);
            });
        });
    },

    compileInputTrigger: function(ast, scope) {
        var selector = ast.selector;
        var name = ast.name;
        var schema;
        if (selector.isBuiltin) {
            var name = selector.name;
            if (!(name in Builtin.Triggers))
                throw new TypeError('Unknown built-in ' + name);
            schema = Q(Builtin.Triggers[name]);
        } else if (selector.isGlobalName) {
            var moduleName = selector.name;
            if (moduleName in this._scope) {
                if (!this._scope[moduleName].isModule)
                    throw new TypeError(moduleName + ' does not name a compute module');
                var module = this._modules[moduleName];
                if (!(ast.name in module.events))
                    throw new TypeError(moduleName + '.' + name + ' does not name a compute event');

                selector = Ast.Selector.ComputeModule(moduleName);
                schema = Q(module.events[ast.name]);
            } else {
                schema = this._getSchema(selector.name, 'triggers', ast.name);
            }
        } else {
            var type = null;

            selector.attributes.forEach(function(attr) {
                if (attr.name === 'type') {
                    if (!attr.value.isString)
                        throw new Error("Invalid type for device attribute \"type\"");
                    if (type !== null)
                        throw new Error("Duplicate device attribute type");
                    type = attr.value.value;
                }
            });
            if (type === null)
                throw new Error("Device type missing in selector, cannot infer schema");

            schema = this._getSchema(type, 'triggers', ast.name);
        }

        return schema.then(function(schema) {
            var params = ast.params;
            var triggerParams = [];
            var binders = {};
            var equalities = [];
            var constchecks = [];
            var reflections = [];
            var anyBinderOrNull = false;

            if (schema !== null) {
                if (params.length > schema.length)
                    throw new TypeError('Invalid number of parameters for trigger');
            }

            for (var i = 0; i < params.length; i++) {
                var param = params[i];
                if (param.isNull) {
                    anyBinderOrNull = true;
                    continue;
                }
                if (param.isBinder) {
                    if (param.name in scope) {
                        if (schema !== null)
                            schema[i] = typeUnify(schema[i], scope[param.name]);
                        if (!anyBinderOrNull)
                            triggerParams.push(Ast.Expression.VarRef(param.name));

                        if (scope[param.name].isFeed)
                            continue;
                        if (param.name in binders)
                            reflections.push([i, binders[param.name]]);
                        else
                            equalities.push([i, param.name]);
                    } else {
                        anyBinderOrNull = true;
                        binders[param.name] = i;
                        if (schema !== null)
                            scope[param.name] = schema[i];
                        else
                            scope[param.name] = Type.Any;
                    }
                } else {
                    var constexpr = this.compileConstant(param.value);
                    if (schema !== null)
                        typeUnify(schema[i], constexpr[0]);
                    var constvalue = constexpr[1]();
                    // FIXME typeUnify with schema for trigger
                    constchecks.push([i, constvalue]);
                    if (!anyBinderOrNull)
                        triggerParams.push(Ast.Expression.Constant(this.normalizeConstant(param.value)));
                }
            }

            function triggerIsTrue(env) {
                if (env.triggerValue === null)
                return;

                for (var i = 0; i < equalities.length; i++) {
                    var equal = equalities[i];
                    if (!Builtin.equality(env.triggerValue[equal[0]],
                                          env.readVar(equal[1])))
                        return false;
                }
                for (var i = 0; i < constchecks.length; i++) {
                    var constcheck = constchecks[i];
                    if (!Builtin.equality(env.triggerValue[constcheck[0]],
                                          constcheck[1]))
                        return false;
                }
                for (var i = 0; i < reflections.length; i++) {
                    var refl = reflections[i];
                    if (!Builtin.equality(env.triggerValue[refl[0]],
                                          env.triggerValue[refl[1]]))
                        return false;
                }

                return true;
            }

            return [selector, name, triggerParams, function(env, cont) {
                if (triggerIsTrue(env)) {
                    for (var name in binders)
                        env.setVar(name, env.triggerValue[binders[name]]);
                    cont();
                }
            }];
        }.bind(this));
    },

    compileInputBinding: function(ast, scope) {
        var name = ast.name;
        var expr = this.compileExpression(ast.expr, scope);
        var exprop = expr[1];

        if (name in scope) {
            scope[name] = typeUnify(scope[name], expr[0]);
            return function(env) {
                return Builtin.equality(env.readVar(name), exprop(env));
            }
        } else {
            scope[name] = expr[0];
            return function(env) {
                env.setVar(name, exprop(env));
                return true;
            }
        }
    },

    compileInputMemberBinding: function(ast, scope) {
        var name = ast.name;
        if (name in scope)
            throw new TypeError('Duplicate member binding expression for ' + name);
        scope[name] = Type.User;
        return name;
    },

    compileCondition: function(ast, scope) {
        var expr = this.compileExpression(ast.expr, scope);
        typeUnify(expr[0], Type.Boolean);
        return expr[1];
    },

    compileRegex: function(argsast, scope) {
        if (argsast.length < 2) {
            throw new TypeError("Function regex does not accept " +
                                argsast.length + " arguments");
        }

        var argsexp = argsast.slice(0, 3).map(function(arg) {
            return this.compileExpression(arg, scope);
        }, this);
        typeUnify(argsexp[0][0], Type.String);
        typeUnify(argsexp[1][0], Type.String);
        if (argsast.length >= 3)
            typeUnify(argsexp[2][0], Type.String);
        var strOp = argsexp[0][1];
        var regexStrOp = argsexp[1][1];
        var flagOp;
        if (argsast.length >= 3)
            flagOp = argsexp[2][1];
        else
            flagOp = function() { return undefined; };

        var regexpOp;
        if (argsast[1].isConstant &&
            (argsast.length <= 2 || argsast[2].isConstant)) {
            var regexp;
            if (argsast.length >= 3)
                regexp = new RegExp(argsexp[1][1](), argsexp[2][1]());
            else
                regexp = new RegExp(argsexp[1][1]());
            regexpOp = function() {
                return regexp;
            }
        } else {
            regexpOp = function(env) {
                return new RegExp(regexStrOp(env), flagOp(env));
            }
        }

        if (argsast.length <= 3) {
            return function(env, cont) {
                var regex = regexpOp(env);
                var str = strOp(env);
                if (regex.test(str))
                    cont();
            };
        } else {
            var bindersast = argsast.slice(3);
            var binderops = new Array(bindersast.length);

            for (var i = 0; i < bindersast.length; i++) {
                (function() {
                    var binder = bindersast[i];
                    if (binder.isVarRef && !(binder.name in scope)) {
                        scope[binder.name] = Type.String;
                        binderops[i] = function(env, group) {
                            env.setVar(binder.name, group);
                            return true;
                        }
                    } else {
                        var binderexp = this.compileExpression(binder, scope);
                        typeUnify(binderexp[0], Type.String);
                        var binderop = binderexp[1];
                        binderops[i] = function(env, group) {
                            return group === binderop(env);
                        }
                    }
                })();
            }

            return function(env, cont) {
                var regex = regexpOp(env);
                var str = strOp(env);
                var exec = regex.exec(str);
                if (exec === null)
                    return;
                for (var i = 0; i < binderops.length; i++) {
                    var group = exec[i+1];
                    if (!group)
                        group = '';
                    if (!binderops[i](env, group))
                        return;
                }
                cont();
            };
        }
    },

    compileContains: function(argsast, scope) {
        if (argsast.length !== 2) {
            throw new TypeError("Function contains does not accept " +
                                argsast.length + " arguments");
        }

        if (argsast[1].isVarRef && !(argsast[1].name in scope)) {
            var arrayexp = this.compileExpression(argsast[0], scope);
            var type = null;
            try {
                type = typeUnify(arrayexp[0], Type.Array(Type.Any));
            } catch(e) { }
            if (type === null) {
                try {
                    type = typeUnify(arrayexp[0], Type.Map(Type.Any, Type.Any));
                } catch(e) { }
            }
            if (type === null)
                throw new TypeError("Invalid first argument to $contains");

            var arrayop = arrayexp[1];
            var name = argsast[1].name;
            if (type.isArray) {
                scope[name] = type.elem;
                return function(env, cont) {
                    var array = arrayop(env);
                    array.forEach(function(elem) {
                        env.setVar(name, elem);
                        cont();
                    });
                }
            } else {
                scope[name] = type.key;
                return function(env, cont) {
                    var map = arrayop(env);
                    if (!(map instanceof Immutable.Map))
                        map = new Immutable.Map(map);
                    return map.forEach(function(value, key) {
                        env.setVar(name, key);
                        cont();
                    });
                }
            }
        } else {
            var filter = this.compileFunctionCall('contains', argsast, scope);
            typeUnify(filter[0], Type.Boolean);
            return function(env, cont) {
                if (filter[1](env))
                    cont();
            }
        }
    },

    compileBuiltinPredicate: function(ast, scope) {
        if (ast.expr.name === 'regex') {
            return this.compileRegex(ast.expr.args, scope);
        } else if (ast.expr.name === 'contains') {
            return this.compileContains(ast.expr.args, scope);
        } else {
            var filter = this.compileCondition(ast, scope);
            return function(env, cont) {
                if (filter(env))
                    cont();
            };
        }
    },

    analyzeExpression: function(expr, state, scope) {
        if (expr.isConstant || expr.isFeedKeywordRef)
            return;

        if (expr.isVarRef) {
            if (expr.name in this._keywords || expr.name in scope)
                return;
            state[expr.name] = true;
        } else if (expr.isMemberRef) {
            this.analyzeExpression(expr.object, state, scope);
        } else if (expr.isFunctionCall) {
            expr.args.forEach(function(arg) {
                this.analyzeExpression(arg, state, scope);
            }, this);
        } else if (expr.isUnaryOp) {
            this.analyzeExpression(expr.arg, state, scope);
        } else if (expr.isBinaryOp) {
            this.analyzeExpression(expr.lhs, state, scope);
            this.analyzeExpression(expr.rhs, state, scope);
        }
    },

    analyzeInputBinding: function(ast, scope) {
        // "x = y" parsed as name x, expr y, could also be name y, expr x
        // we return null to signal that
        if (ast.expr.isVarRef)
            return null;

        var state = {};
        this.analyzeExpression(ast.expr, state, scope);
        return Object.keys(state);
    },

    reorderInputBindings: function(bindings, scope) {
       var bindinganalysis = [];
        for (var i = 0; i < bindings.length; i++) {
            bindinganalysis.push(this.analyzeInputBinding(bindings[i], scope));
        }

        var backtrackorder = [];
        var backtrackscope = {};
        function backtrack(i) {
            if (i === bindings.length)
                return true;

            for (var j = 0; j < bindings.length; j++) {
                if (bindings[j] === null)
                    continue;

                var binding = bindings[j];
                // try to assign bindings[j] to the order

                // first, check that it is possible
                var analysis = bindinganalysis[j];
                if (analysis !== null) {
                    if (!analysis.every(function(req) { return !!backtrackscope[req]; }))
                        continue;

                    bindings[j] = null;
                    backtrackorder[i] = binding;
                    var setscope = false;
                    if (!backtrackscope[binding.name] &&
                        !(binding.name in scope)) {
                        backtrackscope[binding.name] = true;
                        setscope = true;
                    }

                    if (backtrack(i+1))
                        return true;

                    bindings[j] = binding;
                    if (setscope)
                        backtrackscope[binding.name] = false;
                } else {
                    var rhs = binding.name;
                    var lhs = binding.expr.name;

                    if ((!!backtrackscope[rhs] || rhs in scope) &&
                        (!!backtrackscope[lhs] || lhs in scope)) {
                        // both are bound, this is an equality not a binding
                        var binding = bindings[j];
                        bindings[j] = null;
                        backtrackorder[i] = binding;
                        if (backtrack(i+1))
                            return true;
                        bindings[j] = binding;
                        // we didn't touch the scope at this point, so if it failed
                        // there is no point is trying again with this binding
                        continue;
                    }

                    if (!!backtrackscope[rhs] || rhs in scope) {
                        // rhs is bound, so lhs is being assigned -- reverse the binding
                        var originalbinding = bindings[j];
                        bindings[j] = null;
                        backtrackorder[i] = Ast.InputSpec.Binding(lhs, Ast.Expression.VarRef(rhs));
                        backtrackscope[lhs] = true;

                        if (backtrack(i+1))
                            return true;

                        bindings[j] = originalbinding;
                        backtrackscope[lhs] = false;
                    }

                    if (!!backtrackscope[lhs] || lhs in scope) {
                        // lhs is bound, so rhs is being assigned
                        var binding = bindings[j];
                        bindings[j] = null;
                        backtrackorder[i] = binding;
                        backtrackscope[rhs] = true;

                        if (backtrack(i+1))
                            return true;

                        bindings[j] = binding;
                        backtrackscope[rhs] = false;
                    }

                    // neither is in scope, or neither order worked, move on
                }
            }

            // no assignment possible at this step
            return false;
        }

        if (!backtrack(0))
            throw new TypeError("Could not find a valid order of assignments");

        return backtrackorder;
    },

    compileInputs: function(ast) {
        var inputs = ast.inputs.slice();

        // order trigger -> member binding -> keyword -> binding -> condition
        function inputClass(a) {
            if (a.isTrigger)
                return 0;
            else if (a.isMemberBinding)
                return 1;
            else if (a.isKeyword)
                return 2;
            else if (a.isBuiltinPredicate)
                return 3;
            else if (a.isBinding)
                return 4;
            else if (a.isCondition)
                return 5;
        }
        inputs.sort(function(a, b) {
            var va = inputClass(a);
            var vb = inputClass(b);
            return va - vb;
        });

        var trigger = null;
        var memberBindings = [];
        var memberBindingKeywords = {};
        var keywords = {};
        var inputFunctions = [];
        var filterFunctions = [];
        var scope = {};
        for (var name in this._scope)
            scope[name] = this._scope[name];
        if (this._feedAccess)
            scope.self = Type.User;
        var bindings = [];
        var builtinPredicates = [];
        var conditions = [];

        return Q.try(function() {
            if (inputs[0].isTrigger) {
                return this.compileInputTrigger(inputs[0], scope).then(function(compiled) {
                    trigger = { selector: compiled[0],
                                name: compiled[1],
                                params: compiled[2], };
                    inputFunctions.push(compiled[3]);
                    return 1;
                });
            } else {
                return 0;
            }
        }.bind(this)).then(function(start) {
            for (var i = start; i < inputs.length; i++) {
                var input = inputs[i];

                if (input.isMemberBinding) {
                    var compiled = this.compileInputMemberBinding(input, scope);
                    memberBindings.push(compiled);
                    memberBindingKeywords[compiled] = [];
                } else if (input.isKeyword) {
                    var compiled = this.compileInputKeyword(input, scope);
                    // XXX: find a better way than monkey-patching an ADT
                    compiled[0].owner = compiled[1];
                    if (compiled[0].feedAccess && compiled[1] !== 'self')
                        memberBindingKeywords[compiled[1]].push(compiled[0].name);
                    // check if this keyword was already accessed in this rule,
                    // and avoid adding it again
                    if (compiled[0].name in keywords) {
                        console.log('Duplicate keyword ' + compiled[0].name + ' in rule');
                        // merge owners
                        if (compiled[0].owner !== keywords[compiled[0].name].owner) {
                            keywords[compiled[0].name].owner = null;
                            compiled[0].owner = null;
                        }
                    } else {
                        keywords[compiled[0].name] = compiled[0];
                    }
                    inputFunctions.push(compiled[2]);
                } else if (input.isBuiltinPredicate) {
                    builtinPredicates.push(input);
                } else if (input.isBinding) {
                    bindings.push(input);
                } else if (input.isCondition) {
                    conditions.push(input);
                } else {
                    throw new TypeError();
                }
            }

            for (var i = 0; i < builtinPredicates.length; i++)
                inputFunctions.push(this.compileBuiltinPredicate(builtinPredicates[i], scope));

            // bindings further need to be sorted so that the variables they need
            // are in scope
            // this is complicated by the fact that bindings like "x := y" are
            // indistinguishable from "y := x", so we need to explore both possibilities
            // we run a quick backtracking search, as the number of bindings should
            // be small anyway
            bindings = this.reorderInputBindings(bindings, scope);

            for (var i = 0; i < bindings.length; i++)
                filterFunctions.push(this.compileInputBinding(bindings[i], scope));

            for (var i = 0; i < conditions.length; i++)
                filterFunctions.push(this.compileCondition(conditions[i], scope));

            function fullFilter(env, cont) {
                for (var i = 0; i < filterFunctions.length; i++)
                    if (!filterFunctions[i](env))
                        return;
                cont();
            }
            inputFunctions.push(fullFilter);

            function fullInput(env, cont) {
                function next(i) {
                    if (i === inputFunctions.length) {
                        cont();
                    } else {
                        inputFunctions[i](env, function() {
                            next(i+1);
                        });
                    }
                }

                return next(0);
            }

            var memberCaller = null;

            // fast path simple cases
            if (memberBindings.length === 0) {
                memberCaller = fullInput;
            } else if (memberBindings.length === 1) {
                var memberBinding = memberBindings[0];
                memberCaller = function(env, cont) {
                    var members = env.getFeedMembers();
                    if (env.changedMember !== null) {
                        env.setMemberBinding(memberBinding, env.changedMember);
                        env.setVar(memberBinding, members[env.changedMember]);
                        fullInput(env, cont);
                    } else {
                        for (var j = 0; j < members.length; j++) {
                            env.setMemberBinding(memberBinding, j);
                            env.setVar(memberBinding, members[j]);
                            fullInput(env, cont);
                        }
                    }
                };
            } else {
                memberCaller = function(env, cont) {
                    var fixed;

                    function next(i) {
                        if (i === memberBindings.length) {
                            fullInput(env, cont);
                            return;
                        }

                        var members = env.getFeedMembers();
                        if (i === fixed) {
                            env.setMemberBinding(memberBindings[i], env.changedMember);
                            env.setVar(memberBindings[i], members[env.changedMember]);
                            next(i+1);
                        } else {
                            for (var j = 0; j < members.length; j++) {
                                env.setMemberBinding(memberBindings[i], j);
                                env.setVar(memberBindings[i], members[j]);
                                next(i+1);
                            }
                        }
                    }

                    if (env.changedMember !== null) {
                        // fix bindings that use keywords that changed
                        //
                        // so for A[m1], B[m1], C[m2], if A[0] changes
                        // we fix m1 to 0 and let m2 vary, because A is in m1's memberBindingKeywords
                        // we don't fix m2 to 0 and let m1 vary, because C did not change
                        //
                        // for A[m1], A[m2], if A[0] changes
                        // first we fix m1 to 0 and let m2 vary,
                        // then we fix m2 to 0 and let m1 vary
                        for (var i = 0; i < memberBindings.length; i++) {
                            if (memberBindingKeywords[memberBindings[i]].indexOf(env.changedKeyword) != -1) {
                                fixed = i;
                                next(0);
                            }
                        }
                    } else {
                        // fix nothing
                        fixed = -1;
                        next(0);
                    }
                }
            }

            return {
                trigger: trigger,
                keywords: keywords,
                caller: memberCaller,
                scope: scope,
            };
        }.bind(this));
    },

    compileOutput: function(ast, scope) {
        var output = ast.output;

        var params = output.params.map(function(param) {
            return this.compileExpression(param, scope);
        }, this);

        var action = null;
        var keyword = null;
        var owner = null;
        var type = null;
        return Q.try(function() {
            if (output.isAction) {
                action = { selector: output.selector,
                           name: output.name,
                           params: [] };

                var schema;
                if (output.selector.isBuiltin) {
                    var name = output.selector.name;
                    if (!(name in Builtin.Actions))
                        throw new TypeError('Unknown built-in ' + name);
                    schema = Q(Builtin.Actions[name]);
                } else if (output.selector.isGlobalName) {
                    var moduleName = output.selector.name;
                    if (moduleName in this._scope) {
                        if (!this._scope[moduleName].isModule)
                            throw new TypeError(moduleName + ' does not name a compute module');
                        var module = this._modules[moduleName];
                        var name = output.name;
                        if (!(name in module.functions))
                            throw new TypeError(moduleName + '.' + name + ' does not name a compute function');

                        action.selector = Ast.Selector.ComputeModule(moduleName);
                        schema = Q(module.functions[name].schema);
                    } else {
                        schema = this._getSchema(output.selector.name, 'actions', output.name);
                    }
                } else {
                    schema = this._getSchema(output.selector.name, 'actions', output.name);
                }

                return schema.then(function(schema) {
                    type = Type.Tuple(schema);

                    if (schema !== null) {
                        if (params.length > schema.length)
                            throw new TypeError('Invalid number of parameters for action');

                        params.forEach(function(p, i) {
                            typeUnify(p[0], schema[i]);
                        });
                    }
                });
            } else {
                keyword = output.keyword;
                owner = output.owner;

                if (owner !== null && !keyword.feedAccess)
                    throw new TypeError('Invalid ownership operator on private keyword');
                if (owner === null && keyword.feedAccess)
                    throw new TypeError('Missing ownership operator on feed-accessible keyword');
                if (owner !== null && owner !== 'self' &&
                    (!(owner in scope) || !scope[owner].isUser))
                    throw new TypeError('Invalid or unbound ownership operator ' + owner);

                if (!(keyword.name in this._keywords)) {
                    var decl = {
                        feedAccess: keyword.feedAccess,
                        extern: false,
                        schema: null
                    };
                    if (decl.feedAccess && !this._feedAccess)
                        throw new TypeError("Feed-accessible keyword declared in non feed-parametric program");

                    decl.schema = params.map(function(p) { return p[0]; });
                    decl.type = Type.Tuple(decl.schema);
                    type = decl.type;
                    this._keywords[keyword.name] = decl;
                } else {
                    var decl = this._keywords[keyword.name];
                    if (keyword.feedAccess !== decl.feedAccess)
                        throw new TypeError('Inconsistent use of keyword feed specifier');
                    if (params.length !== decl.schema.length)
                        throw new TypeError('Invalid number of parameters for keyword');

                    params.forEach(function(p, i) {
                        decl.schema[i] = typeUnify(p[0], decl.schema[i]);
                    });
                    type = decl.type;
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
                    if (type.isTuple)
                        return toJS(type, v);
                    else
                        return toJS(type, v[0]);
                }
            };
        }.bind(this));
    },

    compileRule: function(ast) {
        this._currentKeywords = [];
        return this.compileInputs(ast).then(function(inputs) {
            var scope = inputs.scope;
            delete inputs.scope;
            return this.compileOutput(ast, scope).then(function(output) {
                var retval = { inputs: inputs, output: output };

                this._currentKeywords.forEach(function(kw) {
                    kw.watched = false;
                    if (kw.name in inputs.keywords) {
                        inputs.keywords[kw.name].owner = null;
                        kw.owner = null;
                    } else {
                        inputs.keywords[kw.name] = kw;
                    }
                });

                // turn keywords from an object into an array
                var keywordArray = [];
                for (var name in inputs.keywords)
                    keywordArray.push(inputs.keywords[name]);
                inputs.keywords = keywordArray;

                /*console.log('*** dump scope ***');
                for (var name in scope)
                    console.log('scope[' + name + ']: ' + scope[name]);
                */

                return retval;
            }.bind(this));
        }.bind(this));
    },

    compileModule: function(ast) {
        var module = { events: {}, functions: {} };
        var scope = {};

        ast.statements.forEach(function(stmt) {
            if (stmt.name in scope || stmt.name in this._scope)
                throw new TypeError("Declaration " + stmt.name + " shadows existing name");
            if (stmt.isEventDecl) {
                var event = {};
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
                scope[stmt.name] = module.functions[stmt.name];
            } else {
                throw new TypeError();
            }
        }, this);

        return module;
    },

    compileVarDecl: function(ast) {
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
    },

    compileCode: function(code, state) {
        return this.compileProgram(Grammar.parse(code), state);
    },

    compileProgram: function(ast, state) {
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
            }
        }, this);

        return Q.all(this._rules);
    },
});

