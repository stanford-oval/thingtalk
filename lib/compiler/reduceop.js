// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Ast = require('../ast');
const Type = require('../type');

const JSIr = require('./jsir');
const { getRegister, typeForValue } = require('./utils');
const Scope = require('./scope');

// ReduceOp : operates on each produced tuple and a state
class ReduceOp {}

class AggregationOp extends ReduceOp {
    finish(state, irBuilder, currentScope, varScopeNames) {
        const newOutputType = irBuilder.allocRegister();
        const keyword = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.String(this.operator), keyword));
        irBuilder.add(new JSIr.BinaryFunctionOp(keyword, getRegister('$outputType', currentScope), 'aggregateOutputType', newOutputType));

        const newTuple = irBuilder.allocRegister();
        irBuilder.add(new JSIr.CreateObject(newTuple));

        const value = this.compute(state, irBuilder);
        irBuilder.add(new JSIr.SetKey(newTuple, this.field, value));

        let newScope = new Scope(currentScope.parent);
        newScope.set(this.field, {
            type: 'scalar',
            tt_type: this.type,
            register: value
        });
        newScope.set('$outputType', {
            type: 'scalar',
            tt_type: null,
            register: newOutputType
        });
        newScope.set('$output', {
            type: 'scalar',
            tt_type: null,
            register: newTuple
        });
        return [newScope, [this.field]];
    }
}

ReduceOp.Count = class CountOp extends AggregationOp {
    constructor() {
        super();
        this.operator = 'count';
        this.field = 'count';
        this.type = Type.Number;
    }

    init(irBuilder) {
        let zero = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Number(0), zero));
        return zero;
    }

    advance(count, irBuilder, currentScope) {
        let one = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Number(1), one));
        irBuilder.add(new JSIr.BinaryOp(count, one, '+', count));
    }

    compute(count) {
        return count;
    }
};

ReduceOp.CountDistinct = class CountDistinctOp extends AggregationOp {
    constructor(field) {
        super();
        this.field = field;
        this.operator = 'count';
        this.type = Type.Number;
    }

    init(irBuilder) {
        let set = irBuilder.allocRegister();
        irBuilder.add(new JSIr.NewObject('EqualitySet', set));
        return set;
    }

    advance(set, irBuilder, currentScope) {
        irBuilder.add(new JSIr.UnaryMethodOp(set, getRegister('$output', currentScope), 'add'));
    }

    compute(set, irBuilder) {
        const count = irBuilder.allocRegister();
        irBuilder.add(new JSIr.GetKey(set, 'size', count));
        return count;
    }
};

ReduceOp.Average = class AverageOp extends AggregationOp {
    constructor(field, type) {
        super();
        this.field = field;
        this.operator = 'avg';
        this.type = type;
    }

    init(irBuilder) {
        let count = irBuilder.allocRegister();
        let sum = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Number(0), sum));
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Number(0), count));
        return { count, sum };
    }

    advance({ count, sum }, irBuilder, currentScope) {
        const field = getRegister(this.field, currentScope);
        let one = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Number(1), one));
        irBuilder.add(new JSIr.BinaryOp(count, one, '+', count));
        irBuilder.add(new JSIr.BinaryOp(sum, field, '+', sum));
    }

    compute({ count, sum }, irBuilder) {
        const value = irBuilder.allocRegister();
        irBuilder.add(new JSIr.BinaryOp(sum, count, '/', value));
        return value;
    }
};

const AggregationInit = {
    'min': Infinity,
    'max': -Infinity,
    'argmin': Infinity,
    'argmax': -Infinity,
    'sum': 0
};

ReduceOp.SimpleAggregation = class SimpleAggregation extends AggregationOp {
    constructor(operator, field, type) {
        super();
        this.field = field;
        this.operator = operator;
        this.type = type;
    }

    init(irBuilder) {
        let zero = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Number(AggregationInit[this.operator]), zero));
        return zero;
    }

    advance(value, irBuilder, currentScope) {
        const field = getRegister(this.field, currentScope);
        irBuilder.add(new JSIr.BinaryFunctionOp(value, field, this.operator, value));
    }

    compute(value) {
        return value;
    }
};

ReduceOp.SimpleArgMinMax = class SimpleArgMinMax extends ReduceOp {
    constructor(operator, field) {
        super();
        this.field = field;
        this.operator = operator;
    }

    init(irBuilder) {
        let anyResult = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(false), anyResult));
        let value = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Number(AggregationInit[this.operator]), value));
        let tuple = irBuilder.allocRegister();
        let outputType = irBuilder.allocRegister();
        return { anyResult, value, tuple, outputType };
    }

    advance({ anyResult, value:previousValue, tuple, outputType }, irBuilder, currentScope, varScopeNames) {
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
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), anyResult));

        irBuilder.popBlock();
    }

    finish({ anyResult, value, tuple, outputType }, irBuilder, currentScope, varScopeNames) {
        let newScope = new Scope(currentScope.parent);
        newScope.set('$outputType', {
            type: 'scalar',
            tt_type: null,
            register: outputType,
            isInVarScopeNames: false
        });
        newScope.set('$output', {
            type: 'scalar',
            tt_type: null,
            register: tuple,
            isInVarScopeNames: false
        });

        const ifStmt = new JSIr.IfStatement(anyResult);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        for (let name of currentScope.ownKeys()) {
            if (name.startsWith('$'))
                continue;
            const value = irBuilder.allocRegister();

            irBuilder.add(new JSIr.GetKey(tuple, name, value));
            const currentScopeObj = currentScope.get(name);
            newScope.set(name, {
                type: 'scalar',
                tt_type: currentScopeObj.tt_type,
                register: value,
                isInVarScopeNames: currentScopeObj.isInVarScopeNames
            });
        }

        return [newScope, varScopeNames];
    }
};

ReduceOp.ComplexArgMinMax = class ComplexArgMinMax extends ReduceOp {
    constructor(operator, field, base, limit) {
        super();
        this.field = field;
        this.operator = operator;
        this.base = base;
        this.limit = limit;
    }

    init(irBuilder, currentScope, compiler) {
        const base = compiler.compileValue(this.base, currentScope);
        const limit = compiler.compileValue(this.limit, currentScope);

        const operator = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadBuiltin(this.operator, operator));

        const field = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.String(this.field), field));

        const state = irBuilder.allocRegister();
        irBuilder.add(new JSIr.NewObject(`ArgMinMaxState`, state, operator, field, base, limit));
        return state;
    }

    advance(state, irBuilder, currentScope, varScopeNames) {
        irBuilder.add(new JSIr.BinaryMethodOp(state, getRegister('$output', currentScope), getRegister('$outputType', currentScope), 'update'));
    }

    finish(state, irBuilder, currentScope, varScopeNames) {
        const iterator = irBuilder.allocRegister();
        const loop = new JSIr.ForOfStatement(iterator, state);

        irBuilder.add(loop);
        irBuilder.pushBlock(loop.body);

        let outputType, result;
        outputType = irBuilder.allocRegister();
        result = irBuilder.allocRegister();

        irBuilder.add(new JSIr.GetIndex(iterator, 0, outputType));
        irBuilder.add(new JSIr.GetIndex(iterator, 1, result));

        let newScope = new Scope(currentScope.parent);
        newScope.set('$outputType', {
            type: 'scalar',
            tt_type: null,
            register: outputType,
            isInVarScopeNames: false
        });
        newScope.set('$output', {
            type: 'scalar',
            tt_type: null,
            register: result,
            isInVarScopeNames: false
        });

        for (let name of currentScope.ownKeys()) {
            if (name.startsWith('$'))
                continue;
            const value = irBuilder.allocRegister();

            irBuilder.add(new JSIr.GetKey(result, name, value));
            const currentScopeObj = currentScope.get(name);
            newScope.set(name, {
                type: 'scalar',
                tt_type: currentScopeObj.tt_type,
                register: value,
                isInVarScopeNames: currentScopeObj.isInVarScopeNames
            });
        }

        return [newScope, varScopeNames];
    }
};

ReduceOp.SimpleIndex = class SimpleIndex extends ReduceOp {
    constructor(index) {
        super();
        this.index = index;
    }

    init(irBuilder, currentScope, compiler) {
        const index = compiler.compileValue(this.index, currentScope);
        const anyResult = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(false), anyResult));
        const counter = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Number(0), counter));
        return { anyResult, index, counter };
    }

    advance({ anyResult, index, counter }, irBuilder, currentScope, varScopeNames) {
        const one = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Number(1), one));
        irBuilder.add(new JSIr.BinaryOp(counter, one, '+', counter));

        const isTarget = irBuilder.allocRegister();
        irBuilder.add(new JSIr.BinaryOp(index, counter, '==', isTarget));

        const ifStmt = new JSIr.IfStatement(isTarget);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), anyResult));
        irBuilder.add(new JSIr.Break());

        irBuilder.popBlock();
    }

    finish({ anyResult, value, tuple, outputType }, irBuilder, currentScope, varScopeNames) {
        const ifStmt = new JSIr.IfStatement(anyResult);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        return [currentScope, varScopeNames];
    }
};

class ArrayReduceOp extends ReduceOp {
    init(irBuilder, currentScope) {
        const array = irBuilder.allocRegister();
        irBuilder.add(new JSIr.CreateTuple(0, array));
        return { array };
    }

    advance({ array }, irBuilder, currentScope, varScopeNames) {
        let resultAndTypeTuple = irBuilder.allocRegister();
        irBuilder.add(new JSIr.CreateTuple(2, resultAndTypeTuple));
        irBuilder.add(new JSIr.SetIndex(resultAndTypeTuple, 0, getRegister('$output', currentScope)));
        irBuilder.add(new JSIr.SetIndex(resultAndTypeTuple, 1, getRegister('$outputType', currentScope)));

        irBuilder.add(new JSIr.UnaryMethodOp(array, resultAndTypeTuple, 'push'));
    }

    finish(state, irBuilder, currentScope, varScopeNames) {
        const array = this._doFinish(irBuilder, state);

        const iterator = irBuilder.allocRegister();
        const loop = new JSIr.ForOfStatement(iterator, array);

        irBuilder.add(loop);
        irBuilder.pushBlock(loop.body);

        let outputType, result;
        outputType = irBuilder.allocRegister();
        result = irBuilder.allocRegister();

        irBuilder.add(new JSIr.GetIndex(iterator, 0, result));
        irBuilder.add(new JSIr.GetIndex(iterator, 1, outputType));

        let newScope = new Scope(currentScope.parent);
        newScope.set('$outputType', {
            type: 'scalar',
            tt_type: null,
            register: outputType,
            isInVarScopeNames: false
        });
        newScope.set('$output', {
            type: 'scalar',
            tt_type: null,
            register: result,
            isInVarScopeNames: false
        });

        for (let name of currentScope.ownKeys()) {
            if (name.startsWith('$'))
                continue;
            const value = irBuilder.allocRegister();

            irBuilder.add(new JSIr.GetKey(result, name, value));
            const currentScopeObj = currentScope.get(name);
            newScope.set(name, {
                type: 'scalar',
                tt_type: currentScopeObj.tt_type,
                register: value,
                isInVarScopeNames: currentScopeObj.isInVarScopeNames
            });
        }

        return [newScope, varScopeNames];
    }
}
ReduceOp.Array = ArrayReduceOp;

ReduceOp.Sort = class Sort extends ArrayReduceOp {
    constructor(field, direction) {
        super();
        this.field = field;
        this.direction = direction;
    }

    _doFinish(irBuilder, { array }) {
        const field = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.String(this.field), field));

        irBuilder.add(new JSIr.VoidFunctionOp('sort' + this.direction, array, field));

        return array;
    }
};

ReduceOp.ComplexIndex = class ComplexIndex extends ArrayReduceOp {
    constructor(indices) {
        super();
        this.indices = indices;
    }

    init(irBuilder, currentScope, compiler) {
        const indicesType = this.indices.length === 1 ?
            typeForValue(this.indices[0], currentScope) : Type.Number;

        let indices;
        if (indicesType.isNumber)
            indices = compiler.compileValue(Ast.Value.Array(this.indices), currentScope);
        else
            indices = compiler.compileValue(this.indices[0], currentScope);

        const state = super.init(irBuilder, currentScope);
        state.indices = indices;
        return state;
    }

    _doFinish(irBuilder, { indices, array }) {
        const newArray = irBuilder.allocRegister();
        irBuilder.add(new JSIr.FunctionOp('indexArray', newArray, array, indices));
        return newArray;
    }
};

ReduceOp.Slice = class Slice extends ArrayReduceOp {
    constructor(base, limit) {
        super();
        this.base = base;
        this.limit = limit;
    }

    init(irBuilder, currentScope, compiler) {
        const base = compiler.compileValue(this.base, currentScope);
        const limit = compiler.compileValue(this.limit, currentScope);

        const state = super.init(irBuilder, currentScope);
        state.base = base;
        state.limit = limit;
        return state;
    }

    _doFinish(irBuilder, { base, limit, array }) {
        const newArray = irBuilder.allocRegister();
        irBuilder.add(new JSIr.FunctionOp('sliceArray', newArray, array, base, limit));
        return newArray;
    }
};


module.exports = ReduceOp;
