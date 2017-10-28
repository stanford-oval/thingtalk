// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
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

const Value = adt.data({
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
    Number: {
        value: adt.only(Number)
    },
    Location: {
        value: adt.only(Location),
    },
    Date: {
        value: adt.only(Date)
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
    if (type.isEntity)
        return Value.Entity(v.value ? v.value : String(v), v.display||null);
    if (type.isMeasure)
        return Value.Measure(v, type.unit);
    if (type.isEnum)
        return Value.Enum(v);
    if (type.isTime)
        return parseTime(v);
    if (type.isDate)
        return Value.Date(v);
    if (type.isLocation)
        return Value.Location(Location.Absolute(v.y, v.x, v.display||null));
    throw new TypeError('Invalid type ' + type);
};
Value.fromJSON = function fromJSON(type, v) {
    if (type.isDate) {
        let date = new Date(v);
        return new Value.Date(date);
    } else {
        return Value.fromJS(type, v);
    }
};

Value.prototype.isConcrete = function isConcrete() {
    if (this.isLocation && this.value.isRelative)
        return false;
    if (this.isEntity && this.type === 'tt:contact_name')
        return false;
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
    if (v.isEntity)
        return new builtin.Entity(v.value, v.display);
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
    if (v.isArray)
        return Type.Array(v.value.length ? v.value[0].getType() : null);
    if (v.isFeed)
        return Type.Feed;
    if (v.isEnum)
        return Type.Enum(null);
    if (v.isEvent && v.name === 'type')
        return Type.Entity('tt:function');
    if (v.isEvent)
        return Type.String;
    throw new TypeError('Invalid value ' + v);
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
        principal: adt.only(Value, null) // either Entity(tt:contact_name) or Entity(tt:contact)
    },
    Builtin: null
});
module.exports.Selector = Selector.seal();

const InputParam = adt.newtype('InputParam', {
    name: adt.only(String),
    value: adt.only(Value)
});
module.exports.InputParam = InputParam.seal();
const OutputParam = adt.newtype('OutputParam', {
    name: adt.only(String),
    value: adt.only(String)
});
module.exports.OutputParam = OutputParam.seal();
const Filter = adt.newtype('Filter', {
    name: adt.only(String),
    operator: adt.only(String),
    value: adt.only(Value)
});
module.exports.Filter = Filter.seal();

var BooleanExpression = adt.data(function() {
    return {
        And: {
            operands: adt.only(Array) // of BooleanExpression
        },
        Or: {
            operands: adt.only(Array) // of BooleanExpression
        },
        Atom: {
            filter: adt.only(Filter),
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
module.exports.BooleanExpression = BooleanExpression.seal();

var FunctionDef = adt.newtype('FunctionDef', {
    kind_type: adt.only(String),
    args: adt.only(Array),
    types: adt.only(Array),
    index: adt.only(Object),
    inReq: adt.only(Object),
    inOpt: adt.only(Object),
    out: adt.only(Object),
    canonical: adt.only(String),
    confirmation: adt.only(String),
    confirmation_remote: adt.only(String),
    argcanonicals: adt.only(Array),
    questions: adt.only(Array)
});
module.exports.FunctionDef = FunctionDef.seal();

const RulePart = adt.newtype('RulePart', {
    selector: adt.only(Selector),
    channel: adt.only(String),
    in_params: adt.only(Array),
    filter: adt.only(BooleanExpression),
    out_params: adt.only(Array),
    schema: adt.only(FunctionDef, null)
});
module.exports.RulePart = RulePart.seal();

var ClassDef = adt.newtype('ClassDef', {
    name: adt.only(String),
    extends: adt.only(String),
    triggers: adt.only(Object),
    queries: adt.only(Object),
    actions: adt.only(Object)
});
module.exports.ClassDef = ClassDef.seal();

var Rule = adt.newtype('Rule', {
    trigger: adt.only(RulePart, null),
    queries: adt.only(Array), // array of RulePart
    actions: adt.only(Array), // array of RulePart
    once: adt.only(Boolean)
});
module.exports.Rule = Rule.seal();

var Program = adt.newtype('Program', {
    name: adt.only(String),
    params: adt.only(Array),
    classes: adt.only(Array), // of ClassDef
    rules: adt.only(Array), // of Rule
    principal: adt.only(Value, null) // either Entity(tt:contact_name) or Entity(tt:contact)
});
module.exports.Program = Program.seal();

var PermissionFunction = adt.data({
    Specified: {
        kind: adt.only(String),
        channel: adt.only(String),
        filter: adt.only(BooleanExpression),
        out_params: adt.only(Array), // of OutputParam
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
    principal: adt.only(Value, null),
    trigger: adt.only(PermissionFunction),
    query: adt.only(PermissionFunction),
    action: adt.only(PermissionFunction)
});
module.exports.PermissionRule = PermissionRule.seal();

module.exports.prettyprint = prettyprint;
module.exports.prettyprintPermissionRule = prettyprintPermissionRule;
module.exports.prettyprintFilterExpression = prettyprintFilterExpression;
