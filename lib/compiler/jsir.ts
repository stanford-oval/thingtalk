// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import assert from 'assert';
import * as Builtin from '../runtime/builtins';
import * as Ast from '../ast';
import { stringEscape } from '../utils/escaping';
import type { ExecEnvironment } from '../runtime/exec_environment';

// A register-based IR for ThingTalk to JS
// Typed like ThingTalk

interface Instruction {
    codegen(prefix : string) : string;
}
type Register = number;

// A sequence of instructions
class Block {
    private _instructions : Instruction[];

    constructor() {
        this._instructions = [];
    }

    add(instr : Instruction) {
        this._instructions.push(instr);
    }

    codegen(prefix : string) : string {
        return this._instructions.map((i) => i.codegen(prefix)).join('\n');
    }
}

class Copy {
    private _what : Register;
    private _into : Register;

    constructor(what : Register, into : Register) {
        this._what = what;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = _t_${this._what};`;
    }
}

class CreateTuple {
    private _size : number;
    private _into : Register;

    constructor(size : number, into : Register) {
        this._size = size;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return prefix + '_t_' + this._into + ' = new Array(' + this._size + ');';
    }
}

class CreateObject {
    private _into : Register;

    constructor(into : Register) {
        this._into = into;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = {};`;
    }
}

class SetIndex {
    private _tuple : Register;
    private _idx : number;
    private _value : Register;

    constructor(tuple : Register, idx : number, value : Register) {
        this._tuple = tuple;
        this._idx = idx;
        this._value = value;
    }

    codegen(prefix : string) : string {
        return prefix + '_t_' + this._tuple + '[' + this._idx + '] = _t_' + this._value + ';';
    }
}

class GetIndex {
    private _tuple : Register;
    private _idx : number;
    private _into : Register;

    constructor(tuple : Register, idx : number, into : Register) {
        this._tuple = tuple;
        this._idx = idx;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return prefix + '_t_' + this._into + ' = _t_' + this._tuple + '[' + this._idx + '];';
    }
}

class GetASTObject {
    private _idx : number;
    private _into : Register;

    constructor(idx : number, into : Register) {
        this._idx = idx;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return prefix + '_t_' + this._into + ' = __ast[' + this._idx + '];';
    }
}

class GetKey {
    private _object : Register;
    private _key : string;
    private _into : Register;

    constructor(object : Register, key : string, into : Register) {
        this._object = object;
        this._key = key;
        this._into = into;
    }

    codegen(prefix : string) : string {
        if (this._key.includes('.'))
            return `${prefix}_t_${this._into} = _t_${this._object}["${this._key}"];`;
        return `${prefix}_t_${this._into} = _t_${this._object}.${this._key};`;
    }
}

class SetKey {
    private _object : Register;
    private _key : string;
    private _value : Register|null;

    constructor(object : Register, key : string, value : Register|null) {
        this._object = object;
        this._key = key;
        this._value = value;
    }

    codegen(prefix : string) : string {
        if (this._value === null)
            return `${prefix}_t_${this._object}.${this._key} = null;`;
        else
            return `${prefix}_t_${this._object}.${this._key} = _t_${this._value};`;
    }
}

class GetVariable {
    private _variable : string;
    private _into : Register;

    constructor(variable : string, into : Register) {
        this._variable = variable;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return prefix + '_t_' + this._into + ' = __env._scope.' + this._variable + ';';
    }
}

class GetEnvironment {
    private _variable : string;
    private _into : Register;

    constructor(variable : string, into : Register) {
        this._variable = variable;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = __env.${this._variable};`;
    }
}

class GetScope {
    private _name : string;
    private _into : Register;

    constructor(name : string, into : Register) {
        this._name = name;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = __scope.${this._name};`;
    }
}

class AsyncIterator {
    private _into : Register;
    private _iterable : Register;

    constructor(into : Register, iterable : Register) {
        this._iterable = iterable;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = __builtin.getAsyncIterator(_t_${this._iterable});`;
    }
}

interface ToJSSource {
    toJSSource() : string;
}

function hasJSSource(x : unknown) : x is ToJSSource {
    return typeof x === 'object' && x !== null && 'toJSSource' in x;
}

function anyToJS(js : unknown) : string {
    if (Array.isArray(js))
        return '[' + js.map(anyToJS).join(', ') + ']';
    if (typeof js === 'string')
        return stringEscape(js);
    if (hasJSSource(js))
        return js.toJSSource();
    if (js instanceof Date)
        return `new Date(${js.getTime()})`;
    return String(js);
}

function valueToJSSource(value : Ast.Value|null) : string {
    if (value === null)
        return 'null';
    const js = value.toJS();
    return anyToJS(js);
}

class LoadConstant {
    private _constant : Ast.Value|null;
    private _into : Register;

    constructor(constant : Ast.Value|null, into : Register) {
        this._constant = constant;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return prefix + '_t_' + this._into + ' = ' + valueToJSSource(this._constant) + ';';
    }
}

class LoadBuiltin {
    private _builtin : string;
    private _into : Register;

    constructor(builtin : string, into : Register) {
        this._builtin = builtin;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return prefix + '_t_' + this._into + ' = __builtin.' + this._builtin + ';';
    }
}

class NewObject {
    private _class : string;
    private _into : Register;
    private _args : Register[];

    constructor(classname : string, into : Register, ...args : Register[]) {
        this._class = classname;
        this._into = into;
        this._args = args;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = new __builtin.${this._class}(${this._args.map((a) => '_t_' + a).join(', ')});`;
    }
}

class MapAndReadField {
    private _into : Register;
    private _array : Register;
    private _field : string;

    constructor(into : Register, array : Register, field : string) {
        this._into = into;
        this._array = array;
        this._field = field;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = _t_${this._array}.map(($) => $.${this._field});`;
    }
}

class FormatEvent {
    private _hint : string;
    private _outputType : Register;
    private _output : Register;
    private _into : Register;

    constructor(hint : string,
                outputType : Register,
                output : Register,
                into : Register) {
        this._hint = hint;
        this._outputType = outputType;
        this._output = output;
        this._into = into;
    }

    codegen(prefix : string) : string {
        if (this._outputType === null)
            return `${prefix}_t_${this._into} = await __env.formatEvent(null, _t_${this._output}, ${stringEscape(this._hint)});`;
        else
            return `${prefix}_t_${this._into} = await __env.formatEvent(_t_${this._outputType}, _t_${this._output}, ${stringEscape(this._hint)});`;
    }
}

class VoidFunctionOp {
    private _fn : string;
    private _args : Register[];

    constructor(fn : string, ...args : Register[]) {
        this._fn = fn;
        this._args = args;
    }

    codegen(prefix : string) : string {
        return `${prefix}__builtin.${this._fn}(${this._args.map((a) => '_t_' + a).join(', ')});`;
    }
}

class FunctionOp {
    private _fn : string;
    private _into : Register;
    private _args : Register[];
    private _passEnv : boolean;

    constructor(fn : string, passEnv : boolean, into : Register, ...args : Register[]) {
        this._fn = fn;
        this._into = into;
        this._args = args;
        this._passEnv = passEnv;
    }

    codegen(prefix : string) : string {
        if (this._passEnv)
            return `${prefix}_t_${this._into} = __builtin.${this._fn}(__env, ${this._args.map((a) => '_t_' + a).join(', ')});`;
        else
            return `${prefix}_t_${this._into} = __builtin.${this._fn}(${this._args.map((a) => '_t_' + a).join(', ')});`;
    }
}

class BinaryOp {
    private _a : Register;
    private _b : Register;
    private _op : string;
    private _into : Register;

    constructor(a : Register, b : Register, op : string, into : Register) {
        this._a = a;
        this._b = b;
        this._op = op;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return prefix + '_t_' + this._into + ' = ' + '_t_' + this._a + ' ' + this._op + ' ' + '_t_' + this._b + ';';
    }
}

class UnaryOp {
    private _v : Register;
    private _op : string;
    private _into : Register;

    constructor(v : Register, op : string, into : Register) {
        this._v = v;
        this._op = op;
        this._into = into;
    }

    codegen(prefix : string) : string {
        return prefix + '_t_' + this._into + ' = ' + this._op + ' (' + '_t_' + this._v + ');';
    }
}

class MethodOp {
    private _obj : Register;
    private _args : Register[];
    private _op : string;

    constructor(obj : Register, op : string, ...args : Register[]) {
        this._obj = obj;
        this._args = args;
        this._op = op;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._obj}.${this._op}(${this._args.map((a) => '_t_' + a).join(', ')});`;
    }
}

function objectToJS(obj : { [key : string] : unknown }) : string {
    let buffer = '{ ';
    for (const key in obj)
        buffer += `${key}: ${anyToJS(obj[key])}, `;
    buffer += '}';
    return buffer;
}

class EnterProcedure {
    private _procid : number;
    private _procname : string|null;

    constructor(procid : number, procname : string|null = null) {
        this._procid = procid;
        this._procname = procname;
    }

    codegen(prefix : string) : string {
        return `${prefix}await __env.enterProcedure(${this._procid}, ${stringEscape(this._procname)});`;
    }
}

class ExitProcedure {
    private _procid : number;
    private _procname : string|null;

    constructor(procid : number, procname : string|null = null) {
        this._procid = procid;
        this._procname = procname;
    }

    codegen(prefix : string) : string {
        return `${prefix}await __env.exitProcedure(${this._procid}, ${stringEscape(this._procname)});`;
    }
}

interface QueryInvocationHints {
    projection : string[];
    filter ?: Register;
    sort ?: [string, 'asc' | 'desc'];
    limit ?: number;
}

function invocationHintsToJS(hints : QueryInvocationHints) : string {
    let buffer = `{ projection: [${hints.projection.map(stringEscape).join(', ')}]`;
    if (hints.filter !== undefined)
        buffer += `, filter: _t_${hints.filter}`;
    if (hints.sort !== undefined)
        buffer += `, sort: [${hints.sort.map(stringEscape).join(', ')}]`;
    if (hints.limit !== undefined)
        buffer += `, limit: ${hints.limit}`;
    buffer += ' }';
    return buffer;
}

export type AttributeMap = { [key : string] : unknown };

class InvokeMonitor {
    private _kind : string;
    private _attrs : AttributeMap;
    private _fname : string;
    private _into : Register;
    private _args : Register;
    private _hints : QueryInvocationHints;

    constructor(kind : string,
                attrs : { [key : string] : unknown },
                fname : string,
                into : Register,
                args : Register,
                hints : QueryInvocationHints) {
        this._kind = kind;
        this._attrs = attrs;
        this._fname = fname;
        this._into = into;
        this._args = args;
        this._hints = hints;
    }

    codegen(prefix : string) : string {
        const hints = invocationHintsToJS(this._hints);
        return `${prefix}_t_${this._into} = await __env.invokeMonitor(${stringEscape(this._kind)}, ${objectToJS(this._attrs)}, ${stringEscape(this._fname)}, _t_${this._args}, ${hints});`;
    }
}

class InvokeTimer {
    private _into : Register;
    private _base : Register;
    private _interval : Register;
    private _frequency : Register|null;

    constructor(into : Register, base : Register, interval : Register, frequency : Register|null) {
        this._into = into;
        this._base = base;
        this._interval = interval;
        this._frequency = frequency;
    }

    codegen(prefix : string) : string {
        if (this._frequency)
            return `${prefix}_t_${this._into} = await __env.invokeTimer(_t_${this._base}, _t_${this._interval}, _t_${this._frequency});`;
        return `${prefix}_t_${this._into} = await __env.invokeTimer(_t_${this._base}, _t_${this._interval}, null);`;
    }
}

class InvokeAtTimer {
    private _into : Register;
    private _time : Register;
    private _expiration_date : Register|null;

    constructor(into : Register, time : Register, expiration_date : Register|null) {
        this._into = into;
        this._time = time;
        this._expiration_date = expiration_date;
    }

    codegen(prefix : string) : string {
        if (this._expiration_date)
            return `${prefix}_t_${this._into} = await __env.invokeAtTimer(_t_${this._time}, _t_${this._expiration_date});`;
        return `${prefix}_t_${this._into} = await __env.invokeAtTimer(_t_${this._time}, null);`;
    }
}

class InvokeOnTimer {
    private _into : Register;
    private _date : Register;

    constructor(into : Register, date : Register) {
        this._into = into;
        this._date = date;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = await __env.invokeOnTimer(_t_${this._date});`;
    }
}

class InvokeQuery {
    private _kind : string;
    private _attrs : AttributeMap;
    private _fname : string;
    private _into : Register;
    private _args : Register;
    private _hints : QueryInvocationHints;

    constructor(kind : string,
                attrs : AttributeMap,
                fname : string,
                into : Register,
                args : Register,
                hints : QueryInvocationHints) {
        this._kind = kind;
        this._attrs = attrs;
        this._fname = fname;
        this._into = into;
        this._args = args;
        this._hints = hints;
    }

    codegen(prefix : string) : string {
        const hints = invocationHintsToJS(this._hints);
        return `${prefix}_t_${this._into} = await __env.invokeQuery(${stringEscape(this._kind)}, ${objectToJS(this._attrs)}, ${stringEscape(this._fname)}, _t_${this._args}, ${hints});`;
    }
}

class InvokeDBQuery {
    private _kind : string;
    private _attrs : AttributeMap;
    private _into : Register;
    private _query : Register;

    constructor(kind : string,
                attrs : AttributeMap,
                into : Register,
                query : Register) {
        this._kind = kind;
        this._attrs = attrs;
        this._into = into;
        this._query = query;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = await __env.invokeDBQuery(${stringEscape(this._kind)}, ${objectToJS(this._attrs)}, _t_${this._query});`;
    }
}

class InvokeStreamVarRef {
    private _name : Register;
    private _into : Register;
    private _args : Register[];

    constructor(name : Register, into : Register, args : Register[]) {
        this._name = name;
        this._into = into;
        this._args = args;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = await __builtin.invokeStreamVarRef(__env, _t_${this._name}${this._args.map((a) => ', _t_' + a).join('')});`;
    }
}

class InvokeAction {
    private _kind : string;
    private _attrs : AttributeMap;
    private _fname : string;
    private _into : Register;
    private _args : Register;

    constructor(kind : string,
                attrs : AttributeMap,
                fname : string,
                into : Register,
                args : Register) {
        this._kind = kind;
        this._attrs = attrs;
        this._fname = fname;
        this._into = into;
        this._args = args;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = __env.invokeAction(${stringEscape(this._kind)}, ${objectToJS(this._attrs)}, ${stringEscape(this._fname)}, _t_${this._args});`;
    }
}

class InvokeOutput {
    private _outputType : Register;
    private _output : Register;

    constructor(outputType : Register, output : Register) {
        this._outputType = outputType;
        this._output = output;
    }

    codegen(prefix : string) : string {
        return `${prefix}await __env.output(String(_t_${this._outputType}), _t_${this._output});`;
    }
}

class InvokeReadState {
    private _into : Register;
    private _stateId : number;

    constructor(into : Register, stateId : number) {
        this._into = into;
        this._stateId = stateId;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = await __env.readState(${this._stateId});`;
    }
}

class InvokeWriteState {
    private _state : Register;
    private _stateId : number;

    constructor(state : Register, stateId : number) {
        this._state = state;
        this._stateId = stateId;
    }

    codegen(prefix : string) : string {
        return `${prefix}await __env.writeState(${this._stateId}, _t_${this._state});`;
    }
}

class CheckIsNewTuple {
    private _into : Register;
    private _state : Register;
    private _tuple : Register;
    private _keys : string[];

    constructor(into : Register, state : Register, tuple : Register, keys : string[]) {
        this._into = into;
        this._state = state;
        this._tuple = tuple;
        this._keys = keys;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = __builtin.isNewTuple(_t_${this._state}, _t_${this._tuple}, [${
            this._keys.map(stringEscape).join(', ')}]);`;
    }
}

class AddTupleToState {
    private _into : Register;
    private _state : Register;
    private _tuple : Register;

    constructor(into : Register, state : Register, tuple : Register) {
        this._into = into;
        this._state = state;
        this._tuple = tuple;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = __builtin.addTuple(_t_${this._state}, _t_${this._tuple});`;
    }
}

class SendEndOfFlow {
    private _principal : Register;
    private _flow : Register;

    constructor(principal : Register, flow : Register) {
        this._principal = principal;
        this._flow = flow;
    }

    codegen(prefix : string) : string {
        return `${prefix}await __env.sendEndOfFlow(_t_${this._principal}, _t_${this._flow});`;
    }
}

class ClearGetCache {
    codegen(prefix : string) : string {
        return prefix + '__env.clearGetCache();';
    }
}

class Break {
    codegen(prefix : string) : string {
        return prefix + 'break;';
    }
}

class IfStatement {
    private _cond : Register;
    iftrue : Block;
    iffalse : Block;

    constructor(cond : Register) {
        this._cond = cond;
        this.iftrue = new Block;
        this.iffalse = new Block;
    }

    codegen(prefix : string) : string {
        return prefix + 'if (_t_' + this._cond + ') {\n' +
            this.iftrue.codegen(prefix + '  ') + '\n'
            + prefix + '} else {\n' +
            this.iffalse.codegen(prefix + '  ') + '\n'
            + prefix + '}';
    }
}

class ForOfStatement {
    private _into : Register;
    private _iterable : Register;
    body : Block;

    constructor(into : Register, iterable : Register) {
        this._into = into;
        this._iterable = iterable;
        this.body = new Block;
    }

    codegen(prefix : string) : string {
        return prefix + 'for (_t_' + this._into + ' of _t_' + this._iterable + ') {\n' +
            this.body.codegen(prefix + '  ') + '\n'
            + prefix + '}';
    }
}

class AsyncWhileLoop {
    private _into : Register;
    private _iterator : Register;
    body : Block;

    constructor(into : Register, iterator : Register) {
        this._into = into;
        this._iterator = iterator;
        this.body = new Block;
    }

    codegen(prefix : string) : string {
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
    private _into : Register;
    body : Block;

    constructor(into : Register) {
        this._into = into;
        this.body = new Block;
    }

    codegen(prefix : string) : string {
        return prefix + `_t_${this._into} = async function(__emit) {\n` +
            this.body.codegen(prefix + '  ') + '\n' +
            prefix + '}';
    }
}


class ArrayFilterExpression {
    private _into : Register;
    private _element : Register;
    private _array : Register;
    body : Block;

    constructor(into : Register, element : Register, array : Register) {
        this._into = into;
        this._element = element;
        this._array = array;
        this.body = new Block;
    }

    codegen(prefix : string) : string {
        return prefix + `_t_${this._into} = _t_${this._array}.filter((_t_${this._element}) => {\n` +
            this.body.codegen(prefix + '  ') + '\n' +
            prefix + '});';
    }
}

class AsyncFunctionDeclaration {
    private _into : Register;
    private _body : IRBuilder;

    constructor(into : Register, body : IRBuilder) {
        this._into = into;
        this._body = body;
    }

    codegen(prefix : string) : string {
        return `${prefix}_t_${this._into} = ${this._body.codegenFunction(prefix)};`;
    }
}

class InvokeEmit {
    private _values : Register[];

    constructor(...values : Register[]) {
        this._values = values;
    }

    codegen(prefix : string) : string {
        return `${prefix}__emit(${this._values.map((v) => '_t_' + v).join(', ')});`;
    }
}

class LabeledLoop {
    private _label : string;
    body : Block;

    constructor(label : string) {
        this._label = label;
        this.body = new Block;
    }

    codegen(prefix : string) : string {
        return prefix + `_l_${this._label}: while (true) {\n` +
            this.body.codegen(prefix + '  ') + '\n' +
            prefix + '}';
    }
}

class LabeledBreak {
    private _label : string;

    constructor(label : string) {
        this._label = label;
    }

    codegen(prefix : string) : string {
        return `${prefix}break _l_${this._label};`;
    }
}

class LabeledContinue {
    private _label : string;

    constructor(label : string) {
        this._label = label;
    }

    codegen(prefix : string) : string {
        return `${prefix}continue _l_${this._label};`;
    }
}

class TryCatch {
    private _message : string;
    try : Block;

    constructor(message : string) {
        this._message = message;
        this.try = new Block;
    }

    codegen(prefix : string) : string {
        return prefix + 'try {\n' +
        this.try.codegen(prefix + '  ') + '\n' +
        prefix + '} catch(_exc_) {\n' +
        prefix + '  __env.reportError(' + stringEscape(this._message) + ', _exc_);\n' +
        prefix + '}';
    }
}

class ReturnValue {
    private _value : Register;

    constructor(value : Register) {
        this._value = value;
    }

    codegen(prefix : string) : string {
        return prefix + `return _t_${this._value};`;
    }
}

class RootBlock extends Block {
    private _temps : Register[];
    private _beginHook : Instruction|null;
    private _endHook : Instruction|null;

    constructor() {
        super();
        this._temps = [];
        this._beginHook = null;
        this._endHook = null;
    }

    setBeginEndHooks(beginHook : Instruction|null, endHook : Instruction|null) : void {
        this._beginHook = beginHook;
        this._endHook = endHook;
    }

    declare(reg : Register) : void {
        this._temps.push(reg);
    }
    codegen(prefix : string) : string {
        let buffer = `${prefix}  "use strict";\n`;
        for (const t of this._temps)
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

type RegisterRange = [Register, Register];

type TopLevelScope = { [key : string] : unknown };

// eslint-disable-next-line prefer-arrow-callback
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
class IRBuilder {
    private _extraArgs : string[];
    private _nArgs : number;
    private _baseRegister : Register;
    private _nextRegister : Register;
    private _skipRegisterRanges : RegisterRange[];
    private _nextLabel : number;
    private _root : RootBlock;
    private _blockStack : Block[];

    constructor(baseRegister = 0, extraArgs : string[] = []) {
        this._extraArgs = extraArgs;
        this._nArgs = 0;
        this._baseRegister = baseRegister;
        this._nextRegister = baseRegister;
        this._skipRegisterRanges = [];
        this._nextLabel = 0;
        this._root = new RootBlock;

        this._blockStack = [this._root];
    }

    setBeginEndHooks(beginHook : Instruction|null, endHook : Instruction|null) : void {
        this._root.setBeginEndHooks(beginHook, endHook);
    }

    get registerRange() : RegisterRange {
        return [this._baseRegister, this._nextRegister];
    }

    get nextRegister() : Register {
        return this._nextRegister;
    }

    skipRegisterRange(range : RegisterRange) : void {
        this._skipRegisterRanges.push(range);
        this._nextRegister = range[1];
    }

    codegen(prefix = '') : string {
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
    codegenFunction(prefix = '') : string {
        const args = ['__env', ...this._extraArgs];
        for (let i = 0; i < this._nArgs; i++)
            args.push('_t_' + (this._baseRegister + i));

        return `async function(${args.join(', ')}) {\n${this.codegen(prefix)}\n${prefix}}`;
    }

    compile(scope : TopLevelScope, asts : Ast.Node[]) : (x : ExecEnvironment) => Promise<void> {
        const code = this.codegen();
        const args = ['__builtin', '__scope', '__ast', '__env', ...this._extraArgs];
        for (let i = 0; i < this._nArgs; i++)
            args.push('_t_' + i);

        const f = new AsyncFunction(...args, code);
        return f.bind(null, Builtin, scope, asts);
    }

    private get _currentBlock() : Block {
        return this._blockStack[this._blockStack.length-1];
    }

    allocRegister() : Register {
        const reg = this._nextRegister++;
        return reg;
    }
    allocArgument() : Register {
        assert(this._baseRegister + this._nArgs === this._nextRegister);
        const reg = this._nextRegister++;
        this._nArgs++;
        return reg;
    }
    allocLabel() : number {
        const lbl = this._nextLabel++;
        return lbl;
    }
    pushBlock(block : Block) : number {
        const now = this._blockStack.length;
        this._blockStack.push(block);
        return now;
    }
    popBlock() : void {
        this._blockStack.pop();
        if (this._blockStack.length === 0)
            throw new Error('Invalid pop');
    }
    saveStackState() : number {
        return this._blockStack.length;
    }
    popTo(upto : number) : void {
        this._blockStack.length = upto;
    }
    popAll() : void {
        this._blockStack.length = 0;
        this._blockStack[0] = this._root;
    }
    add(instr : Instruction) : void {
        this._currentBlock.add(instr);
    }
}

export {
    Register,
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
    AsyncIterator,
    LoadConstant,
    LoadBuiltin,
    NewObject,
    BinaryOp,
    UnaryOp,
    MethodOp,
    VoidFunctionOp,
    FunctionOp,
    MapAndReadField,
    FormatEvent,
    EnterProcedure,
    ExitProcedure,
    InvokeMonitor,
    InvokeTimer,
    InvokeAtTimer,
    InvokeOnTimer,
    InvokeQuery,
    InvokeDBQuery,
    InvokeStreamVarRef,
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
