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

const Builtin = require('./builtin');
const { stringEscape } = require('./escaping');

// A register-based IR for ThingTalk to JS
// Typed like ThingTalk

// A sequence of instructions
class Block {
    constructor() {
        this._instructions = [];
    }

    add(instr) {
        this._instructions.push(instr);
    }

    codegen(prefix) {
        return this._instructions.map((i) => i.codegen(prefix)).join('\n');
    }
}

class Copy {
    constructor(what, into) {
        this._what = what;
        this._into = into;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = _t_${this._what};`;
    }
}

class CreateTuple {
    constructor(size, into) {
        this._size = size;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = new Array(' + this._size + ');';
    }
}

class CreateObject {
    constructor(into) {
        this._into = into;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = {};`;
    }
}

class CreateAggregation {
    constructor(aggregation, into) {
        this._aggregation = aggregation;
        this._into = into;
    }

    codegen(prefix) {
        let type = `"${this._aggregation.type}"`;
        let field = this._aggregation.field ? `"${this._aggregation.field}"` : 'null';
        let cols = this._aggregation.cols ? `["${this._aggregation.cols.join('", "')}"]` : 'null';
        let count = this._aggregation.count ? `${this._aggregation.count}` : 'null';
        return prefix + '_t_' + this._into + ' = new __builtin.Aggregation(' + type + ', ' + field + ', ' + cols + ', ' + count + ');';
    }
}

class SetIndex {
    constructor(tuple, idx, value) {
        this._tuple = tuple;
        this._idx = idx;
        this._value = value;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._tuple + '[' + this._idx + '] = _t_' + this._value + ';';
    }
}

class GetIndex {
    constructor(tuple, idx, into) {
        this._tuple = tuple;
        this._idx = idx;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = _t_' + this._tuple + '[' + this._idx + '];';
    }
}

class GetKey {
    constructor(object, key, into) {
        this._object = object;
        this._key = key;
        this._into = into;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = _t_${this._object}.${this._key};`;
    }
}

class SetKey {
    constructor(object, key, value) {
        this._object = object;
        this._key = key;
        this._value = value;
    }

    codegen(prefix) {
        if (this._value === null)
            return `${prefix}_t_${this._object}.${this._key} = null;`;
        else
            return `${prefix}_t_${this._object}.${this._key} = _t_${this._value};`;
    }
}

class GetVariable {
    constructor(variable, into) {
        this._variable = variable;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = env._scope.' + this._variable + ';';
    }
}

class GetEnvironment {
    constructor(variable, into) {
        this._variable = variable;
        this._into = into;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = env.${this._variable};`;
    }
}

class Iterator {
    constructor(into, iterable) {
        this._iterable = iterable;
        this._into = into;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = _t_${this._iterable}[Symbol.iterator]();`;
    }
}

function valueToJSSource(value) {
    if (value === null)
        return 'null';
    if (value.isArray)
        return `[${value.value.map(valueToJSSource).join(', ')}]`;
    var js = value.toJS();
    if (typeof js === 'string')
        return stringEscape(js);
    if (js.toJSSource)
        return js.toJSSource();
    if (js instanceof Date)
        return `new Date(${js.getTime()})`;
    return String(js);
}

class LoadConstant {
    constructor(constant, into) {
        this._constant = constant;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = ' + valueToJSSource(this._constant) + ';';
    }
}

class FormatEvent {
    constructor(hint, outputType, output, into) {
        this._hint = hint;
        this._outputType = outputType;
        this._output = output;
        this._into = into;
    }

    codegen(prefix) {
        if (this._outputType === null)
            return `${prefix}_t_${this._into} = await env.formatEvent(null, _t_${this._output}, ${stringEscape(this._hint)});`;
        else
            return `${prefix}_t_${this._into} = await env.formatEvent(_t_${this._outputType}, _t_${this._output}, ${stringEscape(this._hint)});`;
    }
}

class BinaryFunctionOp {
    constructor(a, b, fn, into) {
        this._a = a;
        this._b = b;
        this._fn = fn;
        this._into = into;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = __builtin.${this._fn}(_t_${this._a}, _t_${this._b});`;
    }
}

class BinaryOp {
    constructor(a, b, op, into) {
        this._a = a;
        this._b = b;
        this._op = op;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = ' + '_t_' + this._a + ' ' + this._op + ' ' + '_t_' + this._b + ';';
    }
}

class UnaryOp {
    constructor(v, op, into) {
        this._v = v;
        this._op = op;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = ' + this._op + ' (' + '_t_' + this._v + ');';
    }
}

class InvokeMonitor {
    constructor(f, into, args, once) {
        this._f = f;
        this._into = into;
        this._args = args;
        this._once = once;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = await env.invokeMonitor(' + this._f + ', _t_' + this._args + ', ' + this._once + ');';
    }
}

class InvokeTimer {
    constructor(into, base, interval) {
        this._into = into;
        this._base = base;
        this._interval = interval;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = await env.invokeTimer(_t_${this._base}, _t_${this._interval});`;
    }
}

class InvokeAtTimer {
    constructor(into, time) {
        this._into = into;
        this._time = time;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = await env.invokeAtTimer(_t_${this._time});`;
    }
}

class InvokeQuery {
    constructor(f, into, args) {
        this._f = f;
        this._into = into;
        this._args = args;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = await env.invokeQuery(' + this._f + ', _t_' + this._args + ');';
    }
}

class InvokeAction {
    constructor(f, args) {
        this._f = f;
        this._args = args;
    }

    codegen(prefix) {
        return prefix + 'await env.invokeAction(' + this._f + ', _t_' + this._args + ');';
    }
}

class InvokeOutput {
    constructor(outputType, output) {
        this._outputType = outputType;
        this._output = output;
    }

    codegen(prefix) {
        if (this._outputType === null)
            return `${prefix}await env.output(null, _t_${this._output});`;
        else
            return `${prefix}await env.output(String(_t_${this._outputType}), _t_${this._output});`;
    }
}

class InvokeReadState {
    constructor(into, stateId) {
        this._into = into;
        this._stateId = stateId;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = await env.readState(${this._stateId});`;
    }
}

class InvokeWriteState {
    constructor(state, stateId) {
        this._state = state;
        this._stateId = stateId;
    }

    codegen(prefix) {
        return `${prefix}await env.writeState(${this._stateId}, _t_${this._state});`;
    }
}

class CheckIsNewTuple {
    constructor(into, state, tuple, keys) {
        this._into = into;
        this._state = state;
        this._tuple = tuple;
        this._keys = keys;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = __builtin.isNewTuple(_t_${this._state}, _t_${this._tuple}, [${
            this._keys.map(stringEscape).join(', ')}]);`;
    }
}

class AddTupleToState {
    constructor(into, state, tuple) {
        this._into = into;
        this._state = state;
        this._tuple = tuple;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = __builtin.addTuple(_t_${this._state}, _t_${this._tuple});`;
    }
}

class SendEndOfFlow {
    constructor(principal, flow) {
        this._principal = principal;
        this._flow = flow;
    }

    codegen(prefix) {
        return `${prefix}await env.sendEndOfFlow(_t_${this._principal}, _t_${this._flow});`;
    }
}

class ClearGetCache {
    codegen(prefix) {
        return prefix + 'env.clearGetCache();';
    }
}

class Break {
    codegen(prefix) {
        return prefix + 'break;';
    }
}

class IfStatement {
    constructor(cond) {
        this._cond = cond;
        this.iftrue = new Block;
        this.iffalse = new Block;
    }

    codegen(prefix) {
        return prefix + 'if (_t_' + this._cond + ') {\n' +
            this.iftrue.codegen(prefix + '  ') + '\n'
            + prefix + '} else {\n' +
            this.iffalse.codegen(prefix + '  ') + '\n'
            + prefix + '}';
    }
}

class ForOfStatement {
    constructor(into, iterable) {
        this._into = into;
        this._iterable = iterable;
        this.body = new Block;
    }

    codegen(prefix) {
        return prefix + 'for (_t_' + this._into + ' of _t_' + this._iterable + ') {\n' +
            this.body.codegen(prefix + '  ') + '\n'
            + prefix + '}';
    }
}

class AsyncWhileLoop {
    constructor(into, iterator) {
        this._into = into;
        this._iterator = iterator;
        this.body = new Block;
    }

    codegen(prefix) {
        return prefix + '{\n' +
            prefix + '  let _iter_tmp = await _t_' + this._iterator + '.next();\n' +
            prefix + '  while (!_iter_tmp.done) {\n' +
            prefix + '    _t_' + this._into + ' = _iter_tmp.value;\n' +
            this.body.codegen(prefix + '    ') + '\n' +
            prefix + '    _iter_tmp = await _t_' + this._iterator + '.next();\n' +
            prefix + '  }\n' +
            prefix + '}';
    }
}

class AsyncFunctionExpression {
    constructor(into) {
        this._into = into;
        this.body = new Block;
    }

    codegen(prefix) {
        return prefix + `_t_${this._into} = async function(emit) {\n` +
            this.body.codegen(prefix + '  ') + '\n' +
            prefix + '}';
    }
}

class InvokeEmit {
    constructor(...values) {
        this._values = values;
    }

    codegen(prefix) {
        return `${prefix}emit(${this._values.map((v) => '_t_' + v).join(', ')});`;
    }
}

class LabeledLoop {
    constructor(label) {
        this._label = label;
        this.body = new Block;
    }

    codegen(prefix) {
        return prefix + `_l_${this._label}: while (true) {\n` +
            this.body.codegen(prefix + '  ') + '\n' +
            prefix + '}';
    }
}

class LabeledBreak {
    constructor(label) {
        this._label = label;
    }

    codegen(prefix) {
        return `${prefix}break _l_${this._label};`;
    }
}

class LabeledContinue {
    constructor(label) {
        this._label = label;
    }

    codegen(prefix) {
        return `${prefix}continue _l_${this._label};`;
    }
}

class TryCatch {
    constructor(message) {
        this._message = message;
        this.try = new Block;
    }

    codegen(prefix) {
        return prefix + 'try {\n' +
        this.try.codegen(prefix + '  ') + '\n' +
        prefix + '} catch(_exc_) {\n' +
        prefix + '  env.reportError(' + stringEscape(this._message) + ', _exc_);\n' +
        prefix + '}';
    }
}

class RootBlock extends Block {
    constructor() {
        super();
        this._temps = [];
    }

    declare(reg) {
        this._temps.push(reg);
    }
    codegen(prefix) {
        return prefix + '  "use strict";\n' + this._temps.map((t) => prefix + '  let _t_' + t + ';\n').join('') +
            super.codegen(prefix+'  ');
    }
}

// eslint-disable-next-line prefer-arrow-callback
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
class IRBuilder {
    constructor() {
        this._nextRegister = 0;
        this._nextLabel = 0;
        this._root = new RootBlock;

        this._blockStack = [this._root];
    }

    codegen() {
        for (let reg = 0; reg < this._nextRegister; reg++)
            this._root.declare(reg);
        return this._root.codegen('');
    }
    compile() {
        let code = this.codegen();
        let f = new AsyncFunction('__builtin', 'env', code);
        return f.bind(null, Builtin);
    }

    get _currentBlock() {
        return this._blockStack[this._blockStack.length-1];
    }

    allocRegister() {
        var reg = this._nextRegister++;
        return reg;
    }
    allocLabel() {
        var lbl = this._nextLabel++;
        return lbl;
    }
    pushBlock(block) {
        let now = this._blockStack.length;
        this._blockStack.push(block);
        return now;
    }
    popBlock() {
        this._blockStack.pop();
        if (this._blockStack.length === 0)
            throw new Error('Invalid pop');
    }
    popTo(upto) {
        this._blockStack.length = upto;
    }
    popAll() {
        this._blockStack.length = 0;
        this._blockStack[0] = this._root;
    }
    add(instr) {
        this._currentBlock.add(instr);
    }
}

module.exports = {
    IRBuilder,
    IfStatement,
    Copy,
    CreateTuple,
    CreateObject,
    CreateAggregation,
    GetIndex,
    SetIndex,
    GetKey,
    SetKey,
    GetVariable,
    GetEnvironment,
    Iterator,
    LoadConstant,
    BinaryFunctionOp,
    BinaryOp,
    UnaryOp,
    FormatEvent,
    InvokeMonitor,
    InvokeTimer,
    InvokeAtTimer,
    InvokeQuery,
    InvokeAction,
    InvokeOutput,
    InvokeReadState,
    InvokeWriteState,
    InvokeEmit,
    CheckIsNewTuple,
    AddTupleToState,
    LabeledLoop,
    LabeledBreak,
    LabeledContinue,
    ClearGetCache,
    SendEndOfFlow,
    ForOfStatement,
    AsyncWhileLoop,
    AsyncFunctionExpression,
    Break,
    TryCatch
};
