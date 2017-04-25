// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const adt = require('adt');
const Compiler = require('./compiler');
const Type = require('./type');
const Internal = require('./internal');

function adtNullable(o) {
    var only = adt.only(o);
    return function(v) {
        if (v === null)
            return v;
        else
            return only.apply(this, arguments);
    };
}

var Value = adt.data({
    VarRef: {
        // this is not really a value, it's a constant variable
        // it's used by the @(foo=bar) syntax and normalized away by
        // ChannelOpener
        //
        // It's also used internally by the slot filling dialog in
        // RuleDialog in Sabrina
        name: adt.only(String),
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
    Number: {
        value: adt.only(Number)
    },
    Location: {
        x: adt.only(Number),
        y: adt.only(Number),
    },
    Date: {
        value: adt.only(Date)
    },
    Time: {
        hour: adt.only(Number),
        minute: adt.only(Number)
    },
    Entity: {
        value: adt.only(String),
        type: adt.only(String)
    },
    Enum: {
        value: adt.only(String)
    },
    Object: {
        value: adt.only(Object)
    },
    Array: {
        value: adt.only(Array)
    },
    Feed: {
        value: adt.any
    },
});
module.exports.Value = Value;

module.exports.typeForValue = function typeForValue(v) {
    if (v.isVarRef)
        return Type.Any;
    if (v.isBoolean)
        return Type.Boolean;
    if (v.isString)
        return Type.String;
    if (v.isMeasure)
        return Type.Measure(v.unit);
    if (v.isNumber)
        return Type.Number;
    if (v.isLocation)
        return Type.Location;
    if (v.isDate)
        return Type.Date;
    if (v.isTime)
        return Type.Time;
    if (v.isEntity)
        return Type.Entity(v.type);
    if (v.isObject)
        return Type.Object(null);
    if (v.isArray)
        return Type.Array(v.value.length ? typeForValue(v.value[0]) : null);
    if (v.isFeed)
        return Type.Feed;
    if (v.isEnum)
        return Type.String;
    throw new TypeError();
}

module.exports.valueToJS = function valueToJS(v) {
    if (v.isArray)
        return v.value.map(valueToJS);
    if (v.isVarRef)
        throw new TypeError("Value is not constant");
    if (v.isLocation)
        return { x: v.x, y: v.y, display: v.display };
    if (v.isTime)
        return v.hour + ':' + (v.minute < 10 ? '0' : '') + v.minute;
    return v.value;
}

var Attribute = adt.newtype('Attribute', {
    name: adt.only(String),
    value: adt.only(String)
});
module.exports.Attribute = Attribute;
var Selector = adt.data({
    GlobalName: {
        name: adt.only(String),
    },
    Attributes: {
        attributes: adt.only(Array),
    },
    Builtin: null
});
module.exports.Selector = Selector;

var Expression = adt.data(function() {
    return ({
        Null: null,
        Constant: {
            value: adt.only(Value)
        },
        VarRef: {
            name: adt.only(String)
        },
        MemberRef: {
            object: adt.only(this),
            name: adt.only(String),
        },
        FunctionCall: {
            name: adt.only(String),
            args: adt.only(Array), // array of Expression
        },
        UnaryOp: {
            arg: adt.only(this),
            opcode: adt.only(String),
        },
        BinaryOp: {
            lhs: adt.only(this),
            rhs: adt.only(this),
            opcode: adt.only(String),
        },
        Tuple: {
            args: adt.only(Array),
        },
        Array: {
            args: adt.only(Array),
        },
    });
});
module.exports.Expression = Expression;
var RulePart = adt.data({
    Invocation: {
        selector: adt.only(Selector),
        name: adtNullable(String),
        params: adt.only(Array) // of Expression
    },
    Binding: {
        name: adt.only(String),
        expr: adt.only(Expression)
    },
    BuiltinPredicate: {
        expr: adt.only(Expression)
    },
    Condition: {
        expr: adt.only(Expression)
    },
});
module.exports.RulePart = RulePart;
var Statement = adt.data({
    ComputeModule: {
        name: adt.only(String),
        statements: adt.only(Array), // array of ComputeStatement
    },
    VarDecl: {
        name: adt.only(String),
        type: adt.only(Type),
    },
    Rule: {
        trigger: adt.only(Array), // array of RulePart
        queries: adt.only(Array), // array of array of RulePart
        actions: adt.only(Array), // array of RulePart
    },
    Command: {
        queries: adt.only(Array), // array of array of RulePart
        actions: adt.only(Array), // array of RulePart
    }
});
module.exports.Statement = Statement;
var ComputeStatement = adt.data({
    EventDecl: {
        name: adt.only(String),
        params: adt.only(Array),
    },
    FunctionDecl: {
        name: adt.only(String),
        params: adt.only(Array),
        code: adt.only(String)
    }
});
module.exports.ComputeStatement = ComputeStatement;
var Program = adt.newtype('Program', {
    name: adt.only(String),
    params: adt.only(Array),
    statements: adt.only(Array) // of Statement
});
module.exports.Program = Program;
