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
                ast.operands.forEach((op) => typeCheckBoolean(op));
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
        ast.schema = Builtin.Actions.notify;
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

function typeCheckRule(ast, schemas, params, classes) {
    const scope = {};
    for (let name in params)
        scope[name] = params[name];

    return Q.try(() => {
        if (ast.trigger !== null)
            return typeCheckInput(ast.trigger, schemas, scope, true, classes);
        else
            return null;
    }).then(() => {
        function typeCheckQueryLoop(i) {
            if (i === ast.queries.length)
                return Q();
            return typeCheckInput(ast.queries[i], schemas, scope, false, classes).then(() => typeCheckQueryLoop(i+1));
        }
        return typeCheckQueryLoop(0);
    }).then(() => Q.all(ast.actions.map((action) => typeCheckOutput(action, schemas, scope, classes))));
}

function typeCheckProgram(ast, schemas) {
    const params = {};
    ast.params.forEach((ast) => {
        params[ast.name] = ast.type;
    });
    const classes = {};
    ast.classes.forEach((ast) => {
        classes[ast.name] = ast;
    });

    return Q.all(ast.rules.map((rule) => typeCheckRule(rule, schemas, params, classes)));
}

module.exports = {
    typeCheckInput,
    typeCheckOutput,
    typeCheckRule,
    typeCheckProgram
}
