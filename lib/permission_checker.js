// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const assert = require('assert');
const smt = require('smtlib');

const Ast = require('./ast');
const Type = require('./type');
const Utils = require('./utils');
const Builtin = require('./builtin');
const { optimizeFilter, optimizeProgram } = require('./optimize');
const { typeCheckProgram, typeCheckFilter } = require('./typecheck');
const { prettyprintPermissionRule } = require('./prettyprint');
const MultiMap = require('./multimap');

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

function hasUnboundFilter(expr, scope, schema) {
    return (function recursiveHelper(expr) {
        if (expr.isTrue || expr.isFalse)
            return false;
        if (expr.isOr || expr.isAnd)
            return expr.operands.some(recursiveHelper);
        if (expr.isNot)
            return recursiveHelper(expr.expr);

        let filter = expr.filter;
        if (schema) {
            //console.log('schema: ' + schema);
            return !(schema.inReq[filter.name] || schema.inOpt[filter.name] || schema.out[filter.name] || scope[filter.name]);
        } else {
            return !scope[filter.name];
        }
    })(expr);
}

// Reduces a program and a set of Allowed rules into one call to the SMT, and invokes
// the SMT solver
class SmtReduction {
    constructor(SolverClass) {
        this._solver = new SolverClass();

        this._declarations = [];
        this._declarations.push(smt.DeclareDatatype('Location',
            ['loc.home', 'loc.work', 'loc.current_location',
             ['loc.absolute', '(loc.lat Real)', '(loc.lon Real)']]));
        this._entityTypes = new Set;
        let contactType = this._declareEntityType(Type.Entity('tt:contact'));
        let contactGroupType = this._declareEntityType(Type.Entity('tt:contact_group'));
        this._declarations.push(smt.DeclareFun('Entity_tt_contact.getGroups', [contactType], smt.SetType(contactGroupType)));
        this._enumtypes = [];

        this._constants = new Map;
        this._constants.set('pi', 'Entity_tt_contact');

        this._classes = {};
        this._functions = new Set;
        this._asserts = [];

        this._filteridx = 0;
        this._filtermap = [];
        this._filterrevmap = new Map;
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

    _valueToSmtValue(v, type) {
        if (v.isVarRef && v.name === '__pi')
            return 'pi';
        if (v.isVarRef)
            throw new TypeError('Unexpected var ref in filter');
        if (v.isUndefined)
            throw new TypeError('Unexpected undefined TT value');
        if (v.isBoolean)
            return v.value ? 'true' : 'false';
        if (v.isString)
            return smt.StringLiteral(v.value);
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
            return String(v.value.getTime())
        throw new TypeError('Unsupported value ' + v);
    }

    addGroups(principal, groups) {
        let lhs = smt.Predicate('Entity_tt_contact.getGroups', this._valueToSmtValue(principal, Type.Entity('tt:contact')));
        let contactGroupType = this._declareEntityType(Type.Entity('tt:contact_group'));

        let rhs;
        if (groups.length === 0)
            rhs = new smt.SExpr('as', 'emptyset', smt.SetType(contactGroupType));
        else if (groups.length === 1)
            rhs = new smt.SExpr('singleton', this._valueToSmtValue(groups[0], Type.Entity('tt:contact_group')));
        else
            rhs = new smt.SExpr('insert', ...groups.slice(1).map((g) => this._valueToSmtValue(g, Type.Entity('tt:contact_group'))),
                new smt.SExpr('singleton', this._valueToSmtValue(groups[0], Type.Entity('tt:contact_group'))));

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
        case '=':
            return smt.Eq(param, value);
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
        case 'contains': // value is the element, param is the array
            return smt.Predicate('member', value, param);
        case 'in_array': // flip version of contains
            return smt.Predicate('member', param, value);
        case 'group_member': // value is the group, param is the principal
            return smt.Predicate('member', value, smt.Predicate('Entity_tt_contact.getGroups', param));
        case 'has_member': // flip version of group_member
            return smt.Predicate('member', param, smt.Predicate('Entity_tt_contact.getGroups', value));
        default:
            throw new TypeError('Unsupported operator ' + operator);
        }
    }

    _processFilter(ast, fnvar, schema, scope, scopeType) {
        assert(scopeType);
        if (ast.isTrue)
            return 'true';
        if (ast.isFalse)
            return 'false';
        if (ast.isAnd && ast.operands.length === 0)
            return 'true';
        if (ast.isOr && ast.operands.length === 0)
            return 'false';
        if (ast.isAnd)
            return smt.And(...ast.operands.map((o) => this._processFilter(o, fnvar, schema, scope, scopeType)));
        if (ast.isOr)
            return smt.Or(...ast.operands.map((o) => this._processFilter(o, fnvar, schema, scope, scopeType)));
        if (ast.isNot)
            return smt.Not(this._processFilter(ast.expr, fnvar, schema, scope, scopeType));

        let filter = ast.filter;
        let ptype = schema.inReq[filter.name] || schema.inOpt[filter.name] || schema.out[filter.name];
        let pname;
        if (ptype) {
            pname = 'param_' + fnvar + '_' + filter.name;
        } else if (scope[filter.name]) {
            pname = scope[filter.name];
            ptype = scopeType[filter.name];
        } else {
            throw new TypeError('Invalid filter left-hand-side ' + filter.name);
        }
        if (filter.operator === 'contains')
            ptype = ptype.elem;
        if (filter.value.isUndefined)
            throw new TypeError('Invalid filter right hand side (should be slot filled)');
        if (filter.value.isVarRef)
            return this._filterToSmt(filter.operator, pname, ptype,
                scope[filter.value.name], scopeType[filter.value.name]);
        else
            return this._filterToSmt(filter.operator, pname, ptype,
                this._valueToSmtValue(filter.value, ptype), filter.value.getType());
    }

    _declareFunction(kind, fn, suffix, def) {
        kind = kind.replace(/[^A-Za-z0-9_]/g, '_');
        let fnvar = kind + '_' + fn + '_' + suffix;
        if (this._functions.has(fnvar))
            return fnvar;
        this._functions.add(fnvar);

        for (let arg of def.args) {
            let p = 'param_' + fnvar + '_' + arg;
            let type = def.inReq[arg] || def.inOpt[arg] || def.out[arg];
            if (type.isAny)
                continue;
            if (type.isTime)
                this._asserts.push(smt.And(smt.GEq(p, 0), smt.LEq(p, 86400)));
            this._declare(smt.DeclareFun(p, [], this._typeToSmtType(type)));
        }
        return fnvar;
    }

    addRule(principal, program, rule) {
        for (let classdef of program.classes)
            this._classes[classdef.name] = classdef;

        this._asserts.push(smt.Eq('pi', this._valueToSmtValue(principal)));

        let scope = {
            __pi: 'pi',
        };
        let scopeType = {
            __pi: Type.Entity('tt:contact')
        };
        if (rule.trigger)
            this._addFunction(rule.trigger, 't', scope, scopeType);
        rule.queries.forEach((query, i) => {
            this._addFunction(query, 'q_' + i, scope, scopeType);
        });
        rule.actions.forEach((action, i) => {
            if (action.selector.isDevice)
                this._addFunction(action, 'a_' + i, scope, scopeType);
        });
    }

    _addPermissionFunction(fn, suffix, scope, scopeType) {
        let fnvar = this._declareFunction(fn.kind, fn.channel, suffix, fn.schema);

        let ands = [];
        let filter = this._processFilter(fn.filter, fnvar, fn.schema, scope, scopeType);
        let name = this._filteridx++;
        this._filtermap[name] = fn.filter;
        this._filterrevmap.set(fn.filter, name);
        this._constants.set('filter_' + name, 'Bool');
        this._asserts.push(smt.Eq('filter_' + name, filter));
        ands.push('filter_' + name);

        for (let outParam of fn.out_params) {
            let pname = 'param_' + fnvar + '_' + outParam.value;
            let ptype = fn.schema.out[outParam.value];
            if (ptype.isAny)
                continue;
            let vname = this._getVarName(outParam.name, ptype);
            ands.push(smt.Eq(vname, pname));
            scope[outParam.name] = vname;
            scopeType[outParam.name] = ptype;
        }

        if (ands.length > 1)
            return smt.And(...ands);
        else
            return ands[0];
    }

    addPermission(permissionRule) {
        let ands = []
        let scope = {
            __pi: 'pi',
        };
        let scopeType = {
            __pi: Type.Entity('tt:contact')
        };

        if (permissionRule.trigger.isSpecified)
            ands.push(this._addPermissionFunction(permissionRule.trigger, 't', scope, scopeType));
        if (permissionRule.query.isSpecified)
            ands.push(this._addPermissionFunction(permissionRule.query, 'q_0', scope, scopeType));
        if (permissionRule.action.isSpecified)
            ands.push(this._addPermissionFunction(permissionRule.action, 'a_0', scope, scopeType));
        if (ands.length > 1)
            return smt.And(...ands);
        if (ands.length === 1)
            return ands[0];
        return 'true';
    }

    addAssert(v) {
        this._asserts.push(v);
    }

    _addFunction(fn, suffix, scope, scopeType) {
        let fnvar = this._declareFunction(fn.selector.kind, fn.channel, suffix, fn.schema);

        for (let inParam of fn.in_params) {
            let pname = 'param_' + fnvar + '_' + inParam.name;
            let ptype = fn.schema.inReq[inParam.name] || fn.schema.inOpt[inParam.name];
            if (inParam.value.isUndefined)
                continue;
            if (inParam.value.isVarRef)
                this._asserts.push(this._filterToSmt('=', pname, ptype, scope[inParam.value.name], scopeType[inParam.value.name]));
            else
                this._asserts.push(this._filterToSmt('=', pname, ptype,
                    this._valueToSmtValue(inParam.value, ptype), inParam.value.getType()));
        }
        this._asserts.push(this._processFilter(fn.filter, fnvar, fn.schema, scope, scopeType));

        for (let outParam of fn.out_params) {
            let pname = 'param_' + fnvar + '_' + outParam.value;
            let ptype = fn.schema.out[outParam.value];
            if (ptype.isAny)
                continue;
            let vname = this._getVarName(outParam.name, ptype);
            this._asserts.push(smt.Eq(vname, pname));
            scope[outParam.name] = vname;
            scopeType[outParam.name] = ptype;
        }
    }

    checkSatisfiable(enableAssignments = false) {
        if (enableAssignments)
            this._solver.enableAssignments();
        this._addEverything();
        //this._solver.dump();
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
        let self = new SmtReduction(this._solver.constructor);
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
            return Q();
        return Q(fn(array[i], i)).then(() => loop(i+1));
    })(0);
}

function promiseDoAll(array, fn) {
    if (false) {
        return Q.all(array.map(fn));
    } else {
        return promiseLoop(array, fn);
    }
}

class PreconditionFalseError extends Error {}

function flipOperator(op) {
    switch (op) {
    case '=':
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
    default:
        throw new TypeError('invalid operator ' + op);
    }
}

class RuleTransformer {
    constructor(SolverClass, principal, program, rule, permissiondb, groupmap) {
        this._SolverClass = SolverClass;
        this._groupmap = groupmap;

        this._principal = principal;
        this._program = program;
        this._classes = [];
        for (let classdef of program.classes)
            this._classes[classdef.name] = classdef;

        this._rule = rule;
        if (rule.trigger)
            this._trigger = rule.trigger;
        else
            this._trigger = null;
        if (rule.queries.length > 1)
            throw new Error('NOT IMPLEMENTED: cannot support more than one query');
        if (rule.queries.length === 1)
            this._query = rule.queries[0];
        else
            this._query = null;
        if (rule.actions.length > 1)
            throw new Error('NOT IMPLEMENTED: cannot support more than one action');
        if (rule.actions[0].selector.isBuiltin)
            this._action = null;
        else
            this._action = rule.actions[0];
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
        if (programfn === null) {
            return (rulefn === Ast.PermissionFunction.Star || rulefn === Ast.PermissionFunction.Builtin);
        } else {
            if (rulefn === Ast.PermissionFunction.Star)
                return true;
            let kind = programfn.selector.kind;
            if (kind in this._classes)
                kind = this._classes[kind].extends;
            if (rulefn.isClassStar)
                return kind === rulefn.kind;
            if (rulefn.isSpecified)
                return kind === rulefn.kind && programfn.channel === rulefn.channel;
            return false;
        }
    }

    _isPermissionRelevantForFunctions(rule) {
        return this._isFunctionPermissionRelevant(rule.trigger, this._trigger) &&
            this._isFunctionPermissionRelevant(rule.query, this._query) &&
            this._isFunctionPermissionRelevant(rule.action, this._action);
    }

    _computeRelevantPermissions(permissiondb) {
        let ret = [];
        for (let rule of permissiondb) {
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
            return Q(true);
        }
        let filters = [];
        if (permission.trigger.isSpecified && !permission.trigger.filter.isTrue)
            filters.push(permission.trigger.filter);
        if (permission.query.isSpecified && !permission.query.filter.isTrue)
            filters.push(permission.query.filter);
        if (permission.action.isSpecified && !permission.action.filter.isTrue)
            filters.push(permission.action.filter);
        if (filters.every((f) => this._firstReduction.isFilterTrue(f))) {
            // we got lucky! the main reduction found a case where the filters
            // are all true
            // skip the call and say yes
            console.error('Hit OPT 1');
            return Q(true);
        }
        if (filters.every((f) => this._secondReduction.isFilterTrue(f))) {
            // same thing, but with the second reduction
            console.error('Hit OPT 1');
            return Q(true);
        }

        let reduction = new SmtReduction(this._SolverClass);
        this._addAllGroups(reduction);
        this._addProgram(reduction);
        reduction.addAssert(reduction.addPermission(permission));
        //console.log('Checking that permission ' + prettyprintPermissionRule(permission) + ' is applicable');
        return reduction.checkSatisfiable();
    }

    _isFilterImplied(permission, permissionFunction, check) {
        if (!permissionFunction.isSpecified)
            return Q(true);
        let filter = permissionFunction.filter;
        if (filter.isTrue)
            return Q(true);
        if (filter.isFalse)
            return Q(false);
        if (!this._firstReduction.isFilterTrue(filter)) {
            // we got lucky! the main reduction found a case where this filter
            // is false
            // skip the call and say no
            console.error('Hit OPT 2');
            return Q(false);
        }
        if (!this._secondReduction.isFilterTrue(filter)) {
            // same thing, but with the second reduction
            console.error('Hit OPT 2');
            return Q(false);
        }

        let reduction = new SmtReduction(this._SolverClass);
        this._addAllGroups(reduction);
        this._addProgram(reduction);
        reduction.addPermission(permission);
        check(reduction);
        //console.log('Checking that filter ' + filter + ' in permission ' + prettyprintPermissionRule(permission) + ' is valid');
        return reduction.checkSatisfiable().then((r) => !r);
    }

    _partiallyEvalFilter(expr, scope, inParamMap, previousPrimitiveDef = {}) {
        const groupmap = this._groupmap;

        return (function recursiveHelper(expr) {
            if (expr.isTrue || expr.isFalse)
                return expr;
            if (expr.isOr)
                return Ast.BooleanExpression.Or(expr.operands.map(recursiveHelper));
            if (expr.isAnd)
                return Ast.BooleanExpression.And(expr.operands.map(recursiveHelper));
            if (expr.isNot)
                return Ast.BooleanExpression.Not(recursiveHelper(expr.expr));

            let filter = expr.filter;
            // the filter comes from tne Allowed() rule, should it should not have anything funky
            assert(!filter.value.isUndefined);

            if (!inParamMap[filter.name] && !scope[filter.name])
                return expr;
            let lhs = inParamMap[filter.name] || Ast.Value.VarRef(scope[filter.name]);
            let rhs = filter.value;
            assert(!rhs.isVarRef || scope[rhs.name]);
            if (rhs.isVarRef)
                rhs = Ast.Value.VarRef(scope[rhs.name]);
            if (rhs.isVarRef && inParamMap[rhs.name])
                rhs = inParamMap[rhs.name];
            if (rhs.isVarRef && previousPrimitiveDef[rhs.name])
                rhs = Ast.Value.VarRef(previousPrimitiveDef[rhs.name]);
            if (lhs.isUndefined)
                throw new Error('Unexpected $undefined');
            if (lhs.isVarRef) {
                if (previousPrimitiveDef[lhs.name])
                    return new Ast.BooleanExpression.Atom(Ast.Filter(previousPrimitiveDef[lhs.name], filter.operator, rhs));
                else
                    return new Ast.BooleanExpression.Atom(Ast.Filter(lhs.name, filter.operator, rhs));
            } else {
                if ((lhs.isLocation && lhs.value.isRelative) ||
                    (rhs.isLocation && rhs.value.isRelative))
                    return expr;
                if (rhs.isVarRef)
                    return new Ast.BooleanExpression.Atom(Ast.Filter(rhs.name, flipOperator(filter.operator), lhs));
                let jslhs = lhs.toJS();
                let jsrhs = rhs.toJS();
                let result;
                if (filter.operator === 'group_member')
                    result = isGroupMember(jslhs, jsrhs, groupmap);
                else
                    result = Builtin.BinaryOps[filter.operator].op(jslhs, jsrhs);
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
        const newrule = this._newrule;
        if (newrule.trigger)
            this._trigger = newrule.trigger;
        else
            this._trigger = null;
        if (newrule.queries.length === 1)
            this._query = newrule.queries[0];
        else
            this._query = null;
        if (newrule.actions[0].selector.isBuiltin)
            this._action = null;
        else
            this._action = newrule.actions[0];

        let triggerparams = {};
        let triggerdef = {};
        if (this._trigger) {
            for (let outParam of this._trigger.out_params) {
                triggerparams[outParam.value] = outParam.name;
                triggerdef[outParam.name] = outParam.value;
            }
        }
        let queryparams = {};
        let querydef = {};
        if (this._query) {
            for (let outParam of this._query.out_params) {
                queryparams[outParam.value] = outParam.name;
                querydef[outParam.name] = outParam.value;
            }
        }

        let newtriggerfilter = [];
        let newqueryfilter = [];
        let vidx = 0;
        return promiseDoAll(this._relevantPermissions, (permission) => {
            return this._isPermissionApplicable(permission).then((isApplicable) => {
                if (!isApplicable) {
                    //console.log('Not applicable');
                    return;
                }

                const scope = {
                    __pi: this._principal
                };
                let triggerpredicate;
                let querypredicate;

                return this._isFilterImplied(permission, permission.trigger, (reduction) => {
                    reduction.addAssert(smt.Not(reduction.getFilterName(permission.trigger.filter)));
                }).then((isTriggerValid) => {
                    //console.log('isTriggerValid ' + isTriggerValid);
                    if (isTriggerValid) {
                        triggerpredicate = Ast.BooleanExpression.True;
                        return;
                    }

                    let inParamMap = {};
                    for (let inParam of this._trigger.in_params)
                        inParamMap[inParam.name] = inParam.value;

                    triggerpredicate = this._partiallyEvalFilter(permission.trigger.filter, scope, inParamMap);
                }).then(() => {
                    if (!permission.trigger.isSpecified)
                        return;

                    for (let outParam of permission.trigger.out_params) {
                        let pname = outParam.value;
                        if (pname in triggerparams) {
                            scope[outParam.name] = triggerparams[pname];
                        } else {
                            let vname = 'v_' + (vidx++);
                            this._trigger.out_params.push(Ast.OutputParam(vname, pname));
                            triggerparams[pname] = vname;
                            scope[outParam.name] = vname;
                        }
                    }
                }).then(() => {
                    return this._isFilterImplied(permission, permission.query, (reduction) => {
                        if (permission.trigger.isSpecified)
                            reduction.addAssert(reduction.getFilterName(permission.trigger.filter));
                        reduction.addAssert(smt.Not(reduction.getFilterName(permission.query.filter)));
                    });
                }).then((isQueryValid) => {
                    //console.log('isQueryValid ' + isQueryValid);
                    if (isQueryValid) {
                        querypredicate = Ast.BooleanExpression.True;
                        return;
                    }

                    let inParamMap = {};
                    for (let inParam of this._query.in_params)
                        inParamMap[inParam.name] = inParam.value;

                    querypredicate = Ast.BooleanExpression.And([triggerpredicate,
                        this._partiallyEvalFilter(permission.query.filter, scope, inParamMap)]);
                }).then(() => {
                    if (!permission.query.isSpecified)
                        return;

                    for (let outParam of permission.query.out_params) {
                        let pname = outParam.value;
                        if (pname in queryparams) {
                            scope[outParam.name] = queryparams[pname];
                        } else {
                            let vname = 'v_' + (vidx++);
                            this._query.out_params.push(Ast.OutputParam(vname, pname));
                            queryparams[pname] = vname;
                            scope[outParam.name] = vname;
                        }
                    }
                }).then(() => {
                    return this._isFilterImplied(permission, permission.action, (reduction) => {
                        if (permission.trigger.isSpecified)
                            reduction.addAssert(reduction.getFilterName(permission.trigger.filter));
                        if (permission.query.isSpecified)
                            reduction.addAssert(reduction.getFilterName(permission.query.filter));
                        reduction.addAssert(smt.Not(reduction.getFilterName(permission.action.filter)));
                    });
                }).then((isActionValid) => {
                    //console.log('isActionValid ' + isActionValid);
                    if (isActionValid) {
                        return;
                    }

                    let inParamMap = {};
                    for (let inParam of this._action.in_params)
                        inParamMap[inParam.name] = inParam.value;

                    let previousPrimitiveDef;
                    if (this._query)
                        previousPrimitiveDef = querydef;
                    else if (this._trigger)
                        previousPrimitiveDef = triggerdef;
                    else
                        previousPrimitiveDef = {};
                    querypredicate = Ast.BooleanExpression.And([
                        querypredicate, this._partiallyEvalFilter(permission.action.filter, scope, inParamMap, previousPrimitiveDef)]);
                }).then(() => {
                    newtriggerfilter.push(triggerpredicate);
                    newqueryfilter.push(querypredicate);
                });
            });
        }).then(() => {
            //console.log(Ast.prettyprintFilterExpression(Ast.BooleanExpression.Or(newfilter)));
            let triggerfilter = optimizeFilter(Ast.BooleanExpression.Or(newtriggerfilter));
            if (triggerfilter.isFalse)
                return null;

            // as weird as that sounds, it can occur that triggerfilter is not true or false,
            // but we don't have a trigger
            // this can occur with optional input arguments,
            // eg:
            // policy: now => @xkcd.get_comic, number < 11 => notify;
            // prog: now => @xkcd.get_comic() => notify;
            //
            // or
            // @instagram.new_picture() => @almond_bike_market.search, info = "i'm happy" => notify;
            // @instagram.new_picture() => @almond_bike_market.search() => notify;
            // (yeah, info is an "in opt" argument of @almond_bike_market)
            //
            // in this case, we just reject the program, as if the precondition was not satisfied
            if (this._trigger)
                this._trigger.filter = Ast.BooleanExpression.And([this._trigger.filter, triggerfilter]);
            else if (!triggerfilter.isTrue)
                return null;

            let queryfilter = optimizeFilter(Ast.BooleanExpression.Or(newqueryfilter));
            if (queryfilter.isFalse)
                return null;
            if (this._query)
                this._query.filter = Ast.BooleanExpression.And([this._query.filter, queryfilter]);
            else if (this._trigger)
                this._trigger.filter = Ast.BooleanExpression.And([this._trigger.filter, queryfilter]);
            else if (!queryfilter.isTrue)
                return null;

            return this._newrule;
        });
    }

    transform() {
        if (this._relevantPermissions.length === 0)
            return null;
        return Q.try(() => {
            let satReduction = new SmtReduction(this._SolverClass);
            this._addAllGroups(satReduction);
            this._addProgram(satReduction);
            return satReduction.checkSatisfiable();
        }).then((isSatisfiable) => {
            if (!isSatisfiable) {
                //console.log('Rule not satifisiable');
                //console.log(Ast.prettyprint(this._program, true));
                return null;
            }

            this._firstReduction = new SmtReduction(this._SolverClass);
            this._addAllGroups(this._firstReduction);
            this._addProgram(this._firstReduction);
            let ors = [];
            for (let permission of this._relevantPermissions)
                ors.push(this._firstReduction.addPermission(permission));
            this._firstReduction.addAssert(smt.Not(smt.Or(...ors)));
            return this._firstReduction.checkSatisfiable(true).then((isSatisfiable) => {
                if (!isSatisfiable)
                    return this._rule.clone();

                this._secondReduction = new SmtReduction(this._SolverClass);
                this._addAllGroups(this._secondReduction);
                this._addProgram(this._secondReduction);
                let ors = [];
                for (let permission of this._relevantPermissions)
                    ors.push(this._secondReduction.addPermission(permission));
                this._secondReduction.addAssert(smt.Or(...ors));
                return this._secondReduction.checkSatisfiable(true).then((isSatisfiable) => {
                    if (!isSatisfiable)
                        return null;

                    this._newrule = this._rule.clone();
                    return this._adjust();
                });
            });
        });
    }
}

module.exports = class PermissionChecker {
    constructor(SolverClass, schemaRetriever, groupDelegate) {
        this._SolverClass = SolverClass;
        this._schemaRetriever = schemaRetriever;
        this._groupDelegate = groupDelegate;
        this._permissiondb = [];
        this._principals = new Set;

        this._principal = null;
        // maps a principal to its array of groups, as returned by the group delegate
        this._groupmap = new Map;
        this._program = null;

        this._newprogram = null;
    }

    _collectPrincipalsFilter(filter, into) {
        return (function recursiveHelper(expr) {
            if (expr.isTrue || expr.isFalse)
                return;
            if (expr.isNot)
                return recursiveHelper(expr.expr);
            if (expr.isAnd || expr.isOr) {
                expr.operands.forEach((op) => recursiveHelper(op));
                return;
            }

            let filter = expr.filter;
            if (filter.value.isEntity && filter.value.type === 'tt:contact')
                into.add(filter.value.value);
        })(filter);
    }

    _collectPrincipalsInvocation(invocation, into) {
        for (let inParam of invocation.in_params) {
            if (inParam.value.isEntity && inParam.value.type === 'tt:contact')
                into.add(inParam.value.value);
        }
        this._collectPrincipalsFilter(invocation.filter, into);
    }

    _collectPrincipals(program, into) {
        program.rules.forEach((rule) => {
            if (rule.trigger)
                this._collectPrincipalsInvocation(rule.trigger, into);
            for (let query of rule.queries)
                this._collectPrincipalsInvocation(query, into);
            for (let
            action of rule.actions)
                this._collectPrincipalsInvocation(action, into);
        });
    }

    _setProgram(principal, program) {
        this._principal = principal;
        return typeCheckProgram(program, this._schemaRetriever).then(() => {
            this._program = program;

            this._principals.add(principal.value);
            let programPrincipals = new Set(this._principals);
            this._collectPrincipals(program, programPrincipals);

            return Q.all(Array.from(programPrincipals).map((principal) => {
                return this._groupDelegate.getGroups(principal).then((groups) => {
                    this._groupmap.set(principal, groups);
                });
            }));
        }).then(() => {
            // FIXME
            /*return Q.all(program.classes.map((classdef) => {
                // make a default Allowed rule for @remote.send/@remote.receive
                if (classdef.extends === 'org.thingpedia.builtin.thingengine.remote') {
                    let promises = [];
                    if (classdef.triggers.receive) {
                        let allowed = Ast.Allowed(classdef.name, 'receive', 'trigger',
                            Ast.BooleanExpression.Atom(Ast.Filter('__principal', '=', Ast.Value.VarRef('__pi'))),
                            Ast.BooleanExpression.True,
                            classdef.triggers.receive);
                        promises.push(this.allowed(allowed));
                    }
                    if (classdef.actions.send) {
                        let allowed = Ast.Allowed(classdef.name, 'send', 'action',
                            Ast.BooleanExpression.Atom(Ast.Filter('__principal', '=', Ast.Value.VarRef('__pi'))),
                            Ast.BooleanExpression.True,
                            classdef.actions.send);
                        promises.push(this.allowed(allowed));
                    }
                    return Q.all(promises);
                }
            }));*/
        });
    }

    check(principal, program) {
        return this._setProgram(principal, program).then(() => {
            let newrules = [];
            return promiseDoAll(program.rules, (rule) => {
                let transformer = new RuleTransformer(this._SolverClass, principal, program, rule, this._permissiondb, this._groupmap);
                return transformer.transform().then((newrule) => {
                    if (newrule !== null)
                        newrules.push(newrule);
                });
            }).then(() => {
                if (newrules.length === 0)
                    return null;
                return optimizeProgram(new Ast.Program(program.name, program.params, program.classes, newrules));
            });
        });
    }

    _getAllowedSchema(allowed, schemaType) {
        if (!allowed.isSpecified)
            return Promise.resolve();
        if (allowed.schema) {
            return Promise.resolve(allowed.schema);
        } else {
            return Utils.getSchemaForSelector(this._schemaRetriever, allowed.kind, allowed.channel, schemaType, false, {})
                .then((schema) => {
                    allowed.schema = schema;
                    return schema;
                });
        }
    }

    _typeCheckPermissionRule(permissionRule) {
        const scope = {
            __pi: Type.Entity('tt:contact')
        };
        function typecheckPermissionFunction(fn) {
            if (!fn.isSpecified)
                return;

            typeCheckFilter(fn.filter, fn.schema, scope);

            for (let outParam of fn.out_params) {
                let ptype = fn.schema.inReq[outParam.value] || fn.schema.inOpt[outParam.value] || fn.schema.out[outParam.value];
                scope[outParam.name] = ptype;
            }
        }

        typecheckPermissionFunction(permissionRule.trigger);
        typecheckPermissionFunction(permissionRule.query);
        typecheckPermissionFunction(permissionRule.action);
    }

    allowed(permissionRule) {
        return Promise.all([
            this._getAllowedSchema(permissionRule.trigger, 'triggers'),
            this._getAllowedSchema(permissionRule.query, 'queries'),
            this._getAllowedSchema(permissionRule.action, 'actions')
        ]).then(() => {
            this._typeCheckPermissionRule(permissionRule);
            this._permissiondb.push(permissionRule);

            if (permissionRule.trigger.isSpecified)
                this._collectPrincipalsFilter(permissionRule.trigger.filter, this._principals);
            if (permissionRule.query.isSpecified)
                this._collectPrincipalsFilter(permissionRule.query.filter, this._principals);
            if (permissionRule.action.isSpecified)
                this._collectPrincipalsFilter(permissionRule.action.filter, this._principals);
        });
    }
}
