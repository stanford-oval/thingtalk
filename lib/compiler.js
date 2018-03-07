// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Ast = require('./ast');
const Grammar = require('./grammar');
const Type = require('./type');
const JSIr = require('./jsir');
const Builtin = require('./builtin');
const SqlCompiler = require('./sql_compiler');
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
        irBuilder.add(new JSIr.FormatEvent(hint, varScope.$device, varScope.$outputType, varScope.$output, reg));
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
        if (type.isEntity && (type.type === 'tt:hashtag' || type.type === 'tt:username' || type.type === 'tt:picture_url')) {
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

class RuleCompiler {
    constructor(compiler, rule, testMode) {
        this._testMode = testMode;
        this._compiler = compiler;
        this._rule = rule;
        this._irBuilder = new JSIr.IRBuilder();

        this._functions = [];
        this._nextFunction = 0;

        this._sqlStatements = [];
        this._nextSqlStatement = 0;

        this._typeScope = {};
        this._varScope = {};
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

    _allocSql(code) {
        let id = this._nextSqlStatement++;
        this._sqlStatements[id] = code;
        return id;
    }

    _compileInputParams(ast) {
        let args = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.CreateObject(args));
        for (let inParam of ast.in_params) {
            let reg = compileValue(this._irBuilder, inParam.value, this._varScope);
            let ptype = ast.schema.inReq[inParam.name] || ast.schema.inOpt[inParam.name];
            reg = compileCast(this._irBuilder, reg, typeForValue(inParam.value, this._typeScope), ptype);
            this._irBuilder.add(new JSIr.SetKey(args, inParam.name, reg));
        }
        return args;
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

    _compileSqlQuerySet(queries) {
        let sqlCompiler = new SqlCompiler(queries, this._versions, this._varScope);
        let sql = sqlCompiler.compile();

        let id = this._allocSql(sql, sqlCompiler.outputs);
        let list = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.InvokeMemoryQuery(list, id, sqlCompiler.binders));

        return [list, sqlCompiler.outputs];
    }

    _compileFilter(ast, input, output) {
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

                if (expr.selector.isDevice) {
                    let fnid = this._allocFunction(ast, 'query');
                    let list = this._irBuilder.allocRegister();
                    let args = this._compileInputParams(ast);
                    this._irBuilder.add(new JSIr.InvokeQuery(fnid, list, args));

                    let deviceAndResult = this._compileIterateQuery(list);
                    let result = this._irBuilder.allocRegister();
                    this._irBuilder.add(new JSIr.GetIndex(deviceAndResult, 2, result));

                    let ok = this._compileFilter(expr, args, result);
                    let ifStmt = new JSIr.IfStatement(ok);
                    this._irBuilder.add(ifStmt);
                    this._irBuilder.pushBlock(ifStmt.iftrue);
                    this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), cond));
                    this._irBuilder.add(new JSIr.Break());
                    this._irBuilder.popBlock();
                } else {
                    let [list, ] = this._compileSqlQuerySet([expr]);
                    let iterator = this._irBuilder.allocRegister();
                    this._irBuilder.add(new JSIr.Iterator(iterator, list));
                    let row = this._irBuilder.allocRegister();
                    let loop = new JSIr.AsyncWhileLoop(row, iterator);
                    this._irBuilder.add(loop);
                    this._irBuilder.pushBlock(loop.body);
                    // if we enter the loop, we have at least one result, so the predicate is
                    // satisfied (because the filters are checked in SQL)
                    this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), cond));
                    this._irBuilder.add(new JSIr.Break());
                }

                this._irBuilder.popBlock(); // for-of
                this._irBuilder.popBlock(); // try-catch
            } else {
                let filter = expr.filter;
                let op = filter.operator;
                let lhs;
                let lhsType;
                if (ast.schema.inReq[filter.name] || ast.schema.inOpt[filter.name]) {
                    lhsType = ast.schema.inReq[filter.name] || ast.schema.inOpt[filter.name];
                    lhs = this._irBuilder.allocRegister();
                    this._irBuilder.add(new JSIr.GetIndex(input, ast.schema.index[filter.name], lhs));
                } else if (ast.schema.out[filter.name]) {
                    lhsType = ast.schema.out[filter.name];
                    lhs = this._irBuilder.allocRegister();
                    this._irBuilder.add(new JSIr.GetIndex(output, ast.schema.index[filter.name], lhs));
                } else {
                    lhsType = this._typeScope[filter.name];
                    lhs = compileValue(this._irBuilder, Ast.Value.VarRef(filter.name), this._varScope);
                }
                lhs = compileCast(this._irBuilder, lhs, lhsType, filter.overload[0]);
                let rhs = compileValue(this._irBuilder, filter.value, this._varScope);
                rhs = compileCast(this._irBuilder, rhs, typeForValue(filter.value, this._typeScope), filter.overload[1]);
                let negate = false;
                if (op === '!=') {
                    // lower into '!' + '='
                    negate = true;
                    op = '=';
                }

                compileBinaryOp(this._irBuilder, op, lhs, rhs, cond);
                cond = compileCast(this._irBuilder, cond, filter.overload[2], Type.Boolean);
                if (negate)
                    compileUnaryOp(this._irBuilder, '!', cond, cond);
            }
            return cond;
        }).call(this, ast.filter);
    }

    _filterAndSetOutputs(ast, args, deviceAndResult) {
        let outputType, device, result;
        outputType = this._irBuilder.allocRegister();
        device = this._irBuilder.allocRegister();
        result = this._irBuilder.allocRegister();

        this._irBuilder.add(new JSIr.GetIndex(deviceAndResult, 0, outputType));
        this._irBuilder.add(new JSIr.GetIndex(deviceAndResult, 1, device));
        this._irBuilder.add(new JSIr.GetIndex(deviceAndResult, 2, result));

        this._varScope.$outputType = outputType;
        this._varScope.$device = device;
        this._varScope.$input = args;
        this._varScope.$output = result;

        /*
        TODO filters
        if (!ast.filter.isTrue) {
            let filterResult = this._compileFilter(ast, args, result);
            let ifStmt = new JSIr.IfStatement(filterResult);
            this._irBuilder.add(ifStmt);
            this._irBuilder.pushBlock(ifStmt.iftrue);
        }*/

        this._typeScope = {};
        this._varScope = {};
        for (let outParam in ast.schema.out) {
            let reg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetKey(result, outParam, reg));
            this._typeScope[outParam] = ast.schema.out[outParam];
            this._varScope[outParam] = reg;
        }
    }

    _checkStreamSupported(ast) {
        if (ast.isTimer || ast.isAtTimer)
            return;
        if (!ast.isMonitor || !ast.table.isInvocation)
            throw new Error('NOT IMPLEMENTED: ' + ast + ' is not supported'); // TODO
    }
    _checkTableSupported(ast) {
        if (!ast.isInvocation)
            throw new Error('NOT IMPLEMENTED: ' + ast + ' is not supported'); // TODO
    }

    _compileMonitorInvocation(ast) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke trigger");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let fnid = this._allocFunction(ast.table.invocation, 'trigger');
        let args = this._compileInputParams(ast.table.invocation);

        let iterator = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.InvokeMonitor(fnid, iterator, args, false));

        let result = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(result, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);
        // TODO the get cache for get-predicates (or get caching in general)
        //this._irBuilder.add(new JSIr.ClearGetCache());
        this._filterAndSetOutputs(ast, args, result);
    }

    _compileTimer(ast) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke timer");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let iterator = this._irBuilder.allocRegister();
        let base = compileValue(this._irBuilder, ast.base, this._varScope);
        let interval = compileValue(this._irBuilder, ast.interval, this._varScope);

        this._irBuilder.add(new JSIr.InvokeTimer(iterator, base, interval));

        let result = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(result, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        // TODO __timestamp
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

        // TODO __timestamp
    }

    _compileThingpediaQuery(ast) {
        let fnid = this._allocFunction(ast.invocation, 'query');
        let args = this._compileInputParams(ast.invocation);
        let list = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.InvokeQuery(fnid, list, args));

        let deviceAndResult = this._compileIterateQuery(list);
        this._filterAndSetOutputs(ast, args, deviceAndResult);
    }

    /* TODO table queries
    _compileMemoryQuery(querySet) {
        let nullConstant = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.LoadConstant(null, nullConstant));

        let [list, outputs] = this._compileSqlQuerySet(querySet);

        let iterator = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.Iterator(iterator, list));
        let row = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(row, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);

        let lastQuery = querySet[querySet.length-1];
        let tableName = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.String('memory:' + lastQuery.__table), tableName));
        this._varScope.$outputType = tableName;
        this._varScope.$channel = nullConstant;
        this._varScope.$input = nullConstant;
        this._varScope.$output = row;

        lastQuery.out_params.forEach((outParam, i) => {
            let vname = outParam.name;
            let vtype;
            if (lastQuery.aggregation && outParam.value === lastQuery.aggregation.field)
                vtype = lastQuery.aggregation.overload[1];
            else
                vtype = lastQuery.schema.out[outParam.value];
            assert(vtype);
            let reg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetKey(row, outputs[vname], reg));
            this._typeScope[vname] = vtype;
            this._varScope[vname] = reg;
        });
    }
    */

    /* TODO joins
    _compileAllQueries() {
        for (let i = 0; i < this._rule.queries.length; i++) {
            let tryCatch = new JSIr.TryCatch("Failed to invoke query");
            this._irBuilder.add(tryCatch);
            this._irBuilder.pushBlock(tryCatch.try);

            let querySet = [];
            for (let j = i; j < this._rule.queries.length; j++) {
                let query = this._rule.queries[j];
                if (query.selector.isBuiltin) {
                    assert(query.channel === 'get_record');
                    querySet.push(query);
                }
            }

            if (querySet.length > 0) {
                this._compileMemoryQuery(querySet);
                i += querySet.length - 1;
            } else {
                this._compileThingpediaQuery(this._rule.queries[i]);
            }
        }
    }*/

    _compileAction(ast) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke action");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        if (ast.selector.isBuiltin) {
            if (ast.channel === 'return')
                throw new TypeError('return must be lowered before execution, use Generate.lowerReturn');
            assert(ast.channel === 'notify');

            this._irBuilder.add(new JSIr.InvokeOutput(this._varScope.$outputType, this._varScope.$output, this._varScope.$device));
        } else {
            let fnid = this._allocFunction(ast, 'action');
            let args = this._compileInputParams(ast);
            this._irBuilder.add(new JSIr.InvokeAction(fnid, args));
        }

        this._irBuilder.popBlock();
    }

    /* TODO save
    _compileSave(ast) {
        let tuple = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.CreateTuple(ast.tableschema.args.length, tuple));
        for (let name in this._varScope) {
            if (name.startsWith('$'))
                continue;
            if (!ast.tableschema.inOpt[name])
                continue;
            let reg = compileCast(this._irBuilder, this._varScope[name], this._typeScope[name], ast.tableschema.inOpt[name]);
            this._irBuilder.add(new JSIr.SetIndex(tuple, ast.tableschema.index[name], reg));
        }

        let ok = this._retryLoopLabel !== undefined ? this._irBuilder.allocRegister() : -1;
        this._irBuilder.add(new JSIr.InvokeSave(ok, ast.table, this._versions, tuple));
        if (this._retryLoopLabel !== undefined) {
            let versionCheck = new JSIr.IfStatement(ok);
            this._irBuilder.add(versionCheck);
            this._irBuilder.pushBlock(versionCheck.iffalse);
            this._irBuilder.add(new JSIr.LabeledContinue(this._retryLoopLabel));
            this._irBuilder.popBlock();
        }
    }

    _anyVersionDepedency(queries) {
        return queries.some((q) => q.selector.isBuiltin && q.channel === 'get_record');
    }*/

    compile() {
        /* TODO retry loop for version concurrency/consistency
        let retryLoop;
        if (this._anyVersionDepedency(this._rule.queries)) {
            if (this._rule.table) {
                this._retryLoopLabel = this._irBuilder.allocLabel();
                retryLoop = new JSIr.LabeledLoop(this._retryLoopLabel);
                this._irBuilder.add(retryLoop);
                this._irBuilder.pushBlock(retryLoop.body);
            }

            for (let query of this._rule.queries) {
                if (!query.selector.isBuiltin)
                    continue;
                let version = this._irBuilder.allocRegister();
                this._irBuilder.add(new JSIr.GetTableVersion(version, query.__table));
                this._versions[query.__table] = version;
            }
        }
        */
        //this._compileAllQueries();
        if (this._rule.isRule) {
            this._checkStreamSupported(this._rule.stream);

            if (this._rule.stream.isMonitor)
                this._compileMonitorInvocation(this._rule.stream);
            else if (this._rule.stream.isTimer)
                this._compileTimer(this._rule.stream);
            else if (this._rule.stream.isAtTimer)
                this._compileAtTimer(this._rule.stream);
        } else if (this._rule.isCommand && this._rule.table !== null) {
            this._checkTableSupported(this._rule.table);

            let tryCatch = new JSIr.TryCatch("Failed to invoke query");
            this._irBuilder.add(tryCatch);
            this._irBuilder.pushBlock(tryCatch.try);
            this._compileThingpediaQuery(this._rule.table);
        }

        /*
        TODO saving (is that still a thing? probably not actually)
        if (this._rule.table)
            this._compileSave(this._rule);
        */
        for (let action of this._rule.actions)
            this._compileAction(action);
        this._irBuilder.popAll();
        /*
        TODO retry loop
        if (this._retryLoopLabel !== undefined) {
            this._irBuilder.pushBlock(retryLoop.body);
            this._irBuilder.add(new JSIr.LabeledBreak(this._retryLoopLabel));
            this._irBuilder.popBlock();
        }*/

        for (let action of this._rule.actions) {
            if (action.selector.isDevice && isRemoteSend(action)) {
                let tryCatch = new JSIr.TryCatch("Failed to signal end-of-flow");

                this._irBuilder.add(tryCatch);
                this._irBuilder.pushBlock(tryCatch.try);

                let principal, flow;
                for (let inParam of action.in_params) {
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
        }

        let result = this._testMode ? this._irBuilder.codegen() : this._irBuilder.compile();
        return [this._functions, this._sqlStatements, result];
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
                throw new Error('NOT IMPLEMENTED: declarations'); // TODO

            ast.rules.forEach((stmt) => {
                let compiler = new RuleCompiler(this, stmt, this._testMode);
                this._rules.push(compiler.compile());
            });
        });
    }
};

