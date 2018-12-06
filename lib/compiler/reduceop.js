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

// ReduceOp : operates on each produced tuple and a state
class ReduceOp {}

class AggregationOp extends ReduceOp {
    finish(state, irBuilder, varScope, typeScope) {
        const newOutputType = irBuilder.allocRegister();
        const keyword = irBuilder.allocRegister();
        irBuilder.add(new JSIr.LoadConstant(Ast.Value.String(this.operator), keyword));
        irBuilder.add(new JSIr.BinaryFunctionOp(keyword, varScope.$outputType, 'aggregateOutputType', newOutputType));

        const newTuple = irBuilder.allocRegister();
        irBuilder.add(new JSIr.CreateObject(newTuple));

        const value = this.compute(state, irBuilder, varScope, typeScope);
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

module.exports = ReduceOp;
