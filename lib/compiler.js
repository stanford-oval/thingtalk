// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const adt = require('adt');

const Ast = require('./ast');
const Grammar = require('./grammar');
const Type = require('./type');
const JSIr = require('./jsir');
const Builtin = require('./builtin');
const { typeCheckProgram } = require('./typecheck');

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

class Invocation {
    constructor(selector, channel, type) {
        this.selector = selector;
        this.channel = channel;
        this.type = type;
    }
}

function isRemoteSend(fn) {
    return (fn.selector.kind === 'org.thingpedia.builtin.thingengine.remote' || fn.selector.kind.startsWith('__dyn_')) &&
        fn.channel === 'send';
}

class NotImplementedError extends Error {
    constructor(construct) {
        super('NOT IMPLEMENTED: ' + construct);
    }
}

// Low-level ThingTalk operations
// Each ThingTalk AST node can be implemented in terms of these low-level ops
// Each of these ops can be compiled into JS code individually

// PointWiseOp : operates on each produced tuple
const PointWiseOp = adt.data({
    Projection: { args: adt.only(Array) },
    Compute: { expression: adt.only(Ast.ScalarExpression) }
});

// StreamOp : operates on streams
const StreamOp = adt.data(function() {
    return {
        Now: null,
        InvokeSubscribe: {
            invocation: adt.only(Ast.Invocation),
            filter: adt.only(Ast.BooleanExpression)
        },
        Timer: {
            base: adt.only(Ast.Value),
            interval: adt.only(Ast.Value),
        },
        AtTimer: {
            time: adt.only(Ast.Value),
        },
        Filter: {
            stream: adt.only(this),
            filter: adt.only(Ast.BooleanExpression)
        },
        Map: {
            stream: adt.only(this),
            op: adt.only(PointWiseOp)
        },
        EdgeNew: {
            stream: adt.only(this)
        },
        EdgeFilter: {
            stream: adt.only(this),
            filter: adt.only(Ast.BooleanExpression),
        },
        Union: {
            lhs: adt.only(this),
            rhs: adt.only(this)
        },
    };
});

// TableOp : operates on in-memory table
const TableOp = adt.data(function() {
    return {
        InvokeGet: {
            invocation: adt.only(Ast.Invocation),
            extra_in_params: adt.only(Array), // coming from a join
            filter: adt.only(Ast.BooleanExpression)
        },

        Filter: {
            table: adt.only(this),
            filter: adt.only(Ast.BooleanExpression)
        },
        Map: {
            table: adt.only(this),
            op: adt.only(PointWiseOp)
        },

        CrossJoin: {
            lhs: adt.only(this),
            rhs: adt.only(this)
        },
        NestedLoopJoin: {
            lhs: adt.only(this),
            rhs: adt.only(this),
        }
    };
});

StreamOp.type('Join', {
    // when the stream fires, get the whole table and join it
    stream: adt.only(StreamOp),
    table: adt.only(TableOp)
});

// The overall structure of the rule
// this reflects the overall "when => get* => do" structure of ThingTalk
// which is what it optimizes for
const RuleOp = adt.newtype('RuleOp', {
    stream: adt.only(StreamOp, null),
    actions: adt.only(Array)
});

// compile a table that is being monitored to a stream
function compileMonitorTableToOps(table) {
    if (table.isVarRef ||
        table.isAggregation ||
        table.isArgMinMax ||
        table.isWindow ||
        table.isTimeSeries ||
        table.isHistory ||
        table.isSequence ||
        table.isAlias)
        throw new NotImplementedError(table);

    if (table.isInvocation) {
        // subscribe is optimistic, we still need EdgeNew
        return new StreamOp.EdgeNew(new StreamOp.InvokeSubscribe(table.invocation, Ast.BooleanExpression.True));
    } else if (table.isFilter) {
        return new StreamOp.Filter(
            compileMonitorTableToOps(table.table),
            table.filter);
    } else if (table.isProjection) {
        // note the "edge new" operation here, because
        // the projection might cause fewer values to
        // be new
        return new StreamOp.EdgeNew(
            new StreamOp.Map(
                compileMonitorTableToOps(table.table),
                new PointWiseOp.Projection(table.args)
            ));
    } else if (table.isCompute) {
        // note the "edge new" operation here, because
        // the projection might cause fewer values to
        // be new
        return new StreamOp.EdgeNew(
            new StreamOp.Map(
                compileMonitorTableToOps(table.table),
                new PointWiseOp.Compute(table.expression)
            ));
    } else if (table.isJoin) {
        if (table.in_params.length === 0) {
            // if there is no parameter passing, we can individually monitor
            // the two tables and return the union

            return new StreamOp.EdgeNew(new StreamOp.Union(
                compileMonitorTableToOps(table.lhs),
                compileMonitorTableToOps(table.rhs)));
        } else {
            // otherwise we need to subscribe to the left hand side, and
            // every time it fires, create/update a subscription to the
            // right hand side
            // this is VERY MESSY
            // so it's not implemented
            throw new NotImplementedError(table);
        }
    } else {
        throw new TypeError();
    }
}

// compile a TT stream to a stream op and zero or more
// tableops
function compileStreamToOps(stream) {
    if (stream.isVarRef || stream.isAlias)
        throw new NotImplementedError(stream);

    if (stream.isTimer) {
        return new StreamOp.Timer(stream.base, stream.interval);
    } else if (stream.isAtTimer) {
        return new StreamOp.AtTimer(stream.time);
    } else if (stream.isMonitor) {
        return compileMonitorTableToOps(stream.table);
    } else if (stream.isEdgeNew) {
        return new StreamOp.EdgeNew(
            compileStreamToOps(stream.stream));
    } else if (stream.isEdgeFilter) {
        return new StreamOp.EdgeFilter(
            compileStreamToOps(stream.stream),
            stream.filter);
    } else if (stream.isFilter) {
        return new StreamOp.Filter(
            compileStreamToOps(stream.stream),
            stream.filter);
    } else if (stream.isProjection) {
        return new StreamOp.Map(
            compileStreamToOps(stream.stream),
            new PointWiseOp.Projection(stream.args)
        );
    } else if (stream.isCompute) {
        return new StreamOp.Map(
            compileStreamToOps(stream.stream),
            new PointWiseOp.Compute(stream.expression)
        );
    } else if (stream.isJoin) {
        return new StreamOp.Join(
            compileStreamToOps(stream.stream),
            compileTableToOps(stream.table, stream.in_params)
        );
    } else {
        throw new TypeError();
    }
}

function compileTableToOps(table, extra_in_params) {
    if (table.isVarRef ||
        table.isAggregation ||
        table.isArgMinMax ||
        table.isWindow ||
        table.isTimeSeries ||
        table.isHistory ||
        table.isSequence ||
        table.isAlias)
        throw new NotImplementedError(table);

    if (table.isInvocation) {
        return new TableOp.InvokeGet(table.invocation, extra_in_params, Ast.BooleanExpression.True);
    } else if (table.isFilter) {
        return new TableOp.Filter(
            compileTableToOps(table.table, extra_in_params),
            table.filter
        );
    } else if (table.isProjection) {
        return new TableOp.Map(
            compileTableToOps(table.table, extra_in_params),
            new PointWiseOp.Projection(table.args)
        );
    } else if (table.isCompute) {
        return new TableOp.Map(
            compileTableToOps(table.table, extra_in_params),
            new PointWiseOp.Compute(table.expression)
        );
    } else if (table.isJoin) {
        if (table.in_params.length === 0) {
            return new TableOp.CrossJoin(
                compileTableToOps(table.lhs, extra_in_params),
                compileTableToOps(table.rhs, extra_in_params)
            );
        } else {
            let lhs_in_params = [];
            let rhs_in_params = [];
            for (let in_param of extra_in_params) {
                if (in_param.name in table.lhs.schema.inReq ||
                    in_param.name in table.lhs.schema.inOpt)
                    lhs_in_params.push(in_param);
                if (in_param.name in table.rhs.schema.inReq ||
                    in_param.name in table.rhs.schema.inOpt)
                    rhs_in_params.push(in_param);
            }

            return new TableOp.NestedLoopJoin(
                compileTableToOps(table.lhs, lhs_in_params),
                compileTableToOps(table.rhs, rhs_in_params.concat(table.in_params))
            );
        }
    } else {
        throw new TypeError();
    }
}

function optimizeStreamOp(streamop) {
    return streamop;
}
/*function optimizeTableOp(tableop) {
    return tableop;
}*/

function optimizeLoop(what, optimizer) {
    let optimized = optimizer(what);
    if (optimized !== what)
        return optimizeLoop(optimized, optimizer);
    else
        return optimized;
}

// compile a rule/command statement to a RuleOp
function compileStatementToOp(statement) {
    let streamop = null;
    if (statement.isRule) {
        streamop = compileStreamToOps(statement.stream);
    } else if (statement.table) {
        let tableop = compileTableToOps(statement.table, []);
        streamop = new StreamOp.Join(StreamOp.Now, tableop);
    }
    streamop = optimizeLoop(streamop, optimizeStreamOp);

    return new RuleOp(streamop, statement.actions);
}

class CompiledRule {
    constructor(hasTrigger, functions, states, code) {
        this.hasTrigger = hasTrigger;
        this.functions = functions;
        this.states = states;
        this.code = code;
    }
}

class RuleCompiler {
    constructor(compiler, rule, testMode) {
        this._testMode = testMode;
        this._compiler = compiler;
        this._rule = rule;
        this._irBuilder = new JSIr.IRBuilder();

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
        this._irBuilder.add(new JSIr.InvokeEmit(this._varScope.$output));

        let lhsTypeScope = this._typeScope;
        this._irBuilder.popTo(upto);

        let rhs = this._irBuilder.allocRegister();
        let rhsbody = new JSIr.AsyncFunctionExpression(rhs);

        this._irBuilder.add(rhsbody);
        upto = this._irBuilder.pushBlock(rhsbody.body);

        this._compileStream(streamop.rhs);
        this._irBuilder.add(new JSIr.InvokeEmit(this._varScope.$output));

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

    _compileStream(streamop) {
        if (streamop.isNow)
            return;

        if (streamop.isInvokeSubscribe)
            this._compileInvokeSubscribe(streamop);
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
        this._irBuilder.add(new JSIr.InvokeEmit(this._varScope.$output));

        let lhsTypeScope = this._typeScope;
        this._irBuilder.popTo(upto);

        let rhs = this._irBuilder.allocRegister();
        let rhsbody = new JSIr.AsyncFunctionExpression(rhs);

        this._irBuilder.add(rhsbody);
        upto = this._irBuilder.pushBlock(rhsbody.body);

        this._compileTable(tableop.rhs);
        this._irBuilder.add(new JSIr.InvokeEmit(this._varScope.$output));

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

    compile() {
        let ruleop = compileStatementToOp(this._rule);

        if (ruleop.stream)
            this._compileStream(ruleop.stream);

        for (let action of ruleop.actions)
            this._compileAction(action);

        this._irBuilder.popAll();

        for (let action of ruleop.actions)
            this._compileEndOfFlow(action);

        let result = this._testMode ? this._irBuilder.codegen() : this._irBuilder.compile();
        return new CompiledRule(this._rule.isRule, this._functions, this._nextStateVar, result);
    }
}

module.exports = class AppCompiler {
    constructor(testMode) {
        this._testMode = testMode;

        this._name = undefined;
        this._params = {};
        this._declarations = {};
        this._classes = {};
        this._rules = [];

        this._schemaRetriever = null;
    }

    setSchemaRetriever(schemaRetriever) {
        this._schemaRetriever = schemaRetriever;
    }

    get warnings() {
        return [];
    }

    get name() {
        return this._name;
    }

    get declarations() {
        return this._declarations;
    }

    get rules() {
        return this._rules;
    }

    compileCode(code) {
        return this.compileProgram(Grammar.parse(code));
    }

    verifyProgram(ast) {
        return typeCheckProgram(ast, this._schemaRetriever).then(() => {
            ast.classes.forEach((ast) => {
                this._classes[ast.name] = ast;
            });
            ast.declarations.forEach((ast) => {
                this._declarations[ast.name] = ast;
            });
        });
    }

    compileProgram(ast) {
        return this.verifyProgram(ast).then(() => {
            if (ast.declarations.length > 0)
                throw new NotImplementedError(ast.declarations);

            ast.rules.forEach((stmt) => {
                let compiler = new RuleCompiler(this, stmt, this._testMode);
                this._rules.push(compiler.compile());
            });
        });
    }
};
