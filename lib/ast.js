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
const Type = require('./type');
const Internal = require('./internal');
const { prettyprint, prettyprintPermissionRule, prettyprintFilterExpression } = require('./prettyprint');

const builtin = require('./builtin_values');

adt.nativeClone = function nativeClone(x) {
    if (x instanceof adt.__Base__)
        return x.clone();
    if (Array.isArray(x))
        return x.map((el) => nativeClone(el));
    if (x instanceof Date)
        return new Date(x);
    if (typeof x === 'object' && x !== null) {
        let clone = {};
        Object.assign(clone, x);
        return clone;
    }
    return x;
};

const Location = adt.data({
    Absolute: {
        lat: adt.only(Number),
        lon: adt.only(Number),
        display: adt.only(String, null)
    },
    Relative: {
        relativeTag: adt.only(String)
    }
});
module.exports.Location = Location.seal();

const DateEdge = adt.newtype('DateEdge', {
    edge: adt.only('start_of', 'end_of'),
    unit: adt.only(String),
});
module.exports.DateEdge = DateEdge;

const Value = adt.data({
    Array: {
        value: adt.only(Array) // of Value
    },

    VarRef: {
        name: adt.only(String),
    },
    Undefined: { // a special placeholder for values that must be slot-filled
        local: adt.only(Boolean),
    },

    Boolean: {
        value: adt.only(Boolean),
    },
    String: {
        value: adt.only(String)
    },
    Measure: {
        value: adt.only(Number),
        unit: adt.only(String)
    },
    CompoundMeasure: { // a list of measures
        value: adt.only(Array) // of Value.Measure
    },
    Number: {
        value: adt.only(Number)
    },
    Currency: {
        value: adt.only(Number),
        code: adt.only(String)
    },
    Location: {
        value: adt.only(Location),
    },
    Date: {
        value: adt.only(Date, DateEdge, null),
        operator: adt.only('+', '-'),
        offset: (x) => { // can't use adt.only here, because of recursive definition
            if (x === null)
                return x;
            if (x instanceof Value.VarRef && x.name.startsWith('__const_'))
                return x;
            if (!(x instanceof Value.CompoundMeasure) && !(x instanceof Value.Measure))
                throw new TypeError('Invalid Date offset ' + x);
            return x;
        }
    },
    Time: {
        hour: adt.only(Number),
        minute: adt.only(Number),
        second: adt.only(Number)
    },
    Entity: {
        value: adt.only(String),
        type: adt.only(String),
        display: adt.only(String, null)
    },
    Enum: {
        value: adt.only(String)
    },
    Event: {
        name: adt.only(String, null)
    }
});
module.exports.Value = Value.seal();

function parseTime(v) {
    if (typeof v === 'string') {
        let [hour, minute, second] = v.split(':');
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (second === undefined)
            second = 0;
        else
            second = parseInt(second);
        return new Value.Time(hour, minute, second);
    } else {
        return new Value.Time(v.hour, v.minute, v.second);
    }
}

Value.fromJS = function fromJS(type, v) {
    if (type.isBoolean)
        return Value.Boolean(v);
    if (type.isString)
        return Value.String(v);
    if (type.isNumber)
        return Value.Number(v);
    if (type.isCurrency)
        return typeof v === 'number' ? new Value.Currency(v, 'usd') : new Value.Currency(v.value, v.code);
    if (type.isEntity)
        return new Value.Entity((v.value ? v.value : String(v)), type.type, v.display||null);
    if (type.isMeasure)
        return new Value.Measure(v, type.unit);
    if (type.isEnum)
        return Value.Enum(v);
    if (type.isTime)
        return parseTime(v);
    if (type.isDate)
        return new Value.Date(v, '+', null);
    if (type.isLocation)
        return new Value.Location(Location.Absolute(v.y, v.x, v.display||null));
    throw new TypeError('Invalid type ' + type);
};
Value.fromJSON = function fromJSON(type, v) {
    if (type.isDate) {
        if (v === null)
            return new Value.Date(null, null);
        let date = new Date(v);
        return new Value.Date(date, null);
    } else {
        return Value.fromJS(type, v);
    }
};

Value.prototype.isConcrete = function isConcrete() {
    if (this.isLocation && this.value.isRelative)
        return false;
    /*if (this.isEntity && this.type === 'tt:contact_name')
        return false;*/
    if (this.isEntity && !this.display)
        return false;
    return true;
};
Value.prototype.toJS = function toJS() {
    const v = this;
    if (v.isArray)
        return v.value.map((v) => v.toJS());
    if (v.isVarRef || v.isEvent)
        throw new TypeError("Value is not constant");
    if (v.isUndefined)
        return undefined;
    if (v.isLocation && v.value.isAbsolute)
        return new builtin.Location(v.value.lat, v.value.lon, v.value.display);
    if (v.isLocation)
        throw new TypeError('Location is unknown');
    if (v.isTime)
        return new builtin.Time(v.hour, v.minute);
    if (v.isMeasure)
        return Internal.transformToBaseUnit(v.value, v.unit);
    if (v.isCurrency)
        return new builtin.Currency(v.value, v.code);
    if (v.isCompoundMeasure)
        return v.value.reduce(((x, y) => x + y.toJS()), 0);
    if (v.isEntity)
        return new builtin.Entity(v.value, v.display);
    if (v.isDate)
        return Internal.normalizeDate(v.value, (v.operator === '-' ? -1 : 1) * (v.offset ? v.offset.toJS() : 0));
    return v.value;
};
Value.prototype.getType = function getType() {
    const v = this;
    if (v.isVarRef || v.isUndefined)
        return Type.Any;
    if (v.isBoolean)
        return Type.Boolean;
    if (v.isString)
        return Type.String;
    if (v.isMeasure)
        return Type.Measure(v.unit);
    if (v.isCompoundMeasure)
        return Type.Measure(v.value[0].unit); // TODO check that all units are compatible
    if (v.isNumber)
        return Type.Number;
    if (v.isCurrency)
        return Type.Currency;
    if (v.isLocation)
        return Type.Location;
    if (v.isDate)
        return Type.Date;
    if (v.isTime)
        return Type.Time;
    if (v.isEntity)
        return Type.Entity(v.type);
    if (v.isArray)
        return Type.Array(v.value.length ? v.value[0].getType() : Type.Any);
    if (v.isFeed)
        return Type.Feed;
    if (v.isEnum)
        return Type.Enum(null);
    if (v.isEvent && v.name === 'type')
        return Type.Entity('tt:function');
    if (v.isEvent && v.name === 'program_id')
        return Type.Entity('tt:program_id');
    if (v.isEvent)
        return Type.String;
    throw new TypeError('Invalid value ' + v);
};

Value.Date.now = function() {
    return new Value.Date(null, '+', null);
};

module.exports.valueToJS = function valueToJS(v) {
    return v.toJS();
};
module.exports.typeForValue = function typeForValue(v) {
    return v.getType();
};

const Selector = adt.data({
    Device: {
        kind: adt.only(String),
        id: adt.only(String, null),
        principal: adt.only(Value, null), // either Entity(tt:username), Entity(tt:contact), Entity(tt:contact_group_name) or Entity(tt:contact_group)
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

const FunctionDef = adt.newtype('FunctionDef', {
    kind_type: adt.only(String),
    args: adt.only(Array),
    types: adt.only(Array),
    index: adt.only(Object),
    inReq: adt.only(Object),
    inOpt: adt.only(Object),
    out: adt.only(Object),
    is_list: adt.only(Boolean),
    is_monitorable: adt.only(Boolean),
    canonical: adt.only(String),
    confirmation: adt.only(String),
    confirmation_remote: adt.only(String),
    argcanonicals: adt.only(Array),
    questions: adt.only(Array)
});
module.exports.FunctionDef = FunctionDef.seal();

const ClassDef = adt.newtype('ClassDef', {
    name: adt.only(String),
    extends: adt.only(String),
    queries: adt.only(Object),
    actions: adt.only(Object)
});
module.exports.ClassDef = ClassDef.seal();

const Invocation = adt.newtype('Invocation', {
    selector: adt.only(Selector),
    channel: adt.only(String),
    in_params: adt.only(Array),
    schema: adt.only(FunctionDef, null),
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
            schema: adt.only(FunctionDef, null)
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
        principal: adt.only(Value, null),
        schema: adt.only(FunctionDef, null),
    },
    Invocation: {
        invocation: adt.only(Invocation),
        schema: adt.only(FunctionDef, null)
    },
});
Table.type('Filter', {
    table: adt.only(Table),
    filter: adt.only(BooleanExpression),
    schema: adt.only(FunctionDef, null)
});
Table.type('Projection', {
    table: adt.only(Table),
    args: adt.only(Array), // of String
    schema: adt.only(FunctionDef, null)
});
Table.type('Compute', {
    table: adt.only(Table),
    expression: adt.only(ScalarExpression),
    alias: adt.only(String, null),
    schema: adt.only(FunctionDef, null)
});
Table.type('Alias', {
    table: adt.only(Table),
    name: adt.only(String),
    schema: adt.only(FunctionDef, null)
});
Table.type('Aggregation', {
    table: adt.only(Table),
    field: adt.only(String),
    operator: adt.only(String),
    alias: adt.only(String, null),
    schema: adt.only(FunctionDef, null)
});
Table.type('ArgMinMax', {
    table: adt.only(Table),
    field: adt.only(String),
    operator: adt.only(String),
    base: adt.only(Value),
    limit: adt.only(Value),
    schema: adt.only(FunctionDef, null)
});
Table.type('Join', {
    lhs: adt.only(Table),
    rhs: adt.only(Table),
    in_params: adt.only(Array),
    schema: adt.only(FunctionDef, null)
});
var Stream = adt.data({
    VarRef: {
        name: adt.only(String),
        in_params: adt.only(Array),
        principal: adt.only(Value, null),
        schema: adt.only(FunctionDef, null),
    },
    Timer: {
        base: adt.only(Value),
        interval: adt.only(Value),
        schema: adt.only(FunctionDef, null)
    },
    AtTimer: {
        time: adt.only(Value),
        schema: adt.only(FunctionDef, null)
    },
    Monitor: {
        table: adt.only(Table),
        args: adt.only(Array, null),
        schema: adt.only(FunctionDef, null),
    }
});
Table.type('Window', {
    base: adt.only(Value), // : Number
    delta: adt.only(Value), // : Number
    stream: adt.only(Stream),
    schema: adt.only(FunctionDef, null)
});
Table.type('TimeSeries', {
    base: adt.only(Value), // : Date
    delta: adt.only(Value), // : Measure(ms)
    stream: adt.only(Stream),
    schema: adt.only(FunctionDef, null)
});
Table.type('Sequence', {
    base: adt.only(Value), // : Number
    delta: adt.only(Value), // : Number
    table: adt.only(Table),
    schema: adt.only(FunctionDef, null)
});
Table.type('History', {
    base: adt.only(Value), // : Date
    delta: adt.only(Value), // : Measure(ms)
    table: adt.only(Table),
    schema: adt.only(FunctionDef, null)
});
Stream.type('EdgeNew', {
    stream: adt.only(Stream),
    schema: adt.only(FunctionDef, null)
});
Stream.type('EdgeFilter', {
    stream: adt.only(Stream),
    filter: adt.only(BooleanExpression),
    schema: adt.only(FunctionDef, null)
});
Stream.type('Filter', {
    stream: adt.only(Stream),
    filter: adt.only(BooleanExpression),
    schema: adt.only(FunctionDef, null)
});
Stream.type('Projection', {
    stream: adt.only(Stream),
    args: adt.only(Array), // of String
    schema: adt.only(FunctionDef, null)
});
Stream.type('Compute', {
    stream: adt.only(Stream),
    expression: adt.only(ScalarExpression),
    alias: adt.only(String, null),
    schema: adt.only(FunctionDef, null)
});
Stream.type('Alias', {
    stream: adt.only(Stream),
    name: adt.only(String),
    schema: adt.only(FunctionDef, null)
});
Stream.type('Join', {
    stream: adt.only(Stream),
    table: adt.only(Table),
    in_params: adt.only(Array),
    schema: adt.only(FunctionDef, null)
});
module.exports.Table = Table.seal();
module.exports.Stream = Stream.seal();

const Statement = adt.data({
    Declaration: {
        name: adt.only(String),
        type: adt.only('stream', 'table', 'action'),
        args: adt.only(Object), // maps name to Type
        value: adt.only(Stream, Table, Invocation)
    },
    Rule: {
        stream: adt.only(Stream),
        actions: adt.only(Array) // of Invocation
    },
    Command: {
        table: adt.only(Table, null),
        actions: adt.only(Array)
    }
});
module.exports.Statement = Statement.seal();

const Program = adt.newtype('Program', {
    classes: adt.only(Array), // of ClassDef
    declarations: adt.only(Array), // of Statement.Declaration
    rules: adt.only(Array), // of Statement.Rule or Statement.Command
    principal: adt.only(Value, null) // either Entity(tt:username) or Entity(tt:contact)
});
module.exports.Program = Program.seal();

var PermissionFunction = adt.data({
    Specified: {
        kind: adt.only(String),
        channel: adt.only(String),
        filter: adt.only(BooleanExpression),
        schema: adt.only(FunctionDef, null),
    },
    Builtin: null,
    ClassStar: {
        kind: adt.only(String)
    },
    Star: null
});
module.exports.PermissionFunction = PermissionFunction.seal();

var PermissionRule = adt.newtype('PermissionRule', {
    principal: adt.only(BooleanExpression),
    query: adt.only(PermissionFunction),
    action: adt.only(PermissionFunction)
});
module.exports.PermissionRule = PermissionRule.seal();

module.exports.prettyprint = prettyprint;
module.exports.prettyprintPermissionRule = prettyprintPermissionRule;
module.exports.prettyprintFilterExpression = prettyprintFilterExpression;
