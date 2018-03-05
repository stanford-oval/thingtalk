// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const assert = require('assert');

const Ast = require('./ast');
const Type = require('./type');
const Utils = require('./utils');
const Builtin = require('./builtin');
const Generate = require('./generate');

const ALLOWED_PRINCIPAL_TYPES = new Set([
    'tt:contact', 'tt:contact_name', 'tt:contact_group', 'tt:contact_group_name'
]);
const ALLOWED_PRINCIPAL_TYPES_FOR_MEMORY = new Set([
    'tt:contact', 'tt:contact_name'
]);

function log(message) {
    let debug = false;
    if (debug) console.log(message);
}

class Scope {
    constructor(scope) {
        this._globalScope = scope ? Object.assign({}, scope._globalScope) : {};
        this._scope = scope? Object.assign({}, scope._scope) : {};
        this._conflicts = scope? new Set(scope._conflicts) : new Set();
        this.$has_event = scope? scope.$has_event : false;
        this._inReq = scope? Object.assign({}, scope._inReq) : {};
        this._lambda_args = scope? Object.assign({}, scope._lambda_args) : {};
    }

    has(name) {
        return name in this._scope;
    }

    hasGlobal(name) {
        return name in this._globalScope;
    }

    hasInReq() {
        return Object.keys(this._inReq).length > 0;
    }

    getSchema(name) {
        if (this.hasGlobal(name)) {
            return this._globalScope[name];
        }
    }

    add(name, type) {
        // HACK FIXME
        //if (this.has(name))
        //    this._conflicts.add(name);
        this._scope[name] = type;
    }

    addGlobal(name, schema) {
        if (this.hasGlobal(name))
            throw new TypeError('Conflict on using ' + name);
        this._globalScope[name] = schema.clone();
    }

    addConflict(name) {
        this._conflicts.add(name);
    }

    popInReq(name, type) {
        this._inReq[name] = type;
    }

    clearInReq() {
        this._inReq = {};
    }

    initLambdaArgs(args) {
        this.assign(args);
        for (let name in args)
            this._lambda_args[name] = [];
    }

    isLambdaArg(arg) {
        return arg in this._lambda_args;
    }

    updateLambdaArgs(arg, name) {
        this._lambda_args[arg].push(name);
    }

    remove(name) {
        if (this._conflicts.has(name))
            delete this._conflicts[name];
        delete this._scope[name];
    }

    assign(name_type_pairs) {
        for (let name in name_type_pairs) {
            let type = name_type_pairs[name];
            if (type.isTable || type.isStream)
                this.addGlobal(name, Builtin.emptyFunction);
            else if (type.isFunctionDef)
                this.addGlobal(name, type);
            else
                this.add(name, type);
        }
    }

    merge(scope) {
        for (let name in scope._globalScope)
            this.add(name, scope.get(name));
        for (let name in scope._scope)
            this.add(name, scope.get(name));
    }

    clean(args) {
        this._scope = {};
        this._conflicts = new Set();
        this.$has_event = false;
        this._inReq = {};
        this._lambda_args = {};
        if (args)
            Object.keys(args).forEach((name) => delete this._globalScope[name]);
    }

    prefix(prefix) {
        let new_scope = {};
        for (let name in this._scope)
            new_scope[prefix + '.' + name] = this._scope[name];
        this._scope = new_scope;
    }

    get(name) {
        if (this._conflicts.has(name))
            throw new TypeError('Conflicted field name ' + name + ' after join, cannot be used.');
        return this._globalScope[name] || this._scope[name];
    }

    dump() {
        console.log();
        console.log('Scope:');
        for (let name in this._scope)
            console.log(name  +': ' + this._scope[name]);
    }
}

function ensureSchema(schemas, classes, prim, primType, useMeta) {
    if (prim.schema)
        return Q();

    if (prim.isVarRef) {
        let principal;
        if (prim.principal) {
            typecheckPrincipal(prim.principal, true);
            principal = prim.principal.value;
        } else {
            principal = null;
        }
        return Utils.getMemorySchema(schemas, prim.name, principal, useMeta).then((schema) => {
            if (schema === null)
                throw new TypeError('Cannot find table ' + prim.name + ' in memory');
            prim.schema = schema;
        });
    }
    if (prim.selector.isBuiltin && primType === 'action') {
        if (prim.channel === 'notify')
            prim.schema = Builtin.Actions.notify;
        else if (prim.channel === 'return')
            prim.schema = Builtin.Actions['return'];
        else if (prim.channel === 'save')
            prim.schema = Builtin.Actions['save'];
        else
            throw new TypeError('Invalid builtin action ' + prim.channel);
        return Q();
    }
    if (prim.selector.isBuiltin) {
        throw new TypeError('Invalid builtin ' + primType + ' ' + prim.channel);
    }

    if (prim.selector.principal !== null)
        typecheckPrincipal(prim.selector.principal);

    return Utils.getSchemaForSelector(schemas, prim.selector.kind, prim.channel, primType, useMeta, classes).then((schema) => {
        prim.schema = schema;
    });
}

function typeForValue(value, scope) {
    if (value.isVarRef) {
        let type;
        if (value.name.startsWith('$context.location')) {
            type = Type.Location;
        } else {
            type = scope.get(value.name);
        }
        if (!type)
            throw new TypeError('Variable ' + value.name + ' is not in scope');
        return type;
    }
    if (value.isEvent && value.name !== 'program_id' && !scope.$has_event)
        throw new TypeError('Cannot access $event variables in the trigger');
    return value.getType();
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


function typecheckPrincipal(principal, forMemory = false) {
    if (principal.isArray && principal.value.length === 0)
        return;
    if (principal.isArray) {
        for (let elem of principal.value) {
            if (!Type.isAssignable(elem.getType(), Type.Entity('tt:contact')))
                throw new TypeError('Invalid inline group specification, must consist of all contacts or contact names');
        }
    } else {
        assert(principal.isEntity);
        if (!ALLOWED_PRINCIPAL_TYPES.has(principal.type))
            throw new TypeError('Invalid principal, must be a contact or a group');
        if (!ALLOWED_PRINCIPAL_TYPES_FOR_MEMORY.has(principal.type) && forMemory)
            throw new TypeError('Invalid principal for memory access, must be a contact, not a group');
    }
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
}

function resolveFilterOverload(type_lhs, operator, type_rhs) {
    log('resolve filter overload');
    let op = Builtin.BinaryOps[operator];
    if (!op)
        throw new TypeError('Invalid operator ' + operator);
    for (let overload of op.types) {
        let typeScope = {};
        if (!Type.isAssignable(type_lhs, overload[0], typeScope, true))
            continue;
        if (!Type.isAssignable(type_rhs, overload[1], typeScope, true))
            continue;
        if (!Type.isAssignable(overload[2], Type.Boolean, typeScope, true))
            continue;
        return;
    }
    throw new TypeError(`Invalid parameter types ${type_lhs} and ${type_rhs} for ${operator}`);
}

function typeCheckFilter(ast, schema, scope, schemas, classes, useMeta) {
    log('Type check filter ...');
    return (function recursiveHelper(ast) {
        if (!ast)
            return Q();
        if (ast.isTrue || ast.isFalse)
            return Q();
        if (ast.isAnd || ast.isOr)
            return Q.all(ast.operands.map((op) => recursiveHelper(op)));
        if (ast.isNot)
            return recursiveHelper(ast.expr);

        if (ast.isAtom) {
            let name = ast.name;
            let type_lhs = schema.inReq[name] || schema.inOpt[name] || schema.out[name] || scope[name];
            if (!type_lhs)
                throw new TypeError('Invalid filter parameter ' + name);
            let type_rhs = typeForValue(ast.value, scope);
            resolveFilterOverload(type_lhs, ast.operator, type_rhs);
            if (ast.value.isVarRef && scope.isLambdaArg(ast.value.name)) {
                scope.updateLambdaArgs(ast.value.name, ast.name);
            }
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
    let num_input = Object.keys(schema.inReq).length + Object.keys(schema.inOpt).length;
    schema.args = schema.args.slice(0, num_input);
    schema.types = schema.types.slice(0, num_input);
    for (let p in schema.index) {
        if (schema.index[p] >= num_input)
            delete schema.index[p];
    }
    for (let p in schema.out) {
        scope.remove(p);
    }
    schema.out = {};
}

function addOutput(schema, name, type, scope) {
    schema.args.push(name);
    schema.types.push(type);
    schema.index[name] = Object.keys(schema.index).length;
    schema.out[name] = type;
    scope.add(name, type);
}

function addInput(schema, name, type, required) {
    let num_input = Object.keys(schema.inReq).length + Object.keys(schema.inOpt).length;
    schema.args.splice(num_input, 0, name);
    schema.types.splice(num_input, 0, type);
    schema.index[name] = num_input;
    for (let p in schema.index) {
        if (p in schema.out)
            schema.index[p] = schema.index[p] + 1;
    }
    if (required)
        schema.inReq[name] = type;
    else
        schema.inOpt[name] = type;
}

function pushInReq(schema, scope) {
    if (scope.hasInReq()) {
        for (let name in scope._inReq) {
            addInput(schema, name, scope._inReq[name], true);
        }
        scope.clearInReq();
    }
}

function updateLambdaArgs(schema, scope, types) {
    for (let new_name in scope._lambda_args) {
        scope._lambda_args[new_name].forEach((old_name) => {
            if (new_name === old_name)
                return;
            schema.args[schema.index[old_name]] = new_name;
            schema.index[new_name] = schema.index[old_name];
            schema.inReq[new_name] = types[new_name];
            delete schema.index[old_name];
            delete schema.inReq[old_name];
            delete schema.inOpt[old_name];
        });
    }
}

function typeCheckAggregation(ast, scope) {
    let name, type;
    if (ast.field === '*') {
        if (ast.operator !== 'count')
            throw new TypeError('* is not a valid argument to ' + ast.operator);
        type = Type.Number;
        ast.overload = [Type.Any, type];
        name = ast.alias ? ast.alias : 'count';
    } else {
        type = resolveAggregationOverload(ast, ast.operator, ast.field, ast.schema);
        name = ast.alias ? ast.alias : ast.operator;
    }
    cleanOutput(ast.schema, scope);
    addOutput(ast.schema, name, type, scope);
    return Q();
}

function typeCheckArgMinMax(ast) {
    let argm = Builtin.ArgMinMax[ast.operator];
    if (!argm)
        throw new TypeError('Invalid aggregation ' + ast.operator);
    let fieldType = ast.schema.out[ast.field];
    if (!fieldType)
        throw new TypeError('Invalid field ' + ast.field);
    if (Builtin.ArgMinMax[ast.operator].types.indexOf(fieldType) === -1)
        throw new TypeError('Invalid ' + ast.operator + ' field ' + ast.field);
    if (!ast.base.isNumber || !ast.limit.isNumber)
        throw new TypeError('Invalid range for ' + ast.operator);
    return Q();
}

function typeCheckComputation(ast, scope, schemas, classes, useMeta) {
    let name = ast.alias ? ast.alias : 'result';
    let type = resolveScalarExpression(ast.expression, ast.table.schema, scope, schemas, classes, useMeta);
    cleanOutput(ast.schema, scope);
    addOutput(ast.schema, name, type, scope);
    return Q();
}

function typeCheckMonitor(ast) {
    if (ast.args) {
        ast.args.forEach((arg) => {
            if (!(arg in ast.schema.out))
                throw new TypeError('Invalid field name ' + arg);
        });
    }
    return Q();
}

function resolveProjection(args, schema, scope) {
    args.forEach((arg) => {
        if (schema.args.indexOf(arg) === -1)
            throw new TypeError('Invalid field name ' + arg);
    });
    schema.args = args;
    schema.types = schema.args.map((arg) => schema.types[schema.index[arg]]);
    schema.index = schema.args.reduce((res, arg, i) => {
        res[arg] = i;
        return res;
    }, {});
    Object.keys(schema.out).forEach((arg) => {
        if (schema.args.indexOf(arg) === -1) {
            delete schema.out[arg];
            scope.remove(arg);
        }
    });
}

function resolveJoin(ast, lhs, rhs) {
    ast.schema = lhs.schema.clone();
    ast.schema.args = ast.schema.args.concat(rhs.schema.args);
    ast.schema.types = ast.schema.types.concat(rhs.schema.types);
    ast.schema.index = rhs.schema.args.reduce((res, arg) => {
        res[arg] = Object.keys(res).length;
        return res;
    }, lhs.schema.index);
    ast.schema.inReq = Object.assign({}, lhs.schema.inReq);
    ast.schema.inOpt = Object.assign({}, lhs.schema.inOpt);
    let in_params = Object.assign({}, ast.schema.inReq, ast.schema.inOpt);
    for (let p in rhs.schema.inReq) {
        if (p in in_params) {
            delete ast.schema.inReq[p];
            delete ast.schema.inOpt[p];
        } else {
            ast.schema.inReq[p] = rhs.schema.inReq[p];
        }
    }
    for (let p in rhs.schema.inOpt) {
        if (p in in_params) {
            delete ast.schema.inReq[p];
            delete ast.schema.inOpt[p];
        } else {
            ast.schema.inOpt[p] = rhs.schema.inOpt[p];
        }
    }
    ast.schema.out = Object.assign(ast.schema.out, rhs.schema.out);
}

function typeCheckInputArgs(ast, scope, classes) {
    let schema = ast.schema;
    pushInReq(schema, scope);
    if (!ast.isVarRef && !ast.isJoin) {
        if (ast.selector.kind in classes)
            ast.__effectiveSelector = Ast.Selector.Device(classes[ast.selector.kind].extends, ast.selector.id, ast.selector.principal);
        else
            ast.__effectiveSelector = ast.selector;
    }
    var presentParams = new Set;
    for (let inParam of ast.in_params) {
        let inParamType = schema.inReq[inParam.name] || schema.inOpt[inParam.name];
        if (!inParamType)
            throw new TypeError('Invalid input parameter ' + inParam.name);
        if (inParam.value.isEntity && inParam.value.type === 'tt:username' &&
            inParamType.isEntity && (inParamType.type === 'tt:phone_number' || inParamType.type === 'tt:email_address'))
            inParam.value.type = 'tt:contact_name';
        if (!Type.isAssignable(typeForValue(inParam.value, scope), inParamType, {}, true))
            throw new TypeError('Invalid type for parameter '+ inParam.name);
        if (presentParams.has(inParam.name))
            throw new TypeError('Duplicate input param ' + inParam.name);
        presentParams.add(inParam.name);
        if (inParam.value.isVarRef && scope.isLambdaArg(inParam.value.name))
            scope.updateLambdaArgs(inParam.value.name, inParam.name);
    }
    for (let inParam in schema.inReq) {
        if (!presentParams.has(inParam))
            scope.popInReq(inParam, schema.inReq[inParam]);
    }
}

function typeCheckInput(ast, schemas, scope, classes, useMeta = false) {
    return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
        typeCheckInputArgs(ast, scope, classes);
        return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
    }).then(() => {
        if (ast.aggregation)
            return typeCheckAggregation(ast, scope);
        scope.assign(ast.schema.out);
        return Q();
    });
}

function typeCheckOutput(ast, schemas, scope, classes, useMeta = false) {
    log('Type check output ...');
    return ensureSchema(schemas, classes, ast, 'action', useMeta).then(() => {
        return typeCheckInputArgs(ast, scope, classes);
    });
}

function typeCheckJoinInput(ast, schemas, scope, classes, useMeta) {
    return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
        typeCheckInputArgs(ast, scope, classes);
        return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
    }).then(() => {
        if (ast.aggregation)
            return typeCheckAggregation(ast, scope);
        scope.assign(ast.schema.out);
        return Q();
    })
}

function typeCheckTable(ast, schemas, scope, classes, useMeta = false) {
    log('Type check table ...');
    if (ast.isVarRef) {
        log('VarRef');
        if (scope.hasGlobal(ast.name)) {
            ast.schema = scope.getSchema(ast.name).clone();
        }
        return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
            return typeCheckInput(ast, schemas, scope, classes, useMeta);
        });
    }
    if (ast.isInvocation) {
        log('Invocation');
        return ensureSchema(schemas, classes, ast.invocation, 'query', useMeta).then(() => {
            ast.schema = ast.invocation.schema.clone();
            return typeCheckInput(ast.invocation, schemas, scope, classes, useMeta);
        });
    }
    if (ast.isFilter) {
        log('Filter');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema.clone();
            return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
        });
    }
    if (ast.isProjection) {
        log('Projection');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema.clone();
            resolveProjection(ast.args, ast.schema, scope);
            return Q();
        });
    }
    if (ast.isAlias) {
        log('Alias');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema.clone();
            scope.addGlobal(ast.name, ast.schema);
            scope.prefix(ast.name);
            return Q();
        });
    }
    if (ast.isAggregation) {
        log('Aggregation');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema.clone();
            return typeCheckAggregation(ast, scope);
        });
    }
    if (ast.isArgMinMax) {
        log('ArgMinMax');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema.clone();
            return typeCheckArgMinMax(ast);
        });
    }
    if (ast.isJoin) {
        log('Join');
        let leftscope = new Scope(scope);
        let rightscope = new Scope(scope);
        return Promise.resolve()
            .then(() => typeCheckTable(ast.lhs, schemas, leftscope, classes, useMeta))
            .then(() => {
                return typeCheckTable(ast.rhs, schemas, rightscope, classes, useMeta);
            }).then(() => {
                resolveJoin(ast, ast.lhs, ast.rhs);
                leftscope.$has_event = true;
                return typeCheckJoinInput(ast, schemas, leftscope, classes, useMeta);
            }).then(() => {
                scope.merge(leftscope);
                scope.merge(rightscope);
            });
    }
    if (ast.isWindow || ast.isTimeSeries) {
        log('Window or TimeSeries');
        if (ast.isWindow && (!typeForValue(ast.base, scope).isNumber || !typeForValue(ast.delta, scope).isNumber))
            throw new TypeError('Invalid range for window');
        if (ast.isTimeSeries && (!typeForValue(ast.base, scope).isDate
                || !typeForValue(ast.delta, scope).isMeasure
                || typeForValue(ast.delta, scope).unit !== 'ms'))
            throw new TypeError('Invalid time range');
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema.clone();
            return Q();
        });
    }
    if (ast.isSequence || ast.isHistory) {
        log('Sequence or History');
        if (ast.isSequence && (!typeForValue(ast.base, scope).isNumber || !typeForValue(ast.delta, scope).isNumber))
            throw new TypeError('Invalid range for window');
        if (ast.isHistory && (!typeForValue(ast.base, scope).isDate
                || !typeForValue(ast.delta, scope).isMeasure
                || typeForValue(ast.delta, scope).unit !== 'ms'))
            throw new TypeError('Invalid time range');
        return typeCheckStream(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema.clone();
            return Q();
        });
    }
    if (ast.isCompute) {
        log('Compute');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema.clone();
            return typeCheckComputation(ast, scope, schemas, classes, useMeta);
        });
    }
    throw new Error('Not Implemented');
}

function typeCheckStream(ast, schemas, scope, classes, useMeta = false) {
    log('Type check stream ...');
    if (ast.isVarRef) {
        if (scope.hasGlobal(ast.name)) {
            ast.schema = scope.getSchema(ast.name).clone();
        }
        return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
            return typeCheckInput(ast, schemas, scope, classes, useMeta);
        })
    }
    if (ast.isTimer || ast.isAtTimer) {
        ast.schema = Builtin.emptyFunction;
        return Q();
    }
    if (ast.isMonitor) {
        log('Monitor');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema.clone();
            return typeCheckMonitor(ast);
        });
    }
    if (ast.isEdgeNew) {
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema.clone();
            return Q();
        })
    }
    if (ast.isEdgeFilter) {
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema.clone();
            return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
        });
    }
    if (ast.isFilter) {
        log('Filter');
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema.clone();
            return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
        })
    }
    if (ast.isAlias) {
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema.clone();
            scope.addGlobal(ast.name, ast.schema);
            scope.prefix(ast.name);
            return Q();
        });
    }
    if (ast.isProjection) {
        log('Projection');
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema.clone();
            resolveProjection(ast.args, ast.schema, scope);
            return Q();
        });
    }
    if (ast.isJoin) {
        log('Join');
        let leftscope = new Scope(scope);
        let rightscope = new Scope(scope);
        return Promise.resolve()
            .then(() => typeCheckStream(ast.stream, schemas, leftscope, classes, useMeta))
            .then(() => {
                return typeCheckTable(ast.table, schemas, rightscope, classes, useMeta);
            }).then(() => {
                resolveJoin(ast, ast.stream, ast.table);
                leftscope.$has_event = true;
                return typeCheckJoinInput(ast, schemas, leftscope, classes, useMeta);
            }).then(() => {
                scope.merge(leftscope);
                scope.merge(rightscope);
            });
    }
    throw new Error('Not Implemented');
}

function typeCheckDeclaration(ast, schemas, scope, classes, useMeta) {
    return Promise.resolve().then(() => {
        switch (ast.type) {
            case 'stream':
                scope.initLambdaArgs(ast.args);
                return typeCheckStream(ast.value, schemas, scope, classes, useMeta).then(() => {
                    let schema = ast.value.schema.clone();
                    updateLambdaArgs(schema, scope, ast.args);
                    scope.clean(ast.args);
                    scope.addGlobal(ast.name, schema);
                    return Q();
                });
            case 'table':
                scope.initLambdaArgs(ast.args);
                return typeCheckTable(ast.value, schemas, scope, classes, useMeta).then(() => {
                    let schema = ast.value.schema.clone();
                    updateLambdaArgs(schema, scope, ast.args);
                    scope.clean(ast.args);
                    scope.addGlobal(ast.name, schema);
                    return Q();
                });
            case 'action':
                scope.initLambdaArgs(ast.args);
                return typeCheckOutput(ast.value, schemas, scope, classes, useMeta).then(() => {
                    let schema = ast.value.schema.clone();
                    updateLambdaArgs(schema, scope, ast.args);
                    scope.clean(ast.args);
                    scope.addGlobal(ast.name, schema);
                    return Q();
                });
            default:
                throw new TypeError(`Invalid declaration type ${ast.type}`);
        }
    });
}

function addRequiredInputParams(prim) {
    let present = new Set;
    for (let in_param of prim.in_params)
        present.add(in_param.value);

    for (let name in prim.schema.inReq) {
        if (!present.has(name))
            prim.in_params.push(Ast.InputParam(name, Ast.Value.Undefined(true)));
    }
}

function typeCheckRule(ast, schemas, scope, classes, useMeta = false) {
    log('Type check rule ...');
    return Promise.resolve().then(() => {
        if (ast.table !== undefined && ast.table !== null)
            return typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        else if (ast.stream !== undefined && ast.stream !== null)
            return typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        else
            return null;
    }).then((event) => {
        if (ast.isRule) {
            for (let [,prim] of Generate.iteratePrimitivesStream(ast.stream))
                addRequiredInputParams(prim);
        } else if (ast.table) {
            for (let [,prim] of Generate.iteratePrimitivesTable(ast.table))
                addRequiredInputParams(prim);
        }
    }).then((event) => {
        if (event !== null)
            scope.$has_event = true;
    }).then(() => Promise.all(
        ast.actions.map((action) => typeCheckOutput(action, schemas, scope, classes, useMeta)))
    ).then(() => {
        for (let prim of ast.actions)
            addRequiredInputParams(prim);
    });
}

function typeCheckProgram(ast, schemas, useMeta = false) {
    const classes = {};
    ast.classes.forEach((ast) => {
        classes[ast.name] = ast;
    });
    const scope = new Scope();
    if (ast.principal !== null)
        typecheckPrincipal(ast.principal);

    function declLoop(i) {
        if (i === ast.declarations.length)
            return Q();
        scope.clean();
        return typeCheckDeclaration(ast.declarations[i], schemas, scope, classes, useMeta).then(() => declLoop(i+1));
    }
    function ruleLoop(i) {
        if (i === ast.rules.length)
            return Q();
        scope.clean();
        return typeCheckRule(ast.rules[i], schemas, scope, classes, useMeta).then(() => ruleLoop(i+1));
    }

    return Promise.resolve().then(() => declLoop(0)).then(() => ruleLoop(0));
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
        const scope = new Scope();
        scope.add('__pi', Type.Entity('tt:contact'));
        function typecheckPermissionFunction(fn) {
            if (!fn.isSpecified)
                return Promise.resolve();

            return typeCheckFilter(fn.filter, fn.schema, scope, schemas, {}, getMeta).then(() => {
                for (let outParam of fn.out_params) {
                    let ptype = fn.schema.inReq[outParam.value] || fn.schema.inOpt[outParam.value] || fn.schema.out[outParam.value];
                    scope.add(outParam.name, ptype);
                }
            });
        }
        if (permissionRule.principal !== null) {
            typecheckPrincipal(permissionRule.principal);
        }

        return typecheckPermissionFunction(permissionRule.trigger).then(() => {
            scope.$has_event = true;
            return typecheckPermissionFunction(permissionRule.query);
        }).then(() => {
            return typecheckPermissionFunction(permissionRule.action);
        });
    });
}

module.exports = {
    typeCheckInput,
    typeCheckOutput,
    typeCheckRule,
    typeCheckTable,
    typeCheckStream,
    typeCheckProgram,
    typeCheckFilter,
    typeCheckPermissionRule
};
