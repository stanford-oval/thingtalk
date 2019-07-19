// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// Typechecking is idempotent (two parallel typechecks of the same program will yield
// functionally equivalent results) so any data race is a false positive
/* eslint-disable require-atomic-updates */

const assert = require('assert');

const Ast = require('./ast');
const Type = require('./type');
const Utils = require('./utils');
const Builtin = require('./builtin/defs');
const Units = require('./units');

const ALLOWED_PRINCIPAL_TYPES = new Set([
    'tt:contact', 'tt:username'
]);

function log(message) {
    let debug = false;
    if (debug) console.log(message);
}

class Scope {
    constructor(parentScope) {
        this._parentScope = parentScope || null;
        this._globalScope = {};
        this.clean();
    }

    has(name) {
        const here = name in this._scope || name in this._lambda_args || name in this._globalScope;
        if (here)
            return true;
        if (this._parentScope)
            return this._parentScope.has(name);
        return false;
    }

    addLambdaArgs(args) {
        for (let name in args)
            this._lambda_args[name] = args[name];
    }

    add(name, type) {
        this._scope[name] = type;
    }
    addAll(args) {
        for (let name in args)
            this._scope[name] = args[name];
    }

    addGlobal(name, schema) {
        if (name in this._globalScope)
            throw new TypeError(name + ' is already declared');
        this._globalScope[name] = schema;
    }

    remove(name) {
        delete this._scope[name];
    }

    merge(scope) {
        Object.assign(this._scope, scope._scope);
    }

    clean() {
        this._scope = {};
        this.$has_event = false;
        this._lambda_args = {};
    }

    cleanOutput() {
        this._scope = {};
    }

    prefix(prefix) {
        let new_scope = {};
        for (let name in this._scope) {
            new_scope[name] = this._scope[name];
            new_scope[prefix + '.' + name] = this._scope[name];
        }
        this._scope = new_scope;
    }

    get(name) {
        let v = this._scope[name] || this._lambda_args[name] || this._globalScope[name];
        if (!v && this._parentScope)
            v = this._parentScope.get(name);
        return v;
    }

    dump() {
        console.log();
        console.log('Scope:');
        for (let name in this._scope)
            console.log(name  +': ' + this._scope[name]);
    }
}

function loadSchema(schemas, classes, prim, primType, useMeta) {
    if (prim.selector.isBuiltin && primType === 'action') {
        if (prim.channel === 'notify')
            return Builtin.Actions.notify;
        else if (prim.channel === 'return')
            return Builtin.Actions['return'];
        else if (prim.channel === 'save')
            return Builtin.Actions['save'];
        else
            throw new TypeError('Invalid builtin action ' + prim.channel);
    }
    if (prim.selector.isBuiltin)
        throw new TypeError('Invalid builtin ' + primType + ' ' + prim.channel);

    return Utils.getSchemaForSelector(schemas, prim.selector.kind, prim.channel, primType, useMeta, classes);
}

function unescape(symbol) {
    return symbol.replace(/_([0-9a-fA-Z]{2}|_)/g, (match, ch) => {
        if (ch === '_') return ch;
        return String.fromCharCode(parseInt(ch, 16));
    });
}

const TYPES = {
    QUOTED_STRING: Type.String,
    NUMBER: Type.Number,
    CURRENCY: Type.Currency,
    DURATION: Type.Measure('ms'),
    LOCATION: Type.Location,
    DATE: Type.Date,
    TIME: Type.Time,

    EMAIL_ADDRESS: Type.Entity('tt:email_address'),
    PHONE_NUMBER: Type.Entity('tt:phone_number'),
    HASHTAG: Type.Entity('tt:hashtag'),
    USERNAME: Type.Entity('tt:username'),
    URL: Type.Entity('tt:url'),
    PATH_NAME: Type.Entity('tt:path_name'),
};

function entityTypeToTTType(entityType) {
    if (entityType.startsWith('GENERIC_ENTITY_'))
        return Type.Entity(entityType.substring('GENERIC_ENTITY_'.length));
    else if (entityType.startsWith('MEASURE_'))
        return Type.Measure(entityType.substring('MEASURE_'.length));
    else
        return TYPES[entityType];
}

function typeForConstant(name) {
    let measure = /__const_NUMBER_([0-9]+)__([a-z0-9A-Z]+)/.exec(name);
    if (measure !== null)
        return Type.Measure(measure[2]);
    measure = /__const_MEASURE__([a-z0-9A-Z]+)_([0-9]+)_/.exec(name);
    if (measure !== null)
        return Type.Measure(measure[1]);

    const entity = unescape(name.substring('__const_'.length));
    const underscoreindex = entity.lastIndexOf('_');
    const entitytype = entity.substring(0, underscoreindex);

    const type = entityTypeToTTType(entitytype);
    if (!type)
        throw new TypeError(`Invalid __const variable ${name}`);
    return type;
}

function typeForValue(value, scope) {
    if (value.isVarRef) {
        if (value.name.startsWith('__const_'))
            return typeForConstant(value.name);

        let type = scope.get(value.name);

        if (!type)
            throw new TypeError('Variable ' + value.name + ' is not in scope');
        return type;
    }
    if (value.isEvent && value.name !== 'program_id' && !scope.$has_event)
        throw new TypeError('Cannot access $event variables in the trigger');

    const type = value.getType();

    if (type.isArray) {
        const typeScope = {};
        const elem = type.elem;

        for (let v of value.value) {
            let vtype = typeForValue(v, scope);
            if (!Type.isAssignable(vtype, elem, typeScope))
                throw new TypeError(`Inconsistent type for array value`);
        }
    }

    return type;
}

function resolveTypeVars(type, typeScope) {
    if (type === 'string')
        return resolveTypeVars(typeScope[type], typeScope);
    if (type.isArray)
        return Type.Array(resolveTypeVars(type.elem, typeScope));
    if (type.isTuple)
        return Type.Tuple(type.schema.map((t) => resolveTypeVars(t, typeScope)));
    if (type.isMeasure && typeScope._unit)
        return Type.Measure(typeScope._unit);
    return type;
}


function typecheckPrincipal(principal) {
    assert(principal.isEntity);
    if (!ALLOWED_PRINCIPAL_TYPES.has(principal.type))
        throw new TypeError(`Invalid principal ${principal}, must be a contact or a group`);
}

function resolveScalarExpressionOps(type_lhs, operator, type_rhs) {
    let op = Builtin.ScalarExpressionOps[operator];
    if (!op)
        throw new TypeError('Invalid operator ' + operator);
    for (let overload of op.types) {
        let typeScope = {};
        if (!Type.isAssignable(type_lhs, overload[0], typeScope, true))
            continue;
        if (!Type.isAssignable(type_rhs, overload[1], typeScope, true))
            continue;

        if (overload[2].isMeasure && typeScope['_unit'])
            return Type.Measure(typeScope['_unit']);
        return overload[2];
    }
    throw new TypeError(`Invalid parameter types ${type_lhs} and ${type_rhs} for ${operator}`);
}

function resolveScalarExpression(ast, schema, scope, schemas, classes, useMeta) {
    log('Type check scalar expression');
    if (ast.isBoolean) {
        typeCheckFilter(ast.value, schema, scope, schemas, classes, useMeta);
        return Type.Boolean;
    }
    if (ast.isPrimary) {
        if (ast.value.isVarRef) {
            let name = ast.value.name;
            let paramType = schema.inReq[name] || schema.inOpt[name] || schema.out[name] || scope.get(name);
            if (!paramType)
                throw new TypeError('Invalid parameter ' + name);
            return paramType;
        }
        return typeForValue(ast.value, scope);
    }
    if (ast.isDerived) {
        let operands = ast.operands.map((o) => resolveScalarExpression(o, schema, scope, schemas, classes, useMeta));
        return resolveScalarExpressionOps(operands[0], ast.op, operands[1]);
    }
    throw new TypeError(`Invalid scalar expression`);
}

function resolveFilterOverload(type_lhs, operator, type_rhs) {
    log('resolve filter overload');
    let op = Builtin.BinaryOps[operator];
    if (!op)
        throw new TypeError('Invalid operator ' + operator);
    if (type_lhs.isEntity && operator === '=~') {
        // using isAssignable will accept the operator (because it casts everything to String)
        // but we don't want that
        throw new TypeError(`Invalid parameter types ${type_lhs} and ${type_rhs} for ${operator}`);
    }
    for (let overload of op.types) {
        let typeScope = {};
        if (!Type.isAssignable(type_lhs, overload[0], typeScope, true))
            continue;
        if (!Type.isAssignable(type_rhs, overload[1], typeScope, true))
            continue;
        if (!Type.isAssignable(overload[2], Type.Boolean, typeScope, true))
            continue;
        return overload;
    }
    throw new TypeError(`Invalid parameter types ${type_lhs} and ${type_rhs} for ${operator}`);
}

function typeCheckFilter(ast, schema, scope, schemas, classes, useMeta) {
    log('Type check filter ...');
    return (async function recursiveHelper(ast) {
        if (!ast)
            return Promise.resolve();
        if (ast.isTrue || ast.isFalse)
            return Promise.resolve();
        if (ast.isAnd || ast.isOr)
            return Promise.all(ast.operands.map((op) => recursiveHelper(op)));
        if (ast.isNot)
            return recursiveHelper(ast.expr);

        if (ast.isAtom) {
            let name = ast.name;
            let type_lhs = undefined;
            if (schema)
                type_lhs = schema.inReq[name] || schema.inOpt[name] || schema.out[name];
            if (!type_lhs)
                type_lhs = scope.get(name);
            if (!type_lhs)
                throw new TypeError('Invalid filter parameter ' + name);
            let type_rhs = typeForValue(ast.value, scope);
            ast.overload = resolveFilterOverload(type_lhs, ast.operator, type_rhs);
            return Promise.resolve();
        } else {
            assert(ast.isExternal);
            if (ast.schema === null)
                ast.schema = await loadSchema(schemas, classes, ast, 'query', useMeta);
            await typeCheckInputArgs(ast, ast.schema, scope, classes);
            addRequiredInputParamsInvocation(ast, null);
            return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
        }
    })(ast);
}

function resolveAggregationOverload(ast, operator, field, schema) {
    let fieldType = schema.out[field];
    if (!fieldType)
        throw new TypeError('Invalid aggregation field ' + field);
    let ag = Builtin.Aggregations[operator];
    if (!ag)
        throw new TypeError('Invalid aggregation ' + operator);

    for (let overload of ag.types) {
        let typeScope = {};
        if (!Type.isAssignable(fieldType, overload[0], typeScope, true))
            continue;

        ast.overload = overload.map((t) => resolveTypeVars(t, typeScope));
        return ast.overload[1];
    }

    throw new TypeError('Invalid field type ' + fieldType + ' for ' + operator);
}

function cleanOutput(schema, scope) {
    scope.cleanOutput();
    return schema.filterArguments((a) => a.is_input);
}

function addOutput(schema, name, type, scope, metadata = {}) {
    scope.add(name, type);
    return schema.addArguments([new Ast.ArgumentDef(Ast.ArgDirection.OUT, name, type, metadata)]);
}

function typeCheckAggregation(ast, scope) {
    let name, type, metadata;
    if (ast.field === '*') {
        if (ast.operator !== 'count')
            throw new TypeError('* is not a valid argument to ' + ast.operator);
        type = Type.Number;
        ast.overload = [Type.Any, type];
        name = ast.alias ? ast.alias : 'count';
        metadata = { canonical: 'count' };
    } else {
        type = resolveAggregationOverload(ast, ast.operator, ast.field, ast.table.schema);
        name = ast.alias ? ast.alias : ast.field;
        metadata = ast.table.schema.getArgument(ast.field).metadata;
    }

    ast.schema = addOutput(cleanOutput(ast.table.schema, scope), name, type, scope, metadata);
}

function typeCheckComputation(ast, innerSchema, scope, schemas, classes, useMeta) {
    let name = ast.alias ? ast.alias : 'result';
    let type = resolveScalarExpression(ast.expression, innerSchema, scope, schemas, classes, useMeta);

    ast.schema = addOutput(cleanOutput(innerSchema, scope), name, type, scope);
}

function typeCheckSort(ast, scope) {
    let fieldType = ast.table.schema.out[ast.field];
    if (!fieldType)
        throw new TypeError('Invalid sort field ' + ast.field);
    if (!fieldType.isComparable())
        throw new TypeError(`Invalid sort of non-comparable field ${ast.field}`);

    ast.schema = ast.table.schema;
}

function typeCheckIndex(ast, scope) {
    if (ast.indices.length === 1) {
        const valueType = typeForValue(ast.indices[0], scope);
        if (valueType.isArray) {
            if (!Type.isAssignable(valueType, Type.Array(Type.Number)))
                throw new TypeError(`Invalid index parameter, must be of type Array(Number)`);
        } else {
            if (!Type.isAssignable(valueType, Type.Number))
                throw new TypeError(`Invalid index parameter, must be a Number`);
        }
    } else {
        for (let index of ast.indices) {
            const valueType = typeForValue(index, scope);
            if (!Type.isAssignable(valueType, Type.Number))
                throw new TypeError(`Invalid index parameter, must be a Number`);
        }
    }

    ast.schema = ast.table.schema;
}

function typeCheckSlice(ast, scope) {
    const baseType = typeForValue(ast.base, scope);
    const limitType = typeForValue(ast.limit, scope);
    if (!Type.isAssignable(baseType, Type.Number))
        throw new TypeError(`Invalid slice offset parameter, must be a Number`);
    if (!Type.isAssignable(limitType, Type.Number))
        throw new TypeError(`Invalid slice limit parameter, must be a Number`);

    ast.schema = ast.table.schema;
}

function typeCheckMonitor(ast) {
    if (ast.args) {
        ast.args.forEach((arg) => {
            if (!ast.schema.hasArgument(arg) ||
                ast.schema.isArgInput(arg))
                throw new TypeError('Invalid field name ' + arg);
        });
    }
    if (!ast.schema.is_monitorable)
        throw new TypeError('monitor() applied to a non-monitorable query');

    return Promise.resolve();
}

function resolveFilter(filter, schema) {
    // require_filter field is cleared after a filter
    schema.require_filter = false;
    if (schema.annotations)
        schema.annotations.require_filter = Ast.Value.Boolean(false);
    if (schema.no_filter)
        throw new TypeError('Filter is not allowed on a query that has been filtered on a parameter marked as unique');

    schema.no_filter = (function recursiveHelper(ast) {
        if (!ast)
            return false;
        if (ast.isTrue || ast.isFalse)
            return false;
        if (ast.isNot)
            return recursiveHelper(ast.expr);
        if (ast.isAnd || ast.isOr) {
            const result = ast.operands.map((op) => recursiveHelper(op));
            if (result.includes(true))
                throw new TypeError('Filtering on parameter marked as unique cannot be combined with other filters');
            else
                return false;
        }
        if (ast.isAtom) {
            if (schema.getArgument(ast.name).unique)
                return true;
        } else {
            assert(ast.isExternal);
            return false;
        }
    })(filter);

    return schema;
}

function resolveProjection(args, schema, scope) {
    if (Object.keys(schema.out).length === 1)
        throw new TypeError('No projection is allowed if there is only one output parameter');
    if (args.length < 1) // this could be caused by normalization with nested projections
        throw new TypeError(`Invalid empty projection`);
    args = new Set(args);
    for (let arg of args) {
        if (!schema.hasArgument(arg))
            throw new TypeError('Invalid field name ' + arg);
    }
    Object.keys(schema.out).forEach((arg) => {
        if (!args.has(arg))
            scope.remove(arg);
    });
    // if default_projection is non-empty, it's overwritten after a projection
    schema.default_projection = [];
    if (schema.annotations)
        schema.annotations.default_projection = Ast.Value.Array([]);
    return schema.filterArguments((a) => a.is_input || args.has(a.name));
}

function resolveJoin(ast, lhs, rhs) {
    const joinargs = [];
    const joinargnames = new Set;
    const joinparams = new Set;
    for (let inParam of ast.in_params)
        joinparams.add(inParam.name);

    for (let rhsarg of rhs.args) {
        if (joinargnames.has(rhsarg))
            continue;
        if (joinparams.has(rhsarg))
            continue;
        joinargs.push(rhs.getArgument(rhsarg));
        joinargnames.add(rhsarg);
    }
    for (let lhsarg of lhs.args) {
        if (joinargnames.has(lhsarg))
            continue;
        joinargs.push(lhs.getArgument(lhsarg));
        joinargnames.add(lhsarg);
    }

    return new Ast.ExpressionSignature(ast instanceof Ast.Stream ? 'stream' : 'query',
        joinargs,
        lhs.is_list || rhs.is_list,
        lhs.is_monitorable && rhs.is_monitorable,
        lhs.require_filter || rhs.require_filter,
        [...new Set(lhs.default_projection.concat(rhs.default_projection))],
        lhs.no_filter && rhs.no_filter
    );
}

function typeCheckInputArgs(ast, schema, scope, classes) {
    if (!ast.isVarRef && !ast.isJoin) {
        if (ast.selector.kind in classes) {
            const classdef = classes[ast.selector.kind];

            if (classdef.extends && classdef.extends.length === 1 && classdef.extends[0] === 'org.thingpedia.builtin.thingengine.remote')
                ast.__effectiveSelector = Ast.Selector.Device('org.thingpedia.builtin.thingengine.remote', ast.selector.id, ast.selector.principal);
            else
                ast.__effectiveSelector = ast.selector;
        } else {
            ast.__effectiveSelector = ast.selector;
        }
    }

    var presentParams = new Set;
    for (let inParam of ast.in_params) {
        let inParamType = schema.getArgType(inParam.name);
        if (!inParamType || !schema.isArgInput(inParam.name))
            throw new TypeError('Invalid input parameter ' + inParam.name);

        const valueType = typeForValue(inParam.value, scope);
        if (!Type.isAssignable(valueType, inParamType, {}, true))
            throw new TypeError(`Invalid type for parameter ${inParam.name}, have ${valueType}, need ${inParamType}`);
        if (presentParams.has(inParam.name))
            throw new TypeError('Duplicate input param ' + inParam.name);
        presentParams.add(inParam.name);
    }

    return schema.filterArguments((arg) => !presentParams.has(arg.name));
}

async function typeCheckTable(ast, schemas, scope, classes, useMeta = false) {
    if (ast.isVarRef) {
        ast.schema = await typeCheckInputArgs(ast, ast.schema, scope, classes);
        scope.addAll(ast.schema.out);
    } else if (ast.isResultRef) {
        if (!Type.isAssignable(typeForValue(ast.index, scope), Type.Number))
            throw new TypeError(`Invalid result index parameter, must be a Number`);
        scope.addAll(ast.schema.out);
    } else if (ast.isInvocation) {
        ast.schema = await typeCheckInputArgs(ast.invocation, ast.invocation.schema, scope, classes);
        scope.addAll(ast.schema.out);
    } else if (ast.isFilter) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        ast.schema = resolveFilter(ast.filter, ast.table.schema);
        await typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
    } else if (ast.isProjection) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        ast.schema = resolveProjection(ast.args, ast.table.schema, scope);
    } else if (ast.isAlias) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        ast.schema = ast.table.schema;
        scope.addGlobal(ast.name, ast.schema);
        scope.prefix(ast.name);
    } else if (ast.isAggregation) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        typeCheckAggregation(ast, scope);
    } else if (ast.isSort) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        typeCheckSort(ast, scope);
    } else if (ast.isIndex) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        typeCheckIndex(ast, scope);
    } else if (ast.isSlice) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        typeCheckSlice(ast, scope);
    } else if (ast.isJoin) {
        let leftscope = new Scope(scope);
        let rightscope = new Scope(scope);

        await typeCheckTable(ast.lhs, schemas, leftscope, classes, useMeta);
        await typeCheckTable(ast.rhs, schemas, rightscope, classes, useMeta);
        leftscope.$has_event = true;
        await typeCheckInputArgs(ast, ast.rhs.schema, leftscope, classes);
        ast.schema = resolveJoin(ast, ast.lhs.schema, ast.rhs.schema);
        scope.merge(leftscope);
        scope.merge(rightscope);
    } else if (ast.isWindow || ast.isTimeSeries) {
        if (ast.isWindow && (!typeForValue(ast.base, scope).isNumber || !typeForValue(ast.delta, scope).isNumber))
            throw new TypeError('Invalid range for window');
        if (ast.isTimeSeries && (!typeForValue(ast.base, scope).isDate
                || !typeForValue(ast.delta, scope).isMeasure
                || typeForValue(ast.delta, scope).unit !== 'ms'))
            throw new TypeError('Invalid time range');
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = ast.stream.schema;
    } else if (ast.isSequence || ast.isHistory) {
        if (ast.isSequence && (!typeForValue(ast.base, scope).isNumber || !typeForValue(ast.delta, scope).isNumber))
            throw new TypeError('Invalid range for window');
        if (ast.isHistory && (!typeForValue(ast.base, scope).isDate
                || !typeForValue(ast.delta, scope).isMeasure
                || typeForValue(ast.delta, scope).unit !== 'ms'))
            throw new TypeError('Invalid time range');
        await typeCheckStream(ast.table, schemas, scope, classes, useMeta);
        ast.schema = ast.table.schema;
    } else if (ast.isCompute) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        typeCheckComputation(ast, ast.table.schema, scope, schemas, classes, useMeta);
    } else {
        throw new Error('Not Implemented');
    }
}

async function typeCheckStream(ast, schemas, scope, classes, useMeta = false) {
    if (ast.isVarRef) {
        ast.schema = await typeCheckInputArgs(ast, ast.schema, scope, classes);
        scope.addAll(ast.schema.out);
    } else if (ast.isTimer || ast.isAtTimer) {
        ast.schema = new Ast.ExpressionSignature('stream', [], false, true);
        scope.addAll(ast.schema.out);
    } else if (ast.isMonitor) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        ast.schema = ast.table.schema;
        await typeCheckMonitor(ast);
    } else if (ast.isEdgeNew) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = ast.stream.schema;
    } else if (ast.isEdgeFilter) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = ast.stream.schema;
        await typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
    } else if (ast.isFilter) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = resolveFilter(ast.filter, ast.stream.schema);
        await typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
    } else if (ast.isAlias) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = ast.stream.schema;
        scope.addGlobal(ast.name, ast.schema);
        scope.prefix(ast.name);
    } else if (ast.isProjection) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = resolveProjection(ast.args, ast.stream.schema, scope);
    } else if (ast.isJoin) {
        let leftscope = new Scope(scope);
        let rightscope = new Scope(scope);

        await typeCheckStream(ast.stream, schemas, leftscope, classes, useMeta);
        await typeCheckTable(ast.table, schemas, rightscope, classes, useMeta);
        leftscope.$has_event = true;
        await typeCheckInputArgs(ast, ast.table.schema, leftscope, classes);
        ast.schema = resolveJoin(ast, ast.stream.schema, ast.table.schema);
        scope.merge(leftscope);
        scope.merge(rightscope);
    } else {
        throw new Error('Not Implemented');
    }
}

async function typeCheckAction(ast, schemas, scope, classes, useMeta) {
    if (ast.isInvocation)
        ast.schema = await typeCheckInputArgs(ast.invocation, ast.invocation.schema, scope, classes);
    else
        ast.schema = await typeCheckInputArgs(ast, ast.schema, scope, classes);
}

function addRequiredInputParamsInvocation(prim, extrainparams) {
    let present = new Set;
    for (let in_param of prim.in_params)
        present.add(in_param.name);

    for (let name in prim.schema.inReq) {
        if (!present.has(name) && (!extrainparams || !extrainparams.has(name)))
            prim.in_params.push(Ast.InputParam(name, Ast.Value.Undefined(true)));
    }
}

function addRequiredInputParamsStream(stream) {
    if (stream.isTimer || stream.isAtTimer)
        return;
    if (stream.isJoin) {
        let extrainparams = new Set(stream.in_params.map((ip) => ip.name));
        addRequiredInputParamsStream(stream.stream);
        addRequiredInputParamsTable(stream.table, extrainparams);
        return;
    }

    if (stream.isVarRef)
        addRequiredInputParamsInvocation(stream, null);
    else if (Utils.isUnaryStreamToStreamOp(stream))
        addRequiredInputParamsStream(stream.stream);
    else if (Utils.isUnaryTableToStreamOp(stream))
        addRequiredInputParamsTable(stream.table, null);
    else
        throw new TypeError();
}
function addRequiredInputParamsTable(table, extrainparams) {
    if (table.isJoin) {
        let newextrainparams = new Set(table.in_params.map((ip) => ip.name));
        if (extrainparams) {
            for (let name in extrainparams)
                newextrainparams.add(name);
        }
        addRequiredInputParamsTable(table.lhs, extrainparams);
        addRequiredInputParamsTable(table.rhs, newextrainparams);
        return;
    }

    if (table.isResultRef)
        return;
    else if (table.isVarRef)
        addRequiredInputParamsInvocation(table, extrainparams);
    else if (table.isInvocation)
        addRequiredInputParamsInvocation(table.invocation, extrainparams);
    else if (Utils.isUnaryStreamToTableOp(table))
        addRequiredInputParamsStream(table.stream);
    else if (Utils.isUnaryTableToTableOp(table))
        addRequiredInputParamsTable(table.table, extrainparams);
    else
        throw new TypeError();
}

function addRequiredInputParamsAction(action) {
    if (action.isVarRef)
        addRequiredInputParamsInvocation(action, null);
    else if (action.isInvocation)
        addRequiredInputParamsInvocation(action.invocation, null);
    else
        throw new TypeError();
}

function loadAllSchemas(ast, schemas, scope, classes, useMeta) {
    return Promise.all(Array.from(ast.iteratePrimitives(true)).map(async ([primType, prim]) => {
        if (primType === 'table' || primType === 'filter')
            primType = 'query';

        let schema;
        if (prim.isVarRef) {
            if (scope.has(prim.name))
                schema = scope.get(prim.name);
            else
                schema = await schemas.getMemorySchema(prim.name, useMeta);
            if (schema === null)
                throw new TypeError(`Cannot find declaration ${prim.name} in memory`);
            if (schema === Type.Table)
                schema = new Ast.ExpressionSignature('query', [], false, false);
            if (schema === Type.Stream)
                schema = new Ast.ExpressionSignature('stream', [], false, false);
            if (!(schema instanceof Ast.ExpressionSignature) || schema.functionType !== primType)
                throw new TypeError(`Variable ${prim.name} does not name a ${primType}`);
        } else if (prim.isResultRef) {
            schema = await Utils.getSchemaForSelector(schemas, prim.kind, prim.channel, 'query', useMeta, classes);

            // clone and remove all input parameters
            schema = schema.filterArguments((a) => !a.is_input);

            // monitoring a result ref does not make sense, the result will not change
            schema.is_monitorable = false;
        } else {
            schema = await loadSchema(schemas, classes, prim, primType, useMeta);
        }
        if (prim.schema === null)
            prim.schema = schema;
    }));
}

async function typeCheckClass(klass, schemas, isLibrary) {
    if (!isLibrary) {
        if (klass.extends && klass.extends[0] === 'remote')
            klass.extends = ['org.thingpedia.builtin.thingengine.remote'];
        if (klass.extends.length !== 1 && klass.extends[0] !== 'org.thingpedia.builtin.thingengine.remote')
            throw new TypeError('Inline class definitions that extend other than @org.thingpedia.builtin.thingengine.remote are not supported');
    }

    Object.entries(klass.metadata).forEach(([name, value]) => {
        if (typeof value !== 'string')
            throw new TypeError('Invalid value type for natural language annotations');
    });
    let imported = new Set();
    for (let import_stmt of klass.imports) {
        if (import_stmt.isMixin) {
            for (let facet of import_stmt.facets) {
                if (['config', 'loader'].includes(facet) && klass.is_abstract)
                    throw new TypeError('Abstract class should not contain config or loader modules');
                if (imported.has(facet))
                    throw new TypeError(`${facet} mixin imported multiple times`);
                imported.add(facet);
            }
            let mixin = await schemas.getMixins(import_stmt.module);
            typeCheckMixin(import_stmt, mixin);
        }
    }
    Object.entries(klass.queries).forEach(([name, query]) => {
        typeCheckFunctionDef('query', query);
    });
    Object.entries(klass.actions).forEach(([name, action]) => {
        typeCheckFunctionDef('action', action);
    });
}

function typeCheckMixin(import_stmt, mixin) {
    let presentParams = new Set();
    import_stmt.in_params.forEach(({name, value}) => {
        let i = mixin.args.indexOf(name);
        if (i === -1 || !mixin.is_input[i])
            throw new TypeError(`Invalid parameter ${name} for mixin ${mixin.kind}`);
        let inParamType = mixin.types[i];
        const valueType = typeForValue(value, {});
        if (!Type.isAssignable(valueType, inParamType, {}, true))
            throw new TypeError(`Invalid type for parameter ${name}, have ${valueType}, need ${inParamType}`);
        if (presentParams.has(name))
            throw new TypeError(`Duplicate input parameter ${name}`);
        presentParams.add(name);
    });
    for (let i = 0; i < mixin.args.length; i ++ ) {
        if (mixin.required[i] && !presentParams.has(mixin.args[i]))
            throw new TypeError(`Missing required parameter ${mixin.args[i]}`);
    }
}

function typeCheckMetadata(func) {
    Object.entries(func.metadata).forEach(([name, value]) => {
        if (name === 'formatted') {
            // FIXME check harder
            if (!Array.isArray(value))
                throw new TypeError('Expected an array for "formatted" annotation');
        } else if (typeof value !== 'string') {
            throw new TypeError(`Invalid value type for natural language annotation ${name}`);
        }
    });
}

function typeCheckFunctionDef(type, func) {
    for (let argname of func.args) {
        const type = func.getArgType(argname);
        if (type.isUnknown)
            throw new TypeError(`Invalid type ${type.name}`);
    }

    typeCheckMetadata(func);

    for (let name in func.annotations) {
        switch (name) {
        case 'doc':
        case 'url':
            if (!func.annotations[name].isString)
                throw new TypeError(`Invalid type ${func.annotations[name].getType()} for #[${name}] annotation, expected a string`);
            break;
        case 'require_filter':
            if (!func.annotations[name].isBoolean)
                throw new TypeError(`Invalid type ${func.annotations[name].getType()} for #[${name}] annotation, expected a boolean`);
            break;
        case 'default_projection':
            if (!func.annotations[name].isArray)
                throw new TypeError(`Invalid type ${func.annotations[name].getType()} for #[${name}] annotation, expected an array`);
            func.annotations[name].value.forEach((param) => {
                if (!param.isString)
                    throw new TypeError(`Invalid type ${param.getType()} for ${param.value} in #[${name}] annotation, expected a string`);
                if (!func.args.includes(param.value))
                    throw new TypeError(`Invalid parameter ${param.value} in #[${name}] annotation, the parameter does not exist.`);
            });
            break;
        default:
        }
    }

    if (type === 'query') {
        if (func.is_monitorable) {
            let poll_interval = func.annotations['poll_interval'];
            if (poll_interval) {
                if (!(poll_interval.isMeasure) || Units.UnitsToBaseUnit[poll_interval.unit] !== 'ms')
                    throw new TypeError(`Invalid value type for poll_interval.`);
            }
        } else if ('poll_interval' in func.annotations) {
            throw new TypeError(`Invalid annotation poll_interval for non-monitorable query ${func.name}.`);
        }
    }

    if (type === 'action') {
        if ('poll_interval' in func.annotations)
            throw new TypeError(`Invalid annotation poll_interval for action ${func.name}.`);
        if (func.is_monitorable)
            throw new TypeError(`Action is not monitorable.`);
        if (func.is_list)
            throw new TypeError(`Action returns nothing.`);
        for (let arg in func._argmap) {
            if (!func._argmap[arg].is_input)
                throw new TypeError(`Action cannot have output parameter.`);
        }
    }
}

function typeCheckDeclarationArgs(args) {
    for (let name in args) {
        let type = args[name];
        if (type.isUnknown)
            throw new TypeError(`Invalid type ${type.name}`);
    }
}

async function typeCheckDeclarationCommon(ast, schemas, scope, classes, useMeta) {
    typeCheckDeclarationArgs(ast.args);
    scope.addLambdaArgs(ast.args);
    await loadAllSchemas(ast, schemas, scope, classes, useMeta);

    switch (ast.type) {
        case 'stream':
            addRequiredInputParamsStream(ast.value);
            await typeCheckStream(ast.value, schemas, scope, classes, useMeta);
            break;
        case 'query':
            addRequiredInputParamsTable(ast.value, null);
            await typeCheckTable(ast.value, schemas, scope, classes, useMeta);
            break;
        case 'action':
            addRequiredInputParamsAction(ast.value);
            await typeCheckAction(ast.value, schemas, scope, classes, useMeta);
            break;
        case 'program':
        case 'procedure':
            await typeCheckProgram(ast.value, schemas, useMeta, classes, scope);
            if (ast.type === 'procedure') {
                for (let stmt of ast.value.rules) {
                    if (stmt.isRule)
                        throw new TypeError(`Continuous statements are not allowed in nested procedures`);
                }
            }

            break;
        default:
            throw new TypeError(`Invalid declaration type ${ast.type}`);
    }
}

function makeFunctionSchema(ast) {
    // remove all input parameters (which will be filled with undefined)
    // and add the lambda arguments
    const argdefs = ast.value.schema.args
        .map((argname) => ast.value.schema.getArgument(argname))
        .filter((arg) => !arg.is_input)
        .concat(Object.keys(ast.args).map((name) =>
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, name, ast.args[name])));

    return new Ast.FunctionDef(ast.type, ast.name, argdefs,
        ast.value.schema.is_monitorable,
        ast.value.schema.is_list,
        ast.metadata, ast.annotations);
}

function makeProgramSchema(ast) {
    // a program returns nothing, so the only arguments are input arguments
    const argdefs = Object.keys(ast.args).map((name) =>
        new Ast.ArgumentDef(Ast.ArgDirection.IN_REQ, name, ast.args[name]));

    // a program can be called on the action side, so it's an action
    return new Ast.FunctionDef('action', ast.name, argdefs,
        false, /* is_monitorable */
        false, /* is_list */
        ast.metadata, ast.annotations);
}

async function typeCheckDeclaration(ast, schemas, scope, classes, useMeta) {
    await typeCheckDeclarationCommon(ast, schemas, scope, classes, useMeta);
    typeCheckMetadata(ast);

    if (ast.type === 'program' || ast.type === 'procedure')
        ast.schema = makeProgramSchema(ast);
    else
        ast.schema = makeFunctionSchema(ast);
    scope.addGlobal(ast.name, ast.schema);
}

async function typeCheckExample(ast, schemas, classes = {}, useMeta = false) {
    await typeCheckDeclarationCommon(ast, schemas, new Scope(), classes, useMeta);

    if (!Array.isArray(ast.utterances))
        throw new TypeError('Utterances annotation expects an array');
    for (let utterance of ast.utterances) {
        if (typeof utterance !== 'string')
            throw new TypeError('Utterance can only be a string');
    }
}

async function typeCheckAssignment(ast, schemas, scope, classes, useMeta = false) {
    await loadAllSchemas(ast, schemas, scope, classes, useMeta);
    addRequiredInputParamsTable(ast.value, null);
    await typeCheckTable(ast.value, schemas, scope, classes, useMeta);

    // remove all input parameters (which we have filled with $undefined)
    ast.schema = ast.value.schema.filterArguments((a) => !a.is_input);
    scope.addGlobal(ast.name, ast.schema);
}

async function typeCheckRule(ast, schemas, scope, classes, useMeta = false) {
    await loadAllSchemas(ast, schemas, scope, classes, useMeta);

    if (ast.table !== undefined && ast.table !== null) {
        addRequiredInputParamsTable(ast.table, null);
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        if (ast.table.schema.require_filter)
            throw new TypeError('Filter required');
        if (ast.table.schema.default_projection.length > 0)
            throw new TypeError('Projection on the following parameter is required: ' + ast.table.schema.default_projection.join(', '));
    } else if (ast.stream !== undefined && ast.stream !== null) {
        addRequiredInputParamsStream(ast.stream);
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        if (ast.stream.schema.require_filter)
            throw new TypeError('Filter required');
        if (ast.stream.schema.default_projection.length > 0)
            throw new TypeError('Projection on the following parameter is required: ' + ast.stream.schema.default_projection.join(', '));
    }
    scope.$has_event = !!(ast.table || ast.stream);

    if (ast.actions.some((a) => a.isInvocation && a.invocation.selector.isBuiltin) && !ast.stream && !ast.table)
        throw new TypeError('Cannot return a result without a GET function');

    for (let prim of ast.actions)
        addRequiredInputParamsAction(prim);
    await Promise.all(
        ast.actions.map((action) => typeCheckAction(action, schemas, scope, classes, useMeta)));
}

async function typeCheckProgram(ast, schemas, useMeta = false, classes = {}, parentScope = null) {
    ast.classes.forEach((ast) => {
        classes[ast.name] = ast;
    });

    const scope = new Scope(parentScope);
    if (ast.principal !== null)
        typecheckPrincipal(ast.principal);

    for (let klass of ast.classes)
        await typeCheckClass(klass, schemas, false);
    for (let decl of ast.declarations) {
        scope.clean();
        await typeCheckDeclaration(decl, schemas, scope, classes, useMeta);
    }
    /*if (ast.rules.length === 0 && ast.oninputs.length === 0)
        throw new TypeError(`A program must include at least one executable or oninput statement`);*/

    for (let decl of ast.rules) {
        scope.clean();
        if (decl.isAssignment)
            await typeCheckAssignment(decl, schemas, scope, classes, useMeta);
        else
            await typeCheckRule(decl, schemas, scope, classes, useMeta);
    }
    for (let choice of ast.oninputs) {
        scope.clean();
        await typeCheckRule(choice, schemas, scope, classes, useMeta);
    }
}

async function getAllowedSchema(allowed, schemaType, schemas, getMeta) {
    if (!allowed.isSpecified || allowed.schema)
        return;

    allowed.schema = await Utils.getSchemaForSelector(schemas, allowed.kind, allowed.channel, schemaType, getMeta, {});
}

async function typecheckPermissionFunction(fn, scope, schemas, getMeta) {
    if (!fn.isSpecified)
        return;

    await typeCheckFilter(fn.filter, fn.schema, scope, schemas, {}, getMeta);
}

async function typeCheckPermissionRule(permissionRule, schemas, getMeta = false) {
    await Promise.all([
        getAllowedSchema(permissionRule.query, 'query', schemas, getMeta),
        getAllowedSchema(permissionRule.action, 'action', schemas, getMeta),
    ]);

    {
        const scope = new Scope();
        scope.add('source', Type.Entity('tt:contact'));
        await typeCheckFilter(permissionRule.principal, null, scope, schemas, {}, getMeta);
    }

    {
        const scope = new Scope();
        await typecheckPermissionFunction(permissionRule.query, scope, schemas, getMeta);
        scope.$has_event = true;
        await typecheckPermissionFunction(permissionRule.action, scope, schemas, getMeta);
    }
}

async function typeCheckDataset(dataset, schemas, classes, getMeta = false) {
    for (let ex of dataset.examples)
        await typeCheckExample(ex, schemas, classes, getMeta);
}

async function typeCheckMeta(meta, schemas, getMeta = false) {
    const classes = {};
    for (let klass of meta.classes) {
        await typeCheckClass(klass, schemas, true);
        classes[klass.name] = klass;
    }
    for (let dataset of meta.datasets)
        await typeCheckDataset(dataset, schemas, classes, getMeta);
}

async function typeCheckBookkeeping(intent) {
    if (intent.isSpecial) {
        if (Ast.BookkeepingSpecialTypes.indexOf(intent.type) < 0)
            throw new TypeError(`Invalid special ${intent.type}`);
    } else if (intent.isCommandList) {
        const valueType = typeForValue(intent.device, {});
        if (!Type.isAssignable(valueType, Type.Entity('tt:device'), {}, true))
            throw new TypeError('Invalid device parameter');
    }
}

module.exports = {
    typeCheckBookkeeping,
    typeCheckProgram,
    typeCheckFilter,
    typeCheckPermissionRule,
    typeCheckMeta,
    typeCheckClass,
    typeCheckExample
};
