// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const assert = require('assert');

const Ast = require('./ast');
const Ir = require('./ir');
const Grammar = require('./grammar');
const Type = require('./type');
const Utils = require('./utils');
const Builtin = require('./builtin');
const JSIr = require('./jsir');

function typeForValue(value, scope) {
    if (value.isVarRef) {
        let type;
        if (value.name.startsWith('$event'))
            type = Type.String;
        else if (value.name.startsWith('$context.location'))
            type = Type.Location;
        else
            type = scope[value.name];
        if (!type)
            throw new TypeError('Variable ' + value.name + ' is not in scope');
        return type;
    } else {
        return Ast.typeForValue(value);
    }
}

function resolveFilterOverload(paramType, filter, scope) {
    let ft = Builtin.BinaryOps[filter.operator];
    if (!ft)
        throw new TypeError('Invalid operator ' + filter.operator);
    if (filter.value.isNull)
        throw new TypeError('null is not a valid filter value');

    for (let overload of ft.types) {
        let typeScope = {};
        if (!Type.isAssignable(paramType, overload[0], typeScope, true))
            continue;
        let valueType = typeForValue(filter.value, scope);
        if (!Type.isAssignable(valueType, overload[1], typeScope, true))
            continue;
        if (!Type.isAssignable(overload[2], Type.Boolean, typeScope, true))
            continue;
        filter.overload = overload;
        return;
    }

    throw new TypeError('Invalid parameter types for ' + filter.operator);
}

function legacyMakeSchema(ast) {
    // make up a schema on the fly
    ast.schema = {
        kind_type: 'other',
        args: [],
        types: [],
        index: {},
        inReq: [],
        inOpt: {},
        out: {}
    };

    let i = 0;
    for (let inParam of ast.in_params) {
        let pos = i++;
        ast.schema.args[pos] = inParam.name;
        ast.schema.types[pos] = Type.Any;
        ast.schema.index[inParam.name] = pos;
        ast.schema.inOpt[inParam.name] = Type.Any;
    }
    for (let outParam of ast.out_params) {
        let pos = i++;
        ast.schema.args[pos] = outParam.value;
        ast.schema.types[pos] = Type.Any;
        ast.schema.index[outParam.value] = pos;
        ast.schema.out[outParam.value] = Type.Any;
    }

    console.log('Constructed legacy schema: ' + ast.schema.args);
    return ast.schema;
}

function typeCheckInput(ast, schemas, scope, forTrigger, classes) {
    return Utils.getSchemaForSelector(schemas, ast.selector.kind, ast.channel, forTrigger ? 'triggers':'queries', false, classes).then((schema) => {
        ast.schema = schema;
        if (schema === null)
            schema = legacyMakeSchema(ast);
        if (ast.selector.kind in classes)
            ast.__effectiveSelector = Ast.Selector.Device(classes[ast.selector.kind].extends, ast.selector.id, ast.selector.principal);
        else
            ast.__effectiveSelector = ast.selector;

        var presentParams = new Set;
        for (let inParam of ast.in_params) {
            let inParamType = schema.inReq[inParam.name] || schema.inOpt[inParam.name];
            if (!inParamType)
                throw new TypeError('Invalid input parameter ' + inParam.name);
            if (!Type.isAssignable(typeForValue(inParam.value, scope), inParamType, {}, true))
                throw new TypeError('Invalid type for parameter '+ inParam.name);
            presentParams.add(inParam.name);
        }
        for (let inParam in schema.inReq) {
            if (!presentParams.has(inParam))
                throw new TypeError('Missing required parameter ' + inParam);
        }

        function typeCheckBoolean(ast) {
            if (ast.isTrue || ast.isFalse)
                return;
            if (ast.isAnd || ast.isOr) {
                typeCheckBoolean(ast.lhs);
                typeCheckBoolean(ast.rhs);
                return;
            }
            if (ast.isNot) {
                typeCheckBoolean(ast.expr);
                return;
            }

            let filter = ast.filter;
            let paramType = schema.out[filter.name];
            if (!paramType)
                throw new TypeError('Invalid output parameter ' + filter.name);

            resolveFilterOverload(paramType, filter, scope);
        }
        typeCheckBoolean(ast.filter);

        for (let outParam of ast.out_params) {
            let outParamType = schema.out[outParam.value];
            if (!outParamType)
                throw new TypeError('Invalid output parameter ' + outParam.value);
            scope[outParam.name] = outParamType;
        }
    });
}

function typeCheckOutput(ast, schemas, scope, classes) {
    if (ast.selector.isBuiltin) {
        if (ast.in_params.length || ast.out_params.length || !ast.filter.isTrue)
            throw new TypeError('Cannot specify parameters to notify');
        return Q();
    }

    return Utils.getSchemaForSelector(schemas, ast.selector.kind, ast.channel, 'actions', false, classes).then((schema) => {
        ast.schema = schema;
        if (schema === null)
            schema = legacyMakeSchema(ast);
        if (ast.selector.kind in classes)
            ast.__effectiveSelector = Ast.Selector.Device(classes[ast.selector.kind].extends, ast.selector.id, ast.selector.principal);
        else
            ast.__effectiveSelector = ast.selector;

        var presentParams = new Set;
        for (let inParam of ast.in_params) {
            let inParamType = schema.inReq[inParam.name] || schema.inOpt[inParam.name];
            if (!inParamType)
                throw new TypeError('Invalid input parameter ' + inParam.name);
            if (!Type.isAssignable(typeForValue(inParam.value, scope), inParamType, {}, true))
                throw new TypeError('Invalid type for parameter '+ inParam.name);
            presentParams.add(inParam.name);
        }
        for (let inParam in schema.inReq) {
            if (!presentParams.has(inParam))
                throw new TypeError('Missing required parameter ' + inParam);
        }
        if (!ast.filter.isTrue || ast.out_params.length)
            throw new TypeError('Actions cannot have filters or output parameters');
    });
}

function compileEvent(irBuilder, name) {
    let hint = name ? 'string-' + name : 'string';
    var reg = irBuilder.allocRegister(Type.String);
    irBuilder.add(new JSIr.FormatEvent(hint, reg));
    return reg;
}

function compileValue(irBuilder, ast) {
    if (ast.isUndefined)
        throw new Error('Invalid undefined value, should have been slot-filled');
    if (ast.isEvent)
        return compileEvent(irBuilder, ast.name);
    if (ast.isVarRef) {
        const name = ast.name;
        let reg = irBuilder.allocRegister(Type.Any);
        irBuilder.add(new JSIr.GetVariable(name, reg));
        return reg;
    } else {
        let reg = irBuilder.allocRegister(Type.Any);
        irBuilder.add(new JSIr.LoadConstant(ast, reg));
        return reg;
    }
}

function compileTriggerOrQuery(ast, paramAccess) {
    let irBuilder = new JSIr.IRBuilder();

    function compileFilter(expr) {
        const cond = irBuilder.allocRegister(Type.Boolean);
        if (expr.isTrue) {
            irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), cond));
        } else if (expr.isFalse) {
            irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(false), cond));
        } else if (expr.isAnd || expr.isOr) {
            const lhs = compileFilter(expr.lhs);
            const rhs = compileFilter(expr.rhs);
            if (expr.isAnd)
                irBuilder.add(new JSIr.BinaryOp(lhs, rhs, '&&', cond));
            else
                irBuilder.add(new JSIr.BinaryOp(lhs, rhs, '||', cond));

        } else if (expr.isNot) {
            const op = compileFilter(expr.expr);
            irBuilder.add(new JSIr.UnaryOp(op, '!', cond));
        } else {
            let filter = expr.filter;
            const op = filter.operator;
            const lhs = paramAccess(irBuilder, ast, filter.name);
            const rhs = compileValue(irBuilder, filter.value);
            if (op === '!=') {
                // lower into '!' + '='
                irBuilder.add(new JSIr.BinaryOp(lhs, rhs, '=', cond));
                irBuilder.add(new JSIr.UnaryOp(cond, '!', cond));
            } else {
                irBuilder.add(new JSIr.BinaryOp(lhs, rhs, op, cond));
            }
        }
        return cond;
    }

    let filterResult = compileFilter(ast.filter);
    irBuilder.add(new JSIr.Return(filterResult));
    let filterFn = irBuilder.compile();

    irBuilder = new JSIr.IRBuilder();
    for (let outParam of ast.out_params) {
        let vname = outParam.name;
        let p = paramAccess(irBuilder, ast, outParam.value);
        irBuilder.add(new JSIr.SetVariable(vname, p));
    }
    let outputFn = irBuilder.compile();

    return [filterFn, outputFn];
}

function compileTriggerParamAccess(irBuilder, ast, paramName) {
    let reg = irBuilder.allocRegister(Type.Any);
    irBuilder.add(new JSIr.ReadTriggerValue(ast, paramName, reg));
    return reg;
}

function compileTrigger(ast) {
    let triggerParams = new Array(ast.schema.args.length);
    for (let inParam of ast.in_params)
        triggerParams[ast.schema.index[inParam.name]] = inParam.value;

    let [filterFn, outputFn] = compileTriggerOrQuery(ast, compileTriggerParamAccess);

    return Ir.Invocation.Trigger(ast.__effectiveSelector, ast.channel, triggerParams, filterFn, outputFn, false);
}

function compileQueryOutParamAccess(irBuilder, ast, paramName) {
    var reg = irBuilder.allocRegister(Type.Any);
    irBuilder.add(new JSIr.ReadQueryValue(ast, paramName, reg));
    return reg;
}

function compileInputParams(ast) {
    let irBuilder = new JSIr.IRBuilder();
    let tuple = irBuilder.allocRegister(Type.Tuple(ast.schema.types));
    irBuilder.add(new JSIr.CreateTuple(ast.schema.args.length, tuple));
    for (let inParam of ast.in_params) {
        let reg = compileValue(irBuilder, inParam.value);
        irBuilder.add(new JSIr.SetIndex(tuple, ast.schema.index[inParam.name], reg));
    }
    irBuilder.add(new JSIr.Return(tuple));
    return irBuilder.compile();
}

function compileQuery(ast) {
    let inputFn = compileInputParams(ast);
    let [filterFn, outputFn] = compileTriggerOrQuery(ast, compileQueryOutParamAccess);

    return Ir.Invocation.Query(ast.__effectiveSelector, ast.channel, inputFn, filterFn, outputFn);
}

function compileAction(ast) {
    if (ast.selector.isBuiltin) {
        return {
            selector: ast.selector,
            channel: ast.channel,
            params: () => []
        };
    }

    let inputFn = compileInputParams(ast);
    return Ir.Invocation.Action(ast.__effectiveSelector, ast.channel, inputFn);
}

module.exports = class AppCompiler {
    constructor() {
        this._warnings = [];

        this._name = undefined;
        this._params = {};
        this._classes = {};
        this._rules = [];

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

    _buildScope() {
        let scope = {};
        for (let name in this._params)
            scope[name] = this._params[name];
        return scope;
    }

    _typeCheckAll(trigger, queries, actions) {
        const scope = this._buildScope();

        return Q.try(() => {
            if (trigger !== null)
                return typeCheckInput(trigger, this._schemaRetriever, scope, true, this._classes);
            else
                return null;
        }).then(() => {
            function typeCheckQueryLoop(i) {
                if (i === queries.length)
                    return Q();
                return typeCheckInput(queries[i], this._schemaRetriever, scope, false, this._classes).then(() => typeCheckQueryLoop.call(this, i+1));
            }
            return typeCheckQueryLoop.call(this, 0);
        }).then(() => Q.all(actions.map((action) => typeCheckOutput(action, this._schemaRetriever, scope, this._classes))));
    }

    _compileRuleOrCommand(trigger, queries, actions) {
        let compiledTrigger = trigger !== null ? compileTrigger(trigger) : null;
        let compiledQueries = queries.map((q) => compileQuery(q));
        let compiledActions = actions.map((a) => compileAction(a));
        if (compiledTrigger !== null)
            return Ir.Rule(compiledTrigger, compiledQueries, compiledActions);
        else
            return Ir.Command(compiledQueries, compiledActions);
    }

    verifyRule(ast) {
        return this._typeCheckAll(ast.trigger, ast.queries, ast.actions);
    }

    compileRule(ast) {
        let retval = this._compileRuleOrCommand(ast.trigger, ast.queries, ast.actions);
        if (retval.isRule)
            retval.trigger.once = ast.once;
        return retval;
    }

    compileCode(code) {
        return this.compileProgram(Grammar.parse(code));
    }

    verifyProgram(ast) {
        this._name = ast.name;
        ast.params.forEach((ast) => {
            this._params[ast.name] = ast.type;
        });
        ast.classes.forEach((ast) => {
            this._classes[ast.name] = ast;
        });

        return Q.all(ast.rules.map(this.verifyRule, this));
    }

    compileProgram(ast) {
        return this.verifyProgram(ast).then(() => {
            ast.rules.forEach(function(stmt) {
                this._rules.push(this.compileRule(stmt));
            }, this);
        });
    }
};

