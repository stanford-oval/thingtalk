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
const { toJS } = require('./manifest_utils');

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
    ResultRef: {
        kind: adt.only(String),
        channel: adt.only(String),
        index: adt.only(Value),
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
Table.type('Sort', {
    table: adt.only(Table),
    field: adt.only(String),
    direction: adt.only('asc', 'desc'),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Index', {
    table: adt.only(Table),
    indices: adt.only(Array), // of Value
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Slice', {
    table: adt.only(Table),
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
        time: adt.only(Array), // of Value
        expiration_date: adt.only(Value, null), // Date
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

const Action = adt.data({
    VarRef: {
        name: adt.only(String),
        in_params: adt.only(Array),
        schema: adt.only(ExpressionSignature, null),
    },
    Invocation: {
        invocation: adt.only(Invocation),
        schema: adt.only(ExpressionSignature, null),
    }
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

class Statement {
}
module.exports.Statement = Statement;

class Declaration extends Statement {
    constructor(name, type, args, value, metadata = {}, annotations = {}, schema = null) {
        super();

        assert(typeof name === 'string');
        this.name = name;

        assert(['stream', 'query', 'action', 'program', 'procedure'].indexOf(type) >= 0);
        this.type = type;

        assert(typeof args === 'object');
        this.args = args;

        assert(value instanceof Stream || value instanceof Table || value instanceof Action || value instanceof Program);
        this.value = value;

        this.metadata = toJS(metadata);
        this.annotations = annotations;
        this.schema = schema;
    }

    *iterateSlots() {
        // if the declaration refers to a nested scope, we don't need to
        // slot fill it now
        if (this.type === 'program' || this.type === 'procedure')
            return;

        yield* this.value.iterateSlots({});
    }
    *iteratePrimitives(includeVarRef) {
        // if the declaration refers to a nested scope, we don't need to
        // slot fill it now
        if (this.type === 'program' || this.type === 'procedure')
            return;

        yield* this.value.iteratePrimitives(includeVarRef);
    }

    clone() {
        const newArgs = {};
        Object.assign(newArgs, this.args);

        const newMetadata = {};
        Object.assign(newMetadata, this.metadata);
        const newAnnotations = {};
        Object.assign(newAnnotations, this.annotations);
        return new Declaration(this.name, this.type, newArgs, this.value.clone(), newMetadata, newAnnotations);
    }
}
Declaration.prototype.isDeclaration = true;
Statement.Declaration = Declaration;

class Assignment extends Statement {
    constructor(name, value, schema = null) {
        super();

        assert(typeof name === 'string');
        this.name = name;

        assert(value instanceof Table);
        this.value = value;

        this.schema = schema;
    }

    *iterateSlots() {
        yield* this.value.iterateSlots({});
    }
    *iteratePrimitives(includeVarRef) {
        yield* this.value.iteratePrimitives(includeVarRef);
    }

    clone() {
        return new Assignment(this.name, this.value.clone());
    }
}
Assignment.prototype.isAssignment = true;
Statement.Assignment = Assignment;

class Rule extends Statement {
    constructor(stream, actions) {
        super();

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(Array.isArray(actions));
        this.actions = actions;
    }

    *iterateSlots() {
        let [,scope] = yield* this.stream.iterateSlots({});
        for (let action of this.actions)
            yield* action.iterateSlots(scope);
    }
    *iteratePrimitives(includeVarRef) {
        yield* this.stream.iteratePrimitives(includeVarRef);
        for (let action of this.actions)
            yield* action.iteratePrimitives(includeVarRef);
    }

    clone() {
        return new Rule(this.stream.clone(), this.actions.map((a) => a.clone()));
    }
}
Rule.prototype.isRule = true;
Statement.Rule = Rule;

class Command extends Statement {
    constructor(table, actions) {
        super();

        assert(table === null || table instanceof Table);
        this.table = table;

        assert(Array.isArray(actions));
        this.actions = actions;
    }

    *iterateSlots() {
        let scope = {};
        if (this.table)
            [,scope] = yield* this.table.iterateSlots({});
        for (let action of this.actions)
            yield* action.iterateSlots(scope);
    }
    *iteratePrimitives(includeVarRef) {
        if (this.table)
            yield* this.table.iteratePrimitives(includeVarRef);
        for (let action of this.actions)
            yield* action.iteratePrimitives(includeVarRef);
    }

    clone() {
        return new Command(this.table !== null ? this.table.clone() : null,
            this.actions.map((a) => a.clone()));
    }
}
Command.prototype.isCommand = true;
Statement.Command = Command;

class OnInputChoice extends Statement {
    constructor(table, actions, metadata = {}, annotations = {}) {
        super();

        assert(table === null || table instanceof Table);
        this.table = table;

        assert(Array.isArray(actions));
        this.actions = actions;

        this.metadata = metadata;
        this.annotations = annotations;
    }

    *iterateSlots() {
        let scope = {};
        if (this.table)
            [,scope] = yield* this.table.iterateSlots({});
        for (let action of this.actions)
            yield* action.iterateSlots(scope);
    }
    *iteratePrimitives(includeVarRef) {
        if (this.table)
            yield* this.table.iteratePrimitives(includeVarRef);
        for (let action of this.actions)
            yield* action.iteratePrimitives(includeVarRef);
    }

    clone() {
        const newMetadata = {};
        Object.assign(newMetadata, this.metadata);

        const newAnnotations = {};
        Object.assign(newAnnotations, this.annotations);
        return new OnInputChoice(
            this.table !== null ? this.table.clone() : null,
            this.actions.map((a) => a.clone()),
            newMetadata,
            newAnnotations);
    }
}
module.exports.OnInputChoice = OnInputChoice;
OnInputChoice.prototype.isOnInputChoice = true;
Statement.OnInputChoice = OnInputChoice;

class Dataset extends Statement {
    constructor(name, language, examples, annotations) {
        super();

        assert(typeof name === 'string');
        this.name = name;

        assert(typeof language === 'string');
        this.language = language;

        assert(Array.isArray(examples)); // of Example
        this.examples = examples;

        assert(typeof annotations === 'object');
        this.annotations = annotations;
    }

    *iterateSlots() {
        for (let ex of this.examples)
            yield* ex.iterateSlots();
    }
    *iteratePrimitives(includeVarRef) {
        for (let ex of this.examples)
            yield* ex.iteratePrimitives(includeVarRef);
    }

    clone() {
        const newAnnotations = {};
        Object.assign(newAnnotations, this.annotations);
        return new Dataset(this.name, this.language, this.examples.map((e) => e.clone()), newAnnotations);
    }
}
Dataset.prototype.isDataset = true;
Statement.Dataset = Dataset;
module.exports.Dataset = Dataset;

// An Input is basically a collection of Statement
// It is somewhat organized for "easier" API handling,
// and for backward compatibility with API users
class Input {
}

class Program extends Input {
    constructor(classes, declarations, rules, principal = null, oninputs = []) {
        super();
        assert(Array.isArray(classes));
        this.classes = classes;
        assert(Array.isArray(declarations));
        this.declarations = declarations;
        assert(Array.isArray(rules));
        this.rules = rules;
        assert(principal === null || principal instanceof Value);
        this.principal = principal;
        assert(Array.isArray(oninputs));
        this.oninputs = oninputs;
    }

    *iterateSlots() {
        for (let decl of this.declarations)
            yield* decl.iterateSlots();
        for (let rule of this.rules)
            yield* rule.iterateSlots();
        for (let oninput of this.oninputs)
            yield* oninput.iterateSlots();
    }
    *iteratePrimitives(includeVarRef) {
        for (let decl of this.declarations)
            yield* decl.iteratePrimitives(includeVarRef);
        for (let rule of this.rules)
            yield* rule.iteratePrimitives(includeVarRef);
        for (let oninput of this.oninputs)
            yield* oninput.iteratePrimitives(includeVarRef);
    }

    clone() {
        return new Program(
            this.classes.map((c) => c.clone()),
            this.declarations.map((d) => d.clone()),
            this.rules.map((r) => r.clone()),
            this.principal !== null ? this.principal.clone() : null,
            this.oninputs.map((o) => o.clone())
        );
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

    *iterateSlots() {
        yield* this.principal.iterateSlots(null, null, {});

        if (this.query.isSpecified)
            yield* this.query.filter.iterateSlots(this.query.schema, this.query, {});
        if (this.action.isSpecified)
            yield* this.action.filter.iterateSlots(this.action.schema, this.action, this.query.isSpecified ? this.query.schema.out : {});
    }
    *iteratePrimitives() {
    }

    clone() {
        return new PermissionRule(this.principal.clone(), this.query.clone(), this.action.clone());
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

    *iterateSlots() {
        for (let dataset of this.datasets)
            yield* dataset.iterateSlots();
    }
    *iteratePrimitives(includeVarRef) {
        for (let dataset of this.datasets)
            yield* dataset.iteratePrimitives(includeVarRef);
    }

    clone() {
        return new Library(this.classes.map((c) => c.clone()), this.datasets.map((d) => d.clone()));
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
