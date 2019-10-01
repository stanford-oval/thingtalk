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
const Type = require('../type');
const { normalizeDate } = require('../date_utils');
const Units = require('../units');

const builtin = require('../builtin/values');

const Location = adt.data({
    Absolute: {
        lat: adt.only(Number),
        lon: adt.only(Number),
        display: adt.only(String, null)
    },
    Relative: {
        relativeTag: adt.only(String)
    },
    Unresolved: {
        name: adt.only(String)
    }
});
module.exports.Location = Location.seal();

const DateEdge = adt.newtype('DateEdge', {
    edge: adt.only('start_of', 'end_of'),
    unit: adt.only(String),
});
module.exports.DateEdge = DateEdge;

const Time = adt.data({
    Absolute: {
        hour: adt.only(Number),
        minute: adt.only(Number),
        second: adt.only(Number)
    },
    Relative: {
        relativeTag: adt.only(String)
    }
});
module.exports.Time = Time.seal();

/**
 * An AST node that represents a scalar value.
 *
 * This could be a constant (including an array literal), a slot-filling placeholder,
 * or the name of a variable in scope.
 *
 * Note that AST node representations are different from runtime representations
 * (in {@link module:Builtin}. AST nodes carry type information, can carry
 * additional information that might not be available at runtime, and can represent
 * unspecified or unresolved values. Code using the library to manipulate programs statically
 * will make use of this class, while code using the library to implement or call Thingpedia
 * functions will make use of the runtime representations.
 *
 * @alias module:Ast.Value
 * @class
 * @abstract
 */
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
        value: adt.only(Location)
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
        value: adt.only(Time)
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
        return new Value.Time(Time.Absolute(hour, minute, second));
    } else {
        return new Value.Time(Time.Absolute(v.hour, v.minute, v.second));
    }
}

/**
 * Convert a normalized JS value to the corresponding AST node.
 *
 * This is the inverse operation of {@link module:Ast.Value#toJS}.
 *
 * @param {Type} type - the ThingTalk type
 * @param {any} v - the JS value to convert
 * @return {module:Ast.Value} the converted value
 */
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
    if (type.isArgMap) {
        let map = {};
        Object.entries(v).forEach(([key, value]) => {
            map[key] = Type.fromString(value);
        });
        return new Value.ArgMap(map);
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

/**
 * Convert a normalized JSON value to the corresponding AST node.
 *
 * This is similar to {@link module:Ast.Value.fromJS} but handles JSON
 * serialization of Date values.
 *
 * @param {Type} type - the ThingTalk type
 * @param {any} v - the JSON value to convert
 * @return {module:Ast.Value} the converted value
 */
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

/**
 * Check if this AST node represent concrete (compilable) value.
 *
 * Values that are not concrete require normalization by the dialog agent
 * (such as entity or location resolution) before a program using them
 * is compiled and executed.
 *
 * @reutrn {boolean} whether the value is concrete
 */
Value.prototype.isConcrete = function isConcrete() {
    if (this.isLocation && (this.value.isRelative || this.value.isUnresolved))
        return false;
    if (this.isTime && this.value.isRelative)
        return false;
    if (this.isEntity && this.value === null)
        return false;
    return true;
};

/**
 * Normalize this AST value and convert it to JS-friendly representation.
 *
 * This converts the AST representation to something that can be passed to
 * a Thingpedia function. Note that the conversion is lossy and loses type
 * information.
 *
 * @return {any} the normlized value
 */
Value.prototype.toJS = function toJS() {
    const v = this;
    if (v.isArray)
        return v.value.map((v) => v instanceof Value ? v.toJS() : v);
    if (v.isVarRef || v.isEvent)
        throw new TypeError("Value is not constant");
    if (v.isUndefined)
        return undefined;
    if (v.isLocation && v.value.isAbsolute)
        return new builtin.Location(v.value.lat, v.value.lon, v.value.display);
    if (v.isLocation)
        throw new TypeError('Location is unknown');
    if (v.isTime && v.value.isAbsolute)
        return new builtin.Time(v.value.hour, v.value.minute);
    if (v.isTime)
        throw new TypeError('Time is unknown');
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
            obj[key] = value instanceof Value ? value.toJS() : value;
        });
        return obj;
    }
    return v.value;
};

/**
 * Retrieve the ThingTalk type of this value.
 *
 * @return {Type} the type
 */
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
