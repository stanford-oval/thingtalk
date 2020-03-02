// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const smt = require('smtlib');

const Ast = require('./ast');
const Type = require('./type');
const BuiltinDefs = require('./builtin/defs');
const BuiltinOps = require('./builtin/primitive_ops');

function arrayEquals(a, b) {
    if (a === null && b === null)
        return true;
    if (a === null || b === null)
        return false;
    if (a.length !== b.length)
        return false;

    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }

    return true;
}

function isGroupMember(principal, group, groupmap) {
    return (groupmap.get(principal) || []).indexOf(group) >= 0;
}

// Reduces a program and a set of Allowed rules into one call to the SMT, and invokes
// the SMT solver
class SmtReduction {
    constructor(SolverClass, { allowUndefined = false, debug = false }) {
        this._solver = new SolverClass();
        this._allowUndefined = allowUndefined;
        this._debug = debug;

        this._declarations = [];
        this._declarations.push(smt.DeclareSort('ResultId'));
        this._declarations.push(smt.DeclareDatatype('Location',
            ['loc.home', 'loc.work', 'loc.current_location',
             ['loc.absolute', '(loc.lat Real)', '(loc.lon Real)'],
             ['loc.byName', '(loc.name String)']
            ]));
        this._entityTypes = new Set;
        let contactType = this._declareEntityType(Type.Entity('tt:contact'));
        let contactGroupType = this._declareEntityType(Type.Entity('tt:contact_group'));
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

    _getSkolemBool() {
        let bool = 'sk_' + this._nextSkolemBool++;
        this._constants.set(bool, 'Bool');
        return bool;
    }

    _add(stmt) {
        this._solver.add(stmt);
    }

    _declare(stmt) {
        this._declarations.push(stmt);
    }

    _addEverything() {
        for (let [name, t] of this._enumtypes)
            this._add(smt.DeclareDatatype(name, t.entries.map((e) => name + '.' + e)));
        for (let decl of this._declarations)
            this._add(decl);
        for (let [name, t] of this._constants.entries())
            this._add(smt.DeclareFun(name, [], t));
        for (let assert of this._asserts)
            this._solver.assert(assert);
    }

    _makeEnumType(type) {
        for (let [name, enumType] of this._enumtypes) {
            if (arrayEquals(type.entries, enumType.entries))
                return name;
        }
        let name = 'Enum_' + this._enumtypes.length;
        this._enumtypes.push([name, type]);
        return name;
    }

    _declareEntityType(type) {
        let entityType = type.type;
        let smtType = 'Entity_' + entityType.replace(/[^A-Za-z0-9_]/g, '_');
        if (this._entityTypes.has(entityType))
            return smtType;

        this._entityTypes.add(entityType);
        this._declarations.push(smt.DeclareDatatype(smtType,
            [['mk.' + smtType, '(' + smtType + '.get String)']]));
        return smtType;
    }

    _getEntityValue(value, type) {
        this._declareEntityType(type);
        let entityType = type.type;
        let smtType = 'Entity_' + entityType.replace(/[^A-Za-z0-9_]/g, '_');
        return new smt.SExpr(smtType + '.get', value);
    }

    _typeToSmtType(type) {
        if (type.isArray)
            return smt.SetType(this._typeToSmtType(type.elem));
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
        if (type.isEntity)
            return this._declareEntityType(type);
        if (type.isEnum)
            return this._makeEnumType(type);

        throw new TypeError('Unsupported type ' + type);
    }

    _numberToSmt(v) {
        if (v >= 0)
            return String(v);
        else
            return new smt.SExpr('-', -v);
    }

    _locToSmtValue(loc) {
        if (loc.isRelative)
            return 'loc.' + loc.relativeTag;
        if (loc.isUnresolved)
            return new smt.SExpr('loc.byName', smt.StringLiteral(loc.name));

        return new smt.SExpr('loc.absolute', this._numberToSmt(loc.lat),
            this._numberToSmt(loc.lon));
    }

    _encodeEntityValue(ev) {
        return ev.replace(/[^A-Za-z0-9]/g, (c) =>
            '_' + c.charCodeAt(0).toString(16).toUpperCase());
    }

    _entityToSmtValue(entityValue, entityType) {
        let smtType = this._declareEntityType(Type.Entity(entityType));
        return new smt.SExpr('mk.' + smtType, smt.StringLiteral(entityValue));
    }

    _enumToSmtValue(enumerant, type) {
        let typename = this._makeEnumType(type);
        return typename + '.' + enumerant;
    }

    _currencyToSmt(v) {
        let code = v.code.toLowerCase();
        if (!this._currencies.has(code)) {
            this._declare(smt.DeclareFun('Currency_' + code, ['Real'], 'Real'));
            this._currencies.add(code);
        }

        return smt.Predicate('Currency_' + code, this._numberToSmt(v.value));
    }

    _valueToSmtValue(v, type) {
        if (v.isVarRef)
            throw new TypeError('Unexpected var ref in filter');
        if (v.isUndefined)
            throw new TypeError('Unexpected undefined TT value');
        if (v.isArray) {
            if (v.value.length === 0)
                return new smt.SExpr('as', 'emptyset', new smt.SExpr('Set', this._typeToSmtType(type.elem)));
            return new smt.SExpr('insert',
                ...v.value.slice(1).map((elem) => this._valueToSmtValue(elem, type.elem)),
                new smt.SExpr('singleton', this._valueToSmtValue(v.value[0], type.elem)));
        }
        if (v.isBoolean)
            return v.value ? 'true' : 'false';
        if (v.isString)
            return smt.StringLiteral(v.value);
        if (v.isCurrency)
            return this._currencyToSmt(v);
        if (v.isNumber || v.isMeasure)
            return this._numberToSmt(v.toJS()); // toJS() normalizes the measurement
        if (v.isLocation)
            return this._locToSmtValue(v.value);
        if (v.isEntity)
            return this._entityToSmtValue(v.value, v.type);
        if (v.isEnum)
            return this._enumToSmtValue(v.value, type);
        if (v.isTime)
            return String(v.hour * 3600 + v.minute * 60);
        if (v.isDate)
            return String(v.toJS().getTime()); // TODO handle relative dates correctly
        throw new TypeError('Unsupported value ' + v);
    }

    addGroups(principal, groups) {
        let lhs = smt.Predicate('Entity_tt_contact.getGroups', this._valueToSmtValue(principal, Type.Entity('tt:contact')));
        let contactGroupType = this._declareEntityType(Type.Entity('tt:contact_group'));

        let rhs;
        if (groups.length === 0) {
            rhs = new smt.SExpr('as', 'emptyset', smt.SetType(contactGroupType));
        } else if (groups.length === 1) {
            rhs = new smt.SExpr('singleton', this._valueToSmtValue(groups[0], Type.Entity('tt:contact_group')));
        } else {
            rhs = new smt.SExpr('insert',
                ...groups.slice(1).map((g) => this._valueToSmtValue(g, Type.Entity('tt:contact_group'))),
                new smt.SExpr('singleton', this._valueToSmtValue(groups[0], Type.Entity('tt:contact_group'))));
        }

        this._asserts.push(smt.Eq(lhs, rhs));
    }

    _getVarName(prefix, type) {
        let idx = 0;
        let vname = 'prog_' + prefix + '_' + idx;
        while (this._constants.has(vname))
            vname = 'prog_' + prefix + '_' + (++idx);
        this._constants.set(vname, this._typeToSmtType(type));
        return vname;
    }

    _filterToSmt(operator, param, paramType, value, valueType) {
        if (valueType.isEnum)
            valueType = paramType;
        if (operator !== 'group_member' && !valueType.equals(paramType)) {
            if (valueType.isEntity)
                value = this._getEntityValue(value, valueType);
            if (paramType.isEntity)
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

    _addGetPredicate(ast, scope, scopeType) {
        let [signature, ufvar] = this._declareUninterpretedFunction(ast.selector.kind, ast.channel, ast.schema);
        let extfnvar = this._declareFunction(ast.selector.kind, ast.channel, 'pred_' + this._externalfnidx ++,  ast.schema, ast.in_params);

        if (ast.schema.is_list)
            this._declare(smt.DeclareFun(extfnvar + '__resultId', [], 'ResultId'));

        let in_passed = {};
        for (let inParam of ast.in_params) {
            let ptype = ast.schema.inReq[inParam.name] || ast.schema.inOpt[inParam.name];
            if (inParam.value.isVarRef) {
                if (!scope[inParam.value.name] || !scopeType[inParam.value.name])
                    throw new TypeError('Invalid input parameter value ' + inParam.value.name);
                in_passed[inParam.name] = scope[inParam.value.name];
            } else {
                in_passed[inParam.name] = this._valueToSmtValue(inParam.value, ptype);
            }
        }
        let inargs = [];
        for (let name of signature) {
            if (name === '__resultId')
                inargs.push(extfnvar + '__resultId');
            else
                inargs.push(in_passed[name] || ufvar + '_' + name + '_null');
        }

        let subscope = {};
        Object.assign(subscope, scope);
        let subscopeType = {};
        Object.assign(subscopeType, scopeType);
        for (let name in ast.schema.out) {
            let predname = ufvar + '_' + name;
            this._asserts.push(smt.Eq('param_' + extfnvar + '_' + name, smt.Predicate(predname, ...inargs)));
            subscope[name] = 'param_' + extfnvar + '_' + name;
            subscopeType[name] = scopeType;
        }
        let anyresult = 'anyresult_' + extfnvar;
        this._constants.set(anyresult, 'Bool');
        this._asserts.push(smt.Eq(anyresult, smt.Predicate(ufvar + '_anyresult', ...inargs)));
        this._addInputParams(extfnvar, ast, scope, scopeType, []);
        return smt.And(anyresult, this._processFilter(ast.filter, subscope, subscopeType));
    }

    _processFilter(ast, scope, scopeType) {
        assert(scopeType);
        if (ast.isTrue || ast.isDontCare)
            return 'true';
        if (ast.isFalse)
            return 'false';
        if (ast.isAnd && ast.operands.length === 0)
            return 'true';
        if (ast.isOr && ast.operands.length === 0)
            return 'false';
        if (ast.isAnd)
            return smt.And(...ast.operands.map((o) => this._processFilter(o, scope, scopeType)));
        if (ast.isOr)
            return smt.Or(...ast.operands.map((o) => this._processFilter(o, scope, scopeType)));
        if (ast.isNot)
            return smt.Not(this._processFilter(ast.expr, scope, scopeType));
        if (ast.isExternal) {
            return this._addGetPredicate(ast, scope, scopeType);
        } else {
            let filter = ast;
            let pname = scope[filter.name];
            let ptype = scopeType[filter.name];
            if (!ptype)
                throw new TypeError('Invalid filter left-hand-side ' + filter.name);
            if (filter.operator === 'contains')
                ptype = ptype.elem;
            else if (filter.operator === 'in_array')
                ptype = Type.Array(ptype);
            if (filter.value.isUndefined) {
                if (this._allowUndefined)
                    // return an unrestricted value, to signify that the predicate could be true
                    // or false
                    return this._getSkolemBool();
                else
                    throw new TypeError('Invalid filter right hand side (should be slot filled)');
            }
            if (filter.value.isVarRef) {
                if (!scope[filter.value.name] || !scopeType[filter.value.name])
                    throw new TypeError('Invalid filter right-hand-side ' + filter.value.name);
                return this._filterToSmt(filter.operator, pname, ptype,
                    scope[filter.value.name], scopeType[filter.value.name]);
            } else {
                return this._filterToSmt(filter.operator, pname, ptype,
                    this._valueToSmtValue(filter.value, ptype), filter.value.getType());
            }
        }
    }

    _processPermissionFilter(ast, ufvar, schema, scope, scopeType) {
        if (ast.isTrue)
            return 'true';
        if (ast.isFalse)
            return 'false';
        if (ast.isAnd && ast.operands.length === 0)
            return 'true';
        if (ast.isOr && ast.operands.length === 0)
            return 'false';
        if (ast.isAnd)
            return smt.And(...ast.operands.map((o) => this._processPermissionFilter(o, ufvar, schema, scope, scopeType)));
        if (ast.isOr)
            return smt.Or(...ast.operands.map((o) => this._processPermissionFilter(o, ufvar, schema, scope, scopeType)));
        if (ast.isNot)
            return smt.Not(this._processPermissionFilter(ast.expr, ufvar, schema, scope, scopeType));
        if (ast.isExternal) {
            return this._addGetPredicate(ast, {}, {});
        } else {
            let filter = ast;
            let ptype = schema.out[filter.name] || schema.inReq[filter.name] || schema.inOpt[filter.name];
            if (!ptype)
                throw new TypeError('Invalid filter left-hand-side ' + filter.name);
            if (filter.operator === 'contains')
                ptype = ptype.elem;
            if (filter.value.isUndefined)
                throw new TypeError('Invalid filter right hand side (should be slot filled)');
            let values = [];

            //console.error(String(ast));
            //console.log(this._fnparams);
            for (let pname of (this._fnparams.get(ufvar + ':' + filter.name) || [])) {
                if (filter.value.isVarRef) {
                    let rhs = scope[filter.value.name];
                    let rhsType = scopeType[filter.value.name];
                    for (let rhsname of (this._fnparams.get(rhs) || []))
                        values.push(this._filterToSmt(filter.operator, pname, ptype, rhsname, rhsType));
                } else {
                    values.push(this._filterToSmt(filter.operator, pname, ptype,
                        this._valueToSmtValue(filter.value, ptype), filter.value.getType()));
                }
            }
            if (values.length === 1)
                return values[0];
            if (values.length === 0)
                throw new Error('what');
            return smt.And(...values);
        }
    }

    _declareUninterpretedFunction(kind, fn, def) {
        let cleanKind = kind.replace(/[^A-Za-z0-9_]/g, '_');
        let ufvar = 'uf_' + cleanKind + '_' + fn;
        if (this._uf.has(ufvar))
            return [this._uf.get(ufvar), ufvar];

        let signames = [];
        let sigtypes = [];
        if (def.is_list) {
            signames.push('__resultId');
            sigtypes.push('ResultId');
        }

        for (let arg of def.args) {
            let type = def.inReq[arg] || def.inOpt[arg];
            if (!type || type.isAny)
                continue;
            signames.push(arg);
            sigtypes.push(this._typeToSmtType(type));
            if (def.inOpt[arg])
                this._declare(smt.DeclareFun(ufvar + '_' + arg + '_null', [], this._typeToSmtType(type)));
        }
        this._uf.set(ufvar, signames);

        for (let arg of def.args) {
            let type = def.out[arg];
            if (!type || type.isAny)
                continue;
            let p = ufvar + '_' + arg;
            this._declare(smt.DeclareFun(p, sigtypes, this._typeToSmtType(type)));
        }
        this._declare(smt.DeclareFun(ufvar + '_anyresult', sigtypes, 'Bool'));
        return [signames, ufvar];
    }

    _declareFunction(kind, fn, suffix, def) {
        kind = kind.replace(/[^A-Za-z0-9_]/g, '_');
        let fnvar = suffix;//kind + '_' + fn + '_' + suffix;
        if (this._functions.has(fnvar))
            return fnvar;

        let ufvar = 'uf_' + kind + '_' + fn;
        this._functions.add(fnvar);

        for (let arg of def.args) {
            let p = 'param_' + fnvar + '_' + arg;
            let type = def.inReq[arg] || def.inOpt[arg] || def.out[arg];
            if (type.isAny)
                continue;
            if (def.out[arg] && type.isTime)
                this._asserts.push(smt.And(smt.GEq(p, 0), smt.LEq(p, 86400)));
            this._declare(smt.DeclareFun(p, [], this._typeToSmtType(type)));
            this._addParam(ufvar, arg, p);
        }
        return fnvar;
    }

    _addParam(ufvar, param, value) {
        let key = ufvar + ':' + param;
        if (!this._fnparams.has(key))
            this._fnparams.set(key, []);
        this._fnparams.get(key).push(value);
    }

    _addInputParams(fnvar, prim, scope, scopeType, extraInParams) {
        let in_passed = {};
        assert(Array.isArray(extraInParams));
        for (let inParam of prim.in_params.concat(extraInParams)) {
            let pname = 'param_' + fnvar + '_' + inParam.name;
            let ptype = prim.schema.inReq[inParam.name] || prim.schema.inOpt[inParam.name];
            if (inParam.value.isUndefined)
                continue;
            if (inParam.value.isVarRef) {
                if (!scope[inParam.value.name] || !scopeType[inParam.value.name])
                    throw new TypeError('Invalid input parameter value ' + inParam.value.name);
                in_passed[inParam.name] = scope[inParam.value.name];
                this._asserts.push(this._filterToSmt('==', pname, ptype, scope[inParam.value.name], scopeType[inParam.value.name]));
            } else {
                in_passed[inParam.name] = this._valueToSmtValue(inParam.value, ptype);
                this._asserts.push(this._filterToSmt('==', pname, ptype,
                    this._valueToSmtValue(inParam.value, ptype), inParam.value.getType()));
            }
        }
        return in_passed;
    }

    _addGet(prim, scope, scopeType, extraInParams) {
        let [signature, ufvar] = this._declareUninterpretedFunction(prim.selector.kind, prim.channel, prim.schema);
        let fnvar = this._declareFunction(prim.selector.kind, prim.channel, 'get_' + this._externalfnidx ++,  prim.schema, prim.in_params);
        if (prim.schema.is_list)
            this._declare(smt.DeclareFun(fnvar + '__resultId', [], 'ResultId'));

        let in_passed = this._addInputParams(fnvar, prim, scope, scopeType, extraInParams);

        let inargs = [];
        for (let name of signature) {
            if (name === '__resultId') {
                assert(prim.schema.is_list);
                inargs.push(fnvar + '__resultId');
            } else {
                inargs.push(in_passed[name] || ufvar + '_' + name + '_null');
            }
        }
        for (let name in prim.schema.out) {
            let predname = ufvar + '_' + name;
            this._asserts.push(smt.Eq('param_' + fnvar + '_' + name, smt.Predicate(predname, ...inargs)));
            scope[name] = 'param_' + fnvar + '_' + name;
            scopeType[name] = prim.schema.out[name];
        }
    }

    _addAction(fn, prefix, scope, scopeType) {
        let fnvar = this._declareFunction(fn.selector.kind, fn.channel, prefix, fn.schema);
        this._addInputParams(fnvar, fn, scope, scopeType, []);
    }

    _addStream(stream, scope, scopeType) {
        if (stream.isTimer || stream.isAtTimer)
            return;
        if (stream.isMonitor) {
            this._addTable(stream.table, scope, scopeType, []);
            return;
        }
        if (stream.isEdgeNew) {
            this._addStream(stream.stream, scope, scopeType);
            return;
        }
        if (stream.isFilter || stream.isEdgeFilter) {
            this._addStream(stream.stream, scope, scopeType);
            this._asserts.push(this._processFilter(stream.filter, scope, scopeType));
            return;
        }
        if (stream.isJoin) {
            this._addStream(stream.stream, scope, scopeType);
            this._addTable(stream.table, scope, scopeType, stream.in_params);
            return;
        }
        if (stream.isProjection) {
            this._addStream(stream.stream, scope, scopeType);
            for (let name in scope) {
                if (stream.args.indexOf(name) < 0) {
                    delete scope[name];
                    delete scopeType[name];
                }
            }
            return;
        }

        throw new TypeError(`Unimplemented stream ${stream}`);
    }

    _addTable(table, scope, scopeType, extraInParams) {
        if (table.isInvocation) {
            this._addGet(table.invocation, scope, scopeType, extraInParams);
            return;
        }
        if (table.isFilter) {
            this._addTable(table.table, scope, scopeType, extraInParams);
            this._asserts.push(this._processFilter(table.filter, scope, scopeType));
            return;
        }
        if (table.isJoin) {
            this._addTable(table.lhs, scope, scopeType, extraInParams);
            this._addTable(table.rhs, scope, scopeType, extraInParams.concat(table.in_params));
            return;
        }
        if (table.isProjection) {
            this._addTable(table.table, scope, scopeType, extraInParams);
            for (let name in scope) {
                if (table.args.indexOf(name) < 0) {
                    delete scope[name];
                    delete scopeType[name];
                }
            }
            return;
        }

        throw new TypeError(`Unimplemented table ${table}`);
    }

    addRule(principal, program, rule) {
        for (let classdef of program.classes)
            this._classes[classdef.name] = classdef;

        let scope = {};
        let scopeType = {};
        if (rule.stream)
            this._addStream(rule.stream, scope, scopeType);
        else if (rule.table)
            this._addTable(rule.table, scope, scopeType, []);
        rule.actions.forEach((action, i) => {
            if (action.isVarRef)
                throw new TypeError(`Unimplemented action ${action}`);
            if (action.isInvocation && action.invocation.selector.isDevice && !isRemoteSend(action.invocation))
                this._addAction(action.invocation, 'a_' + i, scope, scopeType);
        });
    }

    _addPermissionFunction(fn, scope, scopeType) {
        let kind = fn.kind.replace(/[^A-Za-z0-9_]/g, '_');
        let ufvar = 'uf_' + kind + '_' + fn.channel;

        let ands = [];
        let filter = this._processPermissionFilter(fn.filter, ufvar, fn.schema, scope, scopeType);
        let name = this._filteridx++;
        this._filtermap[name] = fn.filter;
        this._filterrevmap.set(fn.filter, name);
        this._constants.set('filter_' + name, 'Bool');
        this._asserts.push(smt.Eq('filter_' + name, filter));
        ands.push('filter_' + name);

        for (let arg in fn.schema.out) {
            scope[arg] = ufvar + ':' + arg;
            scopeType[arg] = fn.schema.out[arg];
        }

        if (ands.length > 1)
            return smt.And(...ands);
        else
            return ands[0];
    }

    addPermission(permissionRule) {
        let ands = [];
        let scope = {};
        let scopeType = {};

        if (permissionRule.query.isSpecified)
            ands.push(this._addPermissionFunction(permissionRule.query, scope, scopeType));
        if (permissionRule.action.isSpecified)
            ands.push(this._addPermissionFunction(permissionRule.action, scope, scopeType));
        if (ands.length > 1)
            return smt.And(...ands);
        if (ands.length === 1)
            return ands[0];
        return 'true';
    }

    addAssert(v) {
        this._asserts.push(v);
    }

    checkSatisfiable(enableAssignments = false) {
        if (enableAssignments)
            this._solver.enableAssignments();
        this._addEverything();
        if (this._debug)
            this._solver.dump();
        return this._solver.checkSat().then(([sat, assignment, constants, unsatCore]) => {
            //console.log('CVC4 result: ', sat);
            this._assignment = assignment;
            this._assignedConstants = constants;
            this._unsatCore = unsatCore;
            return sat;
        });
    }

    getFilterName(filter) {
        let name = this._filterrevmap.get(filter);
        assert(typeof name === 'number');
        return 'filter_' + name;
    }

    isFilterTrue(filter) {
        if (!this._assignment) // unsat
            throw new Error('Not satifisiable');
        return this._assignment[this.getFilterName(filter)];
    }

    clone() {
        let self = new SmtReduction(this._solver.constructor, { allowUndefined: this._allowUndefined });
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

function promiseLoop(array, fn) {
    return (function loop(i) {
        if (i === array.length)
            return Promise.resolve();
        return Promise.resolve(fn(array[i], i)).then(() => loop(i+1));
    })(0);
}

const PARALLEL_DO_ALL = false;
function promiseDoAll(array, fn) {
    if (PARALLEL_DO_ALL)
        return Promise.all(array.map(fn));
    else
        return promiseLoop(array, fn);

}

function flipOperator(op) {
    switch (op) {
    case '==':
    case '!=':
        return op;
    case '<':
        return '>';
    case '<=':
        return '>=';
    case '>':
        return '<';
    case '>=':
        return '>=';
    case 'contains':
        return 'in_array';
    case 'in_array':
        return 'contains';
    case '=~':
        return '~=';
    case '~=':
        return '=~';
    case 'group_member':
        return 'has_member';
    case 'has_member':
        return 'group_member';
    case 'starts_with':
        return 'prefix_of';
    case 'prefix_of':
        return 'starts_with';
    case 'ends_with':
        return 'suffix_of';
    case 'suffix_of':
        return 'ends_with';
    default:
        throw new TypeError('invalid operator ' + op);
    }
}

const OP_FUNCTIONS = {
    '>': (a, b) => a > b,
    '<': (a, b) => a < b,
    '>=': (a, b) => a >= b,
    '<=': (a, b) => a <= b,
    '!': (a) => !a
};

function evaluateOp(builtinOp, arg1, arg2) {
    if (builtinOp.op)
        return OP_FUNCTIONS[builtinOp.op](arg1, arg2);
    else if (builtinOp.flip)
        return BuiltinOps[builtinOp.fn](arg2, arg1);
    else
        return BuiltinOps[builtinOp.fn](arg1, arg2);
}

function isRemoteSend(fn) {
    return (fn.selector.kind === 'org.thingpedia.builtin.thingengine.remote' || fn.selector.kind.startsWith('__dyn_')) &&
        fn.channel === 'send';
}

class RuleTransformer {
    constructor(SolverClass, principal, program, rule, permissiondb, groupmap, options) {
        this._SolverClass = SolverClass;
        this._groupmap = groupmap;
        this._options = options;

        this._principal = principal;
        this._program = program;
        this._classes = [];
        for (let classdef of program.classes)
            this._classes[classdef.name] = classdef;

        this._rule = rule;
        this._primKey = Array.from(rule.iteratePrimitives());

        this._relevantPermissions = this._computeRelevantPermissions(permissiondb);
        //console.log('Found ' + this._relevantPermissions.length + ' relevant permissions');
        //for (let permission of this._relevantPermissions)
        //    console.log(Ast.prettyprintPermissionRule(permission));

        this._newrule = null;
    }

    _addAllGroups(reduction) {
        for (let [principal, groups] of this._groupmap.entries()) {
            reduction.addGroups(Ast.Value.Entity(principal, 'tt:contact', null),
                groups.map((g) => Ast.Value.Entity(g, 'tt:contact_group', null)));
        }
    }

    _isFunctionPermissionRelevant(rulefn, programfn) {
        if (rulefn === Ast.PermissionFunction.Star)
            return true;
        if (programfn.selector.isBuiltin || isRemoteSend(programfn))
            return rulefn === Ast.PermissionFunction.Builtin;
        let kind = programfn.selector.kind;
        if (kind in this._classes)
            kind = this._classes[kind].extends;
        if (rulefn.isClassStar)
            return kind === rulefn.kind;
        if (rulefn.isSpecified)
            return kind === rulefn.kind && programfn.channel === rulefn.channel;
        return false;
    }

    _isPermissionRelevantForFunctions(rule) {
        if (!this._rule.stream && !this._rule.table &&
            !(rule.query.isBuiltin || rule.query.isStar))
            return false;

        for (let [primType, prim] of this._primKey) {
            if (primType === 'query') {
                if (!this._isFunctionPermissionRelevant(rule.query, prim))
                    return false;
            }
        }
        for (let action of this._rule.actions) {
            if (action.isVarRef)
                continue;
            if (!this._isFunctionPermissionRelevant(rule.action, action.invocation))
                return false;
        }
        //console.log(Ast.prettyprintPermissionRule(rule) + ' is relevant');
        return true;
    }

    _hasGroup(principal, group) {
        if (group.value === 'tt:everyone')
            return true;
        return (this._groupmap.get(principal.value) || []).indexOf(group.value) >= 0;
    }

    _computeRelevantPermissions(permissiondb) {
        let ret = [];
        for (let rule of permissiondb) {
            if (!rule.principal.isTrue) {
                let inParamMap = {
                    source: this._principal
                };
                let simplified = this._partiallyEvalFilter(rule.principal, inParamMap, {}).optimize();
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

    _addProgram(reduction, permissiondb = undefined) {
        reduction.addRule(this._principal, this._program, this._rule, permissiondb);
    }

    _isPermissionApplicable(permission) {
        // if we only have one permission, and we checked that the program was conditionally
        // allowed, skip the call and say yes
        if (this._relevantPermissions.length === 1) {
            console.error('Hit OPT 0');
            return Promise.resolve(true);
        }
        let filters = [];
        if (permission.query.isSpecified && !permission.query.filter.isTrue)
            filters.push(permission.query.filter);
        if (permission.action.isSpecified && !permission.action.filter.isTrue)
            filters.push(permission.action.filter);
        if (filters.every((f) => this._firstReduction.isFilterTrue(f))) {
            // we got lucky! the main reduction found a case where the filters
            // are all true
            // skip the call and say yes
            console.error('Hit OPT 1');
            return Promise.resolve(true);
        }
        if (filters.every((f) => this._secondReduction.isFilterTrue(f))) {
            // same thing, but with the second reduction
            console.error('Hit OPT 1');
            return Promise.resolve(true);
        }

        let reduction = new SmtReduction(this._SolverClass, this._options);
        this._addAllGroups(reduction);
        this._addProgram(reduction);
        reduction.addAssert(reduction.addPermission(permission));
        //console.log('Checking that permission ' + prettyprintPermissionRule(permission) + ' is applicable');
        return reduction.checkSatisfiable();
    }

    _isFilterImplied(permission, permissionFunction, check) {
        if (!permissionFunction.isSpecified)
            return Promise.resolve(true);
        let filter = permissionFunction.filter;
        if (filter.isTrue)
            return Promise.resolve(true);
        if (filter.isFalse)
            return Promise.resolve(false);
        if (!this._firstReduction.isFilterTrue(filter)) {
            // we got lucky! the main reduction found a case where this filter
            // is false
            // skip the call and say no
            console.error('Hit OPT 2');
            return Promise.resolve(false);
        }
        if (!this._secondReduction.isFilterTrue(filter)) {
            // same thing, but with the second reduction
            console.error('Hit OPT 2');
            return Promise.resolve(false);
        }

        let reduction = new SmtReduction(this._SolverClass, this._options);
        this._addAllGroups(reduction);
        this._addProgram(reduction);
        reduction.addPermission(permission);
        check(reduction);
        //console.log('Checking that filter ' + filter + ' in permission ' + prettyprintPermissionRule(permission) + ' is valid');
        return reduction.checkSatisfiable().then((r) => !r);
    }

    _partiallyEvalFilter(expr, inParamMap, previousPrimitiveDef) {
        const groupmap = this._groupmap;

        return (function recursiveHelper(expr) {
            if (expr.isTrue || expr.isFalse || expr.isDontCare)
                return expr;
            if (expr.isOr)
                return new Ast.BooleanExpression.Or(expr.location, expr.operands.map(recursiveHelper));
            if (expr.isAnd)
                return new Ast.BooleanExpression.And(expr.location, expr.operands.map(recursiveHelper));
            if (expr.isNot)
                return new Ast.BooleanExpression.Not(expr.location, recursiveHelper(expr.expr));
            if (expr.isExternal) // external predicates don't refer to the inputs or outputs of the function so we're good
                return expr;

            let filter = expr;
            // the filter comes from tne Allowed() rule, it should not have anything funky
            assert(!filter.value.isUndefined);

            if (!inParamMap[filter.name])
                return expr;
            let lhs = inParamMap[filter.name];
            let rhs = filter.value;
            assert(!rhs.isVarRef);
            if (rhs.isVarRef && inParamMap[rhs.name])
                rhs = inParamMap[rhs.name];
            if (rhs.isVarRef && previousPrimitiveDef[rhs.name])
                rhs = Ast.Value.VarRef(rhs.name);
            if (lhs.isUndefined)
                throw new Error('Unexpected $undefined');
            if (lhs.isVarRef) {
                if (previousPrimitiveDef[lhs.name])
                    return new Ast.BooleanExpression.Atom(expr.location, lhs.name, filter.operator, rhs);
                else
                    return new Ast.BooleanExpression.Atom(expr.location, lhs.name, filter.operator, rhs);
            } else {
                if ((lhs.isLocation && (lhs.value.isRelative || lhs.value.isUnresolved)) ||
                    (rhs.isLocation && (rhs.value.isRelative || rhs.value.isUnresolved)))
                    return expr;
                if (rhs.isVarRef)
                    return new Ast.BooleanExpression.Atom(expr.location, rhs.name, flipOperator(filter.operator), lhs);
                let jslhs = lhs.toJS();
                let jsrhs = rhs.toJS();
                let result;
                if (filter.operator === 'group_member')
                    result = isGroupMember(jslhs, jsrhs, groupmap);
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

    _adjust() {
        let newfilter = [];

        return promiseDoAll(this._relevantPermissions, (permission) => this._isPermissionApplicable(permission).then((isApplicable) => {
            if (!isApplicable) {
                //console.log('Not applicable');
                return Promise.resolve();
            }

            let querypredicate;

            return this._isFilterImplied(permission, permission.query, (reduction) => {
                reduction.addAssert(smt.Not(reduction.getFilterName(permission.query.filter)));
            }).then((isQueryValid) => {
                //console.log('isQueryValid ' + isQueryValid);
                if (isQueryValid) {
                    querypredicate = Ast.BooleanExpression.True;
                    return;
                }

                let inParamMap = {};
                if (this._newrule.stream) {
                    for (let [,in_param,,] of this._newrule.stream.iterateSlots({})) {
                        if (!(in_param instanceof Ast.InputParam))
                            continue;
                        if (in_param.name in inParamMap)
                            inParamMap[in_param.name] = undefined;
                        else
                            inParamMap[in_param.name] = in_param.value;
                    }
                } else if (this._newrule.table) {
                    for (let [,in_param,,] of this._newrule.table.iterateSlots({})) {
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

                querypredicate = this._partiallyEvalFilter(permission.query.filter, inParamMap, {});
            }).then(() => this._isFilterImplied(permission, permission.action, (reduction) => {
                if (permission.query.isSpecified)
                    reduction.addAssert(reduction.getFilterName(permission.query.filter));
                reduction.addAssert(smt.Not(reduction.getFilterName(permission.action.filter)));
            })).then((isActionValid) => {
                //console.log('isActionValid ' + isActionValid);
                if (isActionValid)
                    return;

                for (let action of this._rule.actions) {
                    let inParamMap = {};
                    for (let inParam of action.invocation.in_params)
                        inParamMap[inParam.name] = inParam.value;

                    let previousPrimitiveDef = this._rule.stream ? this._rule.stream.schema : this._rule.table.schema;
                    querypredicate = new Ast.BooleanExpression.And(null, [
                        querypredicate, this._partiallyEvalFilter(permission.action.filter, inParamMap, previousPrimitiveDef.out)]);
                }
            }).then(() => {
                newfilter.push(querypredicate);
            });
        })).then(() => {
            let queryfilter = new Ast.BooleanExpression.Or(null, newfilter).optimize();
            if (queryfilter.isFalse)
                return null;
            if (this._newrule.stream)
                this._newrule.stream = new Ast.Stream.Filter(null, this._newrule.stream, queryfilter, this._newrule.stream.schema);
            else if (this._newrule.table)
                this._newrule.table = new Ast.Table.Filter(null, this._newrule.table, queryfilter, this._newrule.table.schema);
            else if (!queryfilter.isTrue)
                return null;

            return this._newrule;
        });
    }

    async check() {
        if (this._relevantPermissions.length === 0)
            return false;

        let satReduction = new SmtReduction(this._SolverClass, this._options);
        this._addAllGroups(satReduction);
        this._addProgram(satReduction);
        if (!await satReduction.checkSatisfiable())
            return false;

        let anyPermissionReduction = new SmtReduction(this._SolverClass, this._options);
        this._addAllGroups(anyPermissionReduction);
        this._addProgram(anyPermissionReduction);
        let ors = [];
        for (let permission of this._relevantPermissions)
            ors.push(anyPermissionReduction.addPermission(permission));
        anyPermissionReduction.addAssert(smt.Or(...ors));
        return anyPermissionReduction.checkSatisfiable();
    }

    async transform() {
        if (this._relevantPermissions.length === 0)
            return null;


        let satReduction = new SmtReduction(this._SolverClass, this._options);
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
            let ors = [];
            for (let permission of this._relevantPermissions)
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
            let ors = [];
            for (let permission of this._relevantPermissions)
                ors.push(this._secondReduction.addPermission(permission));
            this._secondReduction.addAssert(smt.Or(...ors));
            if (!await this._secondReduction.checkSatisfiable(true))
                return null;
        }

        this._newrule = this._rule.clone();
        return this._adjust();
    }
}

module.exports = class PermissionChecker {
    constructor(SolverClass, schemaRetriever, groupDelegate) {
        this._SolverClass = SolverClass;
        this._schemaRetriever = schemaRetriever;
        this._groupDelegate = groupDelegate;
        this._permissiondb = new Set;
        this._principals = new Set;

        this._principal = null;
        // maps a principal to its array of groups, as returned by the group delegate
        this._groupmap = new Map;
        this._program = null;

        this._newprogram = null;
    }

    _collectPrincipals(program, into) {
        for (let [, slot,,] of program.iterateSlots()) {
            if (slot instanceof Ast.Selector) {
                if (slot.isDevice && slot.principal && slot.principal.isEntity)
                    into.add(slot.principal.value);
            } else if (slot.value.isEntity && slot.value.type === 'tt:contact') {
-               into.add(slot.value.value);
            }
        }
    }

    _setProgram(principal, program) {
        this._principal = principal;
        return program.typecheck(this._schemaRetriever).then(() => {
            this._program = program;

            this._principals.add(principal.value);
            let programPrincipals = new Set(this._principals);
            this._collectPrincipals(program, programPrincipals);

            return Promise.all(Array.from(programPrincipals).map((principal) => this._groupDelegate.getGroups(principal).then((groups) => {
                this._groupmap.set(principal, groups);
            })));
        });
    }

    async _doCheck(principal, program) {
        let all = true;
        await promiseDoAll(program.rules, (rule) => {
            let transformer = new RuleTransformer(this._SolverClass,
                principal, program, rule, this._permissiondb, this._groupmap,
                { allowUndefined: true, debug: false });
            return transformer.check().then((ok) => {
                if (!ok)
                    all = false;
            });
        });
        return all;
    }

    async _doTransform(principal, program) {
        let newrules = [];
        await promiseDoAll(program.rules, (rule) => {
            let transformer = new RuleTransformer(this._SolverClass,
                principal, program, rule, this._permissiondb, this._groupmap,
                { allowUndefined: false, debug: false });
            return transformer.transform().then((newrule) => {
                if (newrule !== null)
                    newrules.push(newrule);
            });
        });
        if (newrules.length === 0)
            return null;
        return (new Ast.Program(null, program.classes, program.declarations, newrules, null)).optimize();
    }

    async check(principal, program, options = { transform: true }) {
        await this._setProgram(principal, program);

        if (options.transform)
            return this._doTransform(principal, program);
        else
            return this._doCheck(principal, program);
    }

    allowed(permissionRule) {
        return permissionRule.typecheck(this._schemaRetriever).then(() => {
            this._permissiondb.add(permissionRule);
            this._collectPrincipals(permissionRule, this._principals);
        });
    }

    disallowed(permissionRule) {
        this._permissiondb.delete(permissionRule);
    }
};
