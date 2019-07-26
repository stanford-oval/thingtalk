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
const Builtin = require('../builtin/defs');

const JSIr = require('./jsir');

function getRegister(name, scope) {
    const decl = scope.get(name);
    assert.strictEqual(decl.type, 'scalar');
    return decl.register;
}

function compileEvent(irBuilder, scope, name) {
    let reg;
    if (name === 'type') {
        return getRegister('$outputType', scope);
    } else if (name === 'program_id') {
        reg = irBuilder.allocRegister();
        irBuilder.add(new JSIr.GetEnvironment('program_id', reg));
    } else {
        let hint = name ? 'string-' + name : 'string';
        reg = irBuilder.allocRegister();
        irBuilder.add(new JSIr.FormatEvent(hint, getRegister('$outputType', scope), getRegister('$output', scope), reg));
    }
    return reg;
}

function typeForValue(ast, scope) {
    if (ast.isVarRef) {
        const decl = scope.get(ast.name);
        assert.strictEqual(decl.type, 'scalar');
        return decl.tt_type;
    } else {
        return ast.getType();
    }
}

function compileValue(irBuilder, ast, scope) {
    if (ast.isUndefined)
        throw new Error('Invalid undefined value, should have been slot-filled');
    if (ast.isEvent)
        return compileEvent(irBuilder, scope, ast.name);
    if (ast.isVarRef)
        return getRegister(ast.name, scope);

    if (ast.isArray) {
        const array = irBuilder.allocRegister();
        irBuilder.add(new JSIr.CreateTuple(ast.value.length, array));

        for (let i = 0; i < ast.value.length; i++) {
            const v = ast.value[i];
            const reg = compileValue(irBuilder, v, scope);
            irBuilder.add(new JSIr.SetIndex(array, i, reg));
        }
        return array;
    }

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

    if (type.isNumber && toType.isCurrency) {
        let casted = irBuilder.allocRegister();
        compileUnaryOp(irBuilder, 'get_currency', reg, casted);
        return casted;
    }

    return reg;
}

function isRemoteSend(fn) {
    return (fn.selector.kind === 'org.thingpedia.builtin.thingengine.remote' || fn.selector.kind.startsWith('__dyn_')) &&
        fn.channel === 'send';
}

module.exports = {
    typeForValue,
    getRegister,

    compileUnaryOp,
    compileBinaryOp,
    compileValue,
    compileCast,

    isRemoteSend
};
