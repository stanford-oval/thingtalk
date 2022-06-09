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
import Type from './type';
import * as Utils from './utils';
import * as Builtin from './operators';
import type SchemaRetriever from './schema';

const ALLOWED_PRINCIPAL_TYPES = new Set([
    'tt:contact', 'tt:username'
]);
const ALLOWED_RELATIVE_TIMES = new Set(['morning', 'evening']);
const ALLOWED_RELATIVE_LOCATIONS = new Set(['current_location', 'home', 'work']);

function log(message : string) : void {
    const debug = false;
    if (debug) console.log(message);
}

class Scope {
    private _parentScope : Scope|null;
    private _globalScope : { [key : string] : Ast.FunctionDef };
    private _lambda_args : Type.TypeMap;
    private _scope : Type.TypeMap;
    $has_event : boolean;
    $has_source : boolean;

    constructor(parentScope : Scope|null = null) {
        this._parentScope = parentScope;
        this._globalScope = {};
        this._scope = {};
        this._lambda_args = {};
        this.$has_event = false;
        this.$has_source = false;
    }

    has(name : string) : boolean {
        const here = name in this._scope || name in this._lambda_args || name in this._globalScope;
        if (here)
            return true;
        if (this._parentScope)
            return this._parentScope.has(name);
        return false;
    }

    addLambdaArgs(args : Type.TypeMap) : void {
        for (const name in args)
            this._lambda_args[name] = args[name];
    }

    add(name : string, type : Type) : void {
        this._scope[name] = type;
    }
    addAll(args : Type.TypeMap) : void {
        for (const name in args)
            this._scope[name] = args[name];
    }

    addGlobal(name : string, schema : Ast.FunctionDef) : void {
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
        const new_scope : Type.TypeMap = {};
        for (const name in this._scope) {
            new_scope[name] = this._scope[name];
            new_scope[prefix + '.' + name] = this._scope[name];
        }
        this._scope = new_scope;
    }

    get(name : string) : Type|Ast.FunctionDef|undefined {
        let v : Type|Ast.FunctionDef|undefined = this._scope[name] || this._lambda_args[name] || this._globalScope[name];
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

type ClassMap = { [key : string] : Ast.ClassDef };

function resolveTypeVars(type : Type|string, typeScope : Type.TypeScope) : Type {
    if (typeof type === 'string')
        return resolveTypeVars(typeScope[type], typeScope);
    if (type instanceof Type.Array)
        return new Type.Array(resolveTypeVars(type.elem, typeScope));
    if (type instanceof Type.Measure && typeScope._unit)
        return new Type.Measure(typeScope._unit as string);
    return type;
}


function cleanOutput(schema : Ast.FunctionDef, scope : Scope) {
    scope.cleanOutput();
    const clone = schema.filterArguments((a) => a.is_input);
    clone.removeDefaultProjection();
    clone.removeMinimalProjection();
    assert(Array.isArray(clone.minimal_projection));
    return clone;
}

function addOutput(schema : Ast.FunctionDef,
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

const VALID_DEVICE_ATTRIBUTES = ['name'];
type OldPrimType = 'stream'|'table'|'query'|'action'|'filter'|'expression';

interface MixinDeclaration {
    kind : string;
    types : Type[];
    args : string[];
    required : boolean[];
    is_input : boolean[];
    facets : string[];
}

export default class TypeChecker {
    private _schemas : SchemaRetriever;
    private _classes : ClassMap;
    private _useMeta : boolean;
    private _entitySubTypeMap : Type.EntitySubTypeMap;
    private _cachedEntityAncestors : Record<string, string[]>;

    constructor(schemas : SchemaRetriever,
                useMeta = false) {
        this._schemas = schemas;
        this._useMeta = useMeta;
        this._classes = {};
        this._entitySubTypeMap = {};
        this._cachedEntityAncestors = {};
    }

    private async _ensureEntitySubTypes(entityType : string) {
        if (!entityType)
            return;
        if (this._entitySubTypeMap[entityType] !== undefined)
            return;

        const parents : string[] = await this._schemas.getEntityParents(entityType);
        this._entitySubTypeMap[entityType] = parents;
        for (const parent of parents)
            await this._ensureEntitySubTypes(parent);
    }

    private _getEntityAncestors(entityType : string) {
        if (entityType in this._cachedEntityAncestors)
            return this._cachedEntityAncestors[entityType];
        const ancestors : string[] = [];
        const parents : string[] = this._entitySubTypeMap[entityType] || [];
        for (const parent of parents) {
            ancestors.push(parent);
            ancestors.push(...this._getEntityAncestors(parent));
        }
        this._cachedEntityAncestors[entityType] = ancestors;
        return ancestors;
    }

    private async _isAssignable(type : Type,
                                assignableTo : Type|string,
                                typeScope : Type.TypeScope) {
        for (let t of [type, assignableTo]) {
            while (t instanceof Type.Array || (t instanceof Type.Compound && 'value' in t.fields)) {
                if (t instanceof Type.Array)
                    t = t.elem;
                else 
                    t = t.fields.value.type;
            }
            if (typeof t === 'string' && t in typeScope)
                t = typeScope[t];
            if (t instanceof Type.Entity)
                await this._ensureEntitySubTypes(t.type);
        }

        return Type.isAssignable(type, assignableTo, typeScope, this._entitySubTypeMap);
    }

    private async _typeCheckValue(value : Ast.Value,
                                  scope : Scope) : Promise<Type> {
        if (value instanceof Ast.ComputationValue) {
            if (value.type instanceof Type)
                return value.type;

            const operands = await Promise.all(value.operands.map((o) => this._typeCheckValue(o, scope)));
            const [overload, resultType] = await this._resolveScalarExpressionOps(value.op, operands);

            value.overload = overload;
            return value.type = resultType;
        }
        if (value instanceof Ast.ArrayFieldValue) {
            if (value.type instanceof Type)
                return value.type;

            const paramType = await this._typeCheckValue(value.value, scope);

            if (!(paramType instanceof Type.Array))
                throw new TypeError(`Invalid field access on value that is not array of record`);
            const elem = paramType.elem;
            if (!(elem instanceof Type.Compound))
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

            const paramType = await this._typeCheckValue(value.value, scope);
            if (!(paramType instanceof Type.Array))
                throw new TypeError(`Invalid aggregation on non-array parameter`);
            const args = [];
            const elem = paramType.elem;
            const inner = new Scope(scope);
            if (elem instanceof Type.Compound) {
                for (const field in elem.fields) {
                    const type = elem.fields[field].type;
                    scope.add(field, type);
                    args.push(new Ast.ArgumentDef(null, Ast.ArgDirection.OUT, field, type, {}));
                }
            } else {
                const type = elem as Type;
                scope.add('value', type);
                args.push(new Ast.ArgumentDef(null, Ast.ArgDirection.OUT, 'value', type, {}));
            }
            const localschema = new Ast.FunctionDef(null, 'query', null, '', [], {
                is_list: false, is_monitorable: false }, args);
            await this._typeCheckFilter(value.filter, localschema, inner);
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
        if (value instanceof Ast.EventValue) {
            switch (value.name) {
            case 'program_id':
                break;
            case 'source':
                if (!scope.$has_source)
                    throw new TypeError('Cannot access $source outside of a policy');
                break;
            default:
                if (!scope.$has_event)
                    throw new TypeError('Cannot access $result or $type before the first primitive');
            }
        }
        if (value instanceof Ast.DateValue) {
            const date = value.value;
            if (date instanceof Ast.DateEdge) {
                if (Units.normalizeUnit(date.unit) !== 'ms')
                    throw new TypeError(`Invalid unit for $${date.edge}`);
            }
        }
        if (value instanceof Ast.TimeValue) {
            if (value.value instanceof Ast.RelativeTime) {
                if (!ALLOWED_RELATIVE_TIMES.has(value.value.relativeTag))
                    throw new TypeError(`Invalid relative time specifier ${value.value.relativeTag}`);
            }
        }
        if (value instanceof Ast.LocationValue) {
            if (value.value instanceof Ast.RelativeLocation) {
                if (!ALLOWED_RELATIVE_LOCATIONS.has(value.value.relativeTag))
                    throw new TypeError(`Invalid relative location specifier ${value.value.relativeTag}`);
            }
        }

        if (value instanceof Ast.ArrayValue) {
            const typeScope = {};
            if (value.value.length === 0)
                return new Type.Array(Type.Any);

            const elem = await this._typeCheckValue(value.value[0], scope);

            for (const v of value.value) {
                const vtype = await this._typeCheckValue(v, scope);

                // merge enum types if necessary
                if (vtype instanceof Type.Enum && elem instanceof Type.Enum) {
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

                if (!await this._isAssignable(vtype, elem, typeScope))
                    throw new TypeError(`Inconsistent type for array value`);
            }

            return value.type = new Type.Array(elem);
        }

        const type = value.getType();
        return type;
    }

    private async _typecheckPrincipal(principal : Ast.Value) {
        if (principal.isUndefined)
            return;
        if (!principal.isConstant())
            throw new TypeError(`Program principal must be a constant`);

        const type = await this._typeCheckValue(principal, new Scope);
        if (!(type instanceof Type.Entity) || !ALLOWED_PRINCIPAL_TYPES.has(type.type))
            throw new TypeError(`Invalid principal ${principal}, must be a contact or a group`);
    }

    /**
     * Given a key and a typeScope, return a list of typeScopes where the value
     * of the key is each ancestor of the original entity
     *
     * During overload, entities with the common ancestor is allowed to be assigned
     * to each other. Thus, we would try with all ancestors to see if ant of them
     * is assignable.
     */
    private _expandTypeScope(typeScope : Type.TypeScope, key : string) : Type.TypeScope[] {
        if (!(key in typeScope))
            return [typeScope];
        const type = typeScope[key];
        if (!(type instanceof Type.Entity))
            return [typeScope];

        const entityType = type.type;
        const ancestors = this._getEntityAncestors(entityType);
        const newScopes = ancestors.map((ancestor) => {
            const scope = Object.assign({}, typeScope);
            scope[key] = ancestor;
            return scope;
        });

        return [typeScope, ...newScopes];
    }

    private async _resolveOverload(overloads : Builtin.OpDefinition,
                                   operator : string,
                                   argTypes : Type[]) : Promise<[Type[], Type]> {
        for (const overload of overloads.types) {
            if (argTypes.length !== overload.length-1)
                continue;
            const typeScope : Type.TypeScope = {};
            let good = true;
            for (let i = 0; i < argTypes.length; i++) {
                const o = overload[i];
                const typeScopes = typeof o === 'string' ? this._expandTypeScope(typeScope, o) : [typeScope];
                let hasAssignable = false;
                for (const scope of typeScopes) {
                    if (await this._isAssignable(argTypes[i], o, scope)) {
                        hasAssignable = true;
                        break;
                    }
                }
                if (!hasAssignable) {
                    good = false;
                    break;
                }
            }
            if (!good)
                continue;
            const resolved : Type[] = [];
            for (const type of overload)
                resolved.push(Type.resolve(type, typeScope));

            if (resolved[overload.length-1] instanceof Type.Measure && typeScope['_unit'])
                return [resolved, new Type.Measure(typeScope['_unit'] as string)];
            return [resolved, resolved[overload.length-1]];
        }
        throw new TypeError(`Invalid parameter types ${argTypes.join(', ')} for ${operator}`);
    }

    private _resolveScalarExpressionOps(operator : string, argTypes : Type[]) {
        const op = Builtin.ScalarExpressionOps[operator];
        if (!op)
            throw new TypeError('Invalid operator ' + operator);
        return this._resolveOverload(op, operator, argTypes);
    }

    private async _resolveFilterOverload(type_lhs : Type, operator : string, type_rhs : Type) {
        log('resolve filter overload');
        const op = Builtin.BinaryOps[operator];
        if (!op)
            throw new TypeError('Invalid operator ' + operator);
        const [overload,] = await this._resolveOverload(op, operator, [type_lhs, type_rhs]);
        return overload;
    }

    private _typeCheckFilter(ast : Ast.BooleanExpression,
                             schema : Ast.FunctionDef|null,
                             scope : Scope = new Scope()) {
        log('Type check filter ...');
        if (schema && schema.no_filter)
            throw new TypeError('Filter is not allowed on a query that has been filtered on a parameter marked as unique');

        return this._typeCheckFilterHelper(ast, schema, scope);
    }

    private async _typeCheckFilterHelper(ast : Ast.BooleanExpression,
                                         schema : Ast.FunctionDef|null,
                                         scope : Scope = new Scope()) {
        if (ast.isTrue || ast.isFalse)
            return;
        if (ast instanceof Ast.AndBooleanExpression || ast instanceof Ast.OrBooleanExpression) {
            await Promise.all(ast.operands.map((op : Ast.BooleanExpression) => this._typeCheckFilterHelper(op, schema, scope)));
            return;
        }
        if (ast instanceof Ast.NotBooleanExpression) {
            await this._typeCheckFilterHelper(ast.expr, schema, scope);
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
                type_lhs = await this._typeCheckValue(new Ast.Value.VarRef(name), scope);
            const type_rhs = await this._typeCheckValue(ast.value, scope);
            ast.overload = await this._resolveFilterOverload(type_lhs, ast.operator, type_rhs);
            return;
        }

        if (ast instanceof Ast.ComputeBooleanExpression) {
            const type_lhs = await this._typeCheckValue(ast.lhs, scope);
            const type_rhs = await this._typeCheckValue(ast.rhs, scope);
            ast.overload = await this._resolveFilterOverload(type_lhs, ast.operator, type_rhs);
            return;
        }

        if (ast instanceof Ast.ComparisonSubqueryBooleanExpression) {
            const type_lhs = await this._typeCheckValue(ast.lhs, scope);
            const type_rhs = await this._typeCheckSubqueryValue(ast.rhs, scope);
            ast.overload = await this._resolveFilterOverload(type_lhs, ast.operator, type_rhs);
            return;
        }

        if (ast instanceof Ast.ExternalBooleanExpression) {
            if (ast.schema === null)
                await this._loadTpSchema(ast);
            if (ast.schema!.functionType !== 'query')
                throw new TypeError(`Subquery function must be a query, not ${ast.schema!.functionType}`);
            await this._typeCheckInputArgs(ast, ast.schema!, scope);
            await this._typeCheckFilterHelper(ast.filter, ast.schema, scope);
            return;
        }
        if (ast instanceof Ast.PropertyPathBooleanExpression) {
            // TODO: typecheck proeprty path boolean expresion
            return;
        }

        assert(ast instanceof Ast.ExistentialSubqueryBooleanExpression);
        await this._typeCheckSubquery(ast.subquery, scope);
    }

    private async _typeCheckSubquery(expr : Ast.Expression, scope : Scope) {
        if (expr.schema === null)
            await this._loadAllSchemas(expr);
        await this._typeCheckExpression(expr, scope);
        this._checkExpressionType(expr, ['query'], 'subquery');
    }

    private async _typeCheckSubqueryValue(expr : Ast.Expression, scope : Scope) {
        if (!(expr instanceof Ast.ProjectionExpression))
            throw new TypeError('Subquery function must be a projection');
        if (expr.args.length + expr.computations.length !== 1)
            throw new TypeError('Subquery function must be a projection with one field');

        await this._typeCheckExpression(expr, scope);
        this._checkExpressionType(expr, ['query'], 'projection');
        if (expr.args.length)
            return expr.schema!.getArgType(expr.args[0])!;
        else
            return this._typeCheckValue(expr.computations[0], scope);


    }

    private async _resolveAggregationOverload(ast : Ast.AggregationTable|Ast.AggregationExpression,
                                              operator : string,
                                              field : string,
                                              schema : Ast.FunctionDef) {
        const fieldType = schema.out[field];
        if (!fieldType)
            throw new TypeError('Invalid aggregation field ' + field);
        const ag = Builtin.Aggregations[operator];
        if (!ag)
            throw new TypeError('Invalid aggregation ' + operator);

        for (const overload of ag.types) {
            const typeScope = {};
            if (!await this._isAssignable(fieldType, overload[0], typeScope))
                continue;

            ast.overload = overload.map((t) => resolveTypeVars(t, typeScope));
            return ast.overload[1];
        }

        throw new TypeError('Invalid field type ' + fieldType + ' for ' + operator);
    }

    private async _typeCheckAggregation(ast : Ast.AggregationTable|Ast.AggregationExpression, scope : Scope) {
        let schema = (ast instanceof Ast.AggregationExpression ? ast.expression.schema : ast.table.schema)!;

        let name, type, nl_annotations;
        if (ast.field === '*') {
            if (ast.operator !== 'count')
                throw new TypeError('* is not a valid argument to ' + ast.operator);
            type = Type.Number;
            ast.overload = [Type.Any, type];
            name = ast.alias ? ast.alias : 'count';
            nl_annotations = { canonical: 'count' };
        } else {
            type = await this._resolveAggregationOverload(ast, ast.operator, ast.field, schema);
            name = ast.alias ? ast.alias : ast.field;
            nl_annotations = schema.getArgument(ast.field)!.nl_annotations;
        }

        if (ast instanceof Ast.AggregationExpression && ast.groupBy) {
            const groupByFieldType = schema.getArgType(ast.groupBy);
            if (!groupByFieldType)
                throw new TypeError('Invalid group by field ' + ast.groupBy);
            schema = schema.filterArguments((a : Ast.ArgumentDef) => a.is_input || a.name === ast.groupBy);
            schema.removeDefaultProjection();
            schema.removeMinimalProjection();
            ast.schema = addOutput(schema, name, type, scope, nl_annotations);
        } else {
            ast.schema = addOutput(cleanOutput(schema, scope), name, type, scope, nl_annotations);
        }
    }

    private async _typeCheckSort(ast : Ast.SortExpression, scope : Scope) {
        const innerSchema = ast.expression.schema;

        const type = await this._typeCheckValue(ast.value, scope);
        if (!type.isComparable()) {
            if (ast.value instanceof Ast.VarRefValue)
                throw new TypeError(`Invalid sort of non-comparable field ${ast.value.name}`);
            else
                throw new TypeError(`Invalid sort of non-comparable value`);
        }

        ast.schema = innerSchema;
    }

    private async _typeCheckIndex(ast : Ast.IndexTable|Ast.IndexExpression, scope : Scope) {
        if (ast.indices.length === 1) {
            const valueType = await this._typeCheckValue(ast.indices[0], scope);
            if (valueType.isArray) {
                if (!await this._isAssignable(valueType, new Type.Array(Type.Number), {}))
                    throw new TypeError(`Invalid index parameter, must be of type Array(Number)`);
            } else {
                if (!await this._isAssignable(valueType, Type.Number, {}))
                    throw new TypeError(`Invalid index parameter, must be a Number`);
            }
        } else {
            for (const index of ast.indices) {
                const valueType = await this._typeCheckValue(index, scope);
                if (!await this._isAssignable(valueType, Type.Number, {}))
                    throw new TypeError(`Invalid index parameter, must be a Number`);
            }
        }

        ast.schema = ast instanceof Ast.IndexExpression ? ast.expression.schema : ast.table.schema;
    }

    private async _typeCheckSlice(ast : Ast.SlicedTable|Ast.SliceExpression, scope : Scope) {
        const baseType = await this._typeCheckValue(ast.base, scope);
        const limitType = await this._typeCheckValue(ast.limit, scope);
        if (!await this._isAssignable(baseType, Type.Number, {}))
            throw new TypeError(`Invalid slice offset parameter, must be a Number`);
        if (!await this._isAssignable(limitType, Type.Number, {}))
            throw new TypeError(`Invalid slice limit parameter, must be a Number`);

        ast.schema = ast instanceof Ast.SliceExpression ? ast.expression.schema : ast.table.schema;
    }

    private _typeCheckMonitor(ast : Ast.MonitorExpression) {
        const schema = ast.expression.schema;
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

    private async _typeCheckJoin(ast : Ast.JoinExpression, scope : Scope) {
        assert(ast.lhs.schema && ast.rhs.schema);
        const name = `join(${ast.lhs.schema.qualifiedName},${ast.rhs.schema.qualifiedName})`;
        const classDef = null;
        const qualifiers = {
            is_list : true,
            is_monitorable: ast.lhs.schema.is_monitorable || ast.rhs.schema.is_monitorable
        };
        const args = [];
        for (const arg of ast.lhs.schema.iterateArguments()) {
            if (arg.is_input)
                continue;
            const newArg = arg.clone();
            newArg.name = `first.${arg.name}`;
            args.push(newArg);
        }
        for (const arg of ast.rhs.schema.iterateArguments()) {
            if (arg.is_input)
                continue;
            const newArg = arg.clone();
            newArg.name = `second.${arg.name}`;
            args.push(newArg);
        }
        ast.schema = new Ast.FunctionDef(null, 'query', classDef, name, [], qualifiers, args);
        scope.cleanOutput();
        scope.addAll(ast.schema.out);
        return Promise.resolve();
    }

    private _resolveFilter(filter : Ast.BooleanExpression,
                           schema : Ast.FunctionDef) {
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

    private _resolveNewProjection(ast : Ast.ProjectionExpression,
                                  scope : Scope) {
        const schema = ast.expression.schema;
        assert(schema);
        if (ast.computations.length === 0 && Object.keys(schema.out).length === 1)
            throw new TypeError('No projection is allowed if there is only one output parameter');
        if (ast.computations.length === 0 && ast.args.length === 0)
            throw new TypeError(`Invalid empty projection`);

        let clone = schema;
        if (ast.args[0] !== '*') {
            const argset = new Set(ast.args);
            for (const argname of schema.minimal_projection||[])
                argset.add(argname);
            for (const argname of argset) {
                const arg = schema.getArgument(argname);
                if (!arg || arg.is_input)
                    throw new TypeError('Invalid field name ' + argname);
            }
            for (const arg of schema.iterateArguments()) {
                if (!arg.is_input && !argset.has(arg.name))
                    scope.remove(arg.name);
            }
            clone = schema.filterArguments((a : Ast.ArgumentDef) => a.is_input || argset.has(a.name));
        }

        const newArgs = [];
        for (let i = 0; i < ast.computations.length; i++) {
            const comp = ast.computations[i];
            const name = ast.aliases[i] || Utils.getScalarExpressionName(comp);
            const type = comp.getType();

            scope.add(name, type);
            newArgs.push(new Ast.ArgumentDef(schema.location,
                Ast.ArgDirection.OUT, name, type));
        }

        clone = clone.addArguments(newArgs);
        clone.default_projection = [];
        assert(Array.isArray(clone.minimal_projection));
        return clone;
    }

    private _resolveNewProjection2(ast : Ast.ProjectionExpression2,
                                   scope : Scope) {
        const schema = ast.expression.schema;
        assert(schema);
        if (ast.projections.length === 0)
            throw new TypeError(`Invalid empty projection`);

        let clone = schema;
        if (ast.projections[0].value !== '*') {
            const argset = new Set(ast.projections
                .filter((proj) => typeof proj.value === 'string')
                .map((proj) => proj.value as string)
            );
            for (const argname of schema.minimal_projection||[])
                argset.add(argname);
            for (const argname of argset) {
                const arg = schema.getArgument(argname);
                if (!arg || arg.is_input)
                    throw new TypeError('Invalid field name ' + argname);
            }
            for (const arg of schema.iterateArguments()) {
                if (!arg.is_input && !argset.has(arg.name))
                    scope.remove(arg.name);
            }
            clone = schema.filterArguments((a : Ast.ArgumentDef) => a.is_input || argset.has(a.name));
        }

        const newArgs = [];
        for (const projection of ast.projections) {
            if (projection.value instanceof Ast.Value) {
                const comp = projection.value;
                const name = projection.alias || Utils.getScalarExpressionName(comp);
                const type = projection.types.length ? projection.types[0] : comp.getType();

                scope.add(name, type);
                newArgs.push(new Ast.ArgumentDef(schema.location,
                    Ast.ArgDirection.OUT, name, type));
            } else if (Array.isArray(projection.value)) {
                // TODO: typecheck property path properly by checking joined tables
                // TODO: handle multiple types (introducing union type)
                const name = projection.alias || Utils.getPropertyPathName(projection.value);
                const type = projection.types.length ? projection.types[0] : Type.Any;
                scope.add(name, type);
                newArgs.push(new Ast.ArgumentDef(schema.location, 
                    Ast.ArgDirection.OUT, name, type));
            }
        }

        clone = clone.addArguments(newArgs);
        clone.default_projection = [];
        assert(Array.isArray(clone.minimal_projection));
        return clone;
    }

    private _resolveChain(ast : Ast.ChainExpression) : Ast.FunctionDef {
        // the schema of a chain is just the schema of the last function in
        // the chain, nothing special about it - no joins, no merging, no
        // nothing
        const last = ast.expressions[ast.expressions.length-1];

        // except the schema is monitorable if the _every_ schema is monitorable
        // and the schema is a list if _any_ schema is a list
        const clone = last.schema!.clone();
        clone.is_list = ast.expressions.some((exp) => exp.schema!.is_list);
        clone.is_monitorable = ast.expressions.every((exp) => exp.schema!.is_monitorable);
        return clone;
    }

    private async _typeCheckInputArgs(ast : Ast.Invocation|Ast.ExternalBooleanExpression|Ast.FunctionCallExpression,
                                      schema : Ast.FunctionDef,
                                      scope : Scope) {
        if (ast instanceof Ast.Invocation ||
            ast instanceof Ast.ExternalBooleanExpression) {
            assert(ast.selector);

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
                const valueType = await this._typeCheckValue(attr.value, attrscope);
                if (!await this._isAssignable(valueType, Type.String, {}) || attr.value.isUndefined)
                    throw new TypeError(`Invalid type for device attribute ${attr.name}, have ${valueType}, need String`);
            }

            if (ast.selector.id && ast.selector.all)
                throw new TypeError(`all=true device attribute is incompatible with setting a device ID`);

            if (ast.selector.kind in this._classes) {
                const classdef = this._classes[ast.selector.kind];

                if (classdef.extends.length > 0 && classdef.extends.length === 1 && classdef.extends[0] === 'org.thingpedia.builtin.thingengine.remote')
                    ast.__effectiveSelector = new Ast.DeviceSelector(ast.selector.location, 'org.thingpedia.builtin.thingengine.remote', ast.selector.id, ast.selector.principal, ast.selector.attributes.slice());
                else
                    ast.__effectiveSelector = ast.selector;
            } else {
                ast.__effectiveSelector = ast.selector;
            }
        }

        const presentParams = new Set<string>();
        for (const inParam of ast.in_params) {
            const inParamType = schema.getArgType(inParam.name);
            if (!inParamType || !schema.isArgInput(inParam.name))
                throw new TypeError('Invalid input parameter ' + inParam.name);

            const valueType = await this._typeCheckValue(inParam.value, scope);
            if (!await this._isAssignable(valueType, inParamType, {}))
                throw new TypeError(`Invalid type for parameter ${inParam.name}, have ${valueType}, need ${inParamType}`);
            if (presentParams.has(inParam.name))
                throw new TypeError('Duplicate input param ' + inParam.name);
            presentParams.add(inParam.name);
        }

        for (const arg of schema.iterateArguments()) {
            if (!arg.is_input || !arg.required)
                continue;
            if (!presentParams.has(arg.name))
                ast.in_params.push(new Ast.InputParam(ast.location, arg.name, new Ast.Value.Undefined(true)));
        }

        // we used to remove the assigned input parameters here, to deal with joins
        // with param passing, but we don't those joins any more
        // removing input params causes problems with finding the type of input params of FunctionCallExpression
        return schema;
    }

    private _checkExpressionType(ast : Ast.Expression, expected : Ast.FunctionType[], msg : string) {
        if (!expected.includes(ast.schema!.functionType))
            throw new TypeError(`Expected a ${expected.join(', ')} expression in argument to ${msg}, got a ${ast.schema!.functionType}`);
    }

    private async _typeCheckExpression(ast : Ast.Expression, scope : Scope) {
        if (ast instanceof Ast.FunctionCallExpression) {
            const schema = await this._loadFunctionSchema(scope, ast);
            ast.schema = await this._typeCheckInputArgs(ast, schema, scope);
            scope.addAll(ast.schema.out);
        } else if (ast instanceof Ast.InvocationExpression) {
            ast.schema = await this._typeCheckInputArgs(ast.invocation, ast.invocation.schema!, scope);
            scope.addAll(ast.schema.out);
        } else if (ast instanceof Ast.FilterExpression) {
            await this._typeCheckExpression(ast.expression, scope);
            this._checkExpressionType(ast.expression, ['query', 'stream'], 'filter');
            await this._typeCheckFilter(ast.filter, ast.expression.schema!, scope);
            ast.schema = this._resolveFilter(ast.filter, ast.expression.schema!);
        } else if (ast instanceof Ast.ProjectionExpression) {
            await this._typeCheckExpression(ast.expression, scope);
            this._checkExpressionType(ast.expression, ['query', 'stream'], 'projection');
            for (const compute of ast.computations)
                await this._typeCheckValue(compute, scope);
            ast.schema = this._resolveNewProjection(ast, scope);
        } else if (ast instanceof Ast.ProjectionExpression2) {
            await this._typeCheckExpression(ast.expression, scope);
            this._checkExpressionType(ast.expression, ['query', 'stream'], 'projection');
            for (const projection of ast.projections) {
                if (projection.value instanceof Ast.Value)
                    await this._typeCheckValue(projection.value, scope);
            }
            ast.schema = this._resolveNewProjection2(ast, scope);
        } else if (ast instanceof Ast.BooleanQuestionExpression) {
            await this._typeCheckExpression(ast.expression, scope);
            this._checkExpressionType(ast.expression, ['query', 'stream'], 'boolean question');
            await this._typeCheckFilter(ast.booleanExpression, ast.expression.schema, scope);
            ast.schema = ast.expression.schema!.addArguments([new Ast.ArgumentDef(
                ast.location,
                Ast.ArgDirection.OUT,
                '__answer',
                Type.Boolean,
                {}
            )]);
        } else if (ast instanceof Ast.AliasExpression) {
            await this._typeCheckExpression(ast.expression, scope);
            this._checkExpressionType(ast.expression, ['query', 'stream'], 'alias');
            ast.schema = ast.expression.schema;
            scope.addGlobal(ast.name, ast.schema!);
            scope.prefix(ast.name);
        } else if (ast instanceof Ast.AggregationExpression) {
            await this._typeCheckExpression(ast.expression, scope);
            this._checkExpressionType(ast.expression, ['query'], 'aggregation');
            await this._typeCheckAggregation(ast, scope);
        } else if (ast instanceof Ast.SortExpression) {
            await this._typeCheckExpression(ast.expression, scope);
            this._checkExpressionType(ast.expression, ['query'], 'sort');
            await this._typeCheckSort(ast, scope);
        } else if (ast instanceof Ast.IndexExpression) {
            await this._typeCheckExpression(ast.expression, scope);
            this._checkExpressionType(ast.expression, ['query'], 'index');
            await this._typeCheckIndex(ast, scope);
        } else if (ast instanceof Ast.SliceExpression) {
            await this._typeCheckExpression(ast.expression, scope);
            this._checkExpressionType(ast.expression, ['query'], 'slice');
            await this._typeCheckSlice(ast, scope);
        } else if (ast instanceof Ast.MonitorExpression) {
            await this._typeCheckExpression(ast.expression, scope);
            this._checkExpressionType(ast.expression, ['query'], 'monitor');
            this._typeCheckMonitor(ast);
            ast.schema = ast.expression.schema!.asType('stream');
        } else if (ast instanceof Ast.ChainExpression) {
            for (let i = 0; i < ast.expressions.length; i++) {
                const expr = ast.expressions[i];
                await this._typeCheckExpression(expr, scope);
                // in a chain expression that is not top-level in the statement,
                // all expressions must be a query, except the last can be a query or action
                //
                // non-top-level chain expressions are used by assignment statements
                // (which can be queries or actions) and as arguments to table
                // operators
                if (i < ast.expressions.length-1)
                    this._checkExpressionType(expr, ['query'], 'chain');
                else
                    this._checkExpressionType(expr, ['query', 'action'], 'chain');
            }

            ast.schema = this._resolveChain(ast);
        } else if (ast instanceof Ast.JoinExpression) {
            for (const expr of [ast.lhs, ast.rhs]) {
                await this._typeCheckExpression(expr, scope);
                this._checkExpressionType(expr, ['query'], 'join');
            }
            await this._typeCheckJoin(ast, scope);
        } else {
            throw new Error('Not Implemented');
        }
    }

    private async _loadFunctionSchema(scope : Scope,
                                      prim : Ast.FunctionCallExpression) : Promise<Ast.FunctionDef> {
        let schema : unknown;
        if (scope.has(prim.name))
            schema = scope.get(prim.name);
        else if (prim.name in Builtin.Functions)
            schema = Builtin.Functions[prim.name];
        else
            schema = await this._schemas.getMemorySchema(prim.name, this._useMeta);
        if (schema === null)
            throw new TypeError(`Undeclared function or variable ${prim.name}`);
        if (!(schema instanceof Ast.FunctionDef))
            throw new TypeError(`Variable ${prim.name} does not name an expression`);
        return schema;
    }

    private async _loadTpSchema(prim : Ast.Invocation|Ast.ExternalBooleanExpression) {
        const schema = await Utils.getSchemaForSelector(this._schemas, prim.selector.kind, prim.channel, 'both', this._useMeta, this._classes);
        if (prim.schema === null)
            prim.schema = schema;

        assert(prim.schema);
    }

    private async _loadAllSchemas(ast : Ast.Node) {
        return Promise.all(Array.from(ast.iteratePrimitives(false)).map(async ([primType, prim] : [OldPrimType, Ast.Invocation|Ast.ExternalBooleanExpression]) => {
            return this._loadTpSchema(prim);
        }));
    }

    async typeCheckClass(klass : Ast.ClassDef,
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
                const mixin = await this._schemas.getMixins(import_stmt.module);
                await this._typeCheckMixin(import_stmt, mixin);
            }
        }

        const names = new Set<string>();
        for (const [, query] of Object.entries(klass.queries)) {
            if (names.has(query.name))
                throw new Error(`Duplicate function ${query.name}`);
            names.add(query.name);
            await this._typeCheckFunctionDef('query', query);
        }
        for (const [, action] of Object.entries(klass.actions)) {
            if (names.has(action.name))
                throw new Error(`Duplicate function ${action.name}`);
            names.add(action.name);
            await this._typeCheckFunctionDef('action', action);
        }
    }

    private async _typeCheckMixin(import_stmt : Ast.MixinImportStmt,
                                  mixin : MixinDeclaration) {
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
            const valueType = await this._typeCheckValue(in_param.value, new Scope);
            if (!await this._isAssignable(valueType, inParamType, {}))
                throw new TypeError(`Invalid type for parameter ${in_param.name}, have ${valueType}, need ${inParamType}`);
        }
        for (let i = 0; i < mixin.args.length; i ++ ) {
            if (mixin.required[i] && !presentParams.has(mixin.args[i]))
                throw new TypeError(`Missing required parameter ${mixin.args[i]}`);
        }
    }

    private _typeCheckMetadata(func : unknown) {
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

    private _typeCheckFunctionAnnotations(func : Ast.FunctionDef) {
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

    private _typeCheckFunctionInheritance(func : Ast.FunctionDef) {
        if (func.extends.length === 0)
            return;
        if (func.functionType !== 'query')
            throw new TypeError(`Actions cannot extend other functions`);
        const functions : string[] = [];
        const args : Type.TypeMap = {};
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
        }
    }

    private async _typeCheckFunctionDef(type : 'query'|'action',
                                        func : Ast.FunctionDef) {
        for (const argname of func.args) {
            const arg = func.getArgument(argname) as Ast.ArgumentDef;
            if (arg.type instanceof Type.Unknown)
                throw new TypeError(`Invalid type ${arg.type.name}`);
            this._typeCheckMetadata(arg);

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

                if (!await this._isAssignable(await this._typeCheckValue(value, new Scope), arg.type, {}))
                    throw new TypeError(`Invalid #[${name}] annotation: must be a ${arg.type}`);
            }
        }

        this._typeCheckMetadata(func);
        this._typeCheckFunctionAnnotations(func);
        this._typeCheckFunctionInheritance(func);

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

    private _typeCheckDeclarationArgs(args : Type.TypeMap) {
        for (const name in args) {
            const type = args[name];
            if (type instanceof Type.Unknown)
                throw new TypeError(`Invalid type ${type.name}`);
        }
    }

    private async _typeCheckDeclarationCommon(ast : Ast.Example|Ast.FunctionDeclaration,
                                              scope : Scope) {
        this._typeCheckDeclarationArgs(ast.args);
        scope.addLambdaArgs(ast.args);
        await this._loadAllSchemas(ast);
    }

    private async _typeCheckDeclaration(ast : Ast.FunctionDeclaration,
                                        scope : Scope) {
        const nestedScope = new Scope(scope);

        await this._typeCheckDeclarationCommon(ast, nestedScope);
        this._typeCheckMetadata(ast);

        for (const decl of ast.declarations)
            await this._typeCheckDeclaration(decl, nestedScope);

        // the return value of a function is
        // - the stream statement, if any (there can be at most one)
        // - the last query expression statement, if any
        // - the last action expression statement
        let anyAction = false, anyStream = false,
            resultExpression : Ast.Expression|undefined,
            returnExpression : Ast.Expression|undefined;

        for (const stmt of ast.statements) {
            if (stmt instanceof Ast.Assignment) {
                await this._typeCheckAssignment(stmt, nestedScope);
                anyAction = anyAction || stmt.value.schema!.functionType === 'action';
            } else if (stmt instanceof Ast.ReturnStatement) {
                if (returnExpression)
                    throw new TypeError(`Multiple return statements are not allowed in the same procedure`);
                await this._typeCheckExpression(stmt.expression, new Scope(nestedScope));
                if (stmt.expression.schema!.functionType === 'stream')
                    throw new TypeError(`Streams are not allowed in return statements`);
                anyAction = anyAction || stmt.expression.schema!.functionType === 'action';
                returnExpression = stmt.expression;
            } else {
                await this._typeCheckExpressionStatement(stmt, new Scope(nestedScope));

                // a stream in a nested function is allowed if it is the only
                // stream statement, and the function does not invoke an action
                if (stmt.stream) {
                    if (anyStream)
                        throw new TypeError(`Multiple stream statements are not allowed in user-defined procedures`);
                    if (anyAction || stmt.expression.schema!.functionType === 'action')
                        throw new TypeError(`Stream-action combinations are not allowed in user-defined procedures`);
                    anyStream = true;
                } else if (stmt.expression.schema!.functionType === 'query') {
                    resultExpression = stmt.expression;
                } else {
                    anyAction = true;
                    if (!resultExpression)
                        resultExpression = stmt.expression;
                    if (anyStream)
                        throw new TypeError(`Stream-action combinations are not allowed in user-defined procedures`);
                }
            }
        }

        const args : Ast.ArgumentDef[] = Object.keys(ast.args).map((name : string) =>
            new Ast.ArgumentDef(ast.location, Ast.ArgDirection.IN_REQ, name, ast.args[name], {}));
        if (returnExpression) {
            const outargs : Ast.ArgumentDef[] = Array.from(returnExpression.schema!.iterateArguments()).filter((a : Ast.ArgumentDef) => !a.is_input);
            args.push(...outargs);
        } else if (resultExpression) {
            const outargs : Ast.ArgumentDef[] = Array.from(resultExpression.schema!.iterateArguments()).filter((a : Ast.ArgumentDef) => !a.is_input);
            args.push(...outargs);
        }

        const schema = new Ast.FunctionDef(ast.location, anyStream ? 'stream' : anyAction ? 'action' : 'query', null, ast.name, [],
            { is_list: false, is_monitorable: false }, args,
            { nl: ast.nl_annotations, impl: ast.impl_annotations });

        ast.schema = schema;
        scope.addGlobal(ast.name, schema);
    }

    async typeCheckExample(ast : Ast.Example) : Promise<void> {
        const scope = new Scope();
        await this._typeCheckDeclarationCommon(ast, scope);

        const value = ast.value;
        let type : string|undefined = undefined;
        if (value instanceof Ast.ChainExpression) {
            const expressions = value.expressions;
            const nestedScope = new Scope(scope);
            for (let i = 0; i < expressions.length; i++) {
                const expr = expressions[i];

                scope.$has_event = i > 0;
                await this._typeCheckExpression(expr, nestedScope);
                const schema = expr.schema!;
                if (schema.require_filter)
                    throw new TypeError('Filter required');
                if (schema.functionType === 'stream' && i > 0)
                    throw new Error(`Stream expression must be first in a chain expression`);
                if (schema.functionType === 'action' && i < expressions.length-1)
                    throw new Error(`Action expression must be last in a chain expression`);

                // a stream+action example must be declared "program"
                // a query+action example must be declared "action" or "program"
                // a stream+query example must be declared "stream" or "program"
                // a query example must be declared "query" or "program"
                if (schema.functionType === 'stream') {
                    if (type === 'action' || type === 'program')
                        type = 'program';
                    else
                        type = 'stream';
                } else if (schema.functionType === 'action') {
                    if (type === 'stream' || type === 'program')
                        type = 'program';
                    else
                        type = 'action';
                } else {
                    if (!type)
                        type = 'query';
                }
            }

            value.schema = this._resolveChain(value);
        } else {
            await this._typeCheckExpression(ast.value, new Scope(scope));
            type = ast.value.schema!.functionType;
        }

        if (ast.type !== 'program' && ast.type !== type)
            throw new Error(`Declared example type does not match the type of the expression, expected ${type} got ${ast.type}`);

        if (!Array.isArray(ast.utterances))
            throw new TypeError('Utterances annotation expects an array');
        for (const utterance of ast.utterances) {
            if (typeof utterance !== 'string')
                throw new TypeError('Utterance can only be a string');
        }
    }

    private async _typeCheckAssignment(ast : Ast.Assignment,
                                       scope : Scope) {
        const nestedScope = new Scope(scope);

        await this._typeCheckExpression(ast.value, nestedScope);
        const schema = ast.value.schema!;
        if (schema.require_filter)
            throw new TypeError('Filter required');
        if (schema.functionType === 'stream')
            throw new Error(`Invalid stream expression in argument to assignment, must be query or action`);

        // remove all input parameters (which we have filled with $undefined)
        const args = Array.from(schema.iterateArguments()).filter((a) => !a.is_input);
        ast.schema = new Ast.FunctionDef(ast.location, 'query', null, ast.name, [],
            { is_list: schema.is_list, is_monitorable: false }, args, {});
        scope.addGlobal(ast.name, ast.schema);
    }

    private async _typeCheckExpressionStatement(ast : Ast.ExpressionStatement,
                                                scope : Scope) {
        const expressions = ast.expression.expressions;
        for (let i = 0; i < expressions.length; i++) {
            const expr = expressions[i];

            scope.$has_event = i > 0;
            await this._typeCheckExpression(expr, scope);
            const schema = expr.schema!;
            if (schema.require_filter)
                throw new TypeError('Filter required');
            if (schema.functionType === 'stream' && i > 0)
                throw new Error(`Stream expression must be first in a chain expression`);
            if (schema.functionType === 'action' && i < expressions.length-1)
                throw new Error(`Action expression must be last in a chain expression`);
        }

        ast.expression.schema = this._resolveChain(ast.expression);
    }

    private _typeCheckProgramAnnotations(ast : Ast.Program) {
        return Promise.all(Object.entries(ast.impl_annotations).map(async ([name, value] : [string, Ast.Value]) => {
            if (name === 'executor')
                await this._typecheckPrincipal(value);
            else if (!value.isConstant())
                throw new Error(`Annotation #[${name}] must be a constant`);
        }));
    }

    async typeCheckProgram(ast : Ast.Program) : Promise<void> {
        ast.classes.forEach((ast) => {
            this._classes[ast.name] = ast;
        });
        await this._loadAllSchemas(ast);

        this._typeCheckMetadata(ast);
        this._typeCheckProgramAnnotations(ast);

        const scope = new Scope();

        for (const klass of ast.classes)
            await this.typeCheckClass(klass, false);
        for (const decl of ast.declarations) {
            scope.clean();
            await this._typeCheckDeclaration(decl, scope);
        }

        for (const decl of ast.statements) {
            scope.clean();
            if (decl instanceof Ast.Assignment)
                await this._typeCheckAssignment(decl, scope);
            else
                await this._typeCheckExpressionStatement(decl, scope);
        }
    }

    async typeCheckDialogue(ast : Ast.DialogueState) : Promise<void> {
        await this._loadAllSchemas(ast);

        if (ast.dialogueActParam) {
            for (const param of ast.dialogueActParam) {
                if (typeof param === 'string')
                    continue;
                if (!param.isConstant())
                    throw new TypeError(`Dialogue act parameters must be constants`);
            }
        }

        for (const item of ast.history) {
            const scope = new Scope(null);
            await this._typeCheckExpressionStatement(item.stmt, scope);

            if (item.results !== null) {
                if (!item.results.count.isConstant() ||
                    !await this._isAssignable(await this._typeCheckValue(item.results.count, new Scope), Type.Number, {}))
                    throw new TypeError(`History annotation #[count] must be a constant of Number type`);
                if (item.results.error) {
                    if (!item.results.error.isConstant())
                        throw new TypeError(`History annotation #[error] must be a constant of String or Enum type`);

                    const type = await this._typeCheckValue(item.results.error, new Scope);
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

    private async _getAllowedSchema(allowed : Ast.PermissionFunction,
                                    schemaType : 'query'|'action') {
        if (!(allowed instanceof Ast.SpecifiedPermissionFunction) || allowed.schema)
            return;

        allowed.schema = await Utils.getSchemaForSelector(this._schemas, allowed.kind, allowed.channel, schemaType, this._useMeta, {});
    }

    private async _typecheckPermissionFunction(fn : Ast.PermissionFunction,
                                               scope : Scope) {
        if (!(fn instanceof Ast.SpecifiedPermissionFunction))
            return;

        await this._typeCheckFilter(fn.filter, fn.schema, scope);
    }

    async typeCheckPermissionRule(permissionRule : Ast.PermissionRule) : Promise<void> {
        await Promise.all([
            this._getAllowedSchema(permissionRule.query, 'query'),
            this._getAllowedSchema(permissionRule.action, 'action'),
        ]);

        const scope = new Scope();
        scope.$has_source = true;
        await this._typeCheckFilter(permissionRule.principal, null, scope);
        scope.$has_source = false;

        await this._typecheckPermissionFunction(permissionRule.query, scope);
        scope.$has_event = true;
        await this._typecheckPermissionFunction(permissionRule.action, scope);
    }

    private async _typeCheckDataset(dataset : Ast.Dataset) {
        await this._loadAllSchemas(dataset);

        for (const ex of dataset.examples)
            await this.typeCheckExample(ex);
    }

    async typeCheckLibrary(meta : Ast.Library) : Promise<void> {
        for (const klass of meta.classes) {
            await this.typeCheckClass(klass, true);
            this._classes[klass.name] = klass;
        }

        await this._loadAllSchemas(meta);
        for (const dataset of meta.datasets)
            await this._typeCheckDataset(dataset);
    }

    async typeCheckControl(intent : Ast.ControlIntent) : Promise<void> {
        if (intent instanceof Ast.SpecialControlIntent) {
            if (Ast.ControlCommandType.indexOf(intent.type) < 0)
                throw new TypeError(`Invalid control command ${intent.type}`);
        } else if (intent instanceof Ast.AnswerControlIntent) {
            await this._typeCheckValue(intent.value, new Scope);
        }
    }
}
