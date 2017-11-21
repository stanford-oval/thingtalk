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
const Grammar = require('./grammar');
const Type = require('./type');
const JSIr = require('./jsir');
const Builtin = require('./builtin');
const { typeCheckRule } = require('./typecheck');

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
        irBuilder.add(new JSIr.FormatEvent(hint, varScope.$channel, varScope.$input, varScope.$output, reg));
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

        this._typeScope = {};
        this._varScope = {};
    }

    _allocFunction(ast, type) {
        let id = this._nextFunction++;
        this._functions[id] = new Invocation(ast.__effectiveSelector, ast.channel, type);
        return id;
    }

    _compileInputParams(ast) {
        let tuple = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.CreateTuple(ast.schema.args.length, tuple));
        for (let inParam of ast.in_params) {
            let reg = compileValue(this._irBuilder, inParam.value, this._varScope);
            let ptype = ast.schema.inReq[inParam.name] || ast.schema.inOpt[inParam.name];
            reg = compileCast(this._irBuilder, reg, typeForValue(inParam.value, this._typeScope), ptype);
            this._irBuilder.add(new JSIr.SetIndex(tuple, ast.schema.index[inParam.name], reg));
        }
        return tuple;
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

                let fnid = this._allocFunction(expr, 'query');
                let list = this._irBuilder.allocRegister();
                let args = this._compileInputParams(ast);
                this._irBuilder.add(new JSIr.InvokeQuery(fnid, list, args));

                let channelAndResult = this._irBuilder.allocRegister();
                let loop = new JSIr.ForOfStatement(channelAndResult, list);
                this._irBuilder.add(loop);
                this._irBuilder.pushBlock(loop.body);

                let result = this._irBuilder.allocRegister();
                this._irBuilder.add(new JSIr.GetIndex(channelAndResult, 2, result));

                let ok = this._compileFilter(expr, args, result);
                let ifStmt = new JSIr.IfStatement(ok);
                this._irBuilder.add(ifStmt);
                this._irBuilder.pushBlock(ifStmt.iftrue);
                this._irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), cond));
                this._irBuilder.add(new JSIr.Break());
                this._irBuilder.popBlock();

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

    _filterAndSetOutputs(ast, args, channelAndResult) {
        let outputType, channel, result;
        outputType = this._irBuilder.allocRegister();
        channel = this._irBuilder.allocRegister();
        result = this._irBuilder.allocRegister();

        this._irBuilder.add(new JSIr.GetIndex(channelAndResult, 0, outputType));
        this._irBuilder.add(new JSIr.GetIndex(channelAndResult, 1, channel));
        this._irBuilder.add(new JSIr.GetIndex(channelAndResult, 2, result));

        this._varScope.$outputType = outputType;
        this._varScope.$channel = channel;
        this._varScope.$input = args;
        this._varScope.$output = result;

        if (!ast.filter.isTrue) {
            let filterResult = this._compileFilter(ast, args, result);
            let ifStmt = new JSIr.IfStatement(filterResult);
            this._irBuilder.add(ifStmt);
            this._irBuilder.pushBlock(ifStmt.iftrue);
        }

        for (let outParam of ast.out_params) {
            let vname = outParam.name;
            let vtype = ast.schema.out[outParam.value];
            let reg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetIndex(result, ast.schema.index[outParam.value], reg));
            this._typeScope[vname] = vtype;
            this._varScope[vname] = reg;
        }
    }

    _compileTrigger(ast) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke trigger");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        let fnid = this._allocFunction(ast, 'trigger');
        let args = this._compileInputParams(ast);

        let iterator = this._irBuilder.allocRegister();
        this._irBuilder.add(new JSIr.InvokeTrigger(fnid, iterator, args, this._rule.once));

        let result = this._irBuilder.allocRegister();
        let loop = new JSIr.AsyncWhileLoop(result, iterator);
        this._irBuilder.add(loop);
        this._irBuilder.pushBlock(loop.body);
        this._irBuilder.add(new JSIr.ClearGetCache());
        this._filterAndSetOutputs(ast, args, result);
    }

    _compileQuery(ast) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke query");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        if (ast.selector.isBuiltin) {
            assert(ast.channel === 'get_record');
            let args = this._compileInputParams(ast);
            let list = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.InvokeLogQuery(list, args, ast.aggregation));
        } else {
            let fnid = this._allocFunction(ast, 'query');
            let args = this._compileInputParams(ast);

            let list = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.InvokeQuery(fnid, list, args));

            let result = this._irBuilder.allocRegister();
            let loop = new JSIr.ForOfStatement(result, list);
            this._irBuilder.add(loop);
            this._irBuilder.pushBlock(loop.body);
            this._filterAndSetOutputs(ast, args, result);
        }
    }

    _compileAction(ast) {
        let tryCatch = new JSIr.TryCatch("Failed to invoke action");
        this._irBuilder.add(tryCatch);
        this._irBuilder.pushBlock(tryCatch.try);

        if (ast.selector.isBuiltin) {
            if (ast.channel === 'return')
                throw new TypeError('return must be lowered before execution, use Generate.lowerReturn');
            assert(ast.channel === 'notify');

            this._irBuilder.add(new JSIr.InvokeOutput(this._varScope.$outputType, this._varScope.$output, this._varScope.$channel));
        } else {
            let fnid = this._allocFunction(ast, 'action');
            let args = this._compileInputParams(ast);
            this._irBuilder.add(new JSIr.InvokeAction(fnid, args));
        }

        this._irBuilder.popBlock();
    }

    compile() {
        for (let name in this._compiler.params) {
            this._typeScope[name] = this._compiler.params[name];
            let reg = this._irBuilder.allocRegister();
            this._irBuilder.add(new JSIr.GetVariable(name, reg));
            this._varScope[name] = reg;
        }

        if (this._rule.trigger !== null)
            this._compileTrigger(this._rule.trigger);
        for (let query of this._rule.queries)
            this._compileQuery(query);
        for (let action of this._rule.actions)
            this._compileAction(action);
        this._irBuilder.popAll();

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
        return [this._functions, result];
    }
}

module.exports = class AppCompiler {
    constructor(testMode) {
        this._testMode = testMode;

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
        return [];
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

    verifyRule(ast) {
        return typeCheckRule(ast, this._schemaRetriever, this._params, this._classes);
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
            ast.rules.forEach((stmt) => {
                let compiler = new RuleCompiler(this, stmt, this._testMode);
                this._rules.push(compiler.compile());
            });
        });
    }
};

