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

const smt = require('./smtlib');
const SmtSolver = require('./smtsolver');
const Ast = require('./ast');
const Type = require('./type');
const Utils = require('./utils');
const Builtin = require('./builtin');
const { optimizeFilter } = require('./optimize');
const { typeCheckProgram } = require('./typecheck');
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

function partiallyEvalFilter(expr, scope, inParamMap, replaceVariables) {
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
        assert(!filter.value.isUndefined && !filter.value.isNull);

        let lhs = inParamMap[filter.name];
        let rhs = filter.value;
        if (rhs.isVarRef)
            rhs = scope[rhs.name];
        assert(!!rhs);
        if (!lhs)
            return expr;
        if (lhs.isNull)
            throw new Error('Precondition refers to unspecified parameter');
        if (lhs.isUndefined)
            throw new Error('Unexpected $undefined');
        if (lhs.isVarRef) {
            if (replaceVariables)
                return Ast.BooleanExpression.Atom(Ast.Filter(scope[lhs.name], filter.operator, filter.value));
            else
                return expr;
        } else {
            let jslhs = lhs.toJS();
            let jsrhs = rhs.toJS();
            let result = Builtin.BinaryOps[filter.operator].op(jslhs, jsrhs);
            if (result === true)
                return Ast.BooleanExpression.True;
            else if (result === false)
                return Ast.BooleanExpression.False;
            else
                throw new TypeError('Partially evaluated filter is not boolean?');
        }
    })(expr);
}

// Reduces a program and a set of Allowed rules into one call to the SMT, and invokes
// the SMT solver
class SmtReduction {
    constructor() {
        this._solver = new SmtSolver();

        this._declarations = [];
        this._declarations.push(smt.DeclareDatatype('Location',
            ['loc.home', 'loc.work', 'loc.current_location',
             ['loc.absolute', '(loc.lat Real)', '(loc.lon Real)']]));
        this._entityTypes = new Set;
        this._declareEntityType(Type.Entity('tt:contact'));
        this._enumtypes = [];

        this._constants = new Map;
        this._constants.set('pi', 'Entity_tt_contact');

        this._classes = {};
        this._asserts = [];

        this._constridx = 0;
        this._constrmap = [];
        this._constrrevmap = new Map;
        this._allowedidx = 0;
        this._allowedmap = [];
        this._allowedrevmap = new Map;

        this._progvars = new Set;
        this._checkidx = 0;
        this._checkmap = [];
        this._checks = [];
        this._checkrevmap = new Map;
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

    _typeToSmtType(type) {
        if (type.isArray)
            return new smt.SExpr('Set', this._typeToSmtType(type.elem));
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

    _locToSmtValue(loc) {
        if (loc.isRelative)
            return 'loc.' + loc.value.relativeTag;

        return new smt.SExpr('loc.absolute', loc.lat, loc.lon);
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
        if (v.isUndefined || v.isNull)
            throw new TypeError('Unexpected null or undefined TT value');
        if (v.isBoolean)
            return v.value ? 'true' : 'false';
        if (v.isString)
            return smt.StringLiteral(v.value);
        if (v.isNumber || v.isMeasure)
            return String(v.toJS()); // toJS() normalizes the measurement
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

    _booleanConstraintToSmt(fnvar, fndef, constr, isPrecondition) {
        if (constr.isTrue)
            return 'true';
        if (constr.isFalse)
            return 'false';
        let name = this._constridx++;
        this._constrmap[name] = constr;
        this._constrrevmap.set(constr, name);

        if (constr.isAnd)
            return smt.Named('constr_' + name,
                smt.And(...constr.operands.map((o) => this._booleanConstraintToSmt(fnvar, fndef, o, isPrecondition))));
        if (constr.isOr)
            return smt.Named('constr_' + name,
                smt.Or(...constr.operands.map((o) => this._booleanConstraintToSmt(fnvar, fndef, o, isPrecondition))));
        if (constr.isNot)
            return smt.Named('constr_' + name,
                smt.Not(this._booleanConstraintToSmt(fnvar, fndef, constr.expr, isPrecondition)));

        let filter = constr.filter;
        let param = 'param_' + fnvar + '_' + filter.name;
        let paramType = fndef.inReq[filter.name] || fndef.inOpt[filter.name];
        if (!isPrecondition)
            paramType = paramType || fndef.out[filter.name];
        if (!paramType)
            throw new TypeError('Invalid parameter name ' + filter.name);
        if (filter.operator === 'contains')
            paramType = paramType.elem;
        let value = this._valueToSmtValue(filter.value, paramType);
        return smt.Named('constr_' + name, this._filterToSmt(filter.operator, param, value));
    }

    _filterToSmt(operator, param, value) {
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
        case 'contains':
            return smt.Predicate('member', value, param);
        default:
            throw new TypeError('Unsupported operator ' + operator);
        }
    }

    addProgram(principal, prog, allowedmap) {
        for (let classdef of prog.classes)
            this._classes[classdef.name] = classdef;

        this._asserts.push(smt.Eq('pi', this._valueToSmtValue(principal)));

        for (let rule of prog.rules)
            this._addRule(rule, allowedmap);
    }

    _addRule(rule, allowedmap) {
        var scope = {};
        if (rule.trigger)
            this._addFunction(rule.trigger, 'triggers', scope, rule.trigger, allowedmap);
        for (let query of rule.queries)
            this._addFunction(query, 'queries', scope, query, allowedmap);
        for (let action of rule.actions) {
            if (action.selector.isBuiltin)
                this._addBuiltinNotify(action, scope, allowedmap);
            else
                this._addFunction(action, 'actions', scope, action, allowedmap);
        }
    }

    _addBuiltinNotify(ast, scope, allowedmap) {
        let fn = Ast.RulePart(Ast.Selector.Device('builtin', null, null), 'notify', [], Ast.BooleanExpression.True, []);
        fn.schema = Builtin.Actions.notify;
        returnthis._addFunction(fn, 'actions', scope, ast, allowedmap);
    }

    _getVarName(prefix, type) {
        let idx = 0;
        let vname = 'prog_' + prefix + '_' + idx;
        while (this._constants.has(vname))
            vname = 'prog_' + prefix + '_' + (++idx);
        this._constants.set(vname, this._typeToSmtType(type));
        return vname;
    }

    _processFilter(ast, fnvar, schema) {
        if (ast.isTrue)
            return 'true';
        if (ast.isFalse)
            return 'false';
        if (ast.isAnd && ast.operands.length === 0)
            return 'true';
        if (ast.isOr && ast.operands.length === 0)
            return 'false';
        if (ast.isAnd)
            return smt.And(...ast.operands.map((o) => this._processFilter(o, fnvar, schema)));
        if (ast.isOr)
            return smt.Or(...ast.operands.map((o) => this._processFilter(o, fnvar, schema)));
        if (ast.isNot)
            return smt.Not(this._processFilter(ast.expr, fnvar, schema));

        let filter = ast.filter;
        let pname = 'param_' + fnvar + '_' + filter.name;
        let ptype = schema.inReq[filter.name] || schema.inOpt[filter.name] || schema.out[filter.name];
        if (!ptype)
            throw new TypeError('Invalid filter left-hand-side ' + filter.name);
        if (filter.operator === 'contains')
            ptype = ptype.elem;
        if (filter.value.isNull || filter.value.isUndefined)
            return 'true';
        if (filter.value.isVarRef)
            return this._filterToSmt(filter.operator, pname, scope[filter.value.name]);
        else
            return this._filterToSmt(filter.operator, pname, this._valueToSmtValue(filter.value, ptype));
    }

    _declareFunction(kind, fn, index, def) {
        kind = kind.replace(/[^A-Za-z0-9_]/g, '_');
        let fnvar = kind + '_' + fn + '_' + index;
        let allowed = 'Allowed_' + fnvar;
        this._declare(smt.DeclareFun(allowed, [], 'Bool'));
        for (let arg of def.args) {
            let p = 'param_' + fnvar + '_' + arg;
            let type = def.inReq[arg] || def.inOpt[arg] || def.out[arg];
            if (type.isTime)
                this._asserts.push(smt.And(smt.GEq(p, 0), smt.LEq(p, 86400)));
            this._declare(smt.DeclareFun(p, [], this._typeToSmtType(type)));
        }
        return fnvar;
    }

    _instantiateAllowed(allowed, fnvar) {
        let name = this._allowedidx++;
        this._allowedmap[name] = allowed;
        this._allowedrevmap.set(allowed, name);
        this._constants.set('precon_' + name, 'Bool');

        this._asserts.push(smt.Eq('precon_' + name,
            this._booleanConstraintToSmt(fnvar, allowed.schema, optimizeFilter(allowed.precondition), true)));
        this._asserts.push(smt.Implies('precon_' + name,
            smt.Named('allowed_' + name, 'Allowed_' + fnvar, 'pi')));
        this._asserts.push(smt.Implies('precon_' + name,
            smt.Named('postcon_' + name,
                this._booleanConstraintToSmt(fnvar, allowed.schema, optimizeFilter(allowed.postcondition), false))));
    }

    _addFunction(fn, fnType, scope, originalFn, allowedmap) {
        let name = this._checkidx++;
        this._checkmap[name] = fn;
        this._checkrevmap.set(originalFn, name);

        let fnkey = fn.selector.kind + ':' + fn.channel;
        let fnvar = this._declareFunction(fn.selector.kind, fn.channel, name, fn.schema);
        if (allowedmap) {
            for (let allowed of allowedmap.get(fnkey))
                this._instantiateAllowed(allowed, fnvar);
        }

        for (let inParam of fn.in_params) {
            let pname = 'param_' + fnvar + '_' + inParam.name;
            let ptype = fn.schema.inReq[inParam.name] || fn.schema.inOpt[inParam.name];
            if (inParam.value.isNull || inParam.value.isUndefined)
                continue;
            if (inParam.value.isVarRef)
                this._asserts.push(smt.Eq(pname, scope[inParam.value.name]));
            else
                this._asserts.push(smt.Eq(pname, this._valueToSmtValue(inParam.value, ptype)));
        }
        this._asserts.push(this._processFilter(fn.filter, fnvar, fn.schema));

        for (let outParam of fn.out_params) {
            let pname = 'param_' + fnvar + '_' + outParam.value;
            let ptype = fn.schema.out[outParam.value];
            let vname = this._getVarName(outParam.name, ptype);
            this._asserts.push(smt.Eq(vname, pname));
            scope[outParam.name] = vname;
        }

        this._checks.push(smt.Named('check_' + name, 'Allowed_' + fnvar, 'pi'));
    }

    addFilterForFunction(fn, filter) {
        let name = this._checkrevmap.get(fn);
        let fnvar = (fn.selector.isBuiltin ? 'builtin_notify' : fn.selector.kind + '_' + fn.channel) + '_' + name;
        this._asserts.push(this._booleanConstraintToSmt(fnvar, fn.schema, filter, false));
    }

    checkAllowed() {
        this._solver.enableAssignments();
        this._addEverything();
        this._solver.assert(smt.Not(smt.And(...this._checks)));
        this._solver.dump();
        return this._solver.checkSat().then(([sat, assignment, constants, unsatCore]) => {
            //console.log('CVC4 result: ', sat, assignment);
            this._assignment = assignment;
            this._assignedConstants = constants;
            this._unsatCore = unsatCore;
            return !sat;
        });
    }

    checkSatisfiable() {
        this._addEverything();
        return this._solver.checkSat().then(([sat, assignment, constants, unsatCore]) => {
            //console.log('CVC4 result: ', sat, assignment);
            this._assignment = assignment;
            this._assignedConstants = constants;
            this._unsatCore = unsatCore;
            return sat;
        });
    }

    checkValid() {
        this._addEverything();
        return this._solver.checkSat().then(([sat, assignment, constants, unsatCore]) => {
            //console.log('CVC4 result: ', sat, assignment);
            this._assignment = assignment;
            this._assignedConstants = constants;
            this._unsatCore = unsatCore;
            return !sat;
        });
    }

    isFunctionAllowed(fn) {
        if (!this._assignment) // unsat
            return true;
        let name = this._checkrevmap.get(fn);
        return this._assignment['check_' + name];
    }

    isPreconditionSometimesTrue(allowed) {
        if (!this._assignment) // unsat
            return true;
        let name = this._allowedrevmap.get(allowed);
        return this._assignment['precon_' + name];
    }

    isPreconditionAlwaysTrue(allowed) {
        if (!this._unsatCore) // sat
            return false;
        let name = this._allowedrevmap.get(allowed);
        return this._unsatCore.has('precon_' + name);
    }

    isPostconditionTrue(allowed) {
        if (!this._assignment) // unsat
            return true;
        let name = this._allowedrevmap.get(allowed);
        return this._assignment['postcon_' + name];
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

module.exports = class PermissionChecker {
    constructor(schemaRetriever) {
        this._schemaRetriever = schemaRetriever;

        this._allowedmap = new MultiMap;
        this._principal = null;
        this._program = null;
        this._newprogram = null;
        this._isProgramAllowed = false;

        this._mainReduction = new SmtReduction();
    }

    check() {
        this._mainReduction.addProgram(this._principal, this._program, this._allowedmap);

        return this._mainReduction.checkAllowed().then((isAllowed) => {
            this._isProgramAllowed = isAllowed;
            if (isAllowed)
                console.log('Program is allowed');
            else
                console.log('Program not allowed, checking for missing constraints');

            // we still need to rewrite the program to add postconditions
            this._newprogram = this._program.clone();
            return Q.all(this._program.rules.map((oldrule, i) => {
                return this._adjustRule(oldrule, this._newprogram.rules[i]);
            })).then(() => this._newprogram);
        });
    }

    _adjustRule(oldrule, newrule) {
        const scope = {
            __pi: this._principal
        };
        let lastPrimitive = null;
        return Q.try(() => {
            if (oldrule.trigger)
                return this._adjustTrigger(oldrule.trigger, newrule.trigger, scope);
        }).then(() => {
            lastPrimitive = newrule.trigger;
        }).then(() => {
            return promiseLoop(oldrule.queries, (oldquery, i) => {
                console.log('newprogram ' + Ast.prettyprint(this._newprogram));
                return this._adjustQuery(oldrule.queries[i], newrule.queries[i], lastPrimitive, scope).then(() => {
                    lastPrimitive = newrule.queries[i];
                });
            });
        }).then(() => {
            return promiseDoAll(oldrule.actions, (oldaction, i) => {
                console.log('newprogram ' + Ast.prettyprint(this._newprogram));
                return this._adjustAction(oldaction, newrule.actions[i], lastPrimitive, scope);
            });
        }).then(() => {
            newrule.actions = newrule.actions.filter((a) => !a.filter.isFalse);
        });
    }

    _fnToString(fn) {
        if (fn.selector.isBuiltin)
            return '@builtin.notify';
        else
            return '@' + fn.selector.kind + '.' + fn.channel;
    }

    _isRuleApplicable(allowed, newfn) {
        let precondition = allowed.precondition;
        let postcondition = Ast.BooleanExpression.Or([Ast.BooleanExpression.Not(allowed.precondition),
            allowed.postcondition]);

        let reduction = new SmtReduction();
        reduction.addProgram(this._principal, this._newprogram);
        // can the precondition be satisfied? and if so, can the post condition be satisfied?
        reduction.addFilterForFunction(newfn, precondition);
        reduction.addFilterForFunction(newfn, postcondition);
        console.log('Checking that rule ' + allowed + ' is applicable');
        return reduction.checkSatisfiable();
    }

    _isPreconditionImplied(allowed, newfn) {
        console.log('Checking that precondition for rule ' + allowed +  ' is implied (redundant)');
        if (!this._mainReduction.isPreconditionSometimesTrue(allowed)) {
            // we got lucky! the main reduction found a case where the precondition is not true
            // skip the SMT call and say no
            return Q(false);
        }

        let reduction = new SmtReduction();
        reduction.addProgram(this._principal, this._newprogram);
        reduction.addFilterForFunction(newfn, Ast.BooleanExpression.Not(allowed.precondition));
        return reduction.checkValid();
    }

    _isPostconditionImplied(allowed, newfn, postcondition) {
        console.log('Checking that postcondition for rule ' + allowed +  ' is implied (redundant)');
        if (!this._mainReduction.isPostconditionTrue(allowed)) {
            // we got lucky! the main reduction found a case where this postcondition is not true
            // skip the SMT call and say no
            return Q(false);
        }
        // the common case is no postcondition (postcondition is just "true")
        // skip the SMT call in that case and say yes
        postcondition = optimizeFilter(postcondition);
        if (postcondition.isTrue)
            return Q(true);

        let reduction = new SmtReduction();
        reduction.addProgram(this._principal, this._newprogram);
        reduction.addFilterForFunction(newfn, Ast.BooleanExpression.Not(postcondition));
        return reduction.checkValid();
    }

    _adjustCommon(oldfn, newfn, scope) {
        let inParamMap = {};
        for (let inParam of newfn.in_params)
            inParamMap[inParam.name] = inParam.value;

        let isFunctionAllowed = this._mainReduction.isFunctionAllowed(oldfn);
        console.log();
        if (this._isProgramAllowed)
            console.log('Function ' + this._fnToString(oldfn) + ' is statically allowed');
        else if (!isFunctionAllowed)
            console.log('Function ' + this._fnToString(oldfn) + ' is not always allowed');
        // otherwise we have no information

        let preconditions = [], postconditions = [];

        let allowedRules;
        if (oldfn.selector.isBuiltin)
            allowedRules = this._allowedmap.get('builtin:notify');
        else
            allowedRules = this._allowedmap.get(oldfn.selector.kind + ':' + oldfn.channel);
        console.log('Found ' + allowedRules.length + ' relevant permission rules');

        return promiseDoAll(allowedRules, (allowed) => {
            return this._isRuleApplicable(allowed, newfn).then((isApplicable) => {
                if (isApplicable)
                    console.log('Rule is applicable (precondition and postcondition are satisfiable)');
                else
                    console.log('Rule is not applicable (precondition and postcondition are not satisfiable)');
                if (!isApplicable) // not relevant
                    return;

                let precondition = this._isProgramAllowed ? Ast.BooleanExpression.True : allowed.precondition;
                let postcondition = Ast.BooleanExpression.Or([Ast.BooleanExpression.Not(allowed.precondition),
                    allowed.postcondition]);

                return this._isPreconditionImplied(allowed, newfn).then((isPreconditionImplied) => {
                    if (isPreconditionImplied)
                        console.log('Rule precondition is implied by the program (precondition is valid)');
                    else
                        console.log('Rule precondition is not implied by the program (precondition is not valid)');
                    if (isPreconditionImplied) {
                        precondition = Ast.BooleanExpression.True;
                        postcondition = allowed.postcondition;
                    }

                    return this._isPostconditionImplied(allowed, newfn, postcondition);
                }).then((isPostconditionImplied) => {
                    if (isPostconditionImplied)
                        console.log('Rule postcondition is implied by the program (postcondition is valid)');
                    else
                        console.log('Rule postcondition is not implied by the program (postcondition is not valid)');
                    if (isPostconditionImplied)
                        postcondition = Ast.BooleanExpression.True;

                    preconditions.push(precondition);
                    postconditions.push(postcondition);
                });
            });
        }).then(() => {
            let result = [optimizeFilter(partiallyEvalFilter(Ast.BooleanExpression.Or(preconditions), scope, inParamMap, true)),
                          optimizeFilter(partiallyEvalFilter(Ast.BooleanExpression.And(postconditions), scope, inParamMap, false))];

            for (let outParam of newfn.out_params)
                scope[outParam.name] = outParam.value;

            return result;
        });
    }

    _adjustQuery(oldquery, newquery, newlastprimitive, scope) {
        return this._adjustCommon(oldquery, newquery, scope).then(([precondition, postcondition]) => {
            if (!precondition.isFalse && !precondition.isTrue && !newlastprimitive)
                throw new TypeError('??? Query precondition is not statically true or false, but there is no trigger?');

            newlastprimitive.filter = Ast.BooleanExpression.And([newlastprimitive.filter, precondition]);
            newquery.filter = Ast.BooleanExpression.And([newquery.filter, postcondition]);
        });
    }

    _adjustAction(oldaction, newaction, newlastprimitive, scope) {
        return this._adjustCommon(oldaction, newaction, scope).then(([precondition, postcondition]) => {
            if (!precondition.isFalse && !precondition.isTrue && !newlastprimitive)
                throw new TypeError('??? Action precondition is not statically true or false, but there is no trigger?');

            if (!postcondition.isFalse && !postcondition.isTrue)
                throw new TypeError('??? Actions cannot have postconditions');
            newlastprimitive.filter = Ast.BooleanExpression.And([newlastprimitive.filter, precondition]);
        });
    }

    _adjustTrigger(oldtrigger, newtrigger, scope) {
        return this._adjustCommon(oldtrigger, newtrigger, scope).then(([precondition, postcondition]) => {
            if (!precondition.isFalse && !precondition.isTrue)
                throw new Error('??? Trigger precondition is not statically true or false? ');

            newtrigger.filter =  Ast.BooleanExpression.And([newtrigger.filter, postcondition]);
        });
    }

    _getAllowedSchema(allowed) {
        if (allowed.schema) {
            return Promise.resolve(allowed.schema);
        } else {
            return Utils.getSchemaForSelector(this._schemaRetriever, allowed.kind, allowed.channel, allowed.channelType, false, {})
                .then((schema) => {
                    allowed.schema = schema;
                    return schema;
                });
        }
    }

    allowed(allowed) {
        return this._getAllowedSchema(allowed).then(() => {
            if (allowed.channelType === 'actions' && !allowed.postcondition.isTrue)
                throw new TypeError('Actions cannot have postconditions');
            this._allowedmap.put(allowed.kind + ':' + allowed.channel, allowed);
        });
    }

    addProgram(principal, program) {
        this._principal = principal;
        return typeCheckProgram(program, this._schemaRetriever).then(() => {
            this._program = program;

            return Q.all(program.classes.map((classdef) => {
                // make a default Allowed rule for @remote.send/@remote.receive
                if (classdef.extends === 'remote') {
                    let promises = [];
                    if (classdef.triggers.receive) {
                        let allowed = Ast.Allowed(classdef.name, 'receive', 'triggers',
                            Ast.BooleanExpression.Atom(Ast.Filter('__principal', '=', Ast.Value.VarRef('__pi'))),
                            Ast.BooleanExpression.True);
                        allowed.schema = classdef.triggers.receive;
                        promises.push(this.allowed(allowed));
                    }
                    if (classdef.actions.send) {
                        let allowed = Ast.Allowed(classdef.name, 'send', 'actions',
                            Ast.BooleanExpression.Atom(Ast.Filter('__principal', '=', Ast.Value.VarRef('__pi'))),
                            Ast.BooleanExpression.True);
                        allowed.schema = classdef.actions.send;
                        promises.push(this.allowed(allowed));
                    }
                    return Q.all(promises);
                }
            }));
        });
    }
}
