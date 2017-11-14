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

function resolveTypeVars(type, typeScope) {
    if (type === 'string')
        return resolveTypeVars(typeScope[type], typeScope);
    if (type.isArray)
        return Type.Array(resolveTypeVars(type.elem, typeScope));
    if (type.isTuple)
        return Type.Tuple(type.schema.map((t) => resolveTypeVars(t, typeScope)));
    return type;
}

function resolveFilterOverload(paramType, filter, scope) {
    let ft = Builtin.BinaryOps[filter.operator];
    if (!ft)
        throw new TypeError('Invalid operator ' + filter.operator);

    let valueType = typeForValue(filter.value, scope);
    for (let overload of ft.types) {
        let typeScope = {};
        if (!Type.isAssignable(paramType, overload[0], typeScope, true))
            continue;
        if (!Type.isAssignable(valueType, overload[1], typeScope, true))
            continue;
        if (!Type.isAssignable(overload[2], Type.Boolean, typeScope, true))
            continue;

        filter.overload = overload.map((t) => resolveTypeVars(t, typeScope));
        return;
    }

    throw new TypeError('Invalid parameter types ' + paramType + ' and ' + valueType + ' for ' + filter.operator);
}

function typeCheckInputArgs(ast, scope, classes) {
    let schema = ast.schema;
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
        if (presentParams.has(inParam.name))
            throw new TypeError('Duplicate input param ' + inParam.name);
        presentParams.add(inParam.name);
    }
    for (let inParam in schema.inReq) {
        if (!presentParams.has(inParam))
            throw new TypeError('Missing required parameter ' + inParam);
    }
}

function typeCheckFilter(ast, schema, scope, schemas, classes, useMeta) {
    return (function recursiveHelper(ast) {
        if (ast.isTrue || ast.isFalse)
            return Q();
        if (ast.isAnd || ast.isOr)
            return Q.all(ast.operands.map((op) => recursiveHelper(op)));
        if (ast.isNot)
            return recursiveHelper(ast.expr);

        if (ast.isAtom) {
            let filter = ast.filter;
            let paramType = schema.inReq[filter.name] || schema.inOpt[filter.name] || schema.out[filter.name] || scope[filter.name];
            if (!paramType)
                throw new TypeError('Invalid filter parameter ' + filter.name);

            resolveFilterOverload(paramType, filter, scope);
            return Q();
        } else {
            assert(ast.isExternal);
            return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
                typeCheckInputArgs(ast, scope, classes);
                return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
            });
        }
    })(ast);
}

function ensureSchema(schemas, classes, prim, primType, useMeta) {
    if (prim.schema)
        return Q();
    if (prim.selector.isBuiltin && primType === 'action') {
        if (prim.channel === 'notify')
            prim.schema = Builtin.Actions.notify;
        else if (prim.channel === 'return')
            prim.schema = Builtin.Actions['return'];
        else
            throw new TypeError('Invalid builtin action ' + prim.channel);
        return Q();
    }
    if (prim.selector.isBuiltin && primType === 'query') {
        if (prim.channel === 'query')
            prim.schema = Builtin.Queries.query;
        else
            throw new TypeError('Invalid builtin query ' + prim.channel);
        return Q();
    }

    let schemaType;
    switch (primType) {
    case 'trigger':
        schemaType = 'triggers';
        break;
    case 'query':
        schemaType = 'queries';
        break;
    case 'action':
        schemaType = 'actions';
        break;
    }
    return Utils.getSchemaForSelector(schemas, prim.selector.kind, prim.channel, schemaType, useMeta, classes).then((schema) => {
        prim.schema = schema;
    });
}

function typeCheckInput(ast, schemas, scope, forTrigger, classes, useMeta = false) {
    return ensureSchema(schemas, classes, ast, forTrigger ? 'trigger':'query', useMeta).then(() => {
        typeCheckInputArgs(ast, scope, classes);
        return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
    }).then(() => {
        let schema = ast.schema;
        for (let outParam of ast.out_params) {
            let outParamType = schema.out[outParam.value];
            if (!outParamType)
                throw new TypeError('Invalid output parameter ' + outParam.value);
            scope[outParam.name] = outParamType;
        }
    });
}

function typeCheckOutput(ast, schemas, scope, classes, useMeta = false) {
    return ensureSchema(schemas, classes, ast, 'action', useMeta).then(() => {
        typeCheckInputArgs(ast, scope, classes);
        if (!ast.filter.isTrue || ast.out_params.length)
            throw new TypeError('Actions cannot have filters or output parameters');
    });
}

function typeCheckRule(ast, schemas, params, classes, useMeta = false) {
    const scope = {};
    for (let name in params)
        scope[name] = params[name];

    return Promise.resolve().then(() => {
        if (ast.trigger !== null)
            return typeCheckInput(ast.trigger, schemas, scope, true, classes, useMeta);
        else
            return null;
    }).then(() => {
        function typeCheckQueryLoop(i) {
            if (i === ast.queries.length)
                return Q();
            return typeCheckInput(ast.queries[i], schemas, scope, false, classes, useMeta).then(() => typeCheckQueryLoop(i+1));
        }
        return typeCheckQueryLoop(0);
    }).then(() => Promise.all(ast.actions.map((action) => typeCheckOutput(action, schemas, scope, classes, useMeta))));
}

function typeCheckProgram(ast, schemas, useMeta = false) {
    const params = {};
    ast.params.forEach((ast) => {
        params[ast.name] = ast.type;
    });
    const classes = {};
    ast.classes.forEach((ast) => {
        classes[ast.name] = ast;
    });

    return Promise.all(ast.rules.map((rule) => typeCheckRule(rule, schemas, params, classes, useMeta)));
}

function getAllowedSchema(allowed, schemaType, schemas, getMeta) {
    if (!allowed.isSpecified)
        return Promise.resolve();
    if (allowed.schema) {
        return Promise.resolve(allowed.schema);
    } else {
        return Utils.getSchemaForSelector(schemas, allowed.kind, allowed.channel, schemaType, getMeta, {})
            .then((schema) => {
                allowed.schema = schema;
                return schema;
            });
    }
}

function typeCheckPermissionRule(permissionRule, schemas, getMeta = false) {
    return Promise.all([
        getAllowedSchema(permissionRule.trigger, 'triggers', schemas, getMeta),
        getAllowedSchema(permissionRule.query, 'queries', schemas, getMeta),
        getAllowedSchema(permissionRule.action, 'actions', schemas, getMeta)
    ]).then(() => {
        const scope = {
            __pi: Type.Entity('tt:contact')
        };
        function typecheckPermissionFunction(fn) {
            if (!fn.isSpecified)
                return Promise.resolve();

            return typeCheckFilter(fn.filter, fn.schema, scope, schemas, {}, getMeta).then(() => {
                for (let outParam of fn.out_params) {
                    let ptype = fn.schema.inReq[outParam.value] || fn.schema.inOpt[outParam.value] || fn.schema.out[outParam.value];
                    scope[outParam.name] = ptype;
                }
            });
        }
        if (permissionRule.principal !== null) {
            if (['tt:contact', 'tt:contact_name', 'tt:contact_group',
                 'tt:contact_group_name'].indexOf(permissionRule.principal.type) < 0)
                throw new TypeError('Invalid principal type ' + permissionRule.principal.type);
        }

        return typecheckPermissionFunction(permissionRule.trigger).then(() =>
            typecheckPermissionFunction(permissionRule.query)).then(() =>
            typecheckPermissionFunction(permissionRule.action));
    });
}

module.exports = {
    typeCheckInput,
    typeCheckOutput,
    typeCheckRule,
    typeCheckProgram,
    typeCheckFilter,
    typeCheckPermissionRule
};
