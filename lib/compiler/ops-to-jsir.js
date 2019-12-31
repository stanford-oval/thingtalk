// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Ast = require('../ast');
const Type = require('../type');
const Builtin = require('../builtin/defs');

const JSIr = require('./jsir');
const {
    getRegister,
    typeForValue,
    compileBinaryOp,
    compileValue,
    compileCast,
    isRemoteSend,
    readResultKey
} = require('./utils');
const Scope = require('./scope');
const { notifyAction } = require("../ast/api");

module.exports = class OpCompiler {
    constructor(compiler, globalScope, irBuilder) {
        this._compiler = compiler;
        this._irBuilder = irBuilder;

        this._globalScope = globalScope;
        this._currentScope = new Scope(globalScope);
        this._varScopeNames = [];
        this._versions = {};
        this._retryLoopLabel = undefined;
    }

    _compileTpFunctionCall(ast) {
        if (!ast.__effectiveSelector) {
            // __effectiveSelector is used to turn dynamically declared classes for @remote
            // into just @remote
            console.error('WARNING: TypeCheck must set __effectiveSelector');
            ast.__effectiveSelector = ast.selector;
        }

        const attributes = {};
        if (ast.__effectiveSelector.id)
            attributes.id = ast.__effectiveSelector.id;
        // NOTE: "all" has no effect on the compiler, it only affects the dialog agent
        // whether it should slot-fill id or not
        // (in the future, this should probably be represented as id=$? like everywhere else...)

        for (let attr of ast.__effectiveSelector.attributes) {
            // attr.value cannot be a parameter passing in a program, so it's safe to call toJS here
            attributes[attr.name] = attr.value.toJS();
        }
        return [ast.__effectiveSelector.kind, attributes, ast.channel];
    }

    _allocState() {
        return this._compiler._allocState();
    }

    _compileOneInputParam(args, ast, inParam) {
        let reg = compileValue(this._irBuilder, inParam.value, this._currentScope);
        let ptype = ast.schema.inReq[inParam.name] || ast.schema.inOpt[inParam.name];
        reg = compileCast(this._irBuilder, reg, typeForValue(inParam.value, this._currentScope), ptype);
        this._irBuilder.add(new JSIr.SetKey(args, inParam.name, reg));
        return reg;
    }

    _compileInputParams(ast, extra_in_params = []) {
        let args = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.CreateObject(args));

        let argmap = {};
        for (let inParam of ast.in_params)
            argmap[inParam.name] = this._compileOneInputParam(args, ast, inParam);
        for (let inParam of extra_in_params)
            argmap[inParam.name] = this._compileOneInputParam(args, ast, inParam);
        return [argmap, args];
    }

    _compileAggregation(ast) {
        if (ast.aggregation) {
            let agg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.CreateAggregation(ast.aggregation, agg));
            return agg;
        }
        return null;
    }

    _compileIterateQuery(list) {
        let iterator = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.Iterator(iterator, list));

        let deviceAndResult = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(deviceAndResult, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        return deviceAndResult;
    }

    _compileFilter(ast, currentScope) {
        return (function recursiveHelper(expr) {
            let cond = this._irBuilder.allocRegister();
            if (expr.isTrue) {
                this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), cond));
            } else if (expr.isFalse) {
                this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(false), cond));
            } else if (expr.isAnd) {
                this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), cond));
                for (let op of expr.operands) {
                    let opv = recursiveHelper.call(this, op);
                    this._irBuilder.add(new JSIr.BinaryOp(cond, opv, '&&', cond));
                }
            } else if (expr.isOr) {
                this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(false), cond));
                for (let op of expr.operands) {
                    let opv = recursiveHelper.call(this, op);
                    this._irBuilder.add(new JSIr.BinaryOp(cond, opv, '||', cond));
                }
            } else if (expr.isNot) {
                const op = recursiveHelper.call(this, expr.expr);
                this._irBuilder.add(new JSIr.UnaryOp(op, '!', cond));
            } else if (expr.isExternal) {
                this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(false), cond));

                let tryCatch = new JSIr.TryCatch("Failed to invoke get-predicate query");
                this._irBuilder.add(tryCatch);
                this._irBuilder.pushBlock(tryCatch.try);

                assert(expr.selector.isDevice);
                let [kind, attrs, fname] = this._compileTpFunctionCall(expr);
                let list = this._irBuilder.allocRegister();
                let [argmap, args] = this._compileInputParams(expr);
                this._irBuilder.add(new JSIr.InvokeQuery(kind, attrs, fname, list, args));

                let typeAndResult = this._compileIterateQuery(list);
                let [, result] = this._readTypeResult(typeAndResult);

                let nestedScope = new Scope(this._globalScope);
                for (let name in argmap) {
                    nestedScope.set(name, {
                        type: 'scalar',
                        tt_type: expr.schema.inReq[name] || expr.schema.inOpt[name],
                        register: argmap[name]
                    });
                }
                for (let outParam in expr.schema.out) {
                    let reg = this._irBuilder.allocRegister();
                    this._irBuilder.add(new JSIr.GetKey(result, outParam, reg));
                    nestedScope.set(outParam, {
                        type: 'scalar',
                        tt_type: expr.schema.out[outParam],
                        register: reg
                    });
                }
                let ok = this._compileFilter(expr.filter, nestedScope);
                let ifStmt = new JSIr.IfStatement(ok);
                this._irBuilder.add(ifStmt);
                this._irBuilder.pushBlock(ifStmt.iftrue);
                this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), cond));
                this._irBuilder.add(new JSIr.Break());
                this._irBuilder.popBlock();

                this._irBuilder.popBlock(); // for-of
                this._irBuilder.popBlock(); // try-catch
            } else if (expr.isCompute) {
                let lhs = this._compileScalarExpression(expr.lhs, currentScope);
                let op = expr.operator;
                lhs = compileCast(this._irBuilder, lhs, expr.lhs.type, expr.overload[0]);
                let rhs = compileValue(this._irBuilder, expr.rhs, currentScope);
                rhs = compileCast(this._irBuilder, rhs, typeForValue(expr.rhs, currentScope), expr.overload[1]);
                compileBinaryOp(this._irBuilder, op, lhs, rhs, cond);
                cond = compileCast(this._irBuilder, cond, expr.overload[2], Type.Boolean);
            } else if (expr.isAtom) {
                let op = expr.operator;
                let { tt_type:lhsType, register:lhs } = currentScope.get(expr.name);
                lhs = compileCast(this._irBuilder, lhs, lhsType, expr.overload[0]);
                let rhs = compileValue(this._irBuilder, expr.value, currentScope);
                rhs = compileCast(this._irBuilder, rhs, typeForValue(expr.value, currentScope), expr.overload[1]);
                compileBinaryOp(this._irBuilder, op, lhs, rhs, cond);
                cond = compileCast(this._irBuilder, cond, expr.overload[2], Type.Boolean);
            } else {
                throw new Error('Unsupported boolean expression ' + expr);
            }
            return cond;
        }).call(this, ast);
    }

    _compileListExpression(expr, currentScope) {
        const array = compileValue(expr, Ast.Value.VarRef(expr.name), currentScope);
        if (!expr.filter)
            return array;

        const result = this._irBuilder.allocRegister();
        const element = this._irBuilder.allocRegister();

        assert(expr.type.isArray);
        const elementtype = expr.type.elem;

        const filterop = new JSIr.ArrayFilterExpression(result, element, array);
        this._irBuilder.add(filterop);
        this._irBuilder.pushBlock(filterop.body);

        const newScope = new Scope(currentScope.parent);
        if (elementtype.isCompound) {
            for (let field in elementtype.fields) {
                if (field.indexOf('.') >= 0)
                    continue;
                readResultKey(this._irBuilder, newScope, element, field, field, elementtype.fields[field].type, false);
            }
        } else {
            newScope.set('value', {
                type: 'scalar',
                reg: element,
                tt_type: elementtype,
                isInVarScopeNames: false,
            });
        }

        const condition = this._compileFilter(expr.filter, newScope);
        this._irBuilder.add(new JSIr.ReturnValue(condition));

        this._irBuilder.popBlock();
        return result;
    }

    _compileScalarExpression(expr, currentScope) {
        if (expr.isFilter || expr.isFlattenedList)
            return this._compileListExpression(expr.list, currentScope);

        if (expr.isAggregation) {
            const list = this._compileListExpression(expr.list, currentScope);

            const field = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.LoadConstant(new Ast.Value.String(expr.field), field));

            const result = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.FunctionOp(expr.operator, result, list, field));
            return result;
        }

        if (expr.isDerived) {
            const args = expr.operands.map((op) => this._compileScalarExpression(op, currentScope));
            const result = this._irBuilder.allocRegister();

            let scalarOp = Builtin.ScalarExpressionOps[expr.op];
            if (scalarOp.op)
                this._irBuilder.add(new JSIr.BinaryOp(args[0], args[1], scalarOp.op, result));
            else
                this._irBuilder.add(new JSIr.FunctionOp(scalarOp.fn, result, ...args));
            return result;
        }

        if (expr.isPrimary)
            return compileValue(this._irBuilder, expr.value, currentScope);

        throw new Error('Unsupported scalar expression ' + expr);
    }

    _setInvocationOutputs(schema, argmap, typeAndResult) {
        let [outputType, result] = this._readTypeResult(typeAndResult);

        this._currentScope = new Scope(this._globalScope);
        this._varScopeNames = [];
        this._currentScope.set('$outputType', {
            type: 'scalar',
            tt_type: null,
            register: outputType
        });
        this._currentScope.set('$output', {
            type: 'scalar',
            tt_type: null,
            register: result
        });

        if (argmap) {
            for (let arg in argmap) {
                this._currentScope.set(arg, {
                    type: 'scalar',
                    tt_type: schema.inReq[arg] || schema.inOpt[arg],
                    register: argmap[arg],
                    isInVarScopeNames: false
                });
                // note: input parameters && __result do not participate in varScopeNames (which is used to
                // compare tuples for equality in monitor())
            }
        }

        for (let outArg of schema.iterateArguments()) {
            if (outArg.direction !== Ast.ArgDirection.IN_OPT || outArg.name in argmap)
                continue;
            if (outArg.name.indexOf('.') >= 0)
                continue;
            readResultKey(this._irBuilder, this._currentScope, result, outArg.name, outArg.name, outArg.type, false);
            // note: input parameters && __result do not participate in varScopeNames (which is used to
            // compare tuples for equality in monitor())
        }

        // if the schema has an explicit __response argument (which is the case for @remote stuff
        // which needs to carry over __response), we do not override it here
        if (!schema.hasArgument('__response'))
            readResultKey(this._irBuilder, this._currentScope, result, '__response', '__response', Type.String);

        for (let outArg of schema.iterateArguments()) {
            if (outArg.direction !== Ast.ArgDirection.OUT)
                continue;
            if (outArg.name.indexOf('.') >= 0)
                continue;
            readResultKey(this._irBuilder, this._currentScope, result, outArg.name, outArg.name, outArg.type, true);
            this._varScopeNames.push(outArg.name);
        }
    }

    _compileInvokeSubscribe(streamop) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke trigger");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let [kind, attrs, fname] = this._compileTpFunctionCall(streamop.invocation);
        let [argmap, argmapreg] = this._compileInputParams(streamop.invocation);

        let iterator = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.InvokeMonitor(kind, attrs, fname, iterator, argmapreg, false));

        let result = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(result, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        this._setInvocationOutputs(streamop.invocation.schema, argmap, result);
    }

    _compileTimer(streamop) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke timer");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let iterator = this._irBuilder.allocRegister();
        let base = compileValue(this._irBuilder, streamop.base, this._currentScope);
        let interval = compileValue(this._irBuilder, streamop.interval, this._currentScope);
        let frequency = null;
        if (streamop.frequency !== null)
            frequency = compileValue(this._irBuilder, streamop.frequency, this._currentScope);

        this._irBuilder.add(new JSIr.InvokeTimer(iterator, base, interval, frequency));

        let result = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(result, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        this._currentScope = new Scope(this._globalScope);
        this._currentScope.set('$outputType', {
            type: 'scalar',
            tt_type: null,
            register: null
        });
        this._currentScope.set('$output', {
            type: 'scalar',
            tt_type: null,
            register: result
        });
    }

    _compileAtTimer(streamop) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke at-timer");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let iterator = this._irBuilder.allocRegister();
        let timeArray = this._irBuilder.allocRegister();

        this._irBuilder.add(new JSIr.CreateTuple(streamop.time.length, timeArray));
        for (let i = 0; i < streamop.time.length; i++) {
            let time = compileValue(this._irBuilder, streamop.time[i], this._currentScope);
            this._irBuilder.add(new JSIr.SetIndex(timeArray, i, time));
        }

        let expiration_date = null;
        if (streamop.expiration_date !== null)
            expiration_date = compileValue(this._irBuilder, streamop.expiration_date, this._currentScope);
        this._irBuilder.add(new JSIr.InvokeAtTimer(iterator, timeArray, expiration_date));

        let result = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(result, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        this._currentScope = new Scope(this._globalScope);
        this._currentScope.set('$outputType', {
            type: 'scalar',
            tt_type: null,
            register: null
        });
        this._currentScope.set('$output', {
            type: 'scalar',
            tt_type: null,
            register: result
        });
    }

    _compileInvokeGet(tableop) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke query");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let [kind, attrs, fname] = this._compileTpFunctionCall(tableop.invocation);
        let [argmap, argmapreg] = this._compileInputParams(tableop.invocation, tableop.extra_in_params);
        let list = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.InvokeQuery(kind, attrs, fname, list, argmapreg));

        let result = this._compileIterateQuery(list);
        this._setInvocationOutputs(tableop.invocation.schema, argmap, result);
    }

    _compileReadResult(tableop) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke readResult");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let index = compileValue(this._irBuilder, tableop.index, this._currentScope);
        index = compileCast(this._irBuilder, index, typeForValue(tableop.index, this._currentScope), Type.Number);

        let list = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.InvokeReadResult(tableop.function, index, list));

        let result = this._compileIterateQuery(list);
        this._setInvocationOutputs(tableop.schema, null, result);
    }

    _compileVarRefInputParams(decl, in_params) {
        let in_argmap = {};
        for (let inParam of in_params) {
            let reg = compileValue(this._irBuilder, inParam.value, this._currentScope);
            let ptype = decl.schema.getArgType(inParam.name);
            reg = compileCast(this._irBuilder, reg, typeForValue(inParam.value, this._currentScope), ptype);
            in_argmap[inParam.name] = reg;
        }

        return decl.args.map((arg) => in_argmap[arg]);
    }

    _compileInvokeGenericVarRef(op) {
        let decl = this._currentScope.get(op.name);
        assert(decl.type !== 'scalar');
        let fnreg;
        if (decl.register !== null) {
            fnreg = decl.register;
        } else {
            fnreg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetScope(op.name, fnreg));
        }

        let args = this._compileVarRefInputParams(decl, op.in_params);
        let iterator = this._irBuilder.allocRegister();
        // both stream and query invoke as stream, because of the lazy evaluation of query
        this._irBuilder.add(new JSIr.InvokeStreamVarRef(fnreg, iterator, args));

        let result = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(result, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);
        this._setInvocationOutputs(decl.schema, null, result);
    }

    _compileInvokeTableVarRef(tableop) {
        let decl = this._currentScope.get(tableop.name);
        assert(decl.type !== 'scalar');

        if (decl.type === 'declaration') {
            let tryCatch = new JSIr.TryCatch("Failed to invoke query");
            this._irBuilder.add(tryCatch);
            this._irBuilder.pushBlock(tryCatch.try);

            this._compileInvokeGenericVarRef(tableop);
        } else {
            // assignment

            let list;
            if (decl.isPersistent) {
                list = this._irBuilder.allocRegister();
                this._irBuilder.add(new JSIr.InvokeReadState(list, decl.register));
            } else {
                list = decl.register;
            }

            let result = this._compileIterateQuery(list);
            this._setInvocationOutputs(decl.schema, null, result);
        }
    }

    _compileInvokeStreamVarRef(streamop) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke stream");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        this._compileInvokeGenericVarRef(streamop);
    }

    _compileInvokeActionVarRef(action) {
        let decl = this._currentScope.get(action.name);
        assert(decl.type === 'declaration' || decl.type === 'procedure');
        let fnreg;
        if (decl.register !== null) {
            fnreg = decl.register;
        } else {
            fnreg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetScope(action.name, fnreg));
        }

        let args = this._compileVarRefInputParams(decl, action.in_params);
        this._irBuilder.add(new JSIr.InvokeActionVarRef(fnreg, args));
    }

    _compileInvokeOutput(action) {
        if (action.invocation.channel === 'return')
                throw new TypeError('return must be lowered before execution, use Generate.lowerReturn');
        assert(action.invocation.channel === 'notify');

        this._irBuilder.add(new JSIr.InvokeOutput(getRegister('$outputType', this._currentScope), getRegister('$output', this._currentScope)));
    }

    _compileInvokeAction(action) {
        let [kind, attrs, fname] = this._compileTpFunctionCall(action.invocation);
        let [,args] = this._compileInputParams(action.invocation);
        this._irBuilder.add(new JSIr.InvokeAction(kind, attrs, fname, args));
    }

    _compileAction(ast) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke action");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        if (ast.isVarRef)
            this._compileInvokeActionVarRef(ast);
        else if (ast.invocation.selector.isBuiltin)
            this._compileInvokeOutput(ast);
        else
            this._compileInvokeAction(ast);

        this._irBuilder.popBlock();
    }

    _compileStreamFilter(streamop) {
        this._compileStream(streamop.stream);

        let filter = this._compileFilter(streamop.filter, this._currentScope);

        let ifStmt = new JSIr.IfStatement(filter);
        this._irBuilder.add(ifStmt);
        this._irBuilder.pushBlock(ifStmt.iftrue);
    }

    _compileTableFilter(tableop) {
        this._compileTable(tableop.table);

        let filter = this._compileFilter(tableop.filter, this._currentScope);

        let ifStmt = new JSIr.IfStatement(filter);
        this._irBuilder.add(ifStmt);
        this._irBuilder.pushBlock(ifStmt.iftrue);
    }

    _compileProjection(proj) {
        let newScope = new Scope(this._globalScope);

        for (let name of proj.args)
            newScope.set(this._currentScope.get(name));

        newScope.set('$outputType', this._currentScope.get('$outputType'));
        newScope.set('$output', this._currentScope.get('$output'));

        this._currentScope = newScope;
        this._varScopeNames = proj.args;
    }

    _compileCompute(compute) {
        const computeresult = this._compileScalarExpression(compute.expression, this._currentScope);
        const type = compute.expression.type;

        this._irBuilder.add(new JSIr.SetKey(getRegister('$output', this._currentScope),
            compute.alias, computeresult));

        this._currentScope.set(compute.alias, {
            type: 'scalar',
            reg: computeresult,
            tt_type: type,
            isInVarScopeNames: false
        });
    }

    _compileStreamMap(streamop) {
        this._compileStream(streamop.stream);

        if (streamop.op.isProjection)
            this._compileProjection(streamop.op);
        else if (streamop.op.isCompute)
            this._compileCompute(streamop.op);
        else
            throw new TypeError();
    }

    _compileTableMap(tableop) {
        this._compileTable(tableop.table);

        if (tableop.op.isProjection)
            this._compileProjection(tableop.op);
        else if (tableop.op.isCompute)
            this._compileCompute(tableop.op);
        else
            throw new TypeError();
    }

    _compileTableReduce(tableop) {
        const state = tableop.op.init(this._irBuilder, this._currentScope);

        const here = this._irBuilder.saveStackState();

        this._compileTable(tableop.table);
        tableop.op.advance(state, this._irBuilder, this._currentScope, this._varScopeNames);

        this._irBuilder.popTo(here);

        [this._currentScope, this._varScopeNames] =
            tableop.op.finish(state, this._irBuilder, this._currentScope, this._varScopeNames);
    }

    _compileStreamEdgeNew(streamop) {
        let state = this._irBuilder.allocRegister();
        let stateId = this._allocState();

        this._irBuilder.add(new JSIr.InvokeReadState(state, stateId));

        this._compileStream(streamop.stream);

        let isNewTuple = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.CheckIsNewTuple(isNewTuple, state, getRegister('$output', this._currentScope),
                            this._varScopeNames));

        let newState = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.AddTupleToState(newState, state, getRegister('$output', this._currentScope)));

        this._irBuilder.add(new JSIr.InvokeWriteState(newState, stateId));
        this._irBuilder.add(new JSIr.Copy(newState, state));

        let ifStmt = new JSIr.IfStatement(isNewTuple);
        this._irBuilder.add(ifStmt);
        this._irBuilder.pushBlock(ifStmt.iftrue);
    }

    _compileStreamEdgeFilter(streamop) {
        let stateId = this._allocState();

        this._compileStream(streamop.stream);

        let state = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.InvokeReadState(state, stateId));

        let filter = this._compileFilter(streamop.filter, this._currentScope);

        // only write the new state if different from the old one (to avoid
        // repeated writes)
        let different = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.BinaryOp(filter, state, '!==', different));
        let ifDifferent = new JSIr.IfStatement(different);
        this._irBuilder.add(ifDifferent);
        this._irBuilder.pushBlock(ifDifferent.iftrue);
        this._irBuilder.add(new JSIr.InvokeWriteState(filter, stateId));
        this._irBuilder.popBlock();

        // negate the state, then and it to the filter to compute whether the rule
        // should fire or not
        this._irBuilder.add(new JSIr.UnaryOp(state, '!', state));
        this._irBuilder.add(new JSIr.BinaryOp(filter, state, '&&', filter));

        let ifStmt = new JSIr.IfStatement(filter);
        this._irBuilder.add(ifStmt);
        this._irBuilder.pushBlock(ifStmt.iftrue);
    }

    _readTypeResult(typeAndResult) {
        let outputType, result;
        outputType = this._irBuilder.allocRegister();
        result = this._irBuilder.allocRegister();

        this._irBuilder.add(new JSIr.GetIndex(typeAndResult, 0, outputType));
        this._irBuilder.add(new JSIr.GetIndex(typeAndResult, 1, result));

        return [outputType, result];
    }

    _mergeResults(lhsScope, rhsScope) {
        let newOutputType;
        const lhsOutputType = getRegister('$outputType', lhsScope);
        const rhsOutputType = getRegister('$outputType', rhsScope);

        if (lhsOutputType !== null && rhsOutputType !== null) {
            newOutputType = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.BinaryFunctionOp(lhsOutputType, rhsOutputType, 'combineOutputTypes', newOutputType));
        } else if (lhsOutputType !== null) {
            newOutputType = lhsOutputType;
        } else if (rhsOutputType !== null) {
            newOutputType = rhsOutputType;
        } else {
            newOutputType = null;
        }

        let newResult = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.CreateObject(newResult));

        for (let outParam of rhsScope.ownKeys()) {
            if (outParam.startsWith('$'))
                continue;
            this._irBuilder.add(new JSIr.SetKey(newResult, outParam, getRegister(outParam, rhsScope)));
        }
        for (let outParam of lhsScope.ownKeys()) {
            if (outParam.startsWith('$') || rhsScope.hasOwnKey(outParam))
                continue;
            this._irBuilder.add(new JSIr.SetKey(newResult, outParam, getRegister(outParam, lhsScope)));
        }

        return [newOutputType, newResult];
    }

    _mergeScopes(lhsScope, rhsScope, outputType, result) {
        this._currentScope = new Scope(this._globalScope);
        this._currentScope.set('$outputType', {
            type: 'scalar',
            tt_type: null,
            register: outputType
        });
        this._currentScope.set('$output', {
            type: 'scalar',
            tt_type: null,
            register: result
        });
        this._varScopeNames = [];

        for (let outParam of rhsScope.ownKeys()) {
            if (outParam.startsWith('$'))
                continue;
            let reg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetKey(result, outParam, reg));

            const currentScopeObj = rhsScope.get(outParam);
            this._currentScope.set(outParam, {
                type: 'scalar',
                tt_type: currentScopeObj.tt_type,
                register: reg,
                isInVarScopeNames: currentScopeObj.isInVarScopeNames
            });
            if (currentScopeObj.isInVarScopeNames)
                this._varScopeNames.push(outParam);
        }
        for (let outParam of lhsScope.ownKeys()) {
            if (outParam.startsWith('$'))
                continue;
            if (rhsScope.hasOwnKey(outParam))
                continue;
            let reg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetKey(result, outParam, reg));
            const currentScopeObj = lhsScope.get(outParam);
            this._currentScope.set(outParam, {
                type: 'scalar',
                tt_type: currentScopeObj.tt_type,
                register: reg,
                isInVarScopeNames: currentScopeObj.isInVarScopeNames
            });
            if (currentScopeObj.isInVarScopeNames)
                this._varScopeNames.push(outParam);
        }
    }

    _compileStreamUnion(streamop) {
        // compile the two streams to two generator expressions, and then pass
        // them to a builtin which will do the right thing

        let lhs = this._irBuilder.allocRegister();
        let lhsbody = new JSIr.AsyncFunctionExpression(lhs);
        this._irBuilder.add(lhsbody);
        let upto = this._irBuilder.pushBlock(lhsbody.body);

        this._compileStream(streamop.lhs);
        this._irBuilder.add(new JSIr.InvokeEmit(getRegister('$outputType', this._currentScope), getRegister('$output', this._currentScope)));

        let lhsScope = this._currentScope;
        this._irBuilder.popTo(upto);

        let rhs = this._irBuilder.allocRegister();
        let rhsbody = new JSIr.AsyncFunctionExpression(rhs);

        this._irBuilder.add(rhsbody);
        upto = this._irBuilder.pushBlock(rhsbody.body);

        this._compileStream(streamop.rhs);
        this._irBuilder.add(new JSIr.InvokeEmit(getRegister('$outputType', this._currentScope), getRegister('$output', this._currentScope)));

        let rhsScope = this._currentScope;
        this._irBuilder.popTo(upto);

        let iterator = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.BinaryFunctionOp(lhs, rhs, 'streamUnion', iterator));

        let typeAndResult = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(typeAndResult, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        let [outputType, result] = this._readTypeResult(typeAndResult);
        this._mergeScopes(lhsScope, rhsScope, outputType, result);
    }

    _compileStreamJoin(streamop) {
        if (streamop.stream.isNow) {
            this._compileTable(streamop.table);
            return;
        }

        this._compileStream(streamop.stream);

        let streamScope = this._currentScope;

        this._compileTable(streamop.table);

        let tableScope = this._currentScope;

        let [outputType, result] = this._mergeResults(streamScope, tableScope);
        this._mergeScopes(streamScope, tableScope, outputType, result);
    }

    _compileStreamInvokeTable(streamop) {
        let state = this._irBuilder.allocRegister();
        let stateId = this._allocState();

        this._irBuilder.add(new JSIr.InvokeReadState(state, stateId));

        this._compileStream(streamop.stream);

        let timestamp = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.GetKey(getRegister('$output', this._currentScope), '__timestamp', timestamp));

        let isOldTimestamp = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.BinaryOp(timestamp, state, '<=', isOldTimestamp));

        let isNewTimestamp = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.UnaryOp(isOldTimestamp, '!', isNewTimestamp));

        let ifStmt = new JSIr.IfStatement(isNewTimestamp);
        this._irBuilder.add(ifStmt);
        this._irBuilder.pushBlock(ifStmt.iftrue);

        this._irBuilder.add(new JSIr.InvokeWriteState(timestamp, stateId));
        this._irBuilder.add(new JSIr.Copy(timestamp, state));

        // compileTable will discard the currentScope here
        this._compileTable(streamop.table);
    }

    _compileStream(streamop) {
        if (streamop.isNow)
            return;

        if (streamop.isInvokeVarRef)
            this._compileInvokeStreamVarRef(streamop);
        else if (streamop.isInvokeSubscribe)
            this._compileInvokeSubscribe(streamop);
        else if (streamop.isInvokeTable)
            this._compileStreamInvokeTable(streamop);
        else if (streamop.isTimer)
            this._compileTimer(streamop);
        else if (streamop.isAtTimer)
            this._compileAtTimer(streamop);
        else if (streamop.isFilter)
            this._compileStreamFilter(streamop);
        else if (streamop.isMap)
            this._compileStreamMap(streamop);
        else if (streamop.isEdgeNew)
            this._compileStreamEdgeNew(streamop);
        else if (streamop.isEdgeFilter)
            this._compileStreamEdgeFilter(streamop);
        else if (streamop.isUnion)
            this._compileStreamUnion(streamop);
        else if (streamop.isJoin)
            this._compileStreamJoin(streamop);
        else
            throw new TypeError();
    }

    _compileTableCrossJoin(tableop) {
        // compile the two tables to two generator expressions, and then pass
        // them to a builtin which will compute the cross join

        let lhs = this._irBuilder.allocRegister();
        let lhsbody = new JSIr.AsyncFunctionExpression(lhs);
        this._irBuilder.add(lhsbody);
        let upto = this._irBuilder.pushBlock(lhsbody.body);

        this._compileTable(tableop.lhs);
        this._irBuilder.add(new JSIr.InvokeEmit(getRegister('$outputType', this._currentScope), getRegister('$output', this._currentScope)));

        let lhsScope = this._currentScope;
        this._irBuilder.popTo(upto);

        let rhs = this._irBuilder.allocRegister();
        let rhsbody = new JSIr.AsyncFunctionExpression(rhs);

        this._irBuilder.add(rhsbody);
        upto = this._irBuilder.pushBlock(rhsbody.body);

        this._compileTable(tableop.rhs);
        this._irBuilder.add(new JSIr.InvokeEmit(getRegister('$outputType', this._currentScope), getRegister('$output', this._currentScope)));

        let rhsScope = this._currentScope;
        this._irBuilder.popTo(upto);

        let iterator = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.BinaryFunctionOp(lhs, rhs, 'tableCrossJoin', iterator));

        let typeAndResult = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(typeAndResult, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        let [outputType, result] = this._readTypeResult(typeAndResult);
        this._mergeScopes(lhsScope, rhsScope, outputType, result);
    }

    _compileTableNestedLoopJoin(tableop) {
        this._compileTable(tableop.lhs);

        let lhsScope = this._currentScope;

        this._compileTable(tableop.rhs);

        let rhsScope = this._currentScope;

        let [outputType, result] = this._mergeResults(lhsScope, rhsScope);
        this._mergeScopes(lhsScope, rhsScope, outputType, result);
    }

    _compileDatabaseQuery(tableop) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke query");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let kind = tableop.device.kind;
        let attrs = tableop.device.id ? { id: tableop.device.id } : {};
        let list = this._irBuilder.allocRegister();
        let query = new Ast.Input.Program(
            null /* location */,
            [],
            [],
            [new Ast.Statement.Command(null, tableop.ast, [notifyAction()])],
            null,
            []
        );
        const astId = this._compiler._allocAst(query);
        const astReg = this._irBuilder.allocRegister();

        this._irBuilder.add(new JSIr.GetASTObject(astId, astReg));
        this._irBuilder.add(new JSIr.InvokeDBQuery(kind, attrs, list, astReg));

        let result = this._compileIterateQuery(list);
        this._setInvocationOutputs(tableop.ast.schema, {}, result);
    }

    _compileTable(tableop) {
        if (tableop.handle_thingtalk)
            this._compileDatabaseQuery(tableop);
        else if (tableop.isInvokeVarRef)
            this._compileInvokeTableVarRef(tableop);
        else if (tableop.isReadResult)
            this._compileReadResult(tableop);
        else if (tableop.isInvokeGet)
            this._compileInvokeGet(tableop);
        else if (tableop.isFilter)
            this._compileTableFilter(tableop);
        else if (tableop.isMap)
            this._compileTableMap(tableop);
        else if (tableop.isReduce)
            this._compileTableReduce(tableop);
        else if (tableop.isCrossJoin)
            this._compileTableCrossJoin(tableop);
        else if (tableop.isNestedLoopJoin)
            this._compileTableNestedLoopJoin(tableop);
        else
            throw new TypeError();
    }

    _compileEndOfFlow(action) {
        if (!action.isInvocation || !action.invocation.selector.isDevice || !isRemoteSend(action.invocation))
            return;

        let tryCatch = new JSIr.TryCatch("Failed to signal end-of-flow");

        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let principal, flow;
        for (let inParam of action.invocation.in_params) {
            if (inParam.name !== '__principal' && inParam.name !== '__flow')
                continue;
            let reg = compileValue(this._irBuilder, inParam.value, this._currentScope);
            if (inParam.name === '__flow')
                flow = reg;
            else
                principal = reg;
        }
        this._irBuilder.add(new JSIr.SendEndOfFlow(principal, flow));

        this._irBuilder.popBlock();
    }

    compileStatement(ruleop) {
        this._compileStream(ruleop.stream);
        for (let action of ruleop.actions)
            this._compileAction(action);

        this._irBuilder.popAll();

        for (let action of ruleop.actions)
            this._compileEndOfFlow(action);
    }

    compileStreamDeclaration(streamop) {
        this._compileStream(streamop);
        this._irBuilder.add(new JSIr.InvokeEmit(getRegister('$outputType', this._currentScope), getRegister('$output', this._currentScope)));

        this._irBuilder.popAll();
    }

    compileQueryDeclaration(tableop) {
        this._compileTable(tableop);
        this._irBuilder.add(new JSIr.InvokeEmit(getRegister('$outputType', this._currentScope), getRegister('$output', this._currentScope)));

        this._irBuilder.popAll();
    }

    compileActionDeclaration(action) {
        this._compileAction(action);
        this._irBuilder.popAll();
    }

    compileAssignment(tableop, isPersistent) {
        let register = this._irBuilder.allocRegister();
        let stateId;
        this._irBuilder.add(new JSIr.CreateTuple(0, register));

        this._compileTable(tableop);
        let resultAndTypeTuple = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.CreateTuple(2, resultAndTypeTuple));
        this._irBuilder.add(new JSIr.SetIndex(resultAndTypeTuple, 0, getRegister('$outputType', this._currentScope)));
        this._irBuilder.add(new JSIr.SetIndex(resultAndTypeTuple, 1, getRegister('$output', this._currentScope)));

        this._irBuilder.add(new JSIr.UnaryMethodOp(register, resultAndTypeTuple, 'push'));

        this._irBuilder.popAll();

        if (isPersistent) {
            stateId = this._allocState();
            this._irBuilder.add(new JSIr.InvokeWriteState(register, stateId));
            return stateId;
        } else {
            return register;
        }
    }
};
