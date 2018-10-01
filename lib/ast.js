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
const { normalizeDate } = require('./date_utils');
const Units = require('./units');

const { ArgDirection, ArgumentDef, ClassDef, FunctionDef, ExpressionSignature, ImportStmt } = require('./class_def_ast');
module.exports.ArgDirection = ArgDirection;
module.exports.ArgumentDef = ArgumentDef;
module.exports.ClassDef = ClassDef;
module.exports.FunctionDef = FunctionDef;
module.exports.ExpressionSignature = ExpressionSignature;
module.exports.ImportStmt = ImportStmt;

const builtin = require('./builtin_values');

adt.nativeClone = function nativeClone(x) {
    if (x === null || x === undefined)
        return x;
    if (x instanceof adt.__Base__ || typeof x.clone === 'function')
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
        value: adt.only(String, null),
        type: adt.only(String),
        display: adt.only(String, null)
    },
    Enum: {
        value: adt.only(String)
    },
    Event: {
        name: adt.only(String, null)
    },
    ArgMap: {
        value: adt.only(Object)
    },
    Object: {
        value: adt.only(Object)
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
    // if type is not provided, try to figure out the type by value
    if (!type || type.isAny) {
        switch (typeof v) {
            case 'boolean': type = Type.Boolean; break;
            case 'number': type = Type.Number; break;
            case 'string': type = Type.String; break;
            case 'object':
                if (Array.isArray(v)) {
                    type = Type.Array(Type.Any);
                    break;
                } else if ('x' in v && 'y' in v) {
                    type = Type.Location;
                    break;
                } else if (Object.values(v).length > 0 && Object.values(v).some((key) => !['unit,operator,value,name,type,display,local'].includes(key))) {
                    // HACK
                    type = Type.Object;
                    break;
                } else if (Object.values(v).length > 0 && Object.values(v)[0] instanceof Type) {
                    type = Type.ArgMap;
                    break;
                }
            default:
                throw new TypeError('Failed to determine the type of ' + JSON.stringify(v));
        }
    }
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
    if (type.isArgMap) {
        let map = {};
        Object.entries(v).forEach(([key, value]) => {
            map[key] = Type.fromString(value);
        });
        return new Value.ArgMap(map);
    }
    if (type.isObject) {
        let map = {};
        Object.entries(v).forEach(([key, value]) => {
            map[key] = fromJS(undefined, value);
        });
        return new Value.Object(map);
    }
    if (type.isArray) {
        let array = [];
        v.forEach((elem) => {
            array.push(fromJS(type.elem, elem));
        });
        return new Value.Array(array);
    }
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
    if (this.isEntity && !this.display)
        return false;
    if (this.isEntity && this.value === null)
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
        return Units.transformToBaseUnit(v.value, v.unit);
    if (v.isCurrency)
        return new builtin.Currency(v.value, v.code);
    if (v.isCompoundMeasure)
        return v.value.reduce(((x, y) => x + y.toJS()), 0);
    if (v.isEntity)
        return new builtin.Entity(v.value, v.display);
    if (v.isDate)
        return normalizeDate(v.value, v.operator, v.offset ? v.offset.toJS() : 0);
    if (v.isObject) {
        let obj = {};
        Object.entries(v.value).forEach(([key, value]) => {
            obj[key] = value.toJS();
        });
        return obj;
    }
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
    if (v.isArgMap)
        return Type.ArgMap;
    throw new TypeError('Invalid value ' + v);
};

Value.Date.now = function() {
    return new Value.Date(null, '+', null);
};

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

function actionCompat(actions, field, ctr) {
    return adt.only(Array)(actions, field, ctr).map((a) => {
        if (a instanceof Invocation)
            return new Action.Invocation(a, a.schema);
        else if (a instanceof Action)
            return a;
        else
            throw new TypeError(`Unexpected type, expected an Action`);
    });
}

const Statement = adt.data({
    Declaration: {
        name: adt.only(String),
        type: adt.only('stream', 'query', 'action'),
        args: adt.only(Object), // maps name to Type
        value: (x, field, ctr) => {
            adt.only(Stream, Table, Action, Invocation)(x, field, ctr);
            if (x instanceof Invocation)
                return new Action.Invocation(x, x.schema);
            else
                return x;
        }
    },
    Rule: {
        stream: adt.only(Stream),
        actions: actionCompat, // Array of ActionInvocation
    },
    Command: {
        table: adt.only(Table, null),
        actions: actionCompat, // Array of ActionInvocation
    }
});
module.exports.Statement = Statement.seal();

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

const Input = adt.data({
    Program: {
        classes: adt.only(Array), // of ClassDef
        declarations: adt.only(Array), // of Statement.Declaration
        rules: adt.only(Array), // of Statement.Rule or Statement.Command
        principal: adt.only(Value, null) // either Entity(tt:username) or Entity(tt:contact)
    },
    'PermissionRule': {
        principal: adt.only(BooleanExpression),
        query: adt.only(PermissionFunction),
        action: adt.only(PermissionFunction)
    },
    Meta: {
        classes: adt.only(Array), // of ClassDef
        datasets: adt.only(Array), // of Dataset
    }
});
module.exports.Input = Input.seal();
module.exports.Program = Input.Program;
module.exports.PermissionRule = Input.PermissionRule;

const Dataset = adt.newtype({
    name: adt.only(String),
    language: adt.only(String),
    examples: adt.only(Array), // of Example
    metadata: adt.only(Object)
});
module.exports.Dataset = Dataset.seal();

const Example = adt.newtype({
    id: adt.only(Number), // default to -1 for newly created examples
    type: adt.only('stream', 'query', 'action', 'program'),
    args: adt.only(Object),
    value: adt.only(Stream, Table, Action, Input),
    utterances: adt.only(Array),
    preprocessed: adt.only(Array)
});
module.exports.Example = Example.seal();