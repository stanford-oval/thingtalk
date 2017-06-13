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
        filter.op = ft.op;
        return;
    }

    throw new TypeError('Invalid parameter types for ' + filter.operator);
}

function legacyMakeSchema(ast) {
    // make up a schema on the fly
    ast.schema = {
        kind_type: 'other',
        args: [],
        index: {},
        inReq: [],
        inOpt: {},
        out: {}
    };

    let i = 0;
    for (let inParam of ast.in_params) {
        let pos = i++;
        ast.schema.args[pos] = inParam.name;
        ast.schema.index[inParam.name] = pos;
        ast.schema.inOpt[inParam.name] = Type.Any;
    }
    for (let outParam of ast.out_params) {
        let pos = i++;
        ast.schema.args[pos] = outParam.value;
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
        for (let filter of ast.filters) {
            let paramType = schema.out[filter.name];
            if (!paramType)
                throw new TypeError('Invalid output parameter ' + filter.name);

            resolveFilterOverload(paramType, filter, scope);
        }
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
        if (ast.in_params.length || ast.out_params.length || ast.filters.length)
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
        if (ast.filters.length || ast.out_params.length)
            throw new TypeError('Actions cannot have filters or output parameters');
    });
}

function compileEvent(name) {
    let hint = name ? 'string-' + name : 'string';
    return function(env) {
        return env.formatEvent(hint);
    };
}

function compileValue(ast) {
    if (ast.isUndefined)
        throw new Error('Invalid undefined value, should have been slot-filled');
    if (ast.isEvent)
        return compileEvent(ast.name);
    if (ast.isVarRef) {
        const name = ast.name;
        return function(env) { return env.readVar(name); };
    } else {
        const value = ast.toJS();
        return function(env) { return value; };
    }
}

function compileTriggerOrQuery(ast, paramAccess) {
    let filterFunctions = new Array(ast.filters.length);
    let i = 0;
    for (let filter of ast.filters) {
        const op = filter.op;
        const lhs = paramAccess(ast, filter.name);
        const rhs = compileValue(filter.value);
        filterFunctions[i++] = function(env) {
            return op(lhs(env), rhs(env));
        };
    }
    let filterFn = function(env) {
        for (let fn of filterFunctions) {
            if (!fn(env))
                return false;
        }
        return true;
    };

    let outputFunctions = new Array(ast.out_params.length);
    i = 0;
    for (let outParam of ast.out_params) {
        let vname = outParam.name;
        let p = paramAccess(ast, outParam.value);
        outputFunctions[i++] = function(env) {
            let v = p(env);
            env.setVar(vname, v);
        };
    }
    let outputFn = function(env) {
        for (let fn of outputFunctions)
            fn(env);
    };

    return [filterFn, outputFn];
}

function compileTriggerParamAccess(ast, paramName) {
    const idx = ast.schema.index[paramName];
    assert(idx >= 0 && idx < ast.schema.args.length);
    return function(env) {
        return env.triggerValue[idx];
    };
}

function compileTrigger(ast) {
    let triggerParams = new Array(ast.schema.args.length);
    for (let inParam of ast.in_params)
        triggerParams[ast.schema.index[inParam.name]] = inParam.value;

    let [filterFn, outputFn] = compileTriggerOrQuery(ast, compileTriggerParamAccess);

    return Ir.Invocation.Trigger(ast.__effectiveSelector, ast.channel, triggerParams, filterFn, outputFn, false);
}

function compileQueryOutParamAccess(ast, paramName) {
    const idx = ast.schema.index[paramName];
    assert(idx >= 0 && idx < ast.schema.args.length);
    return function(env) {
        return env.queryValue[idx];
    };
}

function compileQuery(ast) {
    let queryParams = new Array(ast.schema.args.length);
    for (let inParam of ast.in_params)
        queryParams[ast.schema.index[inParam.name]] = compileValue(inParam.value);
    for (let i = 0; i < queryParams.length; i++) {
        if (!queryParams[i])
            queryParams[i] = function(){};
    }

    let [filterFn, outputFn] = compileTriggerOrQuery(ast, compileQueryOutParamAccess);

    return Ir.Invocation.Query(ast.__effectiveSelector, ast.channel, queryParams, filterFn, outputFn);
}

function compileAction(ast) {
    if (ast.selector.isBuiltin) {
        return {
            selector: ast.selector,
            channel: ast.channel,
            params: []
        };
    }

    let actionParams = new Array(ast.schema.args.length);
    for (let inParam of ast.in_params)
        actionParams[ast.schema.index[inParam.name]] = compileValue(inParam.value);
    for (let i = 0; i < actionParams.length; i++) {
        if (!actionParams[i])
            actionParams[i] = function(){};
    }

    return Ir.Invocation.Action(ast.__effectiveSelector, ast.channel, actionParams);
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

