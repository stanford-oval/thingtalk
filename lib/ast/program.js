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

const adt = require('adt');
const assert = require('assert');

const { ExpressionSignature } = require('./function_def');
const { Value } = require('./values');

const Selector = adt.data({
    Device: {
        kind: adt.only(String),
        id: adt.only(String, null),
        principal: adt.only(null),
    },
    Builtin: null
});
module.exports.Selector = Selector.seal();

const Aggregation = adt.newtype('Aggregation', {
    type: adt.only(String), //max, min, argmax, argmin, sum, avg, count
    field: adt.only(String, null),
    cols: adt.only(Array, null),
    count: adt.only(Number, null)
});
module.exports.Aggregation = Aggregation.seal();

const Invocation = adt.newtype('Invocation', {
    selector: adt.only(Selector),
    channel: adt.only(String),
    in_params: adt.only(Array),
    schema: adt.only(ExpressionSignature, null),
});
module.exports.Invocation = Invocation.seal();

// TODO
const ScalarExpression = adt.data({
    Primary: {
        value: adt.only(Value)
    },
    Derived: {
        op: adt.only(String),
        operands: adt.only(Array) // of ScalarExpression
    }
});

const BooleanExpression = adt.data(function() {
    return {
        And: {
            operands: adt.only(Array) // of BooleanExpression
        },
        Or: {
            operands: adt.only(Array) // of BooleanExpression
        },
        Atom: {
            name: adt.only(String),
            operator: adt.only(String),
            value: adt.only(Value)
        },
        Not: {
            expr: adt.only(this)
        },
        External: {
            selector: adt.only(Selector.Device),
            channel: adt.only(String),
            in_params: adt.only(Array), // of InputParam,
            filter: adt.only(this),
            schema: adt.only(ExpressionSignature, null)
        },

        True: null,
        False: null
    };
});
module.exports.ScalarExpression = ScalarExpression.seal();
module.exports.BooleanExpression = BooleanExpression.seal();

const InputParam = adt.newtype('InputParam', {
    name: adt.only(String),
    value: adt.only(Value)
});
module.exports.InputParam = InputParam.seal();

// Stream and Table are mutually recursive
// hence we need to define them in this weird way
var Table = adt.data({
    VarRef: {
        name: adt.only(String),
        in_params: adt.only(Array),
        schema: adt.only(ExpressionSignature, null),
    },
    Invocation: {
        invocation: adt.only(Invocation),
        schema: adt.only(ExpressionSignature, null)
    },
});
Table.type('Filter', {
    table: adt.only(Table),
    filter: adt.only(BooleanExpression),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Projection', {
    table: adt.only(Table),
    args: adt.only(Array), // of String
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Compute', {
    table: adt.only(Table),
    expression: adt.only(ScalarExpression),
    alias: adt.only(String, null),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Alias', {
    table: adt.only(Table),
    name: adt.only(String),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Aggregation', {
    table: adt.only(Table),
    field: adt.only(String),
    operator: adt.only(String),
    alias: adt.only(String, null),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('ArgMinMax', {
    table: adt.only(Table),
    field: adt.only(String),
    operator: adt.only(String),
    base: adt.only(Value),
    limit: adt.only(Value),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Join', {
    lhs: adt.only(Table),
    rhs: adt.only(Table),
    in_params: adt.only(Array),
    schema: adt.only(ExpressionSignature, null)
});
var Stream = adt.data({
    VarRef: {
        name: adt.only(String),
        in_params: adt.only(Array),
        schema: adt.only(ExpressionSignature, null),
    },
    Timer: {
        base: adt.only(Value),
        interval: adt.only(Value),
        schema: adt.only(ExpressionSignature, null)
    },
    AtTimer: {
        time: adt.only(Value),
        schema: adt.only(ExpressionSignature, null)
    },
    Monitor: {
        table: adt.only(Table),
        args: adt.only(Array, null),
        schema: adt.only(ExpressionSignature, null),
    }
});
Table.type('Window', {
    base: adt.only(Value), // : Number
    delta: adt.only(Value), // : Number
    stream: adt.only(Stream),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('TimeSeries', {
    base: adt.only(Value), // : Date
    delta: adt.only(Value), // : Measure(ms)
    stream: adt.only(Stream),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Sequence', {
    base: adt.only(Value), // : Number
    delta: adt.only(Value), // : Number
    table: adt.only(Table),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('History', {
    base: adt.only(Value), // : Date
    delta: adt.only(Value), // : Measure(ms)
    table: adt.only(Table),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('EdgeNew', {
    stream: adt.only(Stream),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('EdgeFilter', {
    stream: adt.only(Stream),
    filter: adt.only(BooleanExpression),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('Filter', {
    stream: adt.only(Stream),
    filter: adt.only(BooleanExpression),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('Projection', {
    stream: adt.only(Stream),
    args: adt.only(Array), // of String
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('Compute', {
    stream: adt.only(Stream),
    expression: adt.only(ScalarExpression),
    alias: adt.only(String, null),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('Alias', {
    stream: adt.only(Stream),
    name: adt.only(String),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('Join', {
    stream: adt.only(Stream),
    table: adt.only(Table),
    in_params: adt.only(Array),
    schema: adt.only(ExpressionSignature, null)
});
module.exports.Table = Table.seal();
module.exports.Stream = Stream.seal();

const Action = adt.data(function() {
    return {
        VarRef: {
            name: adt.only(String),
            in_params: adt.only(Array),
            schema: adt.only(ExpressionSignature, null),
        },
        Invocation: {
            invocation: adt.only(Invocation),
            schema: adt.only(ExpressionSignature, null),
        },
        CompoundAction: {
            table: adt.only(Table),
            action: adt.only(this)
        }
    };
});
module.exports.Action = Action.seal();

var PermissionFunction = adt.data({
    Specified: {
        kind: adt.only(String),
        channel: adt.only(String),
        filter: adt.only(BooleanExpression),
        schema: adt.only(ExpressionSignature, null),
    },
    Builtin: null,
    ClassStar: {
        kind: adt.only(String)
    },
    Star: null
});
module.exports.PermissionFunction = PermissionFunction.seal();

const Statement = adt.data({
    Declaration: {
        name: adt.only(String),
        type: adt.only('stream', 'query', 'action'),
        args: adt.only(Object), // maps name to Type
        value: adt.only(Stream, Table, Action)
    },
    Rule: {
        stream: adt.only(Stream),
        actions: adt.only(Array), // Array of ActionInvocation
    },
    Command: {
        table: adt.only(Table, null),
        actions: adt.only(Array), // Array of ActionInvocation
    },
    OnInput: {
        choices: adt.only(Array) // Array of Action
    }
});
module.exports.Statement = Statement.seal();

class Input {
}

class Program extends Input {
    constructor(classes, declarations, statements, principal = null, oninput = null) {
        super();
        assert(typeof classes === 'object');
        this.classes = classes;
        assert(Array.isArray(declarations));
        this.declarations = declarations;
        assert(Array.isArray(statements));
        this.statements = statements;
        assert(principal === null || principal instanceof Value);
        this.principal = principal;
        assert(principal === null || oninput instanceof Statement.OnInput);
        this.oninput = oninput;
    }

    // API backward compat
    get rules() {
        return this.statements;
    }
}
Program.prototype.isProgram = true;
Input.Program = Program;

class PermissionRule extends Input {
    constructor(principal, query, action) {
        super();

        assert(principal instanceof BooleanExpression);
        this.principal = principal;

        assert(query instanceof PermissionFunction);
        this.query = query;

        assert(action instanceof PermissionFunction);
        this.action = action;
    }
}
PermissionRule.prototype.isPermissionRule = true;
Input.PermissionRule = PermissionRule;

class Library extends Input {
    constructor(classes, datasets) {
        super();
        assert(Array.isArray(classes));
        this.classes = classes;
        assert(Array.isArray(datasets));
        this.datasets = datasets;
    }
}
Library.prototype.isLibrary = true;
Input.Library = Library;
// API backward compat
Library.prototype.isMeta = true;
Input.Meta = Library;

module.exports.Input = Input;
module.exports.Program = Input.Program;
module.exports.PermissionRule = Input.PermissionRule;

const Dataset = adt.newtype('Dataset', {
    name: adt.only(String),
    language: adt.only(String),
    examples: adt.only(Array), // of Example
    annotations: adt.only(Object)
});
module.exports.Dataset = Dataset.seal();

const Example = adt.newtype('Example', {
    id: adt.only(Number), // default to -1 for newly created examples
    type: adt.only('stream', 'query', 'action', 'program'),
    args: adt.only(Object),
    value: adt.only(Stream, Table, Action, Input),
    utterances: adt.only(Array),
    preprocessed: adt.only(Array),
    annotations: adt.only(Object)
});
module.exports.Example = Example.seal();
