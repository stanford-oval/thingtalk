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
const Ir = require('./ir');
const Grammar = require('./grammar');
const Type = require('./type');
const Utils = require('./utils');
const Builtin = require('./builtin');
const JSIr = require('./jsir');
const { typeCheckInput, typeCheckOutput, typeCheckRule } = require('./typecheck');

function compileEvent(irBuilder, name) {
    let reg;
    if (name === 'type') {
        reg = irBuilder.allocRegister(Type.Entity('tt:function'));
        irBuilder.add(new JSIr.GetEventType(reg));
    } else {
        let hint = name ? 'string-' + name : 'string';
        reg = irBuilder.allocRegister(Type.String);
        irBuilder.add(new JSIr.FormatEvent(hint, reg));
    }
    return reg;
}

function compileValue(irBuilder, ast) {
    if (ast.isUndefined)
        throw new Error('Invalid undefined value, should have been slot-filled');
    if (ast.isEvent)
        return compileEvent(irBuilder, ast.name);
    if (ast.isVarRef) {
        const name = ast.name;
        let reg = irBuilder.allocRegister(Type.Any);
        irBuilder.add(new JSIr.GetVariable(name, reg));
        return reg;
    } else {
        let reg = irBuilder.allocRegister(Type.Any);
        irBuilder.add(new JSIr.LoadConstant(ast, reg));
        return reg;
    }
}

function compileInputParams(ast) {
    let irBuilder = new JSIr.IRBuilder();
    let tuple = irBuilder.allocRegister(Type.Tuple(ast.schema.types));
    irBuilder.add(new JSIr.CreateTuple(ast.schema.args.length, tuple));
    for (let inParam of ast.in_params) {
        let reg = compileValue(irBuilder, inParam.value);
        irBuilder.add(new JSIr.SetIndex(tuple, ast.schema.index[inParam.name], reg));
    }
    irBuilder.add(new JSIr.Return(tuple));
    return irBuilder.compile();
}

function compileTriggerOrQuery(ast, inParamAccess, outParamAccess) {
    let inputFn = compileInputParams(ast);

    let irBuilder = new JSIr.IRBuilder();

    function compileFilter(expr) {
        const cond = irBuilder.allocRegister(Type.Boolean);
        if (expr.isTrue) {
            irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), cond));
        } else if (expr.isFalse) {
            irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(false), cond));
        } else if (expr.isAnd) {
            irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), cond));
            for (let op of expr.operands) {
                let opv = compileFilter(op);
                irBuilder.add(new JSIr.BinaryOp(cond, opv, '&&', cond));
            }
        } else if (expr.isOr) {
            irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(false), cond));
            for (let op of expr.operands) {
                let opv = compileFilter(op);
                irBuilder.add(new JSIr.BinaryOp(cond, opv, '||', cond));
            }
        } else if (expr.isNot) {
            const op = compileFilter(expr.expr);
            irBuilder.add(new JSIr.UnaryOp(op, '!', cond));
        } else {
            let filter = expr.filter;
            const op = filter.operator;
            let lhs;
            if (ast.schema.inReq[filter.name] || ast.schema.inOpt[filter.name])
                lhs = inParamAccess(irBuilder, ast, filter.name);
            else if (ast.schema.out[filter.name])
                lhs = outParamAccess(irBuilder, ast, filter.name);
            else
                lhs = compileValue(irBuilder, Ast.Value.VarRef(filter.name));
            const rhs = compileValue(irBuilder, filter.value);
            if (op === '!=') {
                // lower into '!' + '='
                irBuilder.add(new JSIr.BinaryOp(lhs, rhs, '=', cond));
                irBuilder.add(new JSIr.UnaryOp(cond, '!', cond));
            } else {
                irBuilder.add(new JSIr.BinaryOp(lhs, rhs, op, cond));
            }
        }
        return cond;
    }

    let filterResult = compileFilter(ast.filter);
    irBuilder.add(new JSIr.Return(filterResult));
    let filterFn = irBuilder.compile();

    irBuilder = new JSIr.IRBuilder();
    for (let outParam of ast.out_params) {
        let vname = outParam.name;
        let p = outParamAccess(irBuilder, ast, outParam.value);
        irBuilder.add(new JSIr.SetVariable(vname, p));
    }
    let outputFn = irBuilder.compile();

    return [inputFn, filterFn, outputFn];
}

function compileTriggerOutParamAccess(irBuilder, ast, paramName) {
    let reg = irBuilder.allocRegister(Type.Any);
    irBuilder.add(new JSIr.ReadTriggerValue(ast, paramName, reg));
    return reg;
}

function compileTriggerInParamAccess(irBuilder, ast, paramName) {
    let reg = irBuilder.allocRegister(Type.Any);
    irBuilder.add(new JSIr.ReadTriggerInput(ast, paramName, reg));
    return reg;
}

function compileQueryOutParamAccess(irBuilder, ast, paramName) {
    var reg = irBuilder.allocRegister(Type.Any);
    irBuilder.add(new JSIr.ReadQueryValue(ast, paramName, reg));
    return reg;
}

function compileQueryInParamAccess(irBuilder, ast, paramName) {
    var reg = irBuilder.allocRegister(Type.Any);
    irBuilder.add(new JSIr.ReadQueryInput(ast, paramName, reg));
    return reg;
}

function compileTrigger(ast) {
    let [inputFn, filterFn, outputFn] = compileTriggerOrQuery(ast, compileTriggerInParamAccess, compileTriggerOutParamAccess);
    return Ir.Invocation.Trigger(ast.__effectiveSelector, ast.channel, inputFn, filterFn, outputFn, false);
}

function compileQuery(ast) {
    let [inputFn, filterFn, outputFn] = compileTriggerOrQuery(ast, compileQueryInParamAccess, compileQueryOutParamAccess);
    return Ir.Invocation.Query(ast.__effectiveSelector, ast.channel, inputFn, filterFn, outputFn);
}

function compileBuiltinNotify(ast) {
    /*
    let irBuilder = new JSIr.IRBuilder();
    let tuple = irBuilder.allocRegister(Type.Tuple([Type.Entity('tt:function'), Type.Any]));
    irBuilder.add(new JSIr.CreateTuple(2, tuple));
    let eventType = irBuilder.allocRegister(Type.Entity('tt:function'));
    irBuilder.add(new JSIr.GetEventType(eventType));
    irBuilder.add(new JSIr.SetIndex(tuple, 0, eventType));
    let event = irBuilder.allocRegister(Type.Any);
    irBuilder.add(new JSIr.GetEvent(event));
    irBuilder.add(new JSIr.SetIndex(tuple, 1, event));
    irBuilder.add(new JSIr.Return(tuple));

    return Ir.Invocation.Action(ast.selector, ast.channel, irBuilder.compile());
    */
    return Ir.Invocation.Action(ast.selector, ast.channel, function(env) {
        return [env.getEventType(), env.getCurrentEvent()];
    });
}

function compileAction(ast) {
    if (ast.selector.isBuiltin)
        return compileBuiltinNotify(ast);

    let inputFn = compileInputParams(ast);
    return Ir.Invocation.Action(ast.__effectiveSelector, ast.channel, inputFn);
}

module.exports = class AppCompiler {
    constructor() {
        this._warnings = [];

        this._name = undefined;
        this._params = {};
        this._classes = {};
        this._rules = [];

        this._schemaRetriever = null;
    }

    setSchemaRetriever(schemaRetriever) {
        this._schemaRetriever = schemaRetriever;
    }

    get warnings() {
        return this._warnings;
    }

    _warn(msg) {
        this._warnings.push(msg);
    }

    get name() {
        return this._name;
    }

    get params() {
        return this._params;
    }

    get rules() {
        return this._rules;
    }

    _buildScope() {
        let scope = {};
        for (let name in this._params)
            scope[name] = this._params[name];
        return scope;
    }

    _compileRuleOrCommand(trigger, queries, actions) {
        let compiledTrigger = trigger !== null ? compileTrigger(trigger) : null;
        let compiledQueries = queries.map((q) => compileQuery(q));
        let compiledActions = actions.map((a) => compileAction(a));
        if (compiledTrigger !== null)
            return Ir.Rule(compiledTrigger, compiledQueries, compiledActions);
        else
            return Ir.Command(compiledQueries, compiledActions);
    }

    verifyRule(ast) {
        return typeCheckRule(ast, this._schemaRetriever, this._params, this._classes);
    }

    compileRule(ast) {
        let retval = this._compileRuleOrCommand(ast.trigger, ast.queries, ast.actions);
        if (retval.isRule)
            retval.trigger.once = ast.once;
        return retval;
    }

    compileCode(code) {
        return this.compileProgram(Grammar.parse(code));
    }

    verifyProgram(ast) {
        this._name = ast.name;
        ast.params.forEach((ast) => {
            this._params[ast.name] = ast.type;
        });
        ast.classes.forEach((ast) => {
            this._classes[ast.name] = ast;
        });

        return Q.all(ast.rules.map(this.verifyRule, this));
    }

    compileProgram(ast) {
        return this.verifyProgram(ast).then(() => {
            ast.rules.forEach(function(stmt) {
                this._rules.push(this.compileRule(stmt));
            }, this);
        });
    }
};

