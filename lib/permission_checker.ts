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

import assert from 'assert';
import * as smt from 'smtlib';

import * as Ast from './ast';
import Type from './type';
import * as BuiltinDefs from './operators';
import * as BuiltinOps from './runtime/primitive_ops';
import SchemaRetriever from './schema';
import { flipOperator } from './utils';

function arrayEquals<T>(a : T[]|null, b : T[]|null) : boolean {
    if (a === null && b === null)
        return true;
    if (a === null || b === null)
        return false;
    if (a.length !== b.length)
        return false;

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }

    return true;
}

function isGroupMember(principal : string, group : string, groupmap : Map<string, string[]>) {
    return (groupmap.get(principal) || []).indexOf(group) >= 0;
}

interface SolverConstructor {
    new() : smt.BaseSolver;
}

function DeclareDatatype(name : string, constructors : Array<smt.SNode[]|string>) : smt.SExpr {
    const sortdec = new smt.SExpr(name, '0');
    const datatypedec = new smt.SExpr(...constructors.map((c) => Array.isArray(c) ? new smt.SExpr(...c) : new smt.SExpr(c)));

    return new smt.SExpr('declare-datatypes', new smt.SExpr(sortdec), new smt.SExpr(datatypedec));
}

// Reduces a program and a set of Allowed rules into one call to the SMT, and invokes
// the SMT solver
class SmtReduction {
    private _solver : smt.BaseSolver;
    private _allowUndefined : boolean;
    private _debug : boolean;

    private _declarations : smt.SNode[];
    private _entityTypes : Set<string>;
    private _currencies : Set<string>;
    private _enumtypes : Array<[string, Type.Enum]>;
    private _fnparams : Map<string, string[]>;
    private _constants : Map<string, string>;

    private _classes : { [key : string] : Ast.ClassDef };
    private _functions : Set<string>;
    private _asserts : smt.SNode[];

    private _filteridx : number;
    private _filtermap : Ast.BooleanExpression[];
    private _filterrevmap : Map<Ast.BooleanExpression, number>;

    private _externalfnidx : number;
    private _uf : Map<string, string[]>;

    private _nextSkolemBool : number;

    private _assignment : { [key : string] : number|boolean }|undefined;

    constructor(SolverClass : SolverConstructor,
                { allowUndefined = false, debug = false }) {
        this._solver = new SolverClass();
        this._allowUndefined = allowUndefined;
        this._debug = debug;

        this._declarations = [];
        this._declarations.push(smt.DeclareSort('ResultId'));
        this._declarations.push(DeclareDatatype('Location',
            ['loc.home', 'loc.work', 'loc.current_location',
             ['loc.absolute', '(loc.lat Real)', '(loc.lon Real)'],
             ['loc.byName', '(loc.name String)']
            ]));
        this._entityTypes = new Set;
        const contactType = this._declareEntityType(new Type.Entity('tt:contact'));
        const contactGroupType = this._declareEntityType(new Type.Entity('tt:contact_group'));
        this._declarations.push(smt.DeclareFun('Entity_tt_contact.getGroups', [contactType], smt.SetType(contactGroupType)));

        this._currencies = new Set;
        this._enumtypes = [];

        this._fnparams = new Map;

        this._constants = new Map;

        this._classes = {};
        this._functions = new Set;
        this._asserts = [];

        this._filteridx = 0;
        this._filtermap = [];
        this._filterrevmap = new Map;

        this._externalfnidx = 0;
        this._uf = new Map;

        this._nextSkolemBool = 0;
    }

    private _getSkolemBool() {
        const bool = 'sk_' + this._nextSkolemBool++;
        this._constants.set(bool, 'Bool');
        return bool;
    }

    private _add(stmt : smt.SNode) {
        this._solver.add(stmt);
    }

    private _declare(stmt : smt.SNode) {
        this._declarations.push(stmt);
    }

    private _addEverything() {
        for (const [name, t] of this._enumtypes)
            this._add(smt.DeclareDatatype(name, t.entries!.map((e) => name + '.' + e)));
        for (const decl of this._declarations)
            this._add(decl);
        for (const [name, t] of this._constants.entries())
            this._add(smt.DeclareFun(name, [], t));
        for (const assert of this._asserts)
            this._solver.assert(assert);
    }

    private _makeEnumType(type : Type.Enum) {
        for (const [name, enumType] of this._enumtypes) {
            if (arrayEquals(type.entries, enumType.entries))
                return name;
        }
        const name = 'Enum_' + this._enumtypes.length;
        this._enumtypes.push([name, type]);
        return name;
    }

    private _declareEntityType(type : Type.Entity) {
        const entityType = type.type;
        const smtType = 'Entity_' + entityType.replace(/[^A-Za-z0-9_]/g, '_');
        if (this._entityTypes.has(entityType))
            return smtType;

        this._entityTypes.add(entityType);
        this._declarations.push(DeclareDatatype(smtType,
            [['mk.' + smtType, '(' + smtType + '.get String)']]));
        return smtType;
    }

    private _getEntityValue(value : smt.SNode, type : Type.Entity) {
        this._declareEntityType(type);
        const entityType = type.type;
        const smtType = 'Entity_' + entityType.replace(/[^A-Za-z0-9_]/g, '_');
        return new smt.SExpr(smtType + '.get', value);
    }

    private _typeToSmtType(type : Type) : smt.SNode {
        if (type instanceof Type.Array)
            return smt.SetType(this._typeToSmtType(type.elem as Type));
        if (type.isNumber || type.isMeasure)
            return 'Real';
        if (type.isBoolean)
            return 'Bool';
        if (type.isString)
            return 'String';
        if (type.isLocation)
            return 'Location';
        if (type.isTime || type.isDate)
            return 'Int';
        if (type instanceof Type.Entity)
            return this._declareEntityType(type);
        if (type instanceof Type.Enum)
            return this._makeEnumType(type);

        throw new TypeError('Unsupported type ' + type);
    }

    private _numberToSmt(v : number) {
        if (v >= 0)
            return String(v);
        else
            return new smt.SExpr('-', String(-v));
    }

    private _locToSmtValue(loc : Ast.Location) {
        if (loc instanceof Ast.RelativeLocation)
            return 'loc.' + loc.relativeTag;
        if (loc instanceof Ast.UnresolvedLocation)
            return new smt.SExpr('loc.byName', smt.StringLiteral(loc.name));

        assert(loc instanceof Ast.AbsoluteLocation);
        return new smt.SExpr('loc.absolute', this._numberToSmt(loc.lat),
            this._numberToSmt(loc.lon));
    }

    private _entityToSmtValue(entityValue : string, entityType : string) {
        const smtType = this._declareEntityType(new Type.Entity(entityType));
        return new smt.SExpr('mk.' + smtType, smt.StringLiteral(entityValue));
    }

    private _enumToSmtValue(enumerant : string, type : Type.Enum) {
        const typename = this._makeEnumType(type);
        return typename + '.' + enumerant;
    }

    private _currencyToSmt(v : { code : string; value : number }) {
        const code = v.code.toLowerCase();
        if (!this._currencies.has(code)) {
            this._declare(smt.DeclareFun('Currency_' + code, ['Real'], 'Real'));
            this._currencies.add(code);
        }

        return smt.Predicate('Currency_' + code, this._numberToSmt(v.value));
    }

    private _valueToSmtValue(v : Ast.Value, type : Type) : smt.SNode {
        if (v.isVarRef)
            throw new TypeError('Unexpected var ref in filter');
        if (v.isUndefined)
            throw new TypeError('Unexpected undefined TT value');
        if (v instanceof Ast.ArrayValue) {
            assert(type instanceof Type.Array);
            if (v.value.length === 0)
                return new smt.SExpr('as', 'emptyset', new smt.SExpr('Set', this._typeToSmtType(type.elem as Type)));
            return new smt.SExpr('insert',
                ...v.value.slice(1).map((elem) => this._valueToSmtValue(elem, type.elem as Type)),
                new smt.SExpr('singleton', this._valueToSmtValue(v.value[0], type.elem as Type)));
        }
        if (v instanceof Ast.BooleanValue)
            return v.value ? 'true' : 'false';
        if (v instanceof Ast.StringValue)
            return smt.StringLiteral(v.value);
        if (v instanceof Ast.CurrencyValue)
            return this._currencyToSmt(v);
        if (v instanceof Ast.NumberValue || v instanceof Ast.MeasureValue)
            return this._numberToSmt(v.toJS()); // toJS() normalizes the measurement
        if (v instanceof Ast.LocationValue)
            return this._locToSmtValue(v.value);
        if (v instanceof Ast.EntityValue)
            return this._entityToSmtValue(v.value!, v.type);
        if (v instanceof Ast.EnumValue) {
            assert(type instanceof Type.Enum);
            return this._enumToSmtValue(v.value, type);
        }
        if (v instanceof Ast.DateValue)
            return String(v.toJS().getTime()); // TODO handle relative dates correctly
        throw new TypeError('Unsupported value ' + v);
    }

    addGroups(principal : Ast.EntityValue, groups : Ast.Value[]) {
        const lhs = smt.Predicate('Entity_tt_contact.getGroups', this._valueToSmtValue(principal, new Type.Entity('tt:contact')));
        const contactGroupType = this._declareEntityType(new Type.Entity('tt:contact_group'));

        let rhs;
        if (groups.length === 0) {
            rhs = new smt.SExpr('as', 'emptyset', smt.SetType(contactGroupType));
        } else if (groups.length === 1) {
            rhs = new smt.SExpr('singleton', this._valueToSmtValue(groups[0], new Type.Entity('tt:contact_group')));
        } else {
            rhs = new smt.SExpr('insert',
                ...groups.slice(1).map((g) => this._valueToSmtValue(g, new Type.Entity('tt:contact_group'))),
                new smt.SExpr('singleton', this._valueToSmtValue(groups[0], new Type.Entity('tt:contact_group'))));
        }

        this._asserts.push(smt.Eq(lhs, rhs));
    }

    private _filterToSmt(operator : string,
                         param : smt.SNode,
                         paramType : Type,
                         value : smt.SNode,
                         valueType : Type) {
        if (valueType instanceof Type.Enum)
            valueType = paramType;
        if (operator !== 'group_member' && !valueType.equals(paramType)) {
            if (valueType instanceof Type.Entity)
                value = this._getEntityValue(value, valueType);
            if (paramType instanceof Type.Entity)
                param = this._getEntityValue(param, paramType);
        }

        switch (operator) {
        case '==':
            return smt.Eq(param, value);
        case '!=':
            return smt.NEq(param, value);
        case '>=':
            return smt.GEq(param, value);
        case '<=':
            return smt.LEq(param, value);
        case '>':
            return smt.GT(param, value);
        case '<':
            return smt.LT(param, value);
        case '=~':
            return smt.Predicate('str.contains', param, value);
        case '~=':
            return smt.Predicate('str.contains', value, param);
        case 'starts_with':
            return smt.Predicate('str.prefixof', value, param);
        case 'prefix_of':
            return smt.Predicate('str.prefixof', param, value);
        case 'ends_with':
            return smt.Predicate('str.suffixof', value, param);
        case 'suffix_of':
            return smt.Predicate('str.suffixof', param, value);
        case 'contains': // value is the element, param is the array
            return smt.Predicate('member', value, param);
        case 'in_array': // flip version of contains
            return smt.Predicate('member', param, value);

        // FIXME this is not quite correct...
        case 'contains~': // value is the element, param is the array
            return smt.Predicate('member', value, param);
        case 'in_array~': // flip version of contains
            return smt.Predicate('member', param, value);

        case 'group_member': // value is the group, param is the principal
            return smt.Predicate('member', value, smt.Predicate('Entity_tt_contact.getGroups', param));
        case 'has_member': // flip version of group_member
            return smt.Predicate('member', param, smt.Predicate('Entity_tt_contact.getGroups', value));
        default:
            throw new TypeError('Unsupported operator ' + operator);
        }
    }

    private _addGetPredicate(ast : Ast.ExternalBooleanExpression,
                             scope : { [key : string] : string },
                             scopeType : { [key : string] : Type }) {
        const [signature, ufvar] = this._declareUninterpretedFunction(ast.selector.kind, ast.channel, ast.schema!);
        const extfnvar = this._declareFunction(ast.selector.kind, ast.channel, 'pred_' + this._externalfnidx ++, ast.schema!);

        if (ast.schema!.is_list)
            this._declare(smt.DeclareFun(extfnvar + '__resultId', [], 'ResultId'));

        const in_passed : { [key : string] : smt.SNode } = {};
        for (const inParam of ast.in_params) {
            const ptype = ast.schema!.inReq[inParam.name] || ast.schema!.inOpt[inParam.name];
            const value = inParam.value;
            if (value instanceof Ast.VarRefValue) {
                if (!scope[value.name] || !scopeType[value.name])
                    throw new TypeError('Invalid input parameter value ' + value.name);
                in_passed[inParam.name] = scope[value.name];
            } else {
                in_passed[inParam.name] = this._valueToSmtValue(value, ptype);
            }
        }
        const inargs : smt.SNode[] = [];
        for (const name of signature) {
            if (name === '__resultId')
                inargs.push(extfnvar + '__resultId');
            else
                inargs.push(in_passed[name] || ufvar + '_' + name + '_null');
        }

        const subscope : { [key : string] : string } = {};
        Object.assign(subscope, scope);
        const subscopeType : { [key : string] : Type } = {};
        Object.assign(subscopeType, scopeType);
        for (const name in ast.schema!.out) {
            const predname = ufvar + '_' + name;
            this._asserts.push(smt.Eq('param_' + extfnvar + '_' + name, smt.Predicate(predname, ...inargs)));
            subscope[name] = 'param_' + extfnvar + '_' + name;
            subscopeType[name] = ast.schema!.out[name];
        }
        const anyresult = 'anyresult_' + extfnvar;
        this._constants.set(anyresult, 'Bool');
        this._asserts.push(smt.Eq(anyresult, smt.Predicate(ufvar + '_anyresult', ...inargs)));
        this._addInputParams(extfnvar, ast, scope, scopeType, []);
        return smt.And(anyresult, this._processFilter(ast.filter, subscope, subscopeType));
    }

    private _processFilter(ast : Ast.BooleanExpression,
                           scope : { [key : string] : string },
                           scopeType : { [key : string] : Type }) : smt.SNode {
        assert(scopeType);
        if (ast.isTrue || ast.isDontCare)
            return 'true';
        if (ast.isFalse)
            return 'false';
        if (ast instanceof Ast.AndBooleanExpression && ast.operands.length === 0)
            return 'true';
        if (ast instanceof Ast.OrBooleanExpression && ast.operands.length === 0)
            return 'false';
        if (ast instanceof Ast.AndBooleanExpression)
            return smt.And(...ast.operands.map((o) => this._processFilter(o, scope, scopeType)));
        if (ast instanceof Ast.OrBooleanExpression)
            return smt.Or(...ast.operands.map((o) => this._processFilter(o, scope, scopeType)));
        if (ast instanceof Ast.NotBooleanExpression)
            return smt.Not(this._processFilter(ast.expr, scope, scopeType));
        if (ast instanceof Ast.ExternalBooleanExpression) {
            return this._addGetPredicate(ast, scope, scopeType);
        } else if (ast instanceof Ast.ExistentialSubqueryBooleanExpression) {
            const externalEquivalent = ast.toLegacy();
            if (externalEquivalent)
                return this._addGetPredicate(externalEquivalent, scope, scopeType);
            // TODO: add support for existential subquery in general
            throw new Error('Unsupported subquery');
        } else if (ast instanceof Ast.ComparisonSubqueryBooleanExpression) {
            // TODO: add support for comparison subquery
            throw new Error('Unsupported subquery');
        } else {
            assert(ast instanceof Ast.AtomBooleanExpression);

            const filter = ast;
            const pname = scope[filter.name];
            let ptype = scopeType[filter.name];
            if (!ptype)
                throw new TypeError('Invalid filter left-hand-side ' + filter.name);
            switch (filter.operator) {
            case 'contains':
                ptype = (ptype as Type.Array).elem as Type;
                break;
            case 'contains~':
                ptype = Type.String;
                break;
            case 'in_array':
                ptype = new Type.Array(ptype);
                break;
            case 'in_array~':
                ptype = new Type.Array(Type.String);
                break;
            }

            const value = filter.value;
            if (value.isUndefined) {
                if (this._allowUndefined)
                    // return an unrestricted value, to signify that the predicate could be true
                    // or false
                    return this._getSkolemBool();
                else
                    throw new TypeError('Invalid filter right hand side (should be slot filled)');
            }
            if (value instanceof Ast.VarRefValue) {
                if (!scope[value.name] || !scopeType[value.name])
                    throw new TypeError('Invalid filter right-hand-side ' + value.name);
                return this._filterToSmt(filter.operator, pname, ptype,
                    scope[value.name], scopeType[value.name]);
            } else {
                return this._filterToSmt(filter.operator, pname, ptype,
                    this._valueToSmtValue(value, ptype), value.getType());
            }
        }
    }

    private _processPermissionFilter(ast : Ast.BooleanExpression,
                                     ufvar : string,
                                     schema : Ast.FunctionDef,
                                     scope : { [key : string] : string },
                                     scopeType : { [key : string] : Type }) : smt.SNode {
        if (ast.isTrue)
            return 'true';
        if (ast.isFalse)
            return 'false';
        if (ast instanceof Ast.AndBooleanExpression && ast.operands.length === 0)
            return 'true';
        if (ast instanceof Ast.OrBooleanExpression && ast.operands.length === 0)
            return 'false';
        if (ast instanceof Ast.AndBooleanExpression)
            return smt.And(...ast.operands.map((o) => this._processPermissionFilter(o, ufvar, schema, scope, scopeType)));
        if (ast instanceof Ast.OrBooleanExpression)
            return smt.Or(...ast.operands.map((o) => this._processPermissionFilter(o, ufvar, schema, scope, scopeType)));
        if (ast instanceof Ast.NotBooleanExpression)
            return smt.Not(this._processPermissionFilter(ast.expr, ufvar, schema, scope, scopeType));
        if (ast instanceof Ast.ExternalBooleanExpression) {
            return this._addGetPredicate(ast, {}, {});
        } else if (ast instanceof Ast.ExistentialSubqueryBooleanExpression) {
            const externalEquivalent = ast.toLegacy();
            if (externalEquivalent)
                return this._addGetPredicate(externalEquivalent, scope, scopeType);
            // TODO: add support for existential subquery in general
            throw new Error('Unsupported subquery');
        } else if (ast instanceof Ast.ComparisonSubqueryBooleanExpression) {
            // TODO: add support for comparison subquery
            throw new Error('Unsupported subquery');
        } else {
            assert(ast instanceof Ast.AtomBooleanExpression);

            const filter = ast;
            let ptype = schema.out[filter.name] || schema.inReq[filter.name] || schema.inOpt[filter.name];
            if (!ptype)
                throw new TypeError('Invalid filter left-hand-side ' + filter.name);
            switch (filter.operator) {
            case 'contains':
                ptype = (ptype as Type.Array).elem as Type;
                break;
            case 'contains~':
                ptype = Type.String;
                break;
            case 'in_array':
                ptype = new Type.Array(ptype);
                break;
            case 'in_array~':
                ptype = new Type.Array(Type.String);
                break;
            }
            if (filter.value.isUndefined)
                throw new TypeError('Invalid filter right hand side (should be slot filled)');
            const values = [];

            //console.error(String(ast));
            //console.log(this._fnparams);
            for (const pname of (this._fnparams.get(ufvar + ':' + filter.name) || [])) {
                const value = filter.value;
                if (value instanceof Ast.VarRefValue) {
                    const rhs = scope[value.name];
                    const rhsType = scopeType[value.name];
                    for (const rhsname of (this._fnparams.get(rhs) || []))
                        values.push(this._filterToSmt(filter.operator, pname, ptype, rhsname, rhsType));
                } else {
                    values.push(this._filterToSmt(filter.operator, pname, ptype,
                        this._valueToSmtValue(value, ptype), value.getType()));
                }
            }
            if (values.length === 1)
                return values[0];
            if (values.length === 0)
                throw new Error('what');
            return smt.And(...values);
        }
    }

    private _declareUninterpretedFunction(kind : string,
                                          fn : string,
                                          def : Ast.FunctionDef) {
        const cleanKind = kind.replace(/[^A-Za-z0-9_]/g, '_');
        const ufvar = 'uf_' + cleanKind + '_' + fn;
        if (this._uf.has(ufvar))
            return [this._uf.get(ufvar)!, ufvar];

        const signames : string[] = [];
        const sigtypes : smt.SNode[] = [];
        if (def.is_list) {
            signames.push('__resultId');
            sigtypes.push('ResultId');
        }

        for (const arg of def.args) {
            const type = def.inReq[arg] || def.inOpt[arg];
            if (!type || type.isAny)
                continue;
            signames.push(arg);
            sigtypes.push(this._typeToSmtType(type));
            if (def.inOpt[arg])
                this._declare(smt.DeclareFun(ufvar + '_' + arg + '_null', [], this._typeToSmtType(type)));
        }
        this._uf.set(ufvar, signames);

        for (const arg of def.args) {
            const type = def.out[arg];
            if (!type || type.isAny)
                continue;
            const p = ufvar + '_' + arg;
            this._declare(smt.DeclareFun(p, sigtypes, this._typeToSmtType(type)));
        }
        this._declare(smt.DeclareFun(ufvar + '_anyresult', sigtypes, 'Bool'));
        return [signames, ufvar];
    }

    private _declareFunction(kind : string, fn : string, suffix : string,
                             def : Ast.FunctionDef) {
        kind = kind.replace(/[^A-Za-z0-9_]/g, '_');
        const fnvar = suffix;//kind + '_' + fn + '_' + suffix;
        if (this._functions.has(fnvar))
            return fnvar;

        const ufvar = 'uf_' + kind + '_' + fn;
        this._functions.add(fnvar);

        for (const arg of def.args) {
            const p = 'param_' + fnvar + '_' + arg;
            const type = def.inReq[arg] || def.inOpt[arg] || def.out[arg];
            if (type.isAny)
                continue;
            if (def.out[arg] && type.isTime)
                this._asserts.push(smt.And(smt.GEq(p, '0'), smt.LEq(p, '86400')));
            this._declare(smt.DeclareFun(p, [], this._typeToSmtType(type)));
            this._addParam(ufvar, arg, p);
        }
        return fnvar;
    }

    private _addParam(ufvar : string, param : string, value : string) {
        const key = ufvar + ':' + param;
        if (!this._fnparams.has(key))
            this._fnparams.set(key, []);
        this._fnparams.get(key)!.push(value);
    }

    private _addInputParams(fnvar : string,
                            prim : Ast.Invocation|Ast.ExternalBooleanExpression,
                            scope : { [key : string] : string },
                            scopeType : { [key : string] : Type },
                            extraInParams : Ast.InputParam[]) {
        const in_passed : { [key : string] : smt.SNode } = {};
        assert(Array.isArray(extraInParams));
        for (const inParam of prim.in_params.concat(extraInParams)) {
            const pname = 'param_' + fnvar + '_' + inParam.name;
            const ptype = prim.schema!.inReq[inParam.name] || prim.schema!.inOpt[inParam.name];
            if (inParam.value.isUndefined)
                continue;
            const value = inParam.value;
            if (value instanceof Ast.VarRefValue) {
                if (!scope[value.name] || !scopeType[value.name])
                    throw new TypeError('Invalid input parameter value ' + value.name);
                in_passed[inParam.name] = scope[value.name];
                this._asserts.push(this._filterToSmt('==', pname, ptype, scope[value.name], scopeType[value.name]));
            } else {
                in_passed[inParam.name] = this._valueToSmtValue(value, ptype);
                this._asserts.push(this._filterToSmt('==', pname, ptype,
                    this._valueToSmtValue(value, ptype), value.getType()));
            }
        }
        return in_passed;
    }

    private _addGet(prim : Ast.Invocation,
                    scope : { [key : string] : string },
                    scopeType : { [key : string] : Type },
                    extraInParams : Ast.InputParam[]) {
        const [signature, ufvar] = this._declareUninterpretedFunction(prim.selector.kind, prim.channel, prim.schema!);
        const fnvar = this._declareFunction(prim.selector.kind, prim.channel, 'get_' + this._externalfnidx ++, prim.schema!);
        if (prim.schema!.is_list)
            this._declare(smt.DeclareFun(fnvar + '__resultId', [], 'ResultId'));

        const in_passed = this._addInputParams(fnvar, prim, scope, scopeType, extraInParams);

        const inargs : smt.SNode[] = [];
        for (const name of signature) {
            if (name === '__resultId') {
                assert(prim.schema!.is_list);
                inargs.push(fnvar + '__resultId');
            } else {
                inargs.push(in_passed[name] || ufvar + '_' + name + '_null');
            }
        }
        for (const name in prim.schema!.out) {
            const predname = ufvar + '_' + name;
            this._asserts.push(smt.Eq('param_' + fnvar + '_' + name, smt.Predicate(predname, ...inargs)));
            scope[name] = 'param_' + fnvar + '_' + name;
            scopeType[name] = prim.schema!.out[name];
        }
    }

    private _addAction(fn : Ast.Invocation,
                       prefix : string,
                       scope : { [key : string] : string },
                       scopeType : { [key : string] : Type }) {
        const fnvar = this._declareFunction(fn.selector.kind, fn.channel, prefix, fn.schema!);
        this._addInputParams(fnvar, fn, scope, scopeType, []);
    }

    private _addStream(stream : Ast.Stream,
                       scope : { [key : string] : string },
                       scopeType : { [key : string] : Type }) {
        if (stream.isTimer || stream.isAtTimer)
            return;
        if (stream instanceof Ast.MonitorStream) {
            this._addTable(stream.table, scope, scopeType, []);
            return;
        }
        if (stream instanceof Ast.EdgeNewStream) {
            this._addStream(stream.stream, scope, scopeType);
            return;
        }
        if (stream instanceof Ast.FilteredStream || stream instanceof Ast.EdgeFilterStream) {
            this._addStream(stream.stream, scope, scopeType);
            this._asserts.push(this._processFilter(stream.filter, scope, scopeType));
            return;
        }
        if (stream instanceof Ast.JoinStream) {
            this._addStream(stream.stream, scope, scopeType);
            this._addTable(stream.table, scope, scopeType, stream.in_params);
            return;
        }
        if (stream instanceof Ast.ProjectionStream) {
            this._addStream(stream.stream, scope, scopeType);
            for (const name in scope) {
                if (stream.args.indexOf(name) < 0) {
                    delete scope[name];
                    delete scopeType[name];
                }
            }
            return;
        }

        throw new TypeError(`Unimplemented stream ${stream}`);
    }

    private _addTable(table : Ast.Table,
                      scope : { [key : string] : string },
                      scopeType : { [key : string] : Type },
                      extraInParams : Ast.InputParam[]) {
        if (table instanceof Ast.InvocationTable) {
            this._addGet(table.invocation, scope, scopeType, extraInParams);
            return;
        }
        if (table instanceof Ast.FilteredTable) {
            this._addTable(table.table, scope, scopeType, extraInParams);
            this._asserts.push(this._processFilter(table.filter, scope, scopeType));
            return;
        }
        if (table instanceof Ast.JoinTable) {
            this._addTable(table.lhs, scope, scopeType, extraInParams);
            this._addTable(table.rhs, scope, scopeType, extraInParams.concat(table.in_params));
            return;
        }
        if (table instanceof Ast.ProjectionTable) {
            this._addTable(table.table, scope, scopeType, extraInParams);
            for (const name in scope) {
                if (table.args.indexOf(name) < 0) {
                    delete scope[name];
                    delete scopeType[name];
                }
            }
            return;
        }

        throw new TypeError(`Unimplemented table ${table}`);
    }

    addRule(principal : Ast.EntityValue, program : Ast.Program, rule : Ast.Rule|Ast.Command) : void {
        for (const classdef of program.classes)
            this._classes[classdef.name] = classdef;

        const scope : { [key : string] : string } = {};
        const scopeType : { [key : string] : Type } = {};
        if (rule instanceof Ast.Rule)
            this._addStream(rule.stream, scope, scopeType);
        else if (rule.table)
            this._addTable(rule.table, scope, scopeType, []);
        rule.actions.forEach((action : Ast.Action, i : number) => {
            if (action instanceof Ast.VarRefAction)
                throw new TypeError(`Unimplemented action ${action}`);
            if (action instanceof Ast.InvocationAction && !isRemoteSend(action.invocation))
                this._addAction(action.invocation, 'a_' + i, scope, scopeType);
        });
    }

    private _addPermissionFunction(fn : Ast.SpecifiedPermissionFunction,
                                   scope : { [key : string] : string },
                                   scopeType : { [key : string] : Type }) {
        const kind = fn.kind.replace(/[^A-Za-z0-9_]/g, '_');
        const ufvar = 'uf_' + kind + '_' + fn.channel;

        const ands = [];
        const filter = this._processPermissionFilter(fn.filter, ufvar, fn.schema!, scope, scopeType);
        const name = this._filteridx++;
        this._filtermap[name] = fn.filter;
        this._filterrevmap.set(fn.filter, name);
        this._constants.set('filter_' + name, 'Bool');
        this._asserts.push(smt.Eq('filter_' + name, filter));
        ands.push('filter_' + name);

        for (const arg in fn.schema!.out) {
            scope[arg] = ufvar + ':' + arg;
            scopeType[arg] = fn.schema!.out[arg];
        }

        if (ands.length > 1)
            return smt.And(...ands);
        else
            return ands[0];
    }

    addPermission(permissionRule : Ast.PermissionRule) : smt.SNode {
        const ands : smt.SNode[] = [];
        const scope : { [key : string] : string } = {};
        const scopeType : { [key : string] : Type } = {};

        const query = permissionRule.query;
        if (query instanceof Ast.SpecifiedPermissionFunction)
            ands.push(this._addPermissionFunction(query, scope, scopeType));
        const action = permissionRule.action;
        if (action instanceof Ast.SpecifiedPermissionFunction)
            ands.push(this._addPermissionFunction(action, scope, scopeType));
        if (ands.length > 1)
            return smt.And(...ands);
        if (ands.length === 1)
            return ands[0];
        return 'true';
    }

    addAssert(v : smt.SNode) {
        this._asserts.push(v);
    }

    async checkSatisfiable(enableAssignments = false) : Promise<boolean> {
        if (enableAssignments)
            this._solver.enableAssignments();
        this._addEverything();
        if (this._debug)
            this._solver.dump();
        const [sat, assignment] = await this._solver.checkSat();
        //console.log('CVC4 result: ', sat);
        this._assignment = assignment;
        return sat;
    }

    getFilterName(filter : Ast.BooleanExpression) {
        const name = this._filterrevmap.get(filter);
        assert(typeof name === 'number');
        return 'filter_' + name;
    }

    isFilterTrue(filter : Ast.BooleanExpression) {
        if (!this._assignment) // unsat
            throw new Error('Not satifisiable');
        return this._assignment[this.getFilterName(filter)];
    }

    clone() {
        const self = new SmtReduction(this._solver.constructor as SolverConstructor, { allowUndefined: this._allowUndefined });
        self._declarations = this._declarations;
        self._constants = this._constants;
        self._classes = this._classes;
        self._functions = this._functions;
        // make a copy of the array
        self._asserts = this._asserts.slice();

        self._filteridx = this._filteridx;
        self._filtermap = this._filtermap;
        self._filterrevmap = this._filterrevmap;

        return self;
    }
}

// Verifies that a program is allowed, with the help of an SMT solver

const PARALLEL_DO_ALL = false;
async function promiseDoAll<T>(array : T[], fn : (x : T, i : number) => Promise<unknown>) : Promise<void> {
    if (PARALLEL_DO_ALL) {
        await Promise.all(array.map(fn));
        return;
    }

    for (let i = 0; i < array.length; i++)
        await fn(array[i], i);
}

type BinaryOpMap = { [key : string] : (x : any, y : any) => boolean };
const OP_FUNCTIONS : BinaryOpMap = {
    '>': (a, b) => a > b,
    '<': (a, b) => a < b,
    '>=': (a, b) => a >= b,
    '<=': (a, b) => a <= b,
    '!': (a, b) => !a
};

function evaluateOp(builtinOp : BuiltinDefs.OpImplementation, arg1 : any, arg2 : any) : boolean {
    if (builtinOp.op)
        return OP_FUNCTIONS[builtinOp.op](arg1, arg2);
    else if (builtinOp.flip)
        return (BuiltinOps as unknown as BinaryOpMap)[builtinOp.fn!](arg2, arg1);
    else
        return (BuiltinOps as unknown as BinaryOpMap)[builtinOp.fn!](arg1, arg2);
}

function isRemoteSend(fn : Ast.Invocation|Ast.ExternalBooleanExpression) : boolean {
    return (fn.selector.kind === 'org.thingpedia.builtin.thingengine.remote' || fn.selector.kind.startsWith('__dyn_')) &&
        fn.channel === 'send';
}

interface RuleTransformerOptions {
    allowUndefined : boolean;
    debug : boolean;
}

class RuleTransformer {
    private _SolverClass : SolverConstructor;
    private _groupmap : Map<string, string[]>;
    private _options : RuleTransformerOptions;
    private _classes : { [key : string] : Ast.ClassDef };
    private _principal : Ast.EntityValue;
    private _program : Ast.Program;
    private _rule : Ast.Rule|Ast.Command;
    private _primKey : Array<[('action'|'query'|'stream'|'filter'|'expression'), Ast.Invocation|Ast.ExternalBooleanExpression]>;
    private _relevantPermissions : Ast.PermissionRule[];
    private _newrule : Ast.Rule|Ast.Command|null;

    private _firstReduction : SmtReduction|null = null;
    private _secondReduction : SmtReduction|null = null;

    constructor(SolverClass : SolverConstructor,
                principal : Ast.EntityValue,
                program : Ast.Program,
                rule : Ast.Rule|Ast.Command,
                permissiondb : Set<Ast.PermissionRule>,
                groupmap : Map<string, string[]>,
                options : RuleTransformerOptions) {
        this._SolverClass = SolverClass;
        this._groupmap = groupmap;
        this._options = options;

        this._principal = principal;
        this._program = program;
        this._classes = {};
        for (const classdef of program.classes)
            this._classes[classdef.name] = classdef;

        this._rule = rule;
        this._primKey = Array.from(rule.iteratePrimitives(false));

        this._relevantPermissions = this._computeRelevantPermissions(permissiondb);
        //console.log('Found ' + this._relevantPermissions.length + ' relevant permissions');
        //for (let permission of this._relevantPermissions)
        //    console.log(Ast.prettyprintPermissionRule(permission));

        this._newrule = null;
    }

    private _addAllGroups(reduction : SmtReduction) {
        for (const [principal, groups] of this._groupmap.entries()) {
            reduction.addGroups(new Ast.Value.Entity(principal, 'tt:contact', null),
                groups.map((g) => new Ast.Value.Entity(g, 'tt:contact_group', null)));
        }
    }

    private _isFunctionPermissionRelevant(rulefn : Ast.PermissionFunction,
                                          programfn : Ast.Invocation|Ast.ExternalBooleanExpression) {
        if (rulefn === Ast.PermissionFunction.Star)
            return true;
        if (isRemoteSend(programfn))
            return rulefn === Ast.PermissionFunction.Builtin;
        let kind = programfn.selector.kind;
        if (kind in this._classes)
            kind = this._classes[kind].extends[0];
        if (rulefn instanceof Ast.ClassStarPermissionFunction)
            return kind === rulefn.kind;
        if (rulefn instanceof Ast.SpecifiedPermissionFunction)
            return kind === rulefn.kind && programfn.channel === rulefn.channel;
        return false;
    }

    private _isPermissionRelevantForFunctions(permissionRule : Ast.PermissionRule) {
        if (!(this._rule instanceof Ast.Rule) && !this._rule.table &&
            !(permissionRule.query.isBuiltin || permissionRule.query.isStar))
            return false;

        for (const [primType, prim] of this._primKey) {
            if (primType === 'query' || primType === 'filter') {
                if (!this._isFunctionPermissionRelevant(permissionRule.query, prim))
                    return false;
            }
        }
        for (const action of this._rule.actions) {
            if (action instanceof Ast.VarRefAction)
                continue;
            if (action instanceof Ast.NotifyAction) {
                if (permissionRule.action !== Ast.PermissionFunction.Builtin &&
                    permissionRule.action !== Ast.PermissionFunction.Star)
                    return false;
                continue;
            }
            assert(action instanceof Ast.InvocationAction);
            if (!this._isFunctionPermissionRelevant(permissionRule.action, action.invocation))
                return false;
        }
        //console.log(Ast.prettyprintPermissionRule(rule) + ' is relevant');
        return true;
    }

    private _computeRelevantPermissions(permissiondb : Set<Ast.PermissionRule>) {
        const ret = [];
        for (const rule of permissiondb) {
            if (!rule.principal.isTrue) {
                const inParamMap = {
                    $source: this._principal
                };
                const simplified = this._partiallyEvalFilter(rule.principal, inParamMap, {}).optimize();
                if (simplified.isFalse)
                    continue;
                if (!simplified.isTrue)
                    throw new Error('Predicate on source is not either true or false?');
            }

            if (this._isPermissionRelevantForFunctions(rule))
                ret.push(rule);
        }
        return ret;
    }

    private _addProgram(reduction : SmtReduction) {
        reduction.addRule(this._principal, this._program, this._rule);
    }

    private _isPermissionApplicable(permission : Ast.PermissionRule) {
        // if we only have one permission, and we checked that the program was conditionally
        // allowed, skip the call and say yes
        if (this._relevantPermissions.length === 1) {
            console.error('Hit OPT 0');
            return Promise.resolve(true);
        }
        const filters = [];
        const queryperm = permission.query;
        const actionperm = permission.action;
        if (queryperm instanceof Ast.SpecifiedPermissionFunction && !queryperm.filter.isTrue)
            filters.push(queryperm.filter);
        if (actionperm instanceof Ast.SpecifiedPermissionFunction && !actionperm.filter.isTrue)
            filters.push(actionperm.filter);
        if (filters.every((f) => this._firstReduction!.isFilterTrue(f))) {
            // we got lucky! the main reduction found a case where the filters
            // are all true
            // skip the call and say yes
            console.error('Hit OPT 1');
            return Promise.resolve(true);
        }
        if (filters.every((f) => this._secondReduction!.isFilterTrue(f))) {
            // same thing, but with the second reduction
            console.error('Hit OPT 1');
            return Promise.resolve(true);
        }

        const reduction = new SmtReduction(this._SolverClass, this._options);
        this._addAllGroups(reduction);
        this._addProgram(reduction);
        reduction.addAssert(reduction.addPermission(permission));
        //console.log('Checking that permission ' + prettyprintPermissionRule(permission) + ' is applicable');
        return reduction.checkSatisfiable();
    }

    private _isFilterImplied(permission : Ast.PermissionRule,
                             permissionFunction : Ast.PermissionFunction,
                             check : (reduction : SmtReduction) => void) : Promise<boolean> {
        if (!(permissionFunction instanceof Ast.SpecifiedPermissionFunction))
            return Promise.resolve(true);
        const filter = permissionFunction.filter;
        if (filter.isTrue)
            return Promise.resolve(true);
        if (filter.isFalse)
            return Promise.resolve(false);
        if (!this._firstReduction!.isFilterTrue(filter)) {
            // we got lucky! the main reduction found a case where this filter
            // is false
            // skip the call and say no
            console.error('Hit OPT 2');
            return Promise.resolve(false);
        }
        if (!this._secondReduction!.isFilterTrue(filter)) {
            // same thing, but with the second reduction
            console.error('Hit OPT 2');
            return Promise.resolve(false);
        }

        const reduction = new SmtReduction(this._SolverClass, this._options);
        this._addAllGroups(reduction);
        this._addProgram(reduction);
        reduction.addPermission(permission);
        check(reduction);
        //console.log('Checking that filter ' + filter + ' in permission ' + prettyprintPermissionRule(permission) + ' is valid');
        return reduction.checkSatisfiable().then((r : boolean) => !r);
    }

    private _partiallyEvalFilter(expr : Ast.BooleanExpression,
                                 inParamMap : { [key : string] : Ast.Value|undefined },
                                 previousPrimitiveDef : { [key : string] : Type }) {
        const groupmap = this._groupmap;

        return (function recursiveHelper(expr : Ast.BooleanExpression) : Ast.BooleanExpression {
            if (expr.isTrue || expr.isFalse || expr.isDontCare)
                return expr;
            if (expr instanceof Ast.OrBooleanExpression)
                return new Ast.BooleanExpression.Or(expr.location, expr.operands.map(recursiveHelper));
            if (expr instanceof Ast.AndBooleanExpression)
                return new Ast.BooleanExpression.And(expr.location, expr.operands.map(recursiveHelper));
            if (expr instanceof Ast.NotBooleanExpression)
                return new Ast.BooleanExpression.Not(expr.location, recursiveHelper(expr.expr));
            if (expr instanceof Ast.ExternalBooleanExpression) // external predicates don't refer to the inputs or outputs of the function so we're good
                return expr;
            if (expr instanceof Ast.ExistentialSubqueryBooleanExpression)
                return expr;
            if (expr instanceof Ast.ComparisonSubqueryBooleanExpression)
                return expr;

            let lhs : Ast.Value|undefined, rhs : Ast.Value;
            let filter : Ast.ComputeBooleanExpression|Ast.AtomBooleanExpression;
            if (expr instanceof Ast.ComputeBooleanExpression) {
                filter = expr;
                if (expr.lhs instanceof Ast.EventValue) {
                    assert(expr.lhs.name === 'source');
                    lhs = inParamMap['$source'];
                } else {
                    assert(expr.lhs instanceof Ast.VarRefValue);
                    lhs = inParamMap[expr.lhs.name];
                }
                rhs = expr.rhs;
            } else {
                assert(expr instanceof Ast.AtomBooleanExpression);
                filter = expr;
                lhs = inParamMap[filter.name];
                rhs = expr.value;
            }
            // the filter comes from tne Allowed() rule, it should not have anything funky
            assert(!rhs.isUndefined);
            if (!lhs)
                return expr;
            assert(!(rhs instanceof Ast.VarRefValue)); // ???
            if (rhs instanceof Ast.VarRefValue && inParamMap[rhs.name])
                rhs = inParamMap[rhs.name]!;
            if (rhs instanceof Ast.VarRefValue && previousPrimitiveDef[rhs.name])
                rhs = new Ast.Value.VarRef(rhs.name);
            if (lhs.isUndefined)
                throw new Error('Unexpected $undefined');
            if (lhs instanceof Ast.VarRefValue) {
                if (previousPrimitiveDef[lhs.name])
                    return new Ast.BooleanExpression.Atom(expr.location, lhs.name, filter.operator, rhs);
                else
                    return new Ast.BooleanExpression.Atom(expr.location, lhs.name, filter.operator, rhs);
            } else {
                if ((lhs instanceof Ast.LocationValue && (lhs.value.isRelative || lhs.value.isUnresolved)) ||
                    (rhs instanceof Ast.LocationValue && (rhs.value.isRelative || rhs.value.isUnresolved)))
                    return expr;
                if (rhs instanceof Ast.VarRefValue)
                    return new Ast.BooleanExpression.Atom(expr.location, rhs.name, flipOperator(filter.operator), lhs);
                const jslhs = lhs.toJS();
                const jsrhs = rhs.toJS();
                let result;
                if (filter.operator === 'group_member')
                    result = isGroupMember(jslhs as string, jsrhs as string, groupmap);
                else
                    result = evaluateOp(BuiltinDefs.BinaryOps[filter.operator], jslhs, jsrhs);
                if (result === true)
                    return Ast.BooleanExpression.True;
                else if (result === false)
                    return Ast.BooleanExpression.False;
                else
                    throw new TypeError('Partially evaluated filter is not boolean?');
            }
        })(expr);
    }

    private _adjust() {
        const newfilter : Ast.BooleanExpression[] = [];

        return promiseDoAll(this._relevantPermissions, (permission) => this._isPermissionApplicable(permission).then(async (isApplicable : boolean) => {
            if (!isApplicable) {
                //console.log('Not applicable');
                return;
            }

            // check if the query permission function is "valid" - in the sense of logical validity: it is entailed (implied) by the program
            const isQueryValid = await this._isFilterImplied(permission, permission.query, (reduction : SmtReduction) => {
                reduction.addAssert(smt.Not(reduction.getFilterName((permission.query as Ast.SpecifiedPermissionFunction).filter)));
            });
            //console.log('isQueryValid ' + isQueryValid);

            let querypredicate : Ast.BooleanExpression;
            if (isQueryValid) {
                querypredicate = Ast.BooleanExpression.True;
            } else {
                const inParamMap : { [key : string] : Ast.Value|undefined } = {};
                const newrule = this._newrule!;
                if (newrule instanceof Ast.Rule) {
                    for (const [,in_param,,] of newrule.stream.iterateSlots({})) {
                        if (!(in_param instanceof Ast.InputParam))
                            continue;
                        if (in_param.name in inParamMap)
                            inParamMap[in_param.name] = undefined;
                        else
                            inParamMap[in_param.name] = in_param.value;
                    }
                } else if (newrule.table) {
                    for (const [,in_param,,] of newrule.table.iterateSlots({})) {
                        if (!(in_param instanceof Ast.InputParam))
                            continue;
                        if (in_param.name in inParamMap)
                            inParamMap[in_param.name] = undefined;
                        else
                            inParamMap[in_param.name] = in_param.value;
                    }
                } else {
                    throw new Error('how did we get here?');
                }

                querypredicate = this._partiallyEvalFilter((permission.query as Ast.SpecifiedPermissionFunction).filter, inParamMap, {});
            }

            const isActionValid = await this._isFilterImplied(permission, permission.action, (reduction : SmtReduction) => {
                if (permission.query.isSpecified)
                    reduction.addAssert(reduction.getFilterName((permission.query as Ast.SpecifiedPermissionFunction).filter));
                reduction.addAssert(smt.Not(reduction.getFilterName((permission.action as Ast.SpecifiedPermissionFunction).filter)));
            });
            //console.log('isActionValid ' + isActionValid);
            if (!isActionValid) {
                const rule = this._rule;
                for (const action of rule.actions) {
                    assert(action instanceof Ast.InvocationAction);
                    const inParamMap : { [key : string] : Ast.Value } = {};
                    for (const inParam of action.invocation.in_params)
                        inParamMap[inParam.name] = inParam.value;

                    const previousPrimitiveDef = (rule instanceof Ast.Rule ? rule.stream.schema : rule.table!.schema)!;
                    querypredicate = new Ast.BooleanExpression.And(null, [
                        querypredicate, this._partiallyEvalFilter((permission.action as Ast.SpecifiedPermissionFunction).filter, inParamMap, previousPrimitiveDef.out)]);
                }
            }
            newfilter.push(querypredicate);
        })).then(() => {
            const queryfilter = new Ast.BooleanExpression.Or(null, newfilter).optimize();
            if (queryfilter.isFalse)
                return null;

            const newrule = this._newrule!;
            if (newrule instanceof Ast.Rule)
                newrule.stream = new Ast.Stream.Filter(null, newrule.stream, queryfilter, newrule.stream.schema);
            else if (newrule.table)
                newrule.table = new Ast.Table.Filter(null, newrule.table, queryfilter, newrule.table.schema);
            else if (!queryfilter.isTrue)
                return null;

            return this._newrule;
        });
    }

    async check() {
        if (this._relevantPermissions.length === 0)
            return false;

        const satReduction = new SmtReduction(this._SolverClass, this._options);
        this._addAllGroups(satReduction);
        this._addProgram(satReduction);
        if (!await satReduction.checkSatisfiable())
            return false;

        const anyPermissionReduction = new SmtReduction(this._SolverClass, this._options);
        this._addAllGroups(anyPermissionReduction);
        this._addProgram(anyPermissionReduction);
        const ors = [];
        for (const permission of this._relevantPermissions)
            ors.push(anyPermissionReduction.addPermission(permission));
        anyPermissionReduction.addAssert(smt.Or(...ors));
        return anyPermissionReduction.checkSatisfiable();
    }

    async transform() {
        if (this._relevantPermissions.length === 0)
            return null;


        const satReduction = new SmtReduction(this._SolverClass, this._options);
        this._addAllGroups(satReduction);
        this._addProgram(satReduction);
        if (!await satReduction.checkSatisfiable()) {
            //console.log('Rule not satifisiable');
            //console.log(Ast.prettyprint(this._program, true));
            return null;
        }

        {
            // first check if the permission is directly satisfied

            this._firstReduction = new SmtReduction(this._SolverClass, this._options);
            this._addAllGroups(this._firstReduction);
            this._addProgram(this._firstReduction);
            const ors = [];
            for (const permission of this._relevantPermissions)
                ors.push(this._firstReduction.addPermission(permission));
            this._firstReduction.addAssert(smt.Not(smt.Or(...ors)));
            if (!await this._firstReduction.checkSatisfiable(true))
                return this._rule.clone();
        }

        {
            // now check if the permission can be satisfied at all

            this._secondReduction = new SmtReduction(this._SolverClass, this._options);
            this._addAllGroups(this._secondReduction);
            this._addProgram(this._secondReduction);
            const ors = [];
            for (const permission of this._relevantPermissions)
                ors.push(this._secondReduction.addPermission(permission));
            this._secondReduction.addAssert(smt.Or(...ors));
            if (!await this._secondReduction.checkSatisfiable(true))
                return null;
        }

        this._newrule = this._rule.clone();
        return this._adjust();
    }
}

interface GroupDelegate {
    getGroups(principal : string) : Promise<string[]>;
}

export default class PermissionChecker {
    private _SolverClass : SolverConstructor;
    private _schemaRetriever : SchemaRetriever;
    private _groupDelegate : GroupDelegate;
    private _permissiondb : Set<Ast.PermissionRule>;
    private _principals : Set<string>;
    private _groupmap : Map<string, string[]>;

    constructor(SolverClass : SolverConstructor,
                schemaRetriever : SchemaRetriever,
                groupDelegate : GroupDelegate) {
        this._SolverClass = SolverClass;
        this._schemaRetriever = schemaRetriever;
        this._groupDelegate = groupDelegate;
        this._permissiondb = new Set;
        this._principals = new Set;

        // maps a principal to its array of groups, as returned by the group delegate
        this._groupmap = new Map;
    }

    private _collectPrincipals(program : Ast.Program|Ast.PermissionRule, into : Set<string>) {
        for (const slot of program.iterateSlots2()) {
            if (!(slot instanceof Ast.DeviceSelector)) {
                const value = slot.get();
                if (value instanceof Ast.EntityValue && value.type === 'tt:contact')
                    into.add(value.value!);
            }
        }
    }

    private async _setProgram(principal : Ast.EntityValue, program : Ast.Program) {
        await program.typecheck(this._schemaRetriever);

        this._principals.add(principal.value!);
        const programPrincipals = new Set(this._principals);
        this._collectPrincipals(program, programPrincipals);

        await Promise.all(Array.from(programPrincipals).map(async (principal) => {
            const groups = await this._groupDelegate.getGroups(principal);
            this._groupmap.set(principal, groups);
        }));
    }

    private async _doCheck(principal : Ast.EntityValue, program : Ast.Program) {
        let all = true;
        await promiseDoAll(program.statements, (rule) => {
            if (rule instanceof Ast.Assignment)
                throw new Error(`Unsupported assignment`);

            const transformer = new RuleTransformer(this._SolverClass,
                principal, program, rule.toLegacy(), this._permissiondb, this._groupmap,
                { allowUndefined: true, debug: false });
            return transformer.check().then((ok) => {
                if (!ok)
                    all = false;
            });
        });
        return all;
    }

    private async _doTransform(principal : Ast.EntityValue, program : Ast.Program) {
        const newrules : Ast.ExpressionStatement[] = [];
        await promiseDoAll(program.statements, (rule) => {
            if (rule instanceof Ast.Assignment)
                throw new Error(`Unsupported assignment`);

            const transformer = new RuleTransformer(this._SolverClass,
                principal, program, rule.toLegacy(), this._permissiondb, this._groupmap,
                { allowUndefined: false, debug: false });
            return transformer.transform().then((newrule) => {
                if (newrule !== null)
                    newrules.push(newrule.toExpression());
            });
        });
        if (newrules.length === 0)
            return null;
        return (new Ast.Program(null, program.classes, program.declarations, newrules)).optimize();
    }

    check(principal : Ast.EntityValue, program : Ast.Program, options : { transform : false }) : Promise<boolean>;
    check(principal : Ast.EntityValue, program : Ast.Program, options ?: { transform : true }) : Promise<Ast.Program|null>;
    async check(principal : Ast.EntityValue, program : Ast.Program, options = { transform: true }) : Promise<Ast.Program|null|boolean> {
        await this._setProgram(principal, program);

        if (options.transform)
            return this._doTransform(principal, program);
        else
            return this._doCheck(principal, program);
    }

    allowed(permissionRule : Ast.PermissionRule) {
        return permissionRule.typecheck(this._schemaRetriever).then(() => {
            this._permissiondb.add(permissionRule);
            this._collectPrincipals(permissionRule, this._principals);
        });
    }

    disallowed(permissionRule : Ast.PermissionRule) {
        this._permissiondb.delete(permissionRule);
    }
}
