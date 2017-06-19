// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

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

function partiallyEvalFilter(expr, scope, inParamMap) {
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
        assert(!filter.value.isUndefined && !filter.value.isNull && !filter.value.isVarRef);

        let lhs = inParamMap[filter.name];
        let rhs = filter.value;
        if (!lhs)
            return expr;
        if (lhs.isNull)
            throw new Error('Precondition refers to unspecified parameter');
        if (lhs.isUndefined)
            throw new Error('Unexpected $undefined');
        if (lhs.isVarRef) {
            return Ast.BooleanExpression.Atom(Ast.Filter(scope[lhs.name], filter.operator, filter.value));
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

        this._add(smt.DeclareDatatype('Location',
            ['loc.home', 'loc.work', 'loc.current_location',
             ['loc.absolute', '(loc.lat Real)', '(loc.lon Real)']]));
        this._types = new Set(['Entity_tt_contact']);
        this._enumtypes = [];

        this._constants = new Map;
        this._constants.set('pi', 'Entity_tt_contact');

        this._classes = {};
        this._declarations = [];
        this._asserts = [];

        this._constridx = 0;
        this._constrmap = [];
        this._constrrevmap = new Map;
        this._allowedidx = 0;
        this._allowedmap = [];
        this._fnmap = new MultiMap;

        this._progvars = new Set;
        this._checkidx = 0;
        this._checkmap = [];
        this._fntypemap = [];
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
        for (let t of this._types)
            this._add(smt.DeclareSort(t));
        for (let [name, t] of this._enumtypes)
            this._add(smt.DeclareDatatype(name, t.entries.map((e) => name + '.' + e)));
        for (let [name, t] of this._constants.entries())
            this._add(smt.DeclareFun(name, [], t));
        for (let decl of this._declarations)
            this._add(decl);
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
        if (type.isEntity) {
            let t = 'Entity_' + type.type.replace(/[^A-Za-z0-9_]/g, '_');
            this._types.add(t);
            return t;
        }
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
        entityType = entityType.replace(/[^A-Za-z0-9_]/g, '_');
        entityValue = this._encodeEntityValue(entityValue);
        let name = 'entity_' + entityType + '.' + entityValue;
        this._constants.set(name, 'Entity_' + entityType);
        return name;
    }

    _enumToSmtValue(enumerant, type) {
        let typename = this._makeEnumType(type);
        return typename + '.' + enumerant;
    }

    _valueToSmtValue(v, type) {
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

    _booleanConstraintToSmt(fn, fndef, constr, isPrecondition) {
        if (constr.isTrue)
            return 'true';
        if (constr.isFalse)
            return 'false';
        let name = this._constridx++;
        this._constrmap[name] = constr;
        this._constrrevmap.set(constr, name);

        if (constr.isAnd)
            return smt.Named('constr_' + name,
                smt.And(...constr.operands.map((o) => this._booleanConstraintToSmt(fn, fndef, o, isPrecondition))));
        if (constr.isOr)
            return smt.Named('constr_' + name,
                smt.Or(...constr.operands.map((o) => this._booleanConstraintToSmt(fn, fndef, o, isPrecondition))));
        if (constr.isNot)
            return smt.Named('constr_' + name,
                smt.Not(this._booleanConstraintToSmt(fn, fndef, constr.expr, isPrecondition)));

        let filter = constr.filter;
        let param = 'param_' + fn + '_' + filter.name;
        let paramType;
        if (isPrecondition)
            paramType = fndef.inReq[filter.name] || fndef.inOpt[filter.name];
        else
            paramType = fndef.out[filter.name];
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
        if (ast.isAnd)
            return smt.And(...ast.operands.map((o) => this._processFilter(o, fnvar, schema)));
        if (ast.isOr)
            return smt.Or(...ast.operands.map((o) => this._processFilter(o, fnvar, schema)));
        if (ast.isNot)
            return smt.Not(this._processFilter(ast.expr, fnvar, schema));

        let filter = ast.filter;
        let pname = 'param_' + fnvar + '_' + filter.name;
        let ptype = schema.out[filter.name];
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
        this._declare(smt.DeclareFun(allowed, ['Entity_tt_contact'], 'Bool'));
        for (let arg of def.args) {
            let p = 'param_' + fnvar + '_' + arg;
            let type = def.inReq[arg] || def.inOpt[arg] || def.out[arg];
            if (type.isTime)
                this._asserts.push(smt.And(smt.GEq(p, 0), smt.LEq(p, 86400)));
            this._declare(smt.DeclareFun(p, [], this._typeToSmtType(type)));
        }
        if (kind in this._classes) {
            if (this._classes[kind].extends === 'remote') {
                this._asserts.push(smt.Implies(
                    smt.Eq('pi', 'param_'+ fnvar + '___principal'),
                    smt.Predicate(allowed, 'pi')));
            }
        }
        return fnvar;
    }

    _instantiateAllowed(allowed, fnvar) {
        let name = this._allowedidx++;
        this._allowedmap[name] = allowed;
        this._constants.set('precon_' + name, 'Bool');

        this._asserts.push(smt.Eq('precon_' + name,
            this._booleanConstraintToSmt(fnvar, allowed.schema, optimizeFilter(allowed.precondition), true)));
        this._asserts.push(smt.Implies('precon_' + name,
            smt.Named('allowed_' + name,
                smt.Predicate('Allowed_' + fnvar, 'pi'))));
        this._asserts.push(smt.Implies('precon_' + name,
            this._booleanConstraintToSmt(fnvar, allowed.schema, optimizeFilter(allowed.postcondition), false)));
    }

    _addFunction(fn, fnType, scope, originalFn, allowedmap) {
        let fnkey = fn.selector.kind + ':' + fn.channel;
        let index = this._fnmap.put(fnkey, fn)-1;

        let fnvar = this._declareFunction(fn.selector.kind, fn.channel, index, fn.schema);
        for (let allowed of allowedmap.get(fnkey))
            this._instantiateAllowed(allowed, fnvar);

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
        this._asserts.push(this._processFilter(optimizeFilter(fn.filter), fnvar, fn.schema));

        for (let outParam of fn.out_params) {
            let pname = 'param_' + fnvar + '_' + outParam.value;
            let ptype = fn.schema.out[outParam.value];
            let vname = this._getVarName(outParam.name, ptype);
            this._asserts.push(smt.Eq(vname, pname));
            scope[outParam.name] = vname;
        }

        let name = this._checkidx++;
        this._checkmap[name] = fn;
        this._fntypemap[name] = fnType;
        this._checkrevmap.set(originalFn, name);
        this._checks.push(smt.Named('check_' + name,
            smt.Predicate('Allowed_' + fnvar, 'pi')));
    }

    checkAllowed() {
        this._addEverything();
        this._solver.assert(smt.Not(smt.And(...this._checks)));
        return this._solver.checkSat().then(([sat, assignment, constants]) => {
            console.log('CVC4 result: ', sat, assignment);
            this._assignment = assignment;
            this._assignedConstants = constants;
            return !sat;
        });
    }

    checkPossible() {
        this._addEverything();
        return this._solver.checkSat().then(([sat, assignment, constants]) => {
            console.log('CVC4 result: ', sat, assignment);
            this._assignment = assignment;
            this._assignedConstants = constants;
            return sat;
        });
    }

    isFunctionAllowed(fn) {
        if (!this._assignment) // unsat
            return true;
        let name = this._checkrevmap.get(fn);
        return this._assignment['check_' + name];
    }
}

// Verifies that a program is allowed, with the help of an SMT solver

module.exports = class PermissionChecker {
    constructor(schemaRetriever) {
        this._schemaRetriever = schemaRetriever;

        this._allowedmap = new MultiMap;
        this._principal = null;
        this._program = null;

        this._mainReduction = new SmtReduction();
    }

    check() {
        this._mainReduction.addProgram(this._principal, this._program, this._allowedmap);

        return this._mainReduction.checkAllowed().then((isAllowed) => {
            if (isAllowed)
                console.log('Program is allowed');
            else
                console.log('Program not allowed, checking for missing constraints');

            // we still need to rewrite the program to add postconditions
            let newprogram = this._program.clone();
            this._program.rules.forEach((oldrule, i) => {
                this._adjustRule(oldrule, newprogram.rules[i]);
            });
            return newprogram;
        });
    }

    _adjustRule(oldrule, newrule) {
        var scope = {};
        if (oldrule.trigger)
            this._adjustTrigger(oldrule.trigger, newrule.trigger, scope);
        let lastPrimitive = newrule.trigger;
        oldrule.queries.forEach((oldquery, i) => {
            this._adjustQuery(oldquery, newrule.queries[i], lastPrimitive, scope);
            lastPrimitive = newrule.queries[i];
        });
        oldrule.actions.forEach((oldaction, i) => {
            this._adjustAction(oldaction, newrule.actions[i], lastPrimitive, scope);
        })
        newrule.actions = newrule.actions.filter((a) => !a.filter.isFalse);
    }

    _getRelevantRules(fn) {
        let preconditions = [], postconditions = [];
        let rules;
        if (fn.selector.isBuiltin)
            rules = this._allowedmap.get('builtin:notify');
        else
            rules = this._allowedmap.get(fn.selector.kind + ':' + fn.channel);
        console.log('Found ' + rules.length + ' relevant permission rules');

        for (let rule of rules) {
            preconditions.push(rule.precondition);
            postconditions.push(Ast.BooleanExpression.Or([Ast.BooleanExpression.Not(rule.precondition), rule.postcondition]));
        }
        return [Ast.BooleanExpression.Or(preconditions), Ast.BooleanExpression.And(postconditions)];
    }

    _computeCondition(primitive, scope, condition) {
        let inParamMap = {};
        for (let inParam of primitive.in_params)
            inParamMap[inParam.name] = inParam.value;

        return optimizeFilter(partiallyEvalFilter(condition, scope, inParamMap));
    }

    _fnToString(fn) {
        if (fn.selector.isBuiltin)
            return '@builtin.notify';
        else
            return '@' + fn.selector.kind + '.' + fn.channel;
    }

    _adjustCommon(oldfn, newfn, scope) {
        let [precondition, postcondition] = this._getRelevantRules(oldfn);
        if (this._mainReduction.isFunctionAllowed(oldfn)) {
            console.log('Function ' + this._fnToString(oldfn) + ' is allowed');
            precondition = Ast.BooleanExpression.True;
        } else {
            console.log('Function ' + this._fnToString(oldfn) + ' is not (always) allowed');
            precondition = this._computeCondition(newfn, scope, precondition);
        }

        postcondition = this._computeCondition(newfn, scope, postcondition);

        for (let outParam of newfn.out_params)
            scope[outParam.name] = outParam.value;

        return [precondition, postcondition];
    }

    _adjustQuery(oldquery, newquery, newlastprimitive, scope) {
        let [precondition, postcondition] = this._adjustCommon(oldquery, newquery, scope);

        if (!precondition.isFalse && !precondition.isTrue && !newlastprimitive)
            throw new TypeError('??? Query precondition is not statically true or false, but there is no trigger?');

        newlastprimitive.filter = Ast.BooleanExpression.And([newlastprimitive.filter, precondition]);
        newquery.filter = Ast.BooleanExpression.And([newquery.filter, postcondition]);
    }

    _adjustAction(oldaction, newaction, newlastprimitive, scope) {
        let [precondition, postcondition] = this._adjustCommon(oldaction, newaction, scope);

        if (!precondition.isFalse && !precondition.isTrue && !newlastprimitive)
            throw new TypeError('??? Action precondition is not statically true or false, but there is no trigger?');

        if (!postcondition.isFalse && !postcondition.isTrue)
            throw new TypeError('??? Actions cannot have postconditions');
        newlastprimitive.filter = Ast.BooleanExpression.And([newlastprimitive.filter, precondition]);
    }

    _adjustTrigger(oldtrigger, newtrigger, scope) {
        let [precondition, postcondition] = this._adjustCommon(oldtrigger, newtrigger, scope);

        if (!precondition.isFalse && !precondition.isTrue)
            throw new Error('??? Trigger precondition is not statically true or false?');

        newtrigger.filter =  Ast.BooleanExpression.And([newtrigger.filter, postcondition]);
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
            this._allowedmap.put(allowed.kind + ':' + allowed.channel, allowed);
        });
    }

    addProgram(principal, program) {
        this._principal = principal;
        return typeCheckProgram(program, this._schemaRetriever).then(() => {
            this._program = program;
        });
    }
}
