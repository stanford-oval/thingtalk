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
import * as Ast from '../ast';
import Type from '../type';

import * as JSIr from './jsir';
import { getRegister, typeForValue } from './utils';
import Scope from './scope';
import type OpCompiler from './ops-to-jsir';

const AggregationInit = {
    'min': Infinity,
    'max': -Infinity,
    'argmin': Infinity,
    'argmax': -Infinity,
    'sum': 0
};
export type SimpleAggregationType = keyof typeof AggregationInit;


function setScopeFromResult(currentScope : Scope,
                            newScope : Scope,
                            tuple : JSIr.Register,
                            irBuilder : JSIr.IRBuilder,
                            prefix = '') {
    for (const name of currentScope.ownKeys()) {
        if (name.startsWith('$'))
            continue;
        if (!name.startsWith(prefix))
            continue;

        const unprefixedname = name.substring(prefix.length);
        if (unprefixedname.indexOf('.') >= 0)
            continue;
        const value = irBuilder.allocRegister();

        irBuilder.add(new JSIr.GetKey(tuple, unprefixedname, value));
        const currentScopeObj = currentScope.get(name);
        assert(currentScopeObj.type === 'scalar');
        newScope.set(name, {
            type: 'scalar',
            tt_type: currentScopeObj.tt_type,
            register: value,
            direction: currentScopeObj.direction,
            isInVarScopeNames: currentScopeObj.isInVarScopeNames
        });

        if (currentScopeObj.tt_type instanceof Type.Compound) {
            const ifStmt = new JSIr.IfStatement(value);
            irBuilder.add(ifStmt);
            irBuilder.pushBlock(ifStmt.iftrue);
            setScopeFromResult(currentScope, newScope, value, irBuilder, prefix + unprefixedname + '.');
            irBuilder.popBlock();
        }
    }
}

/**
 * An operation the manipulates each produced tuple and a state.
 */
abstract class ReduceOp<StateType> {
    abstract init(irBuilder : JSIr.IRBuilder,
                  currentScope : Scope,
                  compiler : OpCompiler) : StateType;

    abstract advance(state : StateType,
                     irBuilder : JSIr.IRBuilder,
                     currentScope : Scope,
                     varScopeNames : string[],
                     compiler : OpCompiler) : void;

    abstract finish(state : StateType,
                    irBuilder : JSIr.IRBuilder,
                    currentScope : Scope,
                    varScopeNames : string[],
                    compiler : OpCompiler) : [Scope, string[]];
}
export default ReduceOp;

namespace ReduceOp {

abstract class AggregationOp<StateType> extends ReduceOp<StateType> {
    abstract operator : string;
    abstract field : string;
    abstract type : Type;

    protected abstract compute(state : StateType, irBuilder : JSIr.IRBuilder) : JSIr.Register;

    finish(state : StateType,
           irBuilder : JSIr.IRBuilder,
           currentScope : Scope,
           varScopeNames : string[]) : [Scope, string[]] {
        const newOutputType = irBuilder.allocRegister();
        const keyword = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.String(this.operator), keyword));
        irBuilder.add(new JSIr.FunctionOp('aggregateOutputType', false, newOutputType, keyword, getRegister('$outputType', currentScope)));

        const newTuple = irBuilder.allocRegister();
        irBuilder.add(new JSIr.CreateObject(newTuple));

        const value = this.compute(state, irBuilder);
        irBuilder.add(new JSIr.SetKey(newTuple, this.field, value));

        const newScope = new Scope(currentScope.parent);
        newScope.set(this.field, {
            type: 'scalar',
            tt_type: this.type,
            direction: 'output',
            register: value,
            isInVarScopeNames: true,
        });
        newScope.set('$outputType', {
            type: 'scalar',
            tt_type: null,
            direction: 'special',
            register: newOutputType,
            isInVarScopeNames: false,
        });
        newScope.set('$output', {
            type: 'scalar',
            tt_type: null,
            direction: 'special',
            register: newTuple,
            isInVarScopeNames: false,
        });
        return [newScope, [this.field]];
    }
}

export class Count extends AggregationOp<JSIr.Register> {
    operator : 'count';
    field : 'count';
    type : Type;

    constructor() {
        super();
        this.operator = 'count';
        this.field = 'count';
        this.type = Type.Number;
    }

    init(irBuilder : JSIr.IRBuilder) {
        const zero = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Number(0), zero));
        return zero;
    }

    advance(count : JSIr.Register,
            irBuilder : JSIr.IRBuilder,
            currentScope : Scope) {
        const one = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Number(1), one));
        irBuilder.add(new JSIr.BinaryOp(count, one, '+', count));
    }

    protected compute(count : JSIr.Register, irBuilder : JSIr.IRBuilder) : JSIr.Register {
        return count;
    }
}

export class CountDistinct extends AggregationOp<JSIr.Register> {
    operator : 'count';
    field : string;
    type : Type;

    constructor(field : string) {
        super();
        this.field = field;
        this.operator = 'count';
        this.type = Type.Number;
    }

    init(irBuilder : JSIr.IRBuilder) {
        const set = irBuilder.allocRegister();
        irBuilder.add(new JSIr.NewObject('EqualitySet', set));
        return set;
    }

    advance(set : JSIr.Register,
            irBuilder : JSIr.IRBuilder,
            currentScope : Scope) {
        irBuilder.add(new JSIr.MethodOp(set, 'add', getRegister('$output', currentScope)));
    }

    protected compute(set : JSIr.Register, irBuilder : JSIr.IRBuilder) {
        const count = irBuilder.allocRegister();
        irBuilder.add(new JSIr.GetKey(set, 'size', count));
        return count;
    }
}

export class Average extends AggregationOp<{ count : JSIr.Register, sum : JSIr.Register }> {
    operator : 'avg';
    field : string;
    type : Type;

    constructor(field : string, type : Type) {
        super();
        this.field = field;
        this.operator = 'avg';
        this.type = type;
    }

    init(irBuilder : JSIr.IRBuilder) {
        const count = irBuilder.allocRegister();
        const sum = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Number(0), sum));
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Number(0), count));
        return { count, sum };
    }

    advance({ count, sum } : { count : JSIr.Register, sum : JSIr.Register },
            irBuilder : JSIr.IRBuilder,
            currentScope : Scope) {
        const field = getRegister(this.field, currentScope);
        const one = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Number(1), one));
        irBuilder.add(new JSIr.BinaryOp(count, one, '+', count));
        irBuilder.add(new JSIr.BinaryOp(sum, field, '+', sum));
    }

    protected compute({ count, sum } : { count : JSIr.Register, sum : JSIr.Register },
                      irBuilder : JSIr.IRBuilder) {
        const value = irBuilder.allocRegister();
        irBuilder.add(new JSIr.BinaryOp(sum, count, '/', value));
        return value;
    }
}

export class SimpleAggregation extends AggregationOp<JSIr.Register> {
    operator : SimpleAggregationType;
    field : string;
    type : Type;

    constructor(operator : SimpleAggregationType,
                field : string,
                type : Type) {
        super();
        this.field = field;
        this.operator = operator;
        this.type = type;
    }

    init(irBuilder : JSIr.IRBuilder) : JSIr.Register {
        const zero = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Number(AggregationInit[this.operator]), zero));
        return zero;
    }

    advance(value : JSIr.Register,
            irBuilder : JSIr.IRBuilder,
            currentScope : Scope) {
        const field = getRegister(this.field, currentScope);
        irBuilder.add(new JSIr.FunctionOp(this.operator, false, value, value, field));
    }

    protected compute(value : JSIr.Register,
                      irBuilder : JSIr.IRBuilder) {
        return value;
    }
}

interface SimpleArgMinMaxState {
    anyResult : JSIr.Register;
    value : JSIr.Register;
    tuple : JSIr.Register;
    outputType : JSIr.Register;
}
export class SimpleArgMinMax extends ReduceOp<SimpleArgMinMaxState> {
    field : string;
    operator : 'argmin' | 'argmax';

    constructor(operator : 'argmin' | 'argmax',
                field : string) {
        super();
        this.field = field;
        this.operator = operator;
    }

    init(irBuilder : JSIr.IRBuilder) : SimpleArgMinMaxState {
        const anyResult = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Boolean(false), anyResult));
        const value = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Number(AggregationInit[this.operator]), value));
        const tuple = irBuilder.allocRegister();
        const outputType = irBuilder.allocRegister();
        return { anyResult, value, tuple, outputType };
    }

    advance({ anyResult, value:previousValue, tuple, outputType } : SimpleArgMinMaxState,
            irBuilder : JSIr.IRBuilder,
            currentScope : Scope,
            varScopeNames : string[]) : void {
        const newValue = getRegister(this.field, currentScope);
        const comp = this.operator === 'argmax' ? '<' : '>';

        const isBetter = irBuilder.allocRegister();
        irBuilder.add(new JSIr.BinaryOp(previousValue, newValue, comp, isBetter));

        const ifStmt = new JSIr.IfStatement(isBetter);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        irBuilder.add(new JSIr.Copy(newValue, previousValue));
        irBuilder.add(new JSIr.Copy(getRegister('$output', currentScope), tuple));
        irBuilder.add(new JSIr.Copy(getRegister('$outputType', currentScope), outputType));
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Boolean(true), anyResult));

        irBuilder.popBlock();
    }

    finish({ anyResult, value, tuple, outputType } : SimpleArgMinMaxState,
           irBuilder : JSIr.IRBuilder,
           currentScope : Scope,
           varScopeNames : string[]) : [Scope, string[]] {
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
            register: tuple,
            direction: 'special',
            isInVarScopeNames: false
        });

        const ifStmt = new JSIr.IfStatement(anyResult);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        setScopeFromResult(currentScope, newScope, tuple, irBuilder);

        return [newScope, varScopeNames];
    }
}

export class ComplexArgMinMax extends ReduceOp<JSIr.Register> {
    field : Ast.Value;
    operator : 'argmin' | 'argmax';
    base : Ast.Value;
    limit : Ast.Value;

    constructor(operator : 'argmin' | 'argmax',
                field : Ast.Value,
                base : Ast.Value,
                limit : Ast.Value) {
        super();
        this.field = field;
        this.operator = operator;
        this.base = base;
        this.limit = limit;
    }

    init(irBuilder : JSIr.IRBuilder,
         currentScope : Scope,
         compiler : OpCompiler) : JSIr.Register {
        const base = compiler.compileValue(this.base, currentScope);
        const limit = compiler.compileValue(this.limit, currentScope);

        const operator = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadBuiltin(this.operator, operator));

        const state = irBuilder.allocRegister();
        irBuilder.add(new JSIr.NewObject(`ArgMinMaxState`, state, operator, base, limit));
        return state;
    }

    advance(state : JSIr.Register,
            irBuilder : JSIr.IRBuilder,
            currentScope : Scope,
            varScopeNames : string[],
            compiler : OpCompiler) : void {
        const field = compiler.compileValue(this.field, currentScope);
        irBuilder.add(new JSIr.MethodOp(state, 'update', getRegister('$output', currentScope), getRegister('$outputType', currentScope), field));
    }

    finish(state : JSIr.Register,
           irBuilder : JSIr.IRBuilder,
           currentScope : Scope,
           varScopeNames : string[]) : [Scope, string[]] {
        const iterator = irBuilder.allocRegister();
        const loop = new JSIr.ForOfStatement(iterator, state);

        irBuilder.add(loop);
        irBuilder.pushBlock(loop.body);

        const outputType = irBuilder.allocRegister();
        const result = irBuilder.allocRegister();

        irBuilder.add(new JSIr.GetIndex(iterator, 0, outputType));
        irBuilder.add(new JSIr.GetIndex(iterator, 1, result));

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
            register: result,
            direction: 'special',
            isInVarScopeNames: false
        });

        setScopeFromResult(currentScope, newScope, result, irBuilder);

        return [newScope, varScopeNames];
    }
}

interface SimpleIndexState {
    anyResult : JSIr.Register;
    index : JSIr.Register;
    counter : JSIr.Register;
}
export class SimpleIndex extends ReduceOp<SimpleIndexState> {
    index : Ast.Value;

    constructor(index : Ast.Value) {
        super();
        this.index = index;
    }

    init(irBuilder : JSIr.IRBuilder,
         currentScope : Scope,
         compiler : OpCompiler) : SimpleIndexState {
        const index = compiler.compileValue(this.index, currentScope);
        const anyResult = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Boolean(false), anyResult));
        const counter = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Number(0), counter));
        return { anyResult, index, counter };
    }

    advance({ anyResult, index, counter } : SimpleIndexState,
            irBuilder : JSIr.IRBuilder,
            currentScope : Scope,
            varScopeNames : string[]) : void {
        const one = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Number(1), one));
        irBuilder.add(new JSIr.BinaryOp(counter, one, '+', counter));

        const isTarget = irBuilder.allocRegister();
        irBuilder.add(new JSIr.BinaryOp(index, counter, '==', isTarget));

        const ifStmt = new JSIr.IfStatement(isTarget);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.Boolean(true), anyResult));
        irBuilder.add(new JSIr.Break());

        irBuilder.popBlock();
    }

    finish({ anyResult, index, counter } : SimpleIndexState,
           irBuilder : JSIr.IRBuilder,
           currentScope : Scope,
           varScopeNames : string[]) : [Scope, string[]] {
        const ifStmt = new JSIr.IfStatement(anyResult);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        return [currentScope, varScopeNames];
    }
}

interface ArrayReduceState {
    array : JSIr.Register;
}
abstract class ArrayReduceOp<StateType extends ArrayReduceState> extends ReduceOp<StateType> {
    protected _doInit(irBuilder : JSIr.IRBuilder,
                      currentScope : Scope,
                      compiler : OpCompiler) : JSIr.Register {
        const array = irBuilder.allocRegister();
        irBuilder.add(new JSIr.CreateTuple(0, array));
        return array;
    }

    advance({ array } : StateType,
            irBuilder : JSIr.IRBuilder,
            currentScope : Scope,
            varScopeNames : string[],
            compiler : OpCompiler) : void {
        const resultAndTypeTuple = irBuilder.allocRegister();
        irBuilder.add(new JSIr.CreateTuple(2, resultAndTypeTuple));
        irBuilder.add(new JSIr.SetIndex(resultAndTypeTuple, 0, getRegister('$output', currentScope)));
        irBuilder.add(new JSIr.SetIndex(resultAndTypeTuple, 1, getRegister('$outputType', currentScope)));

        irBuilder.add(new JSIr.MethodOp(array, 'push', resultAndTypeTuple));
    }

    abstract _doFinish(irBuilder : JSIr.IRBuilder, state : StateType) : JSIr.Register;

    finish(state : StateType,
           irBuilder : JSIr.IRBuilder,
           currentScope : Scope,
           varScopeNames : string[]) : [Scope, string[]] {
        const array = this._doFinish(irBuilder, state);

        const iterator = irBuilder.allocRegister();
        const loop = new JSIr.ForOfStatement(iterator, array);

        irBuilder.add(loop);
        irBuilder.pushBlock(loop.body);

        const outputType = irBuilder.allocRegister();
        const result = irBuilder.allocRegister();

        irBuilder.add(new JSIr.GetIndex(iterator, 0, result));
        irBuilder.add(new JSIr.GetIndex(iterator, 1, outputType));

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
            register: result,
            direction: 'special',
            isInVarScopeNames: false
        });

        setScopeFromResult(currentScope, newScope, result, irBuilder);

        return [newScope, varScopeNames];
    }
}

export class SimpleSort extends ArrayReduceOp<ArrayReduceState> {
    field : string;
    direction : 'asc'|'desc';

    constructor(field : string,
                direction : 'asc'|'desc') {
        super();
        this.field = field;
        this.direction = direction;
    }

    init(irBuilder : JSIr.IRBuilder,
         currentScope : Scope,
         compiler : OpCompiler) {
        return { array: this._doInit(irBuilder, currentScope, compiler) };
    }

    _doFinish(irBuilder : JSIr.IRBuilder, { array } : ArrayReduceState) : JSIr.Register {
        const field = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(new Ast.Value.String(this.field), field));

        irBuilder.add(new JSIr.VoidFunctionOp('sort' + this.direction, array, field));

        return array;
    }
}

export class ComplexSort extends ArrayReduceOp<ArrayReduceState> {
    field : Ast.Value;
    direction : 'asc'|'desc';

    constructor(field : Ast.Value,
                direction : 'asc'|'desc') {
        super();
        this.field = field;
        this.direction = direction;
    }

    init(irBuilder : JSIr.IRBuilder,
         currentScope : Scope,
         compiler : OpCompiler) {
        return { array: this._doInit(irBuilder, currentScope, compiler) };
    }

    advance({ array } : ArrayReduceState,
            irBuilder : JSIr.IRBuilder,
            currentScope : Scope,
            varScopeNames : string[],
            compiler : OpCompiler) : void {
        const sortKey = compiler.compileValue(this.field, currentScope);

        const resultAndTypeTuple = irBuilder.allocRegister();
        irBuilder.add(new JSIr.CreateTuple(3, resultAndTypeTuple));
        irBuilder.add(new JSIr.SetIndex(resultAndTypeTuple, 0, getRegister('$output', currentScope)));
        irBuilder.add(new JSIr.SetIndex(resultAndTypeTuple, 1, getRegister('$outputType', currentScope)));
        irBuilder.add(new JSIr.SetIndex(resultAndTypeTuple, 2, sortKey));

        irBuilder.add(new JSIr.MethodOp(array, 'push', resultAndTypeTuple));
    }

    _doFinish(irBuilder : JSIr.IRBuilder, { array } : ArrayReduceState) : JSIr.Register {
        irBuilder.add(new JSIr.VoidFunctionOp('sortkey' + this.direction, array));

        return array;
    }
}

interface ComplexIndexState {
    array : JSIr.Register;
    indices : JSIr.Register;
}
export class ComplexIndex extends ArrayReduceOp<ComplexIndexState> {
    indices : Ast.Value[];

    constructor(indices : Ast.Value[]) {
        super();
        this.indices = indices;
    }

    init(irBuilder : JSIr.IRBuilder,
         currentScope : Scope,
         compiler : OpCompiler) : ComplexIndexState {
        const indicesType = this.indices.length === 1 ?
            typeForValue(this.indices[0], currentScope) : Type.Number;

        let indices;
        if (indicesType.isNumber)
            indices = compiler.compileValue(new Ast.Value.Array(this.indices), currentScope);
        else
            indices = compiler.compileValue(this.indices[0], currentScope);

        const state = {
            array: this._doInit(irBuilder, currentScope, compiler),
            indices: indices
        };
        return state;
    }

    _doFinish(irBuilder : JSIr.IRBuilder,
              { indices, array } : ComplexIndexState) : JSIr.Register {
        const newArray = irBuilder.allocRegister();
        irBuilder.add(new JSIr.FunctionOp('indexArray', false, newArray, array, indices));
        return newArray;
    }
}

interface SliceState {
    array : JSIr.Register;
    base : JSIr.Register;
    limit : JSIr.Register;
}
export class Slice extends ArrayReduceOp<SliceState> {
    base : Ast.Value;
    limit : Ast.Value;

    constructor(base : Ast.Value, limit : Ast.Value) {
        super();
        this.base = base;
        this.limit = limit;
    }

    init(irBuilder : JSIr.IRBuilder,
         currentScope : Scope,
         compiler : OpCompiler) : SliceState {
        const base = compiler.compileValue(this.base, currentScope);
        const limit = compiler.compileValue(this.limit, currentScope);

        const state = {
            array: this._doInit(irBuilder, currentScope, compiler),
            base: base,
            limit: limit
        };
        return state;
    }

    _doFinish(irBuilder : JSIr.IRBuilder,
              { base, limit, array } : SliceState) : JSIr.Register {
        const newArray = irBuilder.allocRegister();
        irBuilder.add(new JSIr.FunctionOp('sliceArray', false, newArray, array, base, limit));
        return newArray;
    }
}

}
