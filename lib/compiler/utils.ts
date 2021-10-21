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
import * as Builtin from '../operators';
import NodeVisitor from '../ast/visitor';
import * as Ast from '../ast';
import Type from '../type';

import * as JSIr from './jsir';
import Scope from './scope';

function getRegister(name : string, scope : Scope) : JSIr.Register {
    const decl = scope.get(name);
    assert(decl.type === 'scalar');
    return decl.register;
}

export type EventType = 'type' | 'program_id' | 'title' | 'body' | null;

function compileEvent(irBuilder : JSIr.IRBuilder, scope : Scope, name : EventType) : JSIr.Register {
    let reg;
    if (name === 'type') {
        return getRegister('$outputType', scope);
    } else if (name === 'program_id') {
        reg = irBuilder.allocRegister();
        irBuilder.add(new JSIr.GetEnvironment('program_id', reg));
    } else {
        const hint = name ? 'string-' + name : 'string';
        reg = irBuilder.allocRegister();
        irBuilder.add(new JSIr.FormatEvent(hint, getRegister('$outputType', scope), getRegister('$output', scope), reg));
    }
    return reg;
}

function typeForValue(ast : Ast.Value, scope : Scope) : Type {
    if (ast instanceof Ast.VarRefValue) {
        const decl = scope.get(ast.name);
        assert(decl.type === 'scalar');
        assert(decl.tt_type);
        return decl.tt_type;
    } else {
        return ast.getType();
    }
}

function compileUnaryOp(irBuilder : JSIr.IRBuilder,
                        op : keyof typeof Builtin.UnaryOps,
                        arg : JSIr.Register,
                        into : JSIr.Register) : void {
    const unaryOp = Builtin.UnaryOps[op];
    if (unaryOp.op)
        irBuilder.add(new JSIr.UnaryOp(arg, unaryOp.op, into));
    else
        irBuilder.add(new JSIr.UnaryOp(arg, '__builtin.' + unaryOp.fn, into));
}

function compileCast(irBuilder : JSIr.IRBuilder,
                     reg : JSIr.Register,
                     type : Type,
                     toType : Type) : JSIr.Register {
    if (type.equals(toType)) {
        if (type instanceof Type.Entity && (type.type === 'tt:hashtag' || type.type === 'tt:username' || type.type === 'tt:picture')) {
            // for compatibility with the ton of devices that take inputs of these types, we auto-cast to string,
            // this is ok because these types don't really need .display that much
            const casted = irBuilder.allocRegister();
            irBuilder.add(new JSIr.UnaryOp(reg, 'String', casted));
            return casted;
        }
        return reg;
    }

    if (toType.isString) {
        const casted = irBuilder.allocRegister();
        irBuilder.add(new JSIr.UnaryOp(reg, 'String', casted));
        return casted;
    }

    if (type.isDate && toType.isTime) {
        const casted = irBuilder.allocRegister();
        compileUnaryOp(irBuilder, 'get_time', reg, casted);
        return casted;
    }

    if (type.isNumber && toType.isCurrency) {
        const casted = irBuilder.allocRegister();
        compileUnaryOp(irBuilder, 'get_currency', reg, casted);
        return casted;
    }

    return reg;
}

function isRemoteSend(fn : Ast.Invocation) : boolean {
    const selector = fn.selector as Ast.DeviceSelector;

    return (selector.kind === 'org.thingpedia.builtin.thingengine.remote' || selector.kind.startsWith('__dyn_')) &&
        fn.channel === 'send';
}

/**
 * Read a parameter from a result object and put it in the current scope.
 *
 * This function handles nested compound types correctly, by checking that
 * the object is not null/undefined before reading.
 */
function readResultKey(irBuilder : JSIr.IRBuilder,
                       currentScope : Scope,
                       result : JSIr.Register,
                       key : string,
                       fullName : string,
                       type : Type|null,
                       isInVarScopeNames : boolean) : void {
    const reg = irBuilder.allocRegister();
    irBuilder.add(new JSIr.GetKey(result, key, reg));

    currentScope.set(fullName, {
        type: 'scalar',
        tt_type: type,
        register: reg,
        direction: 'output',
        isInVarScopeNames
    });

    if (type instanceof Type.Compound) {
        const ifStmt = new JSIr.IfStatement(reg);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        for (const field in type.fields) {
            if (field.indexOf('.') >= 0)
                continue;
            const fieldtype = type.fields[field].type;
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
function readScopeVariables(irBuilder : JSIr.IRBuilder,
                            currentScope : Scope,
                            outputType : JSIr.Register,
                            resultReg : JSIr.Register) : Scope {
    const newScope = new Scope(currentScope.parent);
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

    for (const name of currentScope.ownKeys()) {
        if (name.startsWith('$'))
            continue;

        // ignore nested names, readResultKey will take care of those
        if (name.indexOf('.') >= 0)
            continue;

        const currentScopeObj = currentScope.get(name);
        assert(currentScopeObj.type === 'scalar');
        readResultKey(irBuilder, newScope, resultReg, name, name,
            currentScopeObj.tt_type, currentScopeObj.isInVarScopeNames);
    }

    return newScope;
}

function getDefaultProjection(schema : Ast.FunctionDef|null) : string[] {
    if (!schema)
        return [];

    if (schema.default_projection && schema.default_projection.length > 0)
        return schema.default_projection;

    // if no #[default_projection] is specified, then we project all
    // arguments
    const projection = [];
    for (const arg of schema.iterateArguments()) {
        if (!arg.is_input)
            projection.push(arg.name);
    }
    return projection;
}

class GetExpressionParameterVisitor extends NodeVisitor {
    names = new Set<string>();
    constructor(public schema : Ast.FunctionDef) {
        super();
    }

    visitVarRefValue(value : Ast.VarRefValue) {
        if (this.schema.hasArgument(value.name))
            this.names.add(value.name);
        return true;
    }

    visitAtomBooleanExpression(atom : Ast.AtomBooleanExpression) {
        if (this.schema.hasArgument(atom.name))
            this.names.add(atom.name);
        return true;
    }

    visitDontCareBooleanExpression(atom : Ast.DontCareBooleanExpression) {
        if (this.schema.hasArgument(atom.name))
            this.names.add(atom.name);
        return true;
    }
}

/**
 * Compute all the parameters used in a filter or scalar expression
 *
 * This is a slight over-approximation, because it will also include parameters
 * in a get-predicate that have the same name. This is ok because it is only
 * used as a hint to the query function (which otherwise would have to return everything),
 * and I think the slight loss in performance is acceptable to keep the code complexity low.
 */
function getExpressionParameters(expression : Ast.Node,
                                 schema : Ast.FunctionDef) : Set<string> {
    const visitor = new GetExpressionParameterVisitor(schema);
    expression.visit(visitor);
    return visitor.names;
}


export {
    typeForValue,
    getRegister,

    compileUnaryOp,
    compileEvent,
    compileCast,

    isRemoteSend,

    readResultKey,
    readScopeVariables,

    getDefaultProjection,
    getExpressionParameters
};
