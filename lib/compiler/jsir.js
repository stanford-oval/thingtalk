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
const Builtin = require('../builtin');
const { stringEscape } = require('../escaping');

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

class GetASTObject {
    constructor(idx, into) {
        this._idx = idx;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = __ast[' + this._idx + '];';
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
        return prefix + '_t_' + this._into + ' = __env._scope.' + this._variable + ';';
    }
}

class GetEnvironment {
    constructor(variable, into) {
        this._variable = variable;
        this._into = into;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = __env.${this._variable};`;
    }
}

class GetScope {
    constructor(name, into) {
        this._name = name;
        this._into = into;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = __scope.${this._name};`;
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

function anyToJS(js) {
    if (typeof js === 'string')
        return stringEscape(js);
    if (js.toJSSource)
        return js.toJSSource();
    if (js instanceof Date)
        return `new Date(${js.getTime()})`;
    return String(js);
}

function valueToJSSource(value) {
    if (value === null)
        return 'null';
    if (value.isArray)
        return `[${value.value.map(valueToJSSource).join(', ')}]`;
    var js = value.toJS();
    return anyToJS(js);
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

class LoadContext {
    constructor(context, into) {
        this._context = context;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ` = await __env.loadContext("${this._context.name}", "${this._context.type.toString()}");`;
    }
}

class LoadBuiltin {
    constructor(builtin, into) {
        this._builtin = builtin;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = __builtin.' + this._builtin + ';';
    }
}

class NewObject {
    constructor(classname, into, ...args) {
        this._class = classname;
        this._into = into;
        this._args = args;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = new __builtin.${this._class}(${this._args.map((a) => '_t_' + a).join(', ')});`;
    }
}

class MapAndReadField {
    constructor(into, array, field) {
        this._into = into;
        this._array = array;
        this._field = field;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = _t_${this._array}.map(($) => $.${this._field});`;
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
            return `${prefix}_t_${this._into} = await __env.formatEvent(null, _t_${this._output}, ${stringEscape(this._hint)});`;
        else
            return `${prefix}_t_${this._into} = await __env.formatEvent(_t_${this._outputType}, _t_${this._output}, ${stringEscape(this._hint)});`;
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

class VoidFunctionOp {
    constructor(fn, ...args) {
        this._fn = fn;
        this._args = args;
    }

    codegen(prefix) {
        return `${prefix}__builtin.${this._fn}(${this._args.map((a) => '_t_' + a).join(', ')});`;
    }
}

class FunctionOp {
    constructor(fn, into, ...args) {
        this._fn = fn;
        this._into = into;
        this._args = args;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = __builtin.${this._fn}(${this._args.map((a) => '_t_' + a).join(', ')});`;
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

class UnaryMethodOp {
    constructor(obj, v, op) {
        this._obj = obj;
        this._v = v;
        this._op = op;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._obj}.${this._op}(_t_${this._v});`;
    }
}

class BinaryMethodOp {
    constructor(obj, a, b, op) {
        this._obj = obj;
        this._a = a;
        this._b = b;
        this._op = op;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._obj}.${this._op}(_t_${this._a}, _t_${this._b});`;
    }
}

function objectToJS(obj) {
    let buffer = '{ ';
    for (let key in obj)
        buffer += `${key}: ${anyToJS(obj[key])}, `;
    buffer += '}';
    return buffer;
}

class EnterProcedure {
    constructor(procid, procname) {
        this._procid = procid;
        this._procname = procname;
    }

    codegen(prefix) {
        return `${prefix}await __env.enterProcedure(${this._procid}, ${stringEscape(this._procname)});`;
    }
}

class ExitProcedure {
    constructor(procid, procname) {
        this._procid = procid;
        this._procname = procname;
    }

    codegen(prefix) {
        return `${prefix}await __env.exitProcedure(${this._procid}, ${stringEscape(this._procname)});`;
    }
}

class InvokeMonitor {
    constructor(kind, attrs, fname, into, args, once) {
        this._kind = kind;
        this._attrs = attrs;
        this._fname = fname;
        this._into = into;
        this._args = args;
        this._once = once;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = await __env.invokeMonitor(${stringEscape(this._kind)}, ${objectToJS(this._attrs)}, ${stringEscape(this._fname)}, _t_${this._args}, ${this._once});`;
    }
}

class InvokeTimer {
    constructor(into, base, interval, frequency) {
        this._into = into;
        this._base = base;
        this._interval = interval;
        this._frequency = frequency;
    }

    codegen(prefix) {
        if (this._frequency)
            return `${prefix}_t_${this._into} = await __env.invokeTimer(_t_${this._base}, _t_${this._interval}, _t_${this._frequency});`;
        return `${prefix}_t_${this._into} = await __env.invokeTimer(_t_${this._base}, _t_${this._interval}, null);`;
    }
}

class InvokeAtTimer {
    constructor(into, time, expiration_date) {
        this._into = into;
        this._time = time;
        this._expiration_date = expiration_date;
    }

    codegen(prefix) {
        if (this._expiration_date)
            return `${prefix}_t_${this._into} = await __env.invokeAtTimer(_t_${this._time}, _t_${this._expiration_date});`;
        return `${prefix}_t_${this._into} = await __env.invokeAtTimer(_t_${this._time}, null);`;
    }
}

class InvokeQuery {
    constructor(kind, attrs, fname, into, args) {
        this._kind = kind;
        this._attrs = attrs;
        this._fname = fname;
        this._into = into;
        this._args = args;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = await __env.invokeQuery(${stringEscape(this._kind)}, ${objectToJS(this._attrs)}, ${stringEscape(this._fname)}, _t_${this._args});`;
    }
}

class InvokeDBQuery {
    constructor(kind, attrs, into, query) {
        this._kind = kind;
        this._attrs = attrs;
        this._into = into;
        this._query = query;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = await __env.invokeDBQuery(${stringEscape(this._kind)}, ${objectToJS(this._attrs)}, _t_${this._query});`;
    }
}

class InvokeStreamVarRef {
    constructor(name, into, args) {
        this._name = name;
        this._into = into;
        this._args = args;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = await __builtin.invokeStreamVarRef(__env, _t_${this._name}${this._args.map((a) => ', _t_' + a).join('')});`;
    }
}

class InvokeAction {
    constructor(kind, attrs, fname, args) {
        this._kind = kind;
        this._attrs = attrs;
        this._fname = fname;
        this._args = args;
    }

    codegen(prefix) {
        return `${prefix}await __env.invokeAction(${stringEscape(this._kind)}, ${objectToJS(this._attrs)}, ${stringEscape(this._fname)}, _t_${this._args});`;
    }
}

class InvokeActionVarRef {
    constructor(name, args) {
        this._name = name;
        this._args = args;
    }

    codegen(prefix) {
        return `${prefix}await _t_${this._name}(__env${this._args.map((a) => ', _t_' + a).join('')});`;
    }
}

class InvokeOutput {
    constructor(outputType, output) {
        this._outputType = outputType;
        this._output = output;
    }

    codegen(prefix) {
        if (this._outputType === null)
            return `${prefix}await __env.output(null, _t_${this._output});`;
        else
            return `${prefix}await __env.output(String(_t_${this._outputType}), _t_${this._output});`;
    }
}

class InvokeReadState {
    constructor(into, stateId) {
        this._into = into;
        this._stateId = stateId;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = await __env.readState(${this._stateId});`;
    }
}

class InvokeWriteState {
    constructor(state, stateId) {
        this._state = state;
        this._stateId = stateId;
    }

    codegen(prefix) {
        return `${prefix}await __env.writeState(${this._stateId}, _t_${this._state});`;
    }
}

class InvokeReadResult {
    constructor(_function, index, into) {
        this._into = into;
        this._function = _function;
        this._index = index;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = await __env.readResult(${stringEscape(this._function)}, _t_${this._index});`;
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
        return `${prefix}await __env.sendEndOfFlow(_t_${this._principal}, _t_${this._flow});`;
    }
}

class ClearGetCache {
    codegen(prefix) {
        return prefix + '__env.clearGetCache();';
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


class ArrayFilterExpression {
    constructor(into, element, array) {
        this._into = into;
        this._element = element;
        this._array = array;
        this.body = new Block;
    }

    codegen(prefix) {
        return prefix + `_t_${this._into} = _t_${this._array}.filter((_t_${this._element}) => {\n` +
            this.body.codegen(prefix + '  ') + '\n' +
            prefix + '});';
    }
}

class AsyncFunctionDeclaration {
    constructor(into, body) {
        this._into = into;
        this._body = body;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = ${this._body.codegenFunction(prefix)};`;
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
        prefix + '  __env.reportError(' + stringEscape(this._message) + ', _exc_);\n' +
        prefix + '}';
    }
}

class ReturnValue {
    constructor(value) {
        this._value = value;
    }

    codegen(prefix) {
        return prefix + `return _t_${this._value};`;
    }
}

class RootBlock extends Block {
    constructor() {
        super();
        this._temps = [];
        this._beginHook = null;
        this._endHook = null;
    }

    setBeginEndHooks(beginHook, endHook) {
        this._beginHook = beginHook;
        this._endHook = endHook;
    }

    declare(reg) {
        this._temps.push(reg);
    }
    codegen(prefix) {
        let buffer = `${prefix}  "use strict";\n`;
        for (let t of this._temps)
            buffer += `${prefix}  let _t_${t};\n`;
        if (this._beginHook) {
            buffer += this._beginHook.codegen(prefix + '  ');
            buffer += '\n';
        }
        if (this._endHook) {
            buffer += `${prefix}  try {\n`;
            buffer += super.codegen(prefix + '    ');
            buffer += '\n';
            buffer += `${prefix}  } finally {\n`;
            buffer += this._endHook.codegen(prefix + '    ');
            buffer += '\n';
            buffer += `${prefix}  }`;
        } else {
            buffer += super.codegen(prefix + '  ');
        }
        return buffer;
    }
}

// eslint-disable-next-line prefer-arrow-callback
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
class IRBuilder {
    constructor(baseRegister = 0, extraArgs = []) {
        this._extraArgs = extraArgs;
        this._nArgs = 0;
        this._baseRegister = baseRegister;
        this._nextRegister = baseRegister;
        this._skipRegisterRanges = [];
        this._nextLabel = 0;
        this._root = new RootBlock;

        this._blockStack = [this._root];
    }

    setBeginEndHooks(beginHook, endHook) {
        this._root.setBeginEndHooks(beginHook, endHook);
    }

    get registerRange() {
        return [this._baseRegister, this._nextRegister];
    }

    get nextRegister() {
        return this._nextRegister;
    }

    skipRegisterRange(range) {
        this._skipRegisterRanges.push(range);
        this._nextRegister = range[1];
    }

    codegen(prefix = '') {
        let nextSkipPos = 0;
        let nextSkip = nextSkipPos >= this._skipRegisterRanges.length ? null : this._skipRegisterRanges[nextSkipPos];

        for (let reg = this._baseRegister + this._nArgs; reg < this._nextRegister; reg++) {
            if (nextSkip && reg >= nextSkip[0]) {
                reg = nextSkip[1];
                reg --;
                nextSkipPos++;
                nextSkip = nextSkipPos >= this._skipRegisterRanges.length ? null : this._skipRegisterRanges[nextSkipPos];
                continue;
            }
            this._root.declare(reg);
        }
        return this._root.codegen(prefix);
    }
    codegenFunction(prefix = '') {
        const args = ['__env', ...this._extraArgs];
        for (let i = 0; i < this._nArgs; i++)
            args.push('_t_' + (this._baseRegister + i));

        return `async function(${args.join(', ')}) {\n${this.codegen(prefix)}\n${prefix}}`;
    }

    compile(scope, asts) {
        let code = this.codegen();
        const args = ['__builtin', '__scope', '__ast', '__env', ...this._extraArgs];
        for (let i = 0; i < this._nArgs; i++)
            args.push('_t_' + i);

        let f = new AsyncFunction(...args, code);
        return f.bind(null, Builtin, scope, asts);
    }

    get _currentBlock() {
        return this._blockStack[this._blockStack.length-1];
    }

    allocRegister() {
        var reg = this._nextRegister++;
        return reg;
    }
    allocArgument() {
        assert(this._baseRegister + this._nArgs === this._nextRegister);
        var reg = this._nextRegister++;
        this._nArgs++;
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
    saveStackState() {
        return this._blockStack.length;
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
    GetIndex,
    SetIndex,
    GetKey,
    SetKey,
    GetASTObject,
    GetVariable,
    GetEnvironment,
    GetScope,
    Iterator,
    LoadConstant,
    LoadContext,
    LoadBuiltin,
    NewObject,
    BinaryFunctionOp,
    BinaryOp,
    UnaryOp,
    UnaryMethodOp,
    BinaryMethodOp,
    VoidFunctionOp,
    FunctionOp,
    MapAndReadField,
    FormatEvent,
    EnterProcedure,
    ExitProcedure,
    InvokeMonitor,
    InvokeTimer,
    InvokeAtTimer,
    InvokeQuery,
    InvokeDBQuery,
    InvokeStreamVarRef,
    InvokeAction,
    InvokeActionVarRef,
    InvokeOutput,
    InvokeReadState,
    InvokeWriteState,
    InvokeEmit,
    InvokeReadResult,
    CheckIsNewTuple,
    AddTupleToState,
    LabeledLoop,
    LabeledBreak,
    LabeledContinue,
    ReturnValue,
    ClearGetCache,
    SendEndOfFlow,
    ForOfStatement,
    AsyncWhileLoop,
    AsyncFunctionExpression,
    AsyncFunctionDeclaration,
    ArrayFilterExpression,
    Break,
    TryCatch
};
