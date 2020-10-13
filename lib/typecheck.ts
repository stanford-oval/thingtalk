// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

// Typechecking is idempotent (two parallel typechecks of the same program will yield
// functionally equivalent results) so any data race is a false positive
/* eslint-disable require-atomic-updates */

import assert from 'assert';
import * as Units from 'thingtalk-units';

import * as Ast from './ast';
import Type, {
    TypeMap,
    TypeScope,
    EnumType,
    ArrayType,
    CompoundType,
    EntityType,
    MeasureType,
    UnknownType
} from './type';
import * as Utils from './utils';
import * as Builtin from './builtin/defs';
import type SchemaRetriever from './schema';

const ALLOWED_PRINCIPAL_TYPES = new Set([
    'tt:contact', 'tt:username'
]);

function log(message : string) : void {
    const debug = false;
    if (debug) console.log(message);
}

class Scope {
    private _parentScope : Scope|null;
    private _globalScope : { [key : string] : Ast.ExpressionSignature };
    private _lambda_args : TypeMap;
    private _scope : TypeMap;
    $has_event : boolean;

    constructor(parentScope : Scope|null = null) {
        this._parentScope = parentScope;
        this._globalScope = {};
        this._scope = {};
        this._lambda_args = {};
        this.$has_event = false;
    }

    has(name : string) : boolean {
        const here = name in this._scope || name in this._lambda_args || name in this._globalScope;
        if (here)
            return true;
        if (this._parentScope)
            return this._parentScope.has(name);
        return false;
    }

    addLambdaArgs(args : TypeMap) : void {
        for (const name in args)
            this._lambda_args[name] = args[name];
    }

    add(name : string, type : Type) : void {
        this._scope[name] = type;
    }
    addAll(args : TypeMap) : void {
        for (const name in args)
            this._scope[name] = args[name];
    }

    addGlobal(name : string, schema : Ast.ExpressionSignature) : void {
        if (name in this._globalScope)
            throw new TypeError(name + ' is already declared');
        this._globalScope[name] = schema;
    }

    remove(name : string) : void {
        delete this._scope[name];
    }

    merge(scope : Scope) : void {
        Object.assign(this._scope, scope._scope);
    }

    clean() : void {
        this._scope = {};
        this.$has_event = false;
        this._lambda_args = {};
    }

    clone() : Scope {
        const newself = new Scope(this._parentScope);
        Object.assign(newself._scope, this._scope);
        newself.$has_event = this.$has_event;
        Object.assign(newself._lambda_args, this._lambda_args);
        return newself;
    }

    cleanOutput() : void {
        this._scope = {};
    }

    prefix(prefix : string) : void {
        const new_scope : TypeMap = {};
        for (const name in this._scope) {
            new_scope[name] = this._scope[name];
            new_scope[prefix + '.' + name] = this._scope[name];
        }
        this._scope = new_scope;
    }

    get(name : string) : Type|Ast.ExpressionSignature|undefined {
        let v : Type|Ast.ExpressionSignature|undefined = this._scope[name] || this._lambda_args[name] || this._globalScope[name];
        if (!v && this._parentScope)
            v = this._parentScope.get(name);
        return v;
    }

    dump() : void {
        console.log();
        console.log('Scope:');
        for (const name in this._scope)
            console.log(name  +': ' + this._scope[name]);
    }
}

function loadNotifyAction(name : string) : Ast.FunctionDef {
    if (name === 'notify')
        return Builtin.Actions.notify;
    else if (name === 'return')
        return Builtin.Actions['return'];
    else if (name === 'save')
        return Builtin.Actions['save'];
    else
        throw new TypeError('Invalid notification action ' + name);
}

interface InvocationLike {
    selector : Ast.DeviceSelector;
    channel : string;
}
type ClassMap = { [key : string] : Ast.ClassDef };

function loadSchema(schemas : SchemaRetriever,
                    classes : ClassMap,
                    prim : InvocationLike,
                    primType : 'action' | 'query',
                    useMeta : boolean) : Promise<Ast.FunctionDef> {
    return Utils.getSchemaForSelector(schemas, prim.selector.kind, prim.channel, primType, useMeta, classes);
}

async function typeCheckValue(value : Ast.Value,
                              scope : Scope,
                              schemas : SchemaRetriever,
                              classes : ClassMap,
                              useMeta : boolean) : Promise<Type> {
    if (value instanceof Ast.ComputationValue) {
        if (value.type instanceof Type)
            return value.type;

        const operands = await Promise.all(value.operands.map((o) => typeCheckValue(o, scope, schemas, classes, useMeta)));
        const [overload, resultType] = resolveScalarExpressionOps(value.op, operands);

        value.overload = overload;
        return value.type = resultType;
    }
    if (value instanceof Ast.ArrayFieldValue) {
        if (value.type instanceof Type)
            return value.type;

        const paramType = await typeCheckValue(value.value, scope, schemas, classes, useMeta);

        if (!(paramType instanceof ArrayType))
            throw new TypeError(`Invalid field access on value that is not array of record`);
        const elem = paramType.elem;
        if (!(elem instanceof CompoundType))
            throw new TypeError(`Invalid field access on value that is not array of record`);
        if (!(value.field in elem.fields))
            throw new TypeError(`Invalid field ${value.field} in type ${elem}`);

        const arg = elem.fields[value.field];
        value.arg = arg;
        return value.type = new Type.Array(arg.type);
    }
    if (value instanceof Ast.FilterValue) {
        if (value.type instanceof Type)
            return value.type;

        const paramType = await typeCheckValue(value.value, scope, schemas, classes, useMeta);
        if (!(paramType instanceof ArrayType))
            throw new TypeError(`Invalid aggregation on non-array parameter`);
        const args = [];
        const elem = paramType.elem;
        if (elem instanceof CompoundType) {
            for (const field in elem.fields)
                args.push(new Ast.ArgumentDef(null, Ast.ArgDirection.OUT, field, elem.fields[field].type, {}));
        } else {
            args.push(new Ast.ArgumentDef(null, Ast.ArgDirection.OUT, 'value', elem as Type, {}));
        }
        const localschema = new Ast.ExpressionSignature(null, 'query', null, [], args, {
            minimal_projection: [],
        });
        await typeCheckFilter(value.filter, localschema, new Scope(), schemas, classes, useMeta);
        return value.type = paramType;
    }

    if (value instanceof Ast.VarRefValue) {
        if (value.type instanceof Type)
            return value.type;

        if (value.name.startsWith('__const_'))
            return value.getType();

        const type = scope.get(value.name);

        if (!type || !(type instanceof Type))
            throw new TypeError('Variable ' + value.name + ' is not in scope');
        value.type = type;
        return type;
    }
    if (value instanceof Ast.EventValue && value.name !== 'program_id' && !scope.$has_event)
        throw new TypeError('Cannot access $event variables in the trigger');

    if (value instanceof Ast.ArrayValue) {
        const typeScope = {};
        if (value.value.length === 0)
            return new Type.Array(Type.Any);

        const elem = await typeCheckValue(value.value[0], scope, schemas, classes, useMeta);

        for (const v of value.value) {
            const vtype = await typeCheckValue(v, scope, schemas, classes, useMeta);

            // merge enum types if necessary
            if (vtype instanceof EnumType && elem instanceof EnumType) {
                const ventries = vtype.entries;
                const entries = elem.entries;
                assert(ventries && entries);

                if (ventries[ventries.length-1] === '*' &&
                    entries[entries.length-1] === '*') {
                    for (const entry of ventries) {
                        if (entries.includes(entry))
                            continue;
                        entries.splice(entries.length-1, 0, entry);
                    }
                }
            }

            if (!Type.isAssignable(vtype, elem, typeScope))
                throw new TypeError(`Inconsistent type for array value`);
        }

        return value.type = new Type.Array(elem);
    }

    const type = value.getType();
    return type;
}

function resolveTypeVars(type : Type|string, typeScope : TypeScope) : Type {
    if (typeof type === 'string')
        return resolveTypeVars(typeScope[type], typeScope);
    if (type instanceof ArrayType)
        return new Type.Array(resolveTypeVars(type.elem, typeScope));
    if (type instanceof MeasureType && typeScope._unit)
        return new Type.Measure(typeScope._unit as string);
    return type;
}

async function typecheckPrincipal(principal : Ast.Value,
                                  schemas : SchemaRetriever,
                                  classes : ClassMap,
                                  useMeta : boolean) {
    if (principal.isUndefined)
        return;
    if (!principal.isConstant())
        throw new TypeError(`Program principal must be a constant`);

    const type = await typeCheckValue(principal, new Scope, schemas, classes, useMeta);
    if (!(type instanceof EntityType) || !ALLOWED_PRINCIPAL_TYPES.has(type.type))
        throw new TypeError(`Invalid principal ${principal}, must be a contact or a group`);
}

function resolveOverload(overloads : Builtin.OpDefinition,
                         operator : string,
                         argTypes : Type[],
                         allowCast : boolean) : [Type[], Type] {
    for (const overload of overloads.types) {
        if (argTypes.length !== overload.length-1)
            continue;
        const typeScope : TypeScope = {};
        let good = true;
        for (let i = 0; i < argTypes.length; i++) {
            if (!Type.isAssignable(argTypes[i], overload[i], typeScope, allowCast)) {
                good = false;
                break;
            }
        }
        if (!good)
            continue;
        const resolved : Type[] = [];
        for (const type of overload) {
            if (typeof type === 'string')
                resolved.push(typeScope[type] as Type);
            else
                resolved.push(type);
        }

        if (resolved[overload.length-1] instanceof MeasureType && typeScope['_unit'])
            return [resolved, new Type.Measure(typeScope['_unit'] as string)];
        return [resolved, resolved[overload.length-1]];
    }
    throw new TypeError(`Invalid parameter types ${argTypes.join(', ')} for ${operator}`);
}

function resolveScalarExpressionOps(operator : string, argTypes : Type[]) {
    const op = Builtin.ScalarExpressionOps[operator];
    if (!op)
        throw new TypeError('Invalid operator ' + operator);
    return resolveOverload(op, operator, argTypes, true);
}

function resolveFilterOverload(type_lhs : Type, operator : string, type_rhs : Type) {
    log('resolve filter overload');
    const op = Builtin.BinaryOps[operator];
    if (!op)
        throw new TypeError('Invalid operator ' + operator);
    const [overload,] = resolveOverload(op, operator, [type_lhs, type_rhs], false);
    return overload;
}

async function typeCheckFilter(ast : Ast.BooleanExpression,
                               schema : Ast.ExpressionSignature|null,
                               scope : Scope = new Scope(),
                               schemas : SchemaRetriever,
                               classes : ClassMap,
                               useMeta : boolean) : Promise<void> {
    log('Type check filter ...');
    if (schema && schema.no_filter)
        throw new TypeError('Filter is not allowed on a query that has been filtered on a parameter marked as unique');
    return (async function recursiveHelper(ast : Ast.BooleanExpression) : Promise<void> {
        if (!ast)
            return;
        if (ast.isTrue || ast.isFalse)
            return;
        if (ast instanceof Ast.AndBooleanExpression || ast instanceof Ast.OrBooleanExpression) {
            await Promise.all(ast.operands.map((op : Ast.BooleanExpression) => recursiveHelper(op)));
            return;
        }
        if (ast instanceof Ast.NotBooleanExpression) {
            await recursiveHelper(ast.expr);
            return;
        }

        if (ast instanceof Ast.DontCareBooleanExpression) {
            const name = ast.name;
            let type_lhs = undefined;
            if (schema)
                type_lhs = schema.inReq[name] || schema.inOpt[name] || schema.out[name];
            if (!type_lhs)
                type_lhs = scope.get(name);
            if (!type_lhs)
                throw new TypeError('Invalid filter parameter ' + name);
            return;
        }

        if (ast instanceof Ast.AtomBooleanExpression) {
            const name = ast.name;
            let type_lhs = undefined;
            if (schema)
                type_lhs = schema.inReq[name] || schema.inOpt[name] || schema.out[name];
            if (!type_lhs)
                type_lhs = scope.get(name);
            if (!type_lhs || !(type_lhs instanceof Type))
                throw new TypeError('Invalid filter parameter ' + name);
            const type_rhs = await typeCheckValue(ast.value, scope, schemas, classes, useMeta);
            ast.overload = resolveFilterOverload(type_lhs, ast.operator, type_rhs);
            return;
        }

        if (ast instanceof Ast.ComputeBooleanExpression) {
            const type_lhs = await typeCheckValue(ast.lhs, scope, schemas, classes, useMeta);
            const type_rhs = await typeCheckValue(ast.rhs, scope, schemas, classes, useMeta);
            ast.overload = resolveFilterOverload(type_lhs, ast.operator, type_rhs);
            return;
        }

        assert(ast instanceof Ast.ExternalBooleanExpression);
        if (ast.schema === null)
            ast.schema = await loadSchema(schemas, classes, ast, 'query', useMeta);
        await typeCheckInputArgs(ast, ast.schema, scope, schemas, classes, useMeta);
        addRequiredInputParamsInvocation(ast, new Set<string>());
        await typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
    })(ast);
}

function resolveAggregationOverload(ast : Ast.AggregationTable,
                                    operator : string,
                                    field : string,
                                    schema : Ast.ExpressionSignature) {
    const fieldType = schema.out[field];
    if (!fieldType)
        throw new TypeError('Invalid aggregation field ' + field);
    const ag = Builtin.Aggregations[operator];
    if (!ag)
        throw new TypeError('Invalid aggregation ' + operator);

    for (const overload of ag.types) {
        const typeScope = {};
        if (!Type.isAssignable(fieldType, overload[0], typeScope, true))
            continue;

        ast.overload = overload.map((t) => resolveTypeVars(t, typeScope));
        return ast.overload[1];
    }

    throw new TypeError('Invalid field type ' + fieldType + ' for ' + operator);
}

function cleanOutput(schema : Ast.ExpressionSignature, scope : Scope) {
    scope.cleanOutput();
    const clone = schema.filterArguments((a) => a.is_input);
    clone.removeDefaultProjection();
    clone.removeMinimalProjection();
    assert(Array.isArray(clone.minimal_projection));
    return clone;
}

function addOutput(schema : Ast.ExpressionSignature,
                   name : string,
                   type : Type,
                   scope : Scope,
                   nl_annotations : Ast.NLAnnotationMap = {}) {
    scope.add(name, type);
    const clone = schema.addArguments([new Ast.ArgumentDef(schema.location,
        Ast.ArgDirection.OUT, name, type, { nl: nl_annotations })]);
    assert(Array.isArray(clone.minimal_projection));
    return clone;
}

function typeCheckAggregation(ast : Ast.AggregationTable, scope : Scope) {
    const schema = ast.table.schema!;

    let name, type, nl_annotations;
    if (ast.field === '*') {
        if (ast.operator !== 'count')
            throw new TypeError('* is not a valid argument to ' + ast.operator);
        type = Type.Number;
        ast.overload = [Type.Any, type];
        name = ast.alias ? ast.alias : 'count';
        nl_annotations = { canonical: 'count' };
    } else {
        type = resolveAggregationOverload(ast, ast.operator, ast.field, schema);
        name = ast.alias ? ast.alias : ast.field;
        nl_annotations = schema.getArgument(ast.field)!.nl_annotations;
    }

    ast.schema = addOutput(cleanOutput(schema, scope), name, type, scope, nl_annotations);
}

async function typeCheckComputation(ast : Ast.ComputeTable|Ast.ComputeStream,
                                    innerSchema : Ast.ExpressionSignature,
                                    scope : Scope,
                                    schemas : SchemaRetriever,
                                    classes : ClassMap,
                                    useMeta : boolean) {
    const name = ast.alias ? ast.alias : Utils.getScalarExpressionName(ast.expression);
    const type = await typeCheckValue(ast.expression, scope, schemas, classes, useMeta);

    ast.type = type;
    ast.schema = addOutput(innerSchema, name, type, scope);
}

function typeCheckSort(ast : Ast.SortedTable, scope : Scope) {
    const fieldType = ast.table.schema!.out[ast.field];
    if (!fieldType)
        throw new TypeError('Invalid sort field ' + ast.field);
    if (!fieldType.isComparable())
        throw new TypeError(`Invalid sort of non-comparable field ${ast.field}`);

    ast.schema = ast.table.schema;
}

async function typeCheckIndex(ast : Ast.IndexTable,
                              scope : Scope,
                              schemas : SchemaRetriever,
                              classes : ClassMap,
                              useMeta : boolean) {
    if (ast.indices.length === 1) {
        const valueType = await typeCheckValue(ast.indices[0], scope, schemas, classes, useMeta);
        if (valueType.isArray) {
            if (!Type.isAssignable(valueType, new Type.Array(Type.Number)))
                throw new TypeError(`Invalid index parameter, must be of type Array(Number)`);
        } else {
            if (!Type.isAssignable(valueType, Type.Number))
                throw new TypeError(`Invalid index parameter, must be a Number`);
        }
    } else {
        for (const index of ast.indices) {
            const valueType = await typeCheckValue(index, scope, schemas, classes, useMeta);
            if (!Type.isAssignable(valueType, Type.Number))
                throw new TypeError(`Invalid index parameter, must be a Number`);
        }
    }

    ast.schema = ast.table.schema;
}

async function typeCheckSlice(ast : Ast.SlicedTable,
                              scope : Scope,
                              schemas : SchemaRetriever,
                              classes : ClassMap,
                              useMeta : boolean) {
    const baseType = await typeCheckValue(ast.base, scope, schemas, classes, useMeta);
    const limitType = await typeCheckValue(ast.limit, scope, schemas, classes, useMeta);
    if (!Type.isAssignable(baseType, Type.Number))
        throw new TypeError(`Invalid slice offset parameter, must be a Number`);
    if (!Type.isAssignable(limitType, Type.Number))
        throw new TypeError(`Invalid slice limit parameter, must be a Number`);

    ast.schema = ast.table.schema;
}

function typeCheckMonitor(ast : Ast.MonitorStream) {
    const schema = ast.schema;
    assert(schema);
    if (ast.args) {
        ast.args.forEach((arg : string) => {
            if (!schema.hasArgument(arg) ||
                schema.isArgInput(arg))
                throw new TypeError('Invalid field name ' + arg);
        });
    }
    if (!schema.is_monitorable)
        throw new TypeError('monitor() applied to a non-monitorable query');

    return Promise.resolve();
}

function resolveFilter(filter : Ast.BooleanExpression,
                       schema : Ast.ExpressionSignature) {
    schema = schema.clone();

    // require_filter field is cleared after a filter
    schema.require_filter = false;
    if (schema instanceof Ast.FunctionDef)
        schema.annotations.require_filter = new Ast.Value.Boolean(false);

    schema.no_filter = false;
    /*
    schema.no_filter = (function recursiveHelper(ast) {
        if (!ast)
            return false;
        if (ast.isTrue || ast.isFalse)
            return false;
        if (ast.isCompute)
            return false;
        if (ast.isVarRef)
            return false;
        if (ast.isNot)
            return recursiveHelper(ast.expr);
        if (ast.isOr)
            return false;
        if (ast.isAnd) {
            const result = ast.operands.map((op) => recursiveHelper(op));
            if (result.includes(true))
                throw new TypeError('Filtering on parameter marked as unique cannot be combined with other filters');
            else
                return false;
        }
        if (ast.isAtom) {
            return !!schema.getArgument(ast.name).unique && ast.operator === '==';
        } else {
            assert(ast.isExternal);
            return false;
        }
    })(filter);
     */

    return schema;
}

function resolveProjection(args : string[],
                           schema : Ast.ExpressionSignature,
                           scope : Scope) {
    if (Object.keys(schema.out).length === 1)
        throw new TypeError('No projection is allowed if there is only one output parameter');
    if (args.length < 1) // this could be caused by normalization with nested projections
        throw new TypeError(`Invalid empty projection`);

    const argset = new Set(args);
    for (const arg of schema.minimal_projection||[])
        argset.add(arg);
    for (const arg of argset) {
        if (!schema.hasArgument(arg))
            throw new TypeError('Invalid field name ' + arg);
    }
    Object.keys(schema.out).forEach((arg) => {
        if (!argset.has(arg))
            scope.remove(arg);
    });

    const clone = schema.clone();
    assert(clone !== schema);
    // if default_projection is non-empty, it's overwritten after a projection
    clone.default_projection = [];
    if (clone instanceof Ast.FunctionDef)
        clone.annotations.default_projection = new Ast.Value.Array([]);
    const result = clone.filterArguments((a : Ast.ArgumentDef) => a.is_input || argset.has(a.name));
    assert(result !== schema && result !== clone);
    return result;
}

function resolveJoin(ast : Ast.JoinTable|Ast.JoinStream,
                     lhs : Ast.ExpressionSignature,
                     rhs : Ast.ExpressionSignature) {
    const joinargs : Ast.ArgumentDef[] = [];
    const joinargnames = new Set<string>();
    const joinparams = new Set<string>();
    for (const inParam of ast.in_params)
        joinparams.add(inParam.name);

    for (const rhsarg of rhs.iterateArguments()) {
        if (joinargnames.has(rhsarg.name))
            continue;
        if (joinparams.has(rhsarg.name))
            continue;
        joinargs.push(rhsarg);
        joinargnames.add(rhsarg.name);
    }
    for (const lhsarg of lhs.iterateArguments()) {
        if (joinargnames.has(lhsarg.name))
            continue;
        joinargs.push(lhsarg);
        joinargnames.add(lhsarg.name);
    }

    return new Ast.ExpressionSignature(
        ast.location,
        ast instanceof Ast.Stream ? 'stream' : 'query',
        null,
        [],
        joinargs,
        {
            is_list: lhs.is_list || rhs.is_list,
            is_monitorable: lhs.is_monitorable && rhs.is_monitorable,
            require_filter: lhs.require_filter || rhs.require_filter,
            default_projection: [...new Set<string>(lhs.default_projection.concat(rhs.default_projection || []))],
            minimal_projection: [...new Set<string>((lhs.minimal_projection || []).concat(rhs.minimal_projection || []))],
            no_filter: lhs.no_filter && rhs.no_filter
        }
    );
}

const VALID_DEVICE_ATTRIBUTES = ['name'];

async function typeCheckInputArgs(ast : Ast.Primitive|Ast.JoinStream|Ast.JoinTable,
                                  schema : Ast.ExpressionSignature,
                                  scope : Scope,
                                  schemas : SchemaRetriever,
                                  classes : ClassMap,
                                  useMeta : boolean) {
    if (ast instanceof Ast.Invocation ||
        ast instanceof Ast.ExternalBooleanExpression) {
        assert(ast.selector);

        if (ast.selector instanceof Ast.DeviceSelector) {
            const dupes = new Set;

            const attrscope = scope ? scope.clone() : new Scope;
            attrscope.cleanOutput();
            for (const attr of ast.selector.attributes) {
                if (dupes.has(attr.name))
                    throw new TypeError(`Duplicate device attribute ${attr.name}`);
                dupes.add(attr.name);

                if (VALID_DEVICE_ATTRIBUTES.indexOf(attr.name) < 0)
                    throw new TypeError(`Invalid device attribute ${attr.name}`);

                if (!attr.value.isVarRef && !attr.value.isConstant())
                    throw new TypeError(`Device attribute ${attr.value} must be a constant or variable`);
                const valueType = await typeCheckValue(attr.value, attrscope, schemas, classes, useMeta);
                if (!Type.isAssignable(valueType, Type.String, {}, false) || attr.value.isUndefined)
                    throw new TypeError(`Invalid type for device attribute ${attr.name}, have ${valueType}, need String`);
            }

            if (ast.selector.id && ast.selector.all)
                throw new TypeError(`all=true device attribute is incompatible with setting a device ID`);

            if (ast.selector.kind in classes) {
                const classdef = classes[ast.selector.kind];

                if (classdef.extends.length > 0 && classdef.extends.length === 1 && classdef.extends[0] === 'org.thingpedia.builtin.thingengine.remote')
                    ast.__effectiveSelector = new Ast.DeviceSelector(ast.selector.location, 'org.thingpedia.builtin.thingengine.remote', ast.selector.id, ast.selector.principal, ast.selector.attributes.slice());
                else
                    ast.__effectiveSelector = ast.selector;
            } else {
                ast.__effectiveSelector = ast.selector;
            }
        }
    }

    const presentParams = new Set<string>();
    for (const inParam of ast.in_params) {
        const inParamType = schema.getArgType(inParam.name);
        if (!inParamType || !schema.isArgInput(inParam.name))
            throw new TypeError('Invalid input parameter ' + inParam.name);

        const valueType = await typeCheckValue(inParam.value, scope, schemas, classes, useMeta);
        if (!Type.isAssignable(valueType, inParamType, {}, true))
            throw new TypeError(`Invalid type for parameter ${inParam.name}, have ${valueType}, need ${inParamType}`);
        if (presentParams.has(inParam.name))
            throw new TypeError('Duplicate input param ' + inParam.name);
        presentParams.add(inParam.name);
    }

    return schema.filterArguments((arg) => !presentParams.has(arg.name));
}

async function typeCheckTable(ast : Ast.Table,
                              schemas : SchemaRetriever,
                              scope : Scope,
                              classes : ClassMap,
                              useMeta = false) {
    if (ast instanceof Ast.VarRefTable) {
        ast.schema = await typeCheckInputArgs(ast, ast.schema!, scope, schemas, classes, useMeta);
        scope.addAll(ast.schema.out);
    } else if (ast instanceof Ast.InvocationTable) {
        ast.schema = await typeCheckInputArgs(ast.invocation, ast.invocation.schema!, scope, schemas, classes, useMeta);
        scope.addAll(ast.schema.out);
    } else if (ast instanceof Ast.FilteredTable) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        await typeCheckFilter(ast.filter, ast.table.schema!, scope, schemas, classes, useMeta);
        ast.schema = resolveFilter(ast.filter, ast.table.schema!);
    } else if (ast instanceof Ast.ProjectionTable) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        ast.schema = resolveProjection(ast.args, ast.table.schema!, scope);
    } else if (ast instanceof Ast.AliasTable) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        ast.schema = ast.table.schema;
        scope.addGlobal(ast.name, ast.schema!);
        scope.prefix(ast.name);
    } else if (ast instanceof Ast.AggregationTable) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        typeCheckAggregation(ast, scope);
    } else if (ast instanceof Ast.SortedTable) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        typeCheckSort(ast, scope);
    } else if (ast instanceof Ast.IndexTable) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        await typeCheckIndex(ast, scope, schemas, classes, useMeta);
    } else if (ast instanceof Ast.SlicedTable) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        await typeCheckSlice(ast, scope, schemas, classes, useMeta);
    } else if (ast instanceof Ast.JoinTable) {
        const leftscope = new Scope(scope);
        const rightscope = new Scope(scope);

        await typeCheckTable(ast.lhs, schemas, leftscope, classes, useMeta);
        await typeCheckTable(ast.rhs, schemas, rightscope, classes, useMeta);
        leftscope.$has_event = true;
        await typeCheckInputArgs(ast, ast.rhs.schema!, leftscope, schemas, classes, useMeta);
        ast.schema = resolveJoin(ast, ast.lhs.schema!, ast.rhs.schema!);
        scope.merge(leftscope);
        scope.merge(rightscope);
    } else if (ast instanceof Ast.ComputeTable) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        await typeCheckComputation(ast, ast.table.schema!, scope, schemas, classes, useMeta);
    } else {
        throw new Error('Not Implemented');
    }
}

async function typeCheckStream(ast : Ast.Stream,
                               schemas : SchemaRetriever,
                               scope : Scope,
                               classes : ClassMap,
                               useMeta = false) {
    if (ast instanceof Ast.VarRefStream) {
        ast.schema = await typeCheckInputArgs(ast, ast.schema!, scope, schemas, classes, useMeta);
        scope.addAll(ast.schema!.out);
    } else if (ast instanceof Ast.TimerStream) {
        ast.schema = new Ast.ExpressionSignature(ast.location, 'stream', null, [], [], {
            is_list: false, is_monitorable: true,
            minimal_projection: []
        });
        if (!Type.isAssignable(await typeCheckValue(ast.base, scope, schemas, classes, useMeta), Type.Date, {}, true))
            throw new TypeError(`Invalid type for timer base`);
        if (!Type.isAssignable(await typeCheckValue(ast.interval, scope, schemas, classes, useMeta), new Type.Measure('ms'), {}, true))
            throw new TypeError(`Invalid type for timer interval`);
        scope.addAll(ast.schema.out);
    } else if (ast instanceof Ast.AtTimerStream) {
        ast.schema = new Ast.ExpressionSignature(ast.location, 'stream', null, [], [], {
            is_list: false, is_monitorable: true,
            minimal_projection: []
        });
        for (let i = 0; i < ast.time.length; i++) {
            const value = ast.time[i];
            if (!Type.isAssignable(await typeCheckValue(value, scope, schemas, classes, useMeta), Type.Time, {}, true))
            throw new TypeError(`Invalid type for attimer time`);
        }
        if (ast.expiration_date !== null) {
            if (!Type.isAssignable(await typeCheckValue(ast.expiration_date, scope, schemas, classes, useMeta), Type.Date, {}, true))
                throw new TypeError(`Invalid type for attimer expiration_date`);
        }
        scope.addAll(ast.schema.out);
    } else if (ast instanceof Ast.MonitorStream) {
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        ast.schema = ast.table.schema!.asType('stream');
        await typeCheckMonitor(ast);
    } else if (ast instanceof Ast.EdgeNewStream) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = ast.stream.schema;
    } else if (ast instanceof Ast.EdgeFilterStream) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = ast.stream.schema;
        await typeCheckFilter(ast.filter, ast.schema!, scope, schemas, classes, useMeta);
    } else if (ast instanceof Ast.FilteredStream) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = resolveFilter(ast.filter, ast.stream.schema!);
        await typeCheckFilter(ast.filter, ast.schema!, scope, schemas, classes, useMeta);
    } else if (ast instanceof Ast.AliasStream) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = ast.stream.schema;
        scope.addGlobal(ast.name, ast.schema!);
        scope.prefix(ast.name);
    } else if (ast instanceof Ast.ProjectionStream) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        ast.schema = resolveProjection(ast.args, ast.stream.schema!, scope);
    } else if (ast instanceof Ast.JoinStream) {
        const leftscope = new Scope(scope);
        const rightscope = new Scope(scope);

        await typeCheckStream(ast.stream, schemas, leftscope, classes, useMeta);
        await typeCheckTable(ast.table, schemas, rightscope, classes, useMeta);
        leftscope.$has_event = true;
        await typeCheckInputArgs(ast, ast.table.schema!, leftscope, schemas, classes, useMeta);
        ast.schema = resolveJoin(ast, ast.stream.schema!, ast.table.schema!);
        scope.merge(leftscope);
        scope.merge(rightscope);
    } else if (ast instanceof Ast.ComputeStream) {
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        await typeCheckComputation(ast, ast.stream.schema!, scope, schemas, classes, useMeta);
    } else {
        throw new Error('Not Implemented');
    }
}

async function typeCheckAction(ast : Ast.Action,
                               schemas : SchemaRetriever,
                               scope : Scope,
                               classes : ClassMap,
                               useMeta : boolean) {
    if (ast instanceof Ast.NotifyAction)
        ast.schema = await loadNotifyAction(ast.name);
    else if (ast instanceof Ast.InvocationAction)
        ast.schema = await typeCheckInputArgs(ast.invocation, ast.invocation.schema!, scope, schemas, classes, useMeta);
    else if (ast instanceof Ast.VarRefAction)
        ast.schema = await typeCheckInputArgs(ast, ast.schema!, scope, schemas, classes, useMeta);
    else
        throw new Error('Not Implemented');
}

function addRequiredInputParamsInvocation(prim : Ast.Primitive,
                                          extrainparams : Set<string>) {
    const present = new Set<string>();
    for (const in_param of prim.in_params)
        present.add(in_param.name);

    for (const name in prim.schema!.inReq) {
        if (!present.has(name) && (!extrainparams || !extrainparams.has(name)))
            prim.in_params.push(new Ast.InputParam(prim.location, name, new Ast.Value.Undefined(true)));
    }
}

function addRequiredInputParamsStream(stream : Ast.Stream) {
    if (stream instanceof Ast.TimerStream ||
        stream instanceof Ast.AtTimerStream)
        return;
    if (stream instanceof Ast.JoinStream) {
        const extrainparams = new Set(stream.in_params.map((ip) => ip.name));
        addRequiredInputParamsStream(stream.stream);
        addRequiredInputParamsTable(stream.table, extrainparams);
        return;
    }

    if (stream instanceof Ast.VarRefStream)
        addRequiredInputParamsInvocation(stream, new Set<string>());
    else if (Utils.isUnaryStreamToStreamOp(stream))
        addRequiredInputParamsStream(stream.stream);
    else if (Utils.isUnaryTableToStreamOp(stream))
        addRequiredInputParamsTable(stream.table, new Set<string>());
    else
        throw new TypeError();
}
function addRequiredInputParamsTable(table : Ast.Table,
                                     extrainparams : Set<string>) {
    if (table instanceof Ast.JoinTable) {
        const newextrainparams = new Set<string>(table.in_params.map((ip) => ip.name));
        if (extrainparams) {
            for (const name in extrainparams)
                newextrainparams.add(name);
        }
        addRequiredInputParamsTable(table.lhs, extrainparams);
        addRequiredInputParamsTable(table.rhs, newextrainparams);
        return;
    }

    if (table instanceof Ast.VarRefTable)
        addRequiredInputParamsInvocation(table, extrainparams);
    else if (table instanceof Ast.InvocationTable)
        addRequiredInputParamsInvocation(table.invocation, extrainparams);
    else if (Utils.isUnaryTableToTableOp(table))
        addRequiredInputParamsTable(table.table, extrainparams);
    else
        throw new TypeError();
}

function addRequiredInputParamsAction(action : Ast.Action) {
    if (action instanceof Ast.NotifyAction)
        return;

    if (action instanceof Ast.VarRefAction)
        addRequiredInputParamsInvocation(action, new Set<string>());
    else if (action instanceof Ast.InvocationAction)
        addRequiredInputParamsInvocation(action.invocation, new Set<string>());
    else
        throw new TypeError();
}

type OldPrimType = 'stream'|'table'|'query'|'action'|'filter';

async function loadOneSchema(schemas : SchemaRetriever,
                             scope : Scope,
                             classes : ClassMap,
                             useMeta : boolean,
                             primType : OldPrimType,
                             prim : Ast.Primitive) {
    if (primType === 'table' || primType === 'filter')
        primType = 'query';

    let schema;
    if (prim instanceof Ast.VarRefTable ||
        prim instanceof Ast.VarRefStream ||
        prim instanceof Ast.VarRefAction) {
        if (scope.has(prim.name))
            schema = scope.get(prim.name);
        else
            schema = await schemas.getMemorySchema(prim.name, useMeta);
        if (schema === null)
            throw new TypeError(`Cannot find declaration ${prim.name} in memory`);
        if (!(schema instanceof Ast.ExpressionSignature) || schema.functionType !== primType)
            throw new TypeError(`Variable ${prim.name} does not name a ${primType}`);
    } else {
        assert(primType !== 'stream');
        schema = await loadSchema(schemas, classes, prim, primType, useMeta);
    }
    if (prim.schema === null)
        prim.schema = schema;
}

async function loadAllSchemas(ast : Ast.Node,
                              schemas : SchemaRetriever,
                              scope : Scope,
                              classes : ClassMap,
                              useMeta : boolean) {
    return Promise.all(Array.from(ast.iteratePrimitives(true)).map(async ([primType, prim] : [OldPrimType, Ast.Primitive]) => {
        return loadOneSchema(schemas, scope, classes, useMeta, primType, prim);
    }));
}

async function typeCheckClass(klass : Ast.ClassDef,
                              schemas : SchemaRetriever,
                              classes : ClassMap,
                              useMeta : boolean,
                              isLibrary : boolean) : Promise<void> {
    if (!isLibrary) {
        if (klass.extends.length > 0 && klass.extends[0] === 'remote')
            klass.extends = ['org.thingpedia.builtin.thingengine.remote'];
        if (klass.extends.length > 0 && klass.extends.length !== 1 && klass.extends[0] !== 'org.thingpedia.builtin.thingengine.remote')
            throw new TypeError('Inline class definitions that extend other than @org.thingpedia.builtin.thingengine.remote are not supported');
    }

    Object.entries(klass.metadata).forEach(([name, value] : [string, Ast.Value]) => {
        if (typeof value !== 'string')
            throw new TypeError('Invalid value type for natural language annotations');
    });
    const imported = new Set();
    for (const import_stmt of klass.imports) {
        if (import_stmt instanceof Ast.MixinImportStmt) {
            for (const facet of import_stmt.facets) {
                if (['config', 'loader'].includes(facet) && klass.is_abstract)
                    throw new TypeError('Abstract class should not contain config or loader modules');
                if (imported.has(facet))
                    throw new TypeError(`${facet} mixin imported multiple times`);
                imported.add(facet);
            }
            const mixin = await schemas.getMixins(import_stmt.module);
            await typeCheckMixin(import_stmt, mixin, schemas, classes, useMeta);
        }
    }

    for (const [, query] of Object.entries(klass.queries))
        await typeCheckFunctionDef('query', query, schemas, useMeta);
     for (const [, action] of Object.entries(klass.actions))
        await typeCheckFunctionDef('action', action, schemas, useMeta);
}

interface MixinDeclaration {
    kind : string;
    types : Type[];
    args : string[];
    required : boolean[];
    is_input : boolean[];
    facets : string[];
}

async function typeCheckMixin(import_stmt : Ast.MixinImportStmt,
                              mixin : MixinDeclaration,
                              schemas : SchemaRetriever,
                              classes : ClassMap,
                              useMeta : boolean) {
    const presentParams = new Set<string>();
    for (const in_param of import_stmt.in_params) {
        const i = mixin.args.indexOf(in_param.name);
        if (i === -1 || !mixin.is_input[i])
            throw new TypeError(`Invalid parameter ${in_param.name} for mixin ${mixin.kind}`);
        if (presentParams.has(in_param.name))
            throw new TypeError(`Duplicate input parameter ${in_param.name}`);
        presentParams.add(in_param.name);
        if (in_param.value.isUndefined)
            continue;
        if (!in_param.value.isConstant())
            throw new TypeError(`Mixin parameter ${in_param.name} must be a constant`);
        const inParamType = mixin.types[i];
        const valueType = await typeCheckValue(in_param.value, new Scope, schemas, classes, useMeta);
        if (!Type.isAssignable(valueType, inParamType, {}, true))
            throw new TypeError(`Invalid type for parameter ${in_param.name}, have ${valueType}, need ${inParamType}`);
    }
    for (let i = 0; i < mixin.args.length; i ++ ) {
        if (mixin.required[i] && !presentParams.has(mixin.args[i]))
            throw new TypeError(`Missing required parameter ${mixin.args[i]}`);
    }
}

function typeCheckMetadata(func : unknown) {
    /*Object.entries(func.metadata).forEach(([name, value]) => {
        if (name === 'canonical' && typeof value === 'object') {
            if (!('default' in value))
                throw new TypeError(`"default" is required in canonical to specify which phrase to use by default`);
            if (!(value.default in value))
                throw new TypeError(`Missing the specified default phrase in canonical.`);
            Object.entries(value).forEach(([name, value]) => {
                if (name === 'default') {
                    if (typeof value !== 'string')
                        throw new TypeError(`Invalid value type for ${name} in canonical, expected a string`);
                } else if (name === 'apv' || name === 'npv') {
                    if (typeof value !== 'boolean')
                        throw new TypeError(`Invalid value type for ${name} in canonical, expected a boolean`);
                } else {
                    if (!Array.isArray(value))
                        throw new TypeError(`Invalid value type for ${name} in canonical, expected an array`);
                    value.forEach((v) => {
                        if (typeof v !== 'string')
                            throw new TypeError(`Invalid value type for ${name} in canonical, expected an array of strings`);
                    });
                }
            });
        } else if (name === 'formatted') {
            // FIXME check harder
            if (!Array.isArray(value))
                throw new TypeError('Expected an array for "formatted" annotation');
        } else if (typeof value !== 'string') {
            throw new TypeError(`Invalid value type for natural language annotation ${name}`);
        }
    });
    */
}

function typeCheckFunctionAnnotations(func : Ast.FunctionDef) {
    Object.entries(func.annotations).forEach(([name, value] : [string, Ast.Value]) => {
        if (!value.isConstant())
            throw new Error(`Annotation #[${name}] must be a constant`);

        switch (name) {
            case 'doc':
            case 'url':
                if (!value.isString)
                    throw new TypeError(`Invalid type ${value.getType()} for #[${name}] annotation, expected a string`);
                break;
            case 'handle_thingtalk':
            case 'require_filter':
                if (!value.isBoolean)
                    throw new TypeError(`Invalid type ${value.getType()} for #[${name}] annotation, expected a boolean`);
                break;
            case 'default_projection':
                if (!(value instanceof Ast.ArrayValue))
                    throw new TypeError(`Invalid type ${value.getType()} for #[${name}] annotation, expected an array`);
                value.value.forEach((param : Ast.Value) => {
                    if (!(param instanceof Ast.StringValue))
                        throw new TypeError(`Invalid type ${param.getType()} in #[${name}] annotation, expected a string`);
                    if (!func.args.includes(param.value))
                        throw new TypeError(`Invalid parameter ${param.value} in #[${name}] annotation, the parameter does not exist.`);
                });
                break;
            default:
        }
    });
}

function typeCheckFunctionInheritance(func : Ast.FunctionDef) {
    if (func.extends.length === 0)
        return;
    const functions : string[] = [];
    const args : TypeMap = {};
    for (const fname of func.iterateBaseFunctions()) {
        if (functions.includes(fname))
            continue;
        functions.push(fname);
        const f = func.class!.getFunction(func.functionType, fname);
        if (!f)
            throw new TypeError(`Cannot find ${func.functionType} with name ${fname}`);
        for (const a of f.args) {
            // parameters with the same name are allowed, but must have the same type
            const argtype = f.getArgType(a) as Type;

            if (a in args) {
                // skip entities when check correctness
                // FIXME: implement entity inheritance
                if (args[a].isEntity && argtype.isEntity)
                    continue;
                if (!args[a].equals(argtype))
                    throw new TypeError(`Parameter ${a} is defined multiple times in ${func.functionType} ${func.name} with different types`);
            } else {
                args[a] = argtype;
            }
        }

        if (func.is_monitorable && !f.is_monitorable)
            throw new TypeError(`Monitorable query ${func.name} cannot extends non-monitorable query ${f.name}`);
            // the reverse is allowed
            // e.g., if func add a new non-monitorable parameter to monitable function f, func becomes non-monitorable
    }
}

async function typeCheckFunctionDef(type : 'query'|'action',
                                    func : Ast.FunctionDef,
                                    schemas : SchemaRetriever,
                                    useMeta : boolean) {
    for (const argname of func.args) {
        const arg = func.getArgument(argname) as Ast.ArgumentDef;
        if (arg.type instanceof UnknownType)
            throw new TypeError(`Invalid type ${arg.type.name}`);
        typeCheckMetadata(arg);

        for (const name in arg.impl_annotations) {
            const value = arg.impl_annotations[name];
            if (!value.isConstant())
                throw new TypeError(`Annotation #[${name}] must be a constant`);
        }

        if (arg.impl_annotations.min_number && !arg.type.isNumeric())
            throw new TypeError(`Annotation #[min_number] is only valid on numeric types`);
        if (arg.impl_annotations.max_number && !arg.type.isNumeric())
            throw new TypeError(`Annotation #[max_number] is only valid on numeric types`);

        for (const name of ['default', 'min_number', 'max_number']) {
            const value = arg.impl_annotations[name];
            if (!value)
                continue;

            if (!Type.isAssignable(await typeCheckValue(value, new Scope, schemas, {}, useMeta), arg.type, {}))
                throw new TypeError(`Invalid #[${name}] annotation: must be a ${arg.type}`);
        }
    }

    typeCheckMetadata(func);
    typeCheckFunctionAnnotations(func);
    typeCheckFunctionInheritance(func);

    if (type === 'query') {
        if (func.is_monitorable) {
            const poll_interval = func.annotations['poll_interval'];
            if (poll_interval) {
                if (!(poll_interval instanceof Ast.MeasureValue) || Units.normalizeUnit(poll_interval.unit) !== 'ms')
                    throw new TypeError(`Invalid value type for poll_interval.`);
            }
        } else if ('poll_interval' in func.annotations) {
            throw new TypeError(`Invalid annotation poll_interval for non-monitorable query ${func.name}.`);
        }
    }

    if (type === 'action') {
        if ('poll_interval' in func.annotations)
            throw new TypeError(`Invalid annotation poll_interval for action ${func.name}.`);
        // this is syntactically impossible, but also not meaningful
        // the other check, is_list, is also syntactically impossible but might be allowed in the future
        // so we don't throw
        if (func.is_monitorable)
            throw new TypeError(`Actions cannot be monitorable.`);
    }
}

function typeCheckDeclarationArgs(args : TypeMap) {
    for (const name in args) {
        const type = args[name];
        if (type instanceof UnknownType)
            throw new TypeError(`Invalid type ${type.name}`);
    }
}

async function typeCheckProcedure(ast : Ast.Example|Ast.Declaration) {
    const value = ast.value as Ast.Program;

    let hasNotify = false;
    for (const stmt of value.rules) {
        if (stmt instanceof Ast.Rule)
            throw new TypeError(`Continuous statements are not allowed in nested procedures`);

        if (stmt instanceof Ast.Assignment)
            continue;
        assert(stmt instanceof Ast.Command);
        if (stmt.actions.some((a : Ast.Action) => a.isNotify)) {
            if (hasNotify)
                throw new TypeError(`Multiple statements with 'notify' are not allowed in nested procedures`);
            hasNotify = true;
        }
    }
}

async function typeCheckDeclarationCommon(ast : Ast.Example|Ast.Declaration,
                                          schemas : SchemaRetriever,
                                          scope : Scope,
                                          classes : ClassMap,
                                          useMeta : boolean) {
    typeCheckDeclarationArgs(ast.args);
    scope.addLambdaArgs(ast.args);
    await loadAllSchemas(ast, schemas, scope, classes, useMeta);

    switch (ast.type) {
        case 'stream':
            addRequiredInputParamsStream(ast.value as Ast.Stream);
            await typeCheckStream(ast.value as Ast.Stream, schemas, scope, classes, useMeta);
            break;
        case 'query':
            addRequiredInputParamsTable(ast.value as Ast.Table, new Set<string>());
            await typeCheckTable(ast.value as Ast.Table, schemas, scope, classes, useMeta);
            break;
        case 'action':
            addRequiredInputParamsAction(ast.value as Ast.Action);
            await typeCheckAction(ast.value as Ast.Action, schemas, scope, classes, useMeta);
            break;
        case 'program':
        case 'procedure':
            await typeCheckProgram(ast.value as Ast.Program, schemas, useMeta, classes, scope);
            if (ast.type === 'procedure')
                await typeCheckProcedure(ast);

            break;
        default:
            throw new TypeError(`Invalid declaration type ${ast.type}`);
    }
}

function makeFunctionSchema(ast : Ast.Declaration) : Ast.FunctionDef {
    assert(ast.type !== 'program' && ast.type !== 'procedure');
    assert(!(ast.value instanceof Ast.Program));

    // remove all input parameters (which will be filled with undefined)
    // and add the lambda arguments
    const schema = ast.value.schema!;

    const argdefs : Ast.ArgumentDef[] = schema.args
        .map((argname : string) => schema.getArgument(argname) as Ast.ArgumentDef)
        .filter((arg : Ast.ArgumentDef) => !arg.is_input)
        .concat(Object.keys(ast.args).map((name) =>
        new Ast.ArgumentDef(ast.location, Ast.ArgDirection.IN_REQ, name, ast.args[name], {})));

    return new Ast.FunctionDef(
        ast.location,
        ast.type,
        null,
        ast.name,
        [],
        {
            is_list: schema.is_list,
            is_monitorable: schema.is_monitorable
        },
        argdefs,
        {
            nl: ast.nl_annotations,
            impl: ast.impl_annotations
        }
    );
}

function makeProgramSchema(ast : Ast.Declaration, isProcedure : boolean) {
    const args : Ast.ArgumentDef[] = Object.keys(ast.args).map((name : string) =>
        new Ast.ArgumentDef(ast.location, Ast.ArgDirection.IN_REQ, name, ast.args[name], {}));

    const value = ast.value as Ast.Program;
    if (isProcedure) {
        // add output arguments from the statement that includes a `notify` clause
        // (there can be at most once)
        for (const stmt of value.rules) {
            if (!(stmt instanceof Ast.Command))
                continue;

            if (!stmt.actions.some((a) => a.isNotify))
                continue;

            assert(stmt.table);
            const outargs : Ast.ArgumentDef[] = Array.from(stmt.table.schema!.iterateArguments()).filter((a : Ast.ArgumentDef) => !a.is_input);
            args.push(...outargs);
        }
    }

    // a program/procedure can be called on the action side, so it's an action
    return new Ast.FunctionDef(ast.location, 'action', null, ast.name, [],
        { is_list: false, is_monitorable: false}, args,
        { nl: ast.nl_annotations, impl: ast.impl_annotations });
}

async function typeCheckDeclaration(ast : Ast.Declaration,
                                    schemas : SchemaRetriever,
                                    scope : Scope,
                                    classes : ClassMap,
                                    useMeta : boolean) {
    await typeCheckDeclarationCommon(ast, schemas, scope, classes, useMeta);
    typeCheckMetadata(ast);

    if (ast.type === 'program' || ast.type === 'procedure')
        ast.schema = makeProgramSchema(ast, ast.type === 'procedure');
    else
        ast.schema = makeFunctionSchema(ast);
    scope.addGlobal(ast.name, ast.schema);
}

async function typeCheckExample(ast : Ast.Example,
                                schemas : SchemaRetriever,
                                classes : ClassMap = {},
                                useMeta = false) : Promise<void> {
    await typeCheckDeclarationCommon(ast, schemas, new Scope(), classes, useMeta);

    if (!Array.isArray(ast.utterances))
        throw new TypeError('Utterances annotation expects an array');
    for (const utterance of ast.utterances) {
        if (typeof utterance !== 'string')
            throw new TypeError('Utterance can only be a string');
    }
}

async function typeCheckAssignment(ast : Ast.Assignment,
                                   schemas : SchemaRetriever,
                                   scope : Scope,
                                   classes : ClassMap,
                                   useMeta = false) {
    // if the value is an invocation or varref, without any computation on the result,
    // we allow it to be an action or varref to an action
    if (ast.value instanceof Ast.InvocationTable || ast.value instanceof Ast.VarRefTable) {
        try {
            if (ast.value instanceof Ast.InvocationTable)
                await loadOneSchema(schemas, scope, classes, useMeta, 'action', ast.value.invocation);
            else
                await loadOneSchema(schemas, scope, classes, useMeta, 'action', ast.value);
            ast.isAction = true;
        } catch(e) { /* ignore if it is not an action */ }
    }

    if (!ast.isAction) {
        await loadAllSchemas(ast, schemas, scope, classes, useMeta);

        // if isAction was `undefined` (before typechecking) overwrite it to `false`
        ast.isAction = false;
    }

    addRequiredInputParamsTable(ast.value, new Set<string>());
    await typeCheckTable(ast.value, schemas, scope, classes, useMeta);

    // remove all input parameters (which we have filled with $undefined)
    const args = Array.from(ast.value.schema!.iterateArguments()).filter((a) => !a.is_input);
    ast.schema = new Ast.FunctionDef(ast.location, 'query', null, ast.name, [],
        { is_list: ast.value.schema!.is_list, is_monitorable: false }, args, {});
    scope.addGlobal(ast.name, ast.schema);
}

async function typeCheckRule(ast : Ast.Rule|Ast.Command|Ast.OnInputChoice,
                             schemas : SchemaRetriever,
                             scope : Scope,
                             classes : ClassMap,
                             useMeta = false) {
    await loadAllSchemas(ast, schemas, scope, classes, useMeta);

    if (ast instanceof Ast.Rule) {
        addRequiredInputParamsStream(ast.stream);
        await typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        if (ast.stream.schema!.require_filter)
            throw new TypeError('Filter required');
    } else if (ast.table !== undefined && ast.table !== null) {
        addRequiredInputParamsTable(ast.table, new Set<string>());
        await typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        if (ast.table.schema!.require_filter)
            throw new TypeError('Filter required');
    }
    scope.$has_event = !!(ast instanceof Ast.Rule || ast.table);

    if (ast.actions.some((a) => a.isNotify)
        && (ast instanceof Ast.Command || ast instanceof Ast.OnInputChoice)
        && !ast.table)
        throw new TypeError('Cannot return a result without a GET function');

    for (const prim of ast.actions)
        addRequiredInputParamsAction(prim);
    await Promise.all(
        ast.actions.map((action) => typeCheckAction(action, schemas, scope, classes, useMeta)));
}

async function typeCheckProgram(ast : Ast.Program,
                                schemas : SchemaRetriever,
                                useMeta = false,
                                classes : ClassMap = {},
                                parentScope : Scope|null = null) : Promise<void> {
    ast.classes.forEach((ast) => {
        classes[ast.name] = ast;
    });

    const scope = new Scope(parentScope);
    if (ast.principal !== null)
        await typecheckPrincipal(ast.principal, schemas, classes, useMeta);

    for (const klass of ast.classes)
        await typeCheckClass(klass, schemas, classes, useMeta, false);
    for (const decl of ast.declarations) {
        scope.clean();
        await typeCheckDeclaration(decl, schemas, scope, classes, useMeta);
    }
    /*if (ast.rules.length === 0 && ast.oninputs.length === 0)
        throw new TypeError(`A program must include at least one executable or oninput statement`);*/

    for (const decl of ast.rules) {
        scope.clean();
        if (decl instanceof Ast.Assignment)
            await typeCheckAssignment(decl, schemas, scope, classes, useMeta);
        else
            await typeCheckRule(decl, schemas, scope, classes, useMeta);
    }
    for (const choice of ast.oninputs) {
        scope.clean();
        await typeCheckRule(choice, schemas, scope, classes, useMeta);
    }
}

async function typeCheckDialogue(ast : Ast.DialogueState,
                                 schemas : SchemaRetriever,
                                 useMeta = false) : Promise<void> {
    for (const item of ast.history) {
        const scope = new Scope(null);
        await typeCheckRule(item.stmt, schemas, scope, {}, useMeta);

        if (item.results !== null) {
            if (!item.results.count.isConstant() ||
                !Type.isAssignable(await typeCheckValue(item.results.count, new Scope, schemas, {}, useMeta), Type.Number, {}))
                throw new TypeError(`History annotation #[count] must be a constant of Number type`);
            if (item.results.error) {
                if (!item.results.error.isConstant())
                    throw new TypeError(`History annotation #[error] must be a constant of String or Enum type`);

                const type = await typeCheckValue(item.results.error, new Scope, schemas, {}, useMeta);
                if (!type.isString && !type.isEnum)
                    throw new TypeError(`History annotation #[error] must be a constant of String or Enum type`);
            }

            for (const result of item.results.results) {
                for (const key in result.value) {
                    if (!result.value[key].isConstant())
                        throw new TypeError(`Program results must be constants, found ${result.value[key]}`);
                }
            }
        }
    }
}

async function getAllowedSchema(allowed : Ast.PermissionFunction,
                                schemaType : 'query'|'action',
                                schemas : SchemaRetriever,
                                getMeta : boolean) {
    if (!(allowed instanceof Ast.SpecifiedPermissionFunction) || allowed.schema)
        return;

    allowed.schema = await Utils.getSchemaForSelector(schemas, allowed.kind, allowed.channel, schemaType, getMeta, {});
}

async function typecheckPermissionFunction(fn : Ast.PermissionFunction,
                                           scope : Scope,
                                           schemas : SchemaRetriever,
                                           getMeta : boolean) {
    if (!(fn instanceof Ast.SpecifiedPermissionFunction))
        return;

    await typeCheckFilter(fn.filter, fn.schema, scope, schemas, {}, getMeta);
}

async function typeCheckPermissionRule(permissionRule : Ast.PermissionRule,
                                       schemas : SchemaRetriever,
                                       getMeta = false) : Promise<void> {
    await Promise.all([
        getAllowedSchema(permissionRule.query, 'query', schemas, getMeta),
        getAllowedSchema(permissionRule.action, 'action', schemas, getMeta),
    ]);

    {
        const scope = new Scope();
        scope.add('source', new Type.Entity('tt:contact'));
        await typeCheckFilter(permissionRule.principal, null, scope, schemas, {}, getMeta);
    }

    {
        const scope = new Scope();
        await typecheckPermissionFunction(permissionRule.query, scope, schemas, getMeta);
        scope.$has_event = true;
        await typecheckPermissionFunction(permissionRule.action, scope, schemas, getMeta);
    }
}

async function typeCheckDataset(dataset : Ast.Dataset,
                                schemas : SchemaRetriever,
                                classes : ClassMap,
                                getMeta = false) {
    for (const ex of dataset.examples)
        await typeCheckExample(ex, schemas, classes, getMeta);
}

async function typeCheckMeta(meta : Ast.Library,
                             schemas : SchemaRetriever,
                             getMeta = false) : Promise<void> {
    const classes : ClassMap = {};
    for (const klass of meta.classes) {
        await typeCheckClass(klass, schemas, classes, getMeta, true);
        classes[klass.name] = klass;
    }
    for (const dataset of meta.datasets)
        await typeCheckDataset(dataset, schemas, classes, getMeta);
}

async function typeCheckBookkeeping(intent : Ast.BookkeepingIntent,
                                    schemas : SchemaRetriever,
                                    getMeta = false) : Promise<void> {
    if (intent instanceof Ast.SpecialBookkeepingIntent) {
        if (Ast.BookkeepingSpecialTypes.indexOf(intent.type) < 0)
            throw new TypeError(`Invalid special ${intent.type}`);
    } else if (intent instanceof Ast.CommandListBookkeepingIntent) {
        const valueType = await typeCheckValue(intent.device, new Scope, schemas, {}, getMeta);
        if (!Type.isAssignable(valueType, new Type.Entity('tt:device'), {}, true))
            throw new TypeError('Invalid device parameter');
    }
}

export {
    typeCheckBookkeeping,
    typeCheckProgram,
    typeCheckDialogue,
    typeCheckFilter,
    typeCheckPermissionRule,
    typeCheckMeta,
    typeCheckClass,
    typeCheckExample
};
