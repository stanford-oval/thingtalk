// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
"use strict";

const assert = require('assert');
const Builtin = require('../builtin/defs');
const NodeVisitor = require('../ast/visitor');

const JSIr = require('./jsir');
const Scope = require('./scope');

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

/**
 * Read a parameter from a result object and put it in the current scope.
 *
 * This function handles nested compound types correctly, by checking that
 * the object is not null/undefined before reading.
 */
function readResultKey(irBuilder, currentScope, result, key, fullName, type, isInVarScopeNames) {
    let reg = irBuilder.allocRegister();
    irBuilder.add(new JSIr.GetKey(result, key, reg));

    currentScope.set(fullName, {
        type: 'scalar',
        tt_type: type,
        register: reg,
        direction: 'output',
        isInVarScopeNames
    });

    if (type.isCompound) {
        let ifStmt = new JSIr.IfStatement(reg);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        for (let field in type.fields) {
            if (field.indexOf('.') >= 0)
                continue;
            let fieldtype = type.fields[field].type;
            readResultKey(irBuilder, currentScope, reg, field, fullName + '.' + field, fieldtype, false);
        }
        irBuilder.popBlock();
    }
}

/**
 * Reads all variables that are present in currentScope from the
 * passed-in result object.
 *
 * This is used to re-establish a scope at the end of an aggregation
 * or stream operation.
 *
 * @internal
 */
function readScopeVariables(irBuilder, currentScope, outputType, resultReg) {
    let newScope = new Scope(currentScope.parent);
    newScope.set('$outputType', {
        type: 'scalar',
        tt_type: null,
        register: outputType,
        direction: 'special',
        isInVarScopeNames: false
    });
    newScope.set('$output', {
        type: 'scalar',
        tt_type: null,
        register: resultReg,
        direction: 'special',
        isInVarScopeNames: false
    });

    for (let name of currentScope.ownKeys()) {
        if (name.startsWith('$'))
            continue;

        // ignore nested names, readResultKey will take care of those
        if (name.indexOf('.') >= 0)
            continue;

        const currentScopeObj = currentScope.get(name);
        readResultKey(irBuilder, newScope, resultReg, name, name,
            currentScopeObj.tt_type, currentScopeObj.isInVarScopeNames);
    }

    return newScope;
}

function getDefaultProjection(schema) {
    if (!schema)
        return [];

    if (schema.default_projection && schema.default_projection.length > 0)
        return schema.default_projection;

    // if no #[default_projection] is specified, then we project all
    // arguments
    let projection = [];
    for (let arg of schema.iterateArguments())
        projection.push(arg.name);
    return projection;
}


/**
 * Compute all the parameters used in a filter or scalar expression
 *
 * This is a slight over-approximation, because it will also include parameters
 * in a get-predicate that have the same name. This is ok because it is only
 * used as a hint to the query function (which otherwise would have to return everything),
 * and I think the slight loss in performance is acceptable to keep the code complexity low.
 */
function getExpressionParameters(filter, schema) {
    const names = new Set;
    filter.visit(new class extends NodeVisitor {
        visitValue(value) {
            if (value.isVarRef && schema.hasArgument(value.name))
                names.add(value.name);
            return true;
        }

        visitAtomBooleanExpression(atom) {
            if (schema.hasArgument(atom.name))
                names.add(atom.name);
            return true;
        }

        visitDontCareBooleanExpression(atom) {
            if (schema.hasArgument(atom.name))
                names.add(atom.name);
            return true;
        }
    });
    return names;
}


module.exports = {
    typeForValue,
    getRegister,

    compileUnaryOp,
    compileBinaryOp,
    compileEvent,
    compileCast,

    isRemoteSend,

    readResultKey,
    readScopeVariables,

    getDefaultProjection,
    getExpressionParameters
};
