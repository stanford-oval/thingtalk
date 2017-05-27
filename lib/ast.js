// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const adt = require('adt');
const Type = require('./type');
const Internal = require('./internal');
const prettyprint = require('./prettyprint');

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
        minute: adt.only(Number)
    },
    Entity: {
        value: adt.only(String),
        type: adt.only(String),
        display: adt.only(String, null)
    },
    Enum: {
        value: adt.only(String)
    },
    Array: {
        value: adt.only(Array)
    },
    Event: {
        name: adt.only(String, null)
    }
});
module.exports.Value = Value.seal();

Value.prototype.toJS = function toJS() {
    const v = this;
    if (v.isArray)
        return v.value.map(valueToJS);
    if (v.isVarRef || v.isEvent)
        throw new TypeError("Value is not constant");
    if (v.isUndefined)
        return undefined;
    if (v.isLocation && v.value.isAbsolute)
        return { x: v.value.lon, y: v.value.lat, display: v.value.display };
    if (v.isLocation)
        throw new TypeError('Location is unknown');
    if (v.isTime)
        return v.hour + ':' + (v.minute < 10 ? '0' : '') + v.minute;
    if (v.isMeasure)
        return Internal.transformToBaseUnit(v.value, v.unit);
    return v.value;
}
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
        return Type.Array(v.value.length ? typeForValue(v.value[0]) : null);
    if (v.isFeed)
        return Type.Feed;
    if (v.isEnum)
        return Type.Enum(null);
    if (v.isEvent)
        return Type.String;
    throw new TypeError('Invalid value ' + v);
}

module.exports.valueToJS = function valueToJS(v) {
    return v.toJS();
}
module.exports.typeForValue = function typeForValue(v) {
    return v.getType();
}

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

const RulePart = adt.newtype('RulePart', {
    selector: adt.only(Selector),
    channel: adt.only(String),
    in_params: adt.only(Array),
    filters: adt.only(Array),
    out_params: adt.only(Array)
});
module.exports.RulePart = RulePart.seal();

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
    rules: adt.only(Array) // of Rule
});
module.exports.Program = Program;

module.exports.prettyprint = prettyprint;
