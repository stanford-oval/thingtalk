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
const { NotImplementedError } = require('../errors');

const JSIr = require('./jsir');
const { Invocation } = require('./output');

function compileEvent(irBuilder, varScope, name) {
    let reg;
    if (name === 'type') {
        return varScope.$outputType;
    } else if (name === 'program_id') {
        reg = irBuilder.allocRegister();
        irBuilder.add(new JSIr.GetEnvironment('program_id', reg));
    } else {
        let hint = name ? 'string-' + name : 'string';
        reg = irBuilder.allocRegister();
        irBuilder.add(new JSIr.FormatEvent(hint, varScope.$outputType, varScope.$output, reg));
    }
    return reg;
}

function typeForValue(ast, scope) {
    if (ast.isVarRef)
        return scope[ast.name];
    else
        return ast.getType();
}

function compileValue(irBuilder, ast, varScope) {
    if (ast.isUndefined)
        throw new Error('Invalid undefined value, should have been slot-filled');
    if (ast.isEvent)
        return compileEvent(irBuilder, varScope, ast.name);
    if (ast.isVarRef)
        return varScope[ast.name];

    let reg = irBuilder.allocRegister();
    irBuilder.add(new JSIr.LoadConstant(ast, reg));
    return reg;
}

function compileBinaryOp(irBuilder, op, lhs, rhs, into) {
    let binaryOp = Builtin.BinaryOps[op];
    if (binaryOp.op)
        irBuilder.add(new JSIr.BinaryOp(lhs, rhs, binaryOp.op, into));
    else if (binaryOp.flip)
        irBuilder.add(new JSIr.BinaryFunctionOp(rhs, lhs, binaryOp.fn, into));
    else
        irBuilder.add(new JSIr.BinaryFunctionOp(lhs, rhs, binaryOp.fn, into));
}

function compileUnaryOp(irBuilder, op, arg, into) {
    let unaryOp = Builtin.UnaryOps[op];
    if (unaryOp.op)
        irBuilder.add(new JSIr.UnaryOp(arg, unaryOp.op, into));
    else
        irBuilder.add(new JSIr.UnaryOp(arg, '__builtin.' + unaryOp.fn, into));
}

function compileCast(irBuilder, reg, type, toType) {
    if (type.equals(toType)) {
        if (type.isEntity && (type.type === 'tt:hashtag' || type.type === 'tt:username' || type.type === 'tt:picture')) {
            // for compatibility with the ton of devices that take inputs of these types, we auto-cast to string,
            // this is ok because these types don't really need .display that much
            let casted = irBuilder.allocRegister();
            irBuilder.add(new JSIr.UnaryOp(reg, 'String', casted));
            return casted;
        }
        return reg;
    }

    if (toType.isString) {
        let casted = irBuilder.allocRegister();
        irBuilder.add(new JSIr.UnaryOp(reg, 'String', casted));
        return casted;
    }

    if (type.isDate && toType.isTime) {
        let casted = irBuilder.allocRegister();
        compileUnaryOp(irBuilder, 'get_time', reg, casted);
        return casted;
    }

    return reg;
}

function isRemoteSend(fn) {
    return (fn.selector.kind === 'org.thingpedia.builtin.thingengine.remote' || fn.selector.kind.startsWith('__dyn_')) &&
        fn.channel === 'send';
}

module.exports = class OpCompiler {
    constructor(irBuilder) {
        this._irBuilder = irBuilder;

        this._functions = [];
        this._nextFunction = 0;

        this._currentStateId = null;
        this._nextStateVar = 0;

        this._typeScope = {};
        this._varScope = {};
        this._varScopeNames = [];
        this._versions = {};
        this._retryLoopLabel = undefined;
    }

    _allocFunction(ast, type) {
        let id = this._nextFunction++;

        if (!ast.__effectiveSelector) {
            // __effectiveSelector is used to turn dynamically declared classes for @remote
            // into just @remote
            console.error('WARNING: TypeCheck must set __effectiveSelector');
            ast.__effectiveSelector = ast.selector;
        }
        this._functions[id] = new Invocation(ast.__effectiveSelector, ast.channel, type);
        return id;
    }

    _allocState() {
        return this._nextStateVar++;
    }

    _compileOneInputParam(args, ast, inParam) {
        let reg = compileValue(this._irBuilder, inParam.value, this._varScope);
        let ptype = ast.schema.inReq[inParam.name] || ast.schema.inOpt[inParam.name];
        reg = compileCast(this._irBuilder, reg, typeForValue(inParam.value, this._typeScope), ptype);
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

    _compileFilter(ast, varScope, typeScope) {
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
                let fnid = this._allocFunction(ast, 'query');
                let list = this._irBuilder.allocRegister();
                let [argmap, args] = this._compileInputParams(expr);
                this._irBuilder.add(new JSIr.InvokeQuery(fnid, list, args));

                let typeAndResult = this._compileIterateQuery(list);
                let [, result] = this._readTypeResult(typeAndResult);

                let nestedTypeScope = {};
                let nestedVarScope = {};
                for (let name in argmap) {
                    nestedTypeScope[name] = expr.schema.inReq[name] || expr.schema.inOpt[name];
                    nestedVarScope[name] = argmap[name];
                }
                for (let outParam in expr.schema.out) {
                    let reg = this._irBuilder.allocRegister();
                    this._irBuilder.add(new JSIr.GetKey(result, outParam, reg));
                    nestedTypeScope[outParam] = expr.schema.out[outParam];
                    nestedVarScope[outParam] = reg;
                }
                let ok = this._compileFilter(expr.filter, nestedVarScope, nestedTypeScope);
                let ifStmt = new JSIr.IfStatement(ok);
                this._irBuilder.add(ifStmt);
                this._irBuilder.pushBlock(ifStmt.iftrue);
                this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), cond));
                this._irBuilder.add(new JSIr.Break());
                this._irBuilder.popBlock();

                this._irBuilder.popBlock(); // for-of
                this._irBuilder.popBlock(); // try-catch
            } else {
                let op = expr.operator;
                let lhsType = typeScope[expr.name];
                let lhs = varScope[expr.name];
                lhs = compileCast(this._irBuilder, lhs, lhsType, expr.overload[0]);
                let rhs = compileValue(this._irBuilder, expr.value, varScope);
                rhs = compileCast(this._irBuilder, rhs, typeForValue(expr.value, typeScope), expr.overload[1]);
                compileBinaryOp(this._irBuilder, op, lhs, rhs, cond);
                cond = compileCast(this._irBuilder, cond, expr.overload[2], Type.Boolean);
            }
            return cond;
        }).call(this, ast);
    }

    _setInvocationOutputs(invocation, argmap, typeAndResult) {
        let [outputType, result] = this._readTypeResult(typeAndResult);

        this._typeScope = {};
        this._varScope = {};
        this._varScopeNames = [];
        this._varScope.$outputType = outputType;
        this._varScope.$output = result;

        for (let arg in argmap) {
            this._typeScope[arg] = invocation.schema.inReq[arg] || invocation.schema.inOpt[arg];
            this._varScope[arg] = argmap[arg];
            this._varScopeNames.push(arg);
        }
        for (let outParam in invocation.schema.inOpt) {
            if (outParam in argmap)
                continue;
            let reg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetKey(result, outParam, reg));
            this._typeScope[outParam] = invocation.schema.inOpt[outParam];
            this._varScope[outParam] = reg;
            this._varScopeNames.push(outParam);
        }

        for (let outParam in invocation.schema.out) {
            let reg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetKey(result, outParam, reg));
            this._typeScope[outParam] = invocation.schema.out[outParam];
            this._varScope[outParam] = reg;
            this._varScopeNames.push(outParam);
        }
    }

    _compileInvokeSubscribe(streamop) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke trigger");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let fnid = this._allocFunction(streamop.invocation, 'trigger');
        let [argmap, argmapreg] = this._compileInputParams(streamop.invocation);

        let iterator = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.InvokeMonitor(fnid, iterator, argmapreg, false));

        let result = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(result, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        this._setInvocationOutputs(streamop.invocation, argmap, result);
    }

    _compileTimer(streamop) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke timer");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let iterator = this._irBuilder.allocRegister();
        let base = compileValue(this._irBuilder, streamop.base, this._varScope);
        let interval = compileValue(this._irBuilder, streamop.interval, this._varScope);

        this._irBuilder.add(new JSIr.InvokeTimer(iterator, base, interval));

        let result = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(result, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        this._typeScope = {};
        this._varScope = {};
        this._varScope.$outputType = null;
        this._varScope.$output = result;
    }

    _compileAtTimer(ast) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke at-timer");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let iterator = this._irBuilder.allocRegister();
        let time = compileValue(this._irBuilder, ast.time, this._varScope);

        this._irBuilder.add(new JSIr.InvokeAtTimer(iterator, time));

        let result = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(result, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        this._typeScope = {};
        this._varScope = {};
        this._varScope.$outputType = null;
        this._varScope.$output = result;
    }

    _compileInvokeGet(tableop) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke query");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let fnid = this._allocFunction(tableop.invocation, 'query');
        let [argmap, argmapreg] = this._compileInputParams(tableop.invocation, tableop.extra_in_params);
        let list = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.InvokeQuery(fnid, list, argmapreg));

        let result = this._compileIterateQuery(list);
        this._setInvocationOutputs(tableop.invocation, argmap, result);
    }

    _compileAction(ast) {
        if (ast.isVarRef)
            throw new NotImplementedError(ast);

        let tryCatch = new JSIr.TryCatch("Failed to invoke action");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        if (ast.invocation.selector.isBuiltin) {
            if (ast.invocation.channel === 'return')
                throw new TypeError('return must be lowered before execution, use Generate.lowerReturn');
            assert(ast.invocation.channel === 'notify');

            this._irBuilder.add(new JSIr.InvokeOutput(this._varScope.$outputType, this._varScope.$output));
        } else {
            let fnid = this._allocFunction(ast.invocation, 'action');
            let [,args] = this._compileInputParams(ast.invocation);
            this._irBuilder.add(new JSIr.InvokeAction(fnid, args));
        }

        this._irBuilder.popBlock();
    }

    _compileStreamFilter(streamop) {
        this._compileStream(streamop.stream);

        let filter = this._compileFilter(streamop.filter, this._varScope,
            this._typeScope);

        let ifStmt = new JSIr.IfStatement(filter);
        this._irBuilder.add(ifStmt);
        this._irBuilder.pushBlock(ifStmt.iftrue);
    }

    _compileTableFilter(tableop) {
        this._compileTable(tableop.table);

        let filter = this._compileFilter(tableop.filter, this._varScope,
            this._typeScope);

        let ifStmt = new JSIr.IfStatement(filter);
        this._irBuilder.add(ifStmt);
        this._irBuilder.pushBlock(ifStmt.iftrue);
    }

    _compileProjection(proj) {
        let newTypeScope = {};
        let newVarScope = {};

        for (let name of proj.args) {
            newTypeScope[name] = this._typeScope[name];
            newVarScope[name] = this._varScope[name];
        }

        newVarScope.$outputType = this._varScope.$outputType;
        newVarScope.$output = this._varScope.$output;

        this._typeScope = newTypeScope;
        this._varScope = newVarScope;
        this._varScopeNames = proj.args;
    }

    _compileCompute(compute) {
        throw new NotImplementedError(compute);
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
        const state = tableop.op.init(this._irBuilder);

        const here = this._irBuilder.saveStackState();

        this._compileTable(tableop.table);
        tableop.op.advance(state, this._irBuilder, this._varScope, this._typeScope);

        this._irBuilder.popTo(here);

        [this._varScope, this._typeScope, this._varScopeNames] =
            tableop.op.finish(state, this._irBuilder, this._varScope, this._typeScope);
    }

    _compileStreamEdgeNew(streamop) {
        let state = this._irBuilder.allocRegister();
        let stateId = this._allocState();

        this._irBuilder.add(new JSIr.InvokeReadState(state, stateId));

        this._compileStream(streamop.stream);

        let isNewTuple = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.CheckIsNewTuple(isNewTuple, state, this._varScope.$output,
                            this._varScopeNames));

        let newState = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.AddTupleToState(newState, state, this._varScope.$output));

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

        let filter = this._compileFilter(streamop.filter, this._varScope,
            this._typeScope);

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

    _mergeResults(lhsVarScope, rhsVarScope) {
        let newOutputType;
        if (lhsVarScope.$outputType !== null && rhsVarScope.$outputType !== null) {
            newOutputType = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.BinaryFunctionOp(lhsVarScope.$outputType, rhsVarScope.$outputType, 'combineOutputTypes', newOutputType));
        } else if (lhsVarScope.$outputType !== null) {
            newOutputType = lhsVarScope.$outputType;
        } else if (rhsVarScope.$outputType !== null) {
            newOutputType = rhsVarScope.$outputType;
        } else {
            newOutputType = null;
        }

        let newResult = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.CreateObject(newResult));

        for (let outParam in rhsVarScope) {
            if (outParam.startsWith('$'))
                continue;
            this._irBuilder.add(new JSIr.SetKey(newResult, outParam, rhsVarScope[outParam]));
        }
        for (let outParam in lhsVarScope) {
            if (outParam.startsWith('$') || rhsVarScope[outParam])
                continue;
            this._irBuilder.add(new JSIr.SetKey(newResult, outParam, lhsVarScope[outParam]));
        }

        return [newOutputType, newResult];
    }

    _mergeScopes(lhsTypeScope, rhsTypeScope, outputType, result) {
        this._typeScope = {};
        this._varScope = {};
        this._varScopeNames = [];
        this._varScope.$outputType = outputType;
        this._varScope.$output = result;

        for (let outParam in rhsTypeScope) {
            this._typeScope[outParam] = rhsTypeScope[outParam];
            let reg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetKey(result, outParam, reg));
            this._varScope[outParam] = reg;
            this._varScopeNames.push(outParam);
        }
        for (let outParam in lhsTypeScope) {
            if (this._typeScope[outParam])
                continue;
            this._typeScope[outParam] = lhsTypeScope[outParam];
            let reg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetKey(result, outParam, reg));
            this._varScope[outParam] = reg;
            this._varScopeNames.push(outParam);
        }
    }

    _compileStreamUnion(streamop) {
        // compile the two streams to two generator expressions, and then pass
        // them to a builtin which will to the right thing

        let lhs = this._irBuilder.allocRegister();
        let lhsbody = new JSIr.AsyncFunctionExpression(lhs);
        this._irBuilder.add(lhsbody);
        let upto = this._irBuilder.pushBlock(lhsbody.body);

        this._compileStream(streamop.lhs);
        this._irBuilder.add(new JSIr.InvokeEmit(this._varScope.$outputType, this._varScope.$output));

        let lhsTypeScope = this._typeScope;
        this._irBuilder.popTo(upto);

        let rhs = this._irBuilder.allocRegister();
        let rhsbody = new JSIr.AsyncFunctionExpression(rhs);

        this._irBuilder.add(rhsbody);
        upto = this._irBuilder.pushBlock(rhsbody.body);

        this._compileStream(streamop.rhs);
        this._irBuilder.add(new JSIr.InvokeEmit(this._varScope.$outputType, this._varScope.$output));

        let rhsTypeScope = this._typeScope;
        this._irBuilder.popTo(upto);

        let iterator = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.BinaryFunctionOp(lhs, rhs, 'streamUnion', iterator));

        let typeAndResult = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(typeAndResult, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        let [outputType, result] = this._readTypeResult(typeAndResult);
        this._mergeScopes(lhsTypeScope, rhsTypeScope, outputType, result);
    }

    _compileStreamJoin(streamop) {
        if (streamop.stream.isNow) {
            this._compileTable(streamop.table);
            return;
        }

        this._compileStream(streamop.stream);

        let streamVarScope = this._varScope;
        let streamTypeScope = this._typeScope;

        this._compileTable(streamop.table);

        let tableVarScope = this._varScope;
        let tableTypeScope = this._typeScope;

        let [outputType, result] = this._mergeResults(streamVarScope, tableVarScope);
        this._mergeScopes(streamTypeScope, tableTypeScope, outputType, result);
    }

    _compileStreamInvokeTable(streamop) {
        let state = this._irBuilder.allocRegister();
        let stateId = this._allocState();

        this._irBuilder.add(new JSIr.InvokeReadState(state, stateId));

        this._compileStream(streamop.stream);

        let timestamp = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.GetKey(this._varScope.$output, '__timestamp', timestamp));

        let isOldTimestamp = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.BinaryOp(timestamp, state, '<=', isOldTimestamp));

        let isNewTimestamp = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.UnaryOp(isOldTimestamp, '!', isNewTimestamp));

        let ifStmt = new JSIr.IfStatement(isNewTimestamp);
        this._irBuilder.add(ifStmt);
        this._irBuilder.pushBlock(ifStmt.iftrue);

        this._irBuilder.add(new JSIr.InvokeWriteState(timestamp, stateId));
        this._irBuilder.add(new JSIr.Copy(timestamp, state));

        // compileTable will discard the varScope/typeScope here
        this._compileTable(streamop.table);
    }

    _compileStream(streamop) {
        if (streamop.isNow)
            return;

        if (streamop.isInvokeSubscribe)
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
        this._irBuilder.add(new JSIr.InvokeEmit(this._varScope.$outputType, this._varScope.$output));

        let lhsTypeScope = this._typeScope;
        this._irBuilder.popTo(upto);

        let rhs = this._irBuilder.allocRegister();
        let rhsbody = new JSIr.AsyncFunctionExpression(rhs);

        this._irBuilder.add(rhsbody);
        upto = this._irBuilder.pushBlock(rhsbody.body);

        this._compileTable(tableop.rhs);
        this._irBuilder.add(new JSIr.InvokeEmit(this._varScope.$outputType, this._varScope.$output));

        let rhsTypeScope = this._typeScope;
        this._irBuilder.popTo(upto);

        let iterator = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.BinaryFunctionOp(lhs, rhs, 'tableCrossJoin', iterator));

        let typeAndResult = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(typeAndResult, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        let [outputType, result] = this._readTypeResult(typeAndResult);
        this._mergeScopes(lhsTypeScope, rhsTypeScope, outputType, result);
    }

    _compileTableNestedLoopJoin(tableop) {
        this._compileTable(tableop.lhs);

        let lhsVarScope = this._varScope;
        let lhsTypeScope = this._typeScope;

        this._compileTable(tableop.rhs);

        let rhsVarScope = this._varScope;
        let rhsTypeScope = this._typeScope;

        let [outputType, result] = this._mergeResults(lhsVarScope, rhsVarScope);
        this._mergeScopes(lhsTypeScope, rhsTypeScope, outputType, result);
    }

    _compileTable(tableop) {
        if (tableop.isInvokeGet)
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
            let reg = compileValue(this._irBuilder, inParam.value, this._varScope);
            if (inParam.name === '__flow')
                flow = reg;
            else
                principal = reg;
        }
        this._irBuilder.add(new JSIr.SendEndOfFlow(principal, flow));

        this._irBuilder.popBlock();
    }

    compile(ruleop) {
        if (ruleop.stream)
            this._compileStream(ruleop.stream);

        for (let action of ruleop.actions)
            this._compileAction(action);

        this._irBuilder.popAll();

        for (let action of ruleop.actions)
            this._compileEndOfFlow(action);

        return [this._functions, this._nextStateVar];
    }
};
