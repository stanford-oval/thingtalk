// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
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

class CreateTuple {
    constructor(size, into) {
        this._size = size;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = new Array(' + this._size + ');';
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
        return prefix + '_t_' + this._into + ' = new __builtin.Aggregation(' + type + ', ' + field + ', ' + cols + ');';
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

function valueToJSSource(value) {
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
    constructor(hint, channel, input, output, into) {
        this._hint = hint;
        this._input = input;
        this._output = output;
        this._channel = channel;
        this._into = into;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = yield env.formatEvent(_t_' + this._channel + ', _t_' + this._input + ', _t_' + this._output + ', ' + stringEscape(this._hint) + ');';
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
        return prefix + '_t_' + this._into + ' = __builtin.' + this._fn + '(' + '_t_' + this._a + ', ' + '_t_' + this._b + ');';
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

class InvokeTrigger {
    constructor(f, into, args, once) {
        this._f = f;
        this._into = into;
        this._args = args;
        this._once = once;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = yield env.invokeTrigger(' + this._f + ', _t_' + this._args + ', ' + this._once + ');';
    }
}

class InvokeQuery {
    constructor(f, into, args) {
        this._f = f;
        this._into = into;
        this._args = args;
    }

    codegen(prefix) {
        return prefix + '_t_' + this._into + ' = yield env.invokeQuery(' + this._f + ', _t_' + this._args + ');';
    }
}

class InvokeAction {
    constructor(f, args) {
        this._f = f;
        this._args = args;
    }

    codegen(prefix) {
        return prefix + 'yield env.invokeAction(' + this._f + ', _t_' + this._args + ');';
    }
}

class InvokeOutput {
    constructor(outputType, output, channel) {
        this._outputType = outputType;
        this._output = output;
        this._channel = channel;
    }

    codegen(prefix) {
        return prefix + 'yield env.output(String(_t_' + this._outputType + '), _t_' + this._output + ', _t_' + this._channel + ');';
    }
}

class InvokeMemoryQuery {
    constructor(into, table, version, aggregation) {
        this._into = into;
        this._table = table;
        this._version = version;
        this._aggregation = aggregation;
    }

    codegen(prefix) {
        let aggregation;
        if (this._aggregation) {
            aggregation  = '_t_' + this._aggregation;
        } else {
            aggregation = 'null';
        }
        return `${prefix}_t_${this._into} = yield env.invokeMemoryQuery(${stringEscape(this._table)}, _t_${this._version}, ${aggregation});`;
    }
}

class GetTableVersion {
    constructor(into, table) {
        this._into = into;
        this._table = table;
    }

    codegen(prefix) {
        return `${prefix}_t_${this._into} = yield env.getTableVersion(${stringEscape(this._table)});`;
    }
}

function dictionaryEscape(dict) {
    let buf = '{'
    for (let name in dict)
        buf += `${stringEscape(name)}: _t_${dict[name]},`;
    buf += '}';
    return buf;
}

class InvokeSave {
    constructor(into, table, versions, params) {
        this._into = into;
        this._table = table;
        this._versions = versions;
        this._params = params;
    }

    codegen(prefix) {
        if (this._into >= 0)
            return `${prefix}_t_${this._into} = yield env.save(${stringEscape(this._table)}, ${dictionaryEscape(this._versions)}, _t_${this._params});`;
        else
            return `${prefix}yield env.save(${stringEscape(this._table)}, ${dictionaryEscape(this._versions)}, _t_${this._params});`;
    }
}

class SendEndOfFlow {
    constructor(principal, flow) {
        this._principal = principal;
        this._flow = flow;
    }

    codegen(prefix) {
        return prefix + `yield env.sendEndOfFlow(_t_${this._principal}, _t_${this._flow});`
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
            prefix + '  let _iter_tmp = yield _t_' + this._iterator + '.next();\n' +
            prefix + '  while (!_iter_tmp.done) {\n' +
            prefix + '    _t_' + this._into + ' = _iter_tmp.value;\n' +
            this.body.codegen(prefix + '    ') + '\n' +
            prefix + '    _iter_tmp = yield _t_' + this._iterator + '.next();\n' +
            prefix + '  }\n' +
            prefix + '}';
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

function _generatorToAsync(fn) {
    return function () {
        var gen = fn.apply(this, arguments);
        return new Promise((resolve, reject) => {
            function step(key, arg) {
                try {
                    var info = gen[key](arg);
                    var value = info.value;
                } catch (error) {
                    reject(error);
                    return;
                }
                if (info.done)
                    resolve(value);
                else
                    Promise.resolve(value).then((value) => { step("next", value); }, (err) => { step("throw", err); });
            }
            step("next");
        });
    };
}

const GeneratorFunction = Object.getPrototypeOf(function*(){}).constructor;
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
        let f = new GeneratorFunction('__builtin', 'env', code);
        return _generatorToAsync(f).bind(null, Builtin);
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
        this._blockStack.push(block);
    }
    popBlock() {
        this._blockStack.pop();
        if (this._blockStack.length === 0)
            throw new Error('Invalid pop');
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
    CreateTuple,
    CreateAggregation,
    GetIndex,
    SetIndex,
    GetVariable,
    GetEnvironment,
    LoadConstant,
    BinaryFunctionOp,
    BinaryOp,
    UnaryOp,
    FormatEvent,
    InvokeTrigger,
    InvokeQuery,
    InvokeAction,
    InvokeOutput,
    InvokeMemoryQuery,
    InvokeSave,
    LabeledLoop,
    LabeledBreak,
    LabeledContinue,
    GetTableVersion,
    ClearGetCache,
    SendEndOfFlow,
    ForOfStatement,
    AsyncWhileLoop,
    Break,
    TryCatch
};
