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
const { compileValue } = require('./utils');

// ReduceOp : operates on each produced tuple and a state
class ReduceOp {}

class AggregationOp extends ReduceOp {
    finish(state, irBuilder, varScope, typeScope, varScopeNames) {
        const newOutputType = irBuilder.allocRegister();
        const keyword = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.String(this.operator), keyword));
        irBuilder.add(new JSIr.BinaryFunctionOp(keyword, varScope.$outputType, 'aggregateOutputType', newOutputType));

        const newTuple = irBuilder.allocRegister();
        irBuilder.add(new JSIr.CreateObject(newTuple));

        const value = this.compute(state, irBuilder);
        irBuilder.add(new JSIr.SetKey(newTuple, this.field, value));

        let newVarScope = {
            [this.field]: value,
            $outputType: newOutputType,
            $output: newTuple
        };
        let newTypeScope = {
            [this.field]: this.type
        };
        return [newVarScope, newTypeScope, [this.field]];
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

    advance(count, irBuilder, varScope, typeScope) {
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

    advance(set, irBuilder, varScope, typeScope) {
        irBuilder.add(new JSIr.UnaryMethodOp(set, varScope.$output, 'add'));
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

    advance({ count, sum }, irBuilder, varScope, typeScope) {
        const field = varScope[this.field];
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

ReduceOp.SimpleAggregation = class CountDistinctOp extends AggregationOp {
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

    advance(value, irBuilder, varScope, typeScope) {
        const field = varScope[this.field];
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

    advance({ anyResult, value:previousValue, tuple, outputType }, irBuilder, varScope, typeScope, varScopeNames) {
        const newValue = varScope[this.field];

        const comp = this.operator === 'argmax' ? '<' : '>';

        const isBetter = irBuilder.allocRegister();
        irBuilder.add(new JSIr.BinaryOp(previousValue, newValue, comp, isBetter));

        const ifStmt = new JSIr.IfStatement(isBetter);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        irBuilder.add(new JSIr.Copy(newValue, previousValue));
        irBuilder.add(new JSIr.Copy(varScope.$output, tuple));
        irBuilder.add(new JSIr.Copy(varScope.$outputType, outputType));
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.Boolean(true), anyResult));

        irBuilder.popBlock();
    }

    finish({ anyResult, value, tuple, outputType }, irBuilder, varScope, typeScope, varScopeNames) {
        let newVarScope = {
            $output: tuple,
            $outputType: outputType
        };

        const ifStmt = new JSIr.IfStatement(anyResult);
        irBuilder.add(ifStmt);
        irBuilder.pushBlock(ifStmt.iftrue);

        for (let name of varScopeNames) {
            const value = irBuilder.allocRegister();

            irBuilder.add(new JSIr.GetKey(tuple, name, value));
            newVarScope[name] = value;
        }

        return [newVarScope, typeScope, varScopeNames];
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

    init(irBuilder, varScope, typeScope) {
        const base = compileValue(irBuilder, this.base, varScope);
        const limit = compileValue(irBuilder, this.limit, varScope);

        const operator = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadBuiltin(this.operator, operator));

        const field = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.String(this.field), field));

        const state = irBuilder.allocRegister();
        irBuilder.add(new JSIr.NewObject(`ArgMinMaxState`, state, operator, field, base, limit));
        return state;
    }

    advance(state, irBuilder, varScope, typeScope, varScopeNames) {
        irBuilder.add(new JSIr.BinaryMethodOp(state, varScope.$output, varScope.$outputType, 'update'));
    }

    finish(state, irBuilder, varScope, typeScope, varScopeNames) {
        const iterator = irBuilder.allocRegister();
        const loop = new JSIr.ForOfStatement(iterator, state);

        irBuilder.add(loop);
        irBuilder.pushBlock(loop.body);

        let outputType, result;
        outputType = irBuilder.allocRegister();
        result = irBuilder.allocRegister();

        irBuilder.add(new JSIr.GetIndex(iterator, 0, outputType));
        irBuilder.add(new JSIr.GetIndex(iterator, 1, result));

        let newVarScope = {
            $outputType: outputType,
            $output: result
        };

        for (let name of varScopeNames) {
            const value = irBuilder.allocRegister();

            irBuilder.add(new JSIr.GetKey(result, name, value));
            newVarScope[name] = value;
        }

        return [newVarScope, typeScope, varScopeNames];
    }
};

module.exports = ReduceOp;
