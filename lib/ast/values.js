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

const assert = require('assert');
const adt = require('adt');
const Units = require('thingtalk-units');

const Type = require('../type');
const { normalizeDate } = require('../date_utils');
const AstNode = require('./base');

const builtin = require('../builtin/values');

class Location extends AstNode {
}
module.exports.Location = Location;

class AbsoluteLocation extends Location {
    constructor(lat, lon, display = null) {
        super(null);
        assert(typeof lat === 'number');
        this.lat = lat;
        assert(typeof lon === 'number');
        this.lon = lon;
        assert(typeof display === 'string' || display === null);
        this.display = display;
    }

    toString() {
        return `Absolute(${this.lat}, ${this.lon}, ${this.display})`;
    }

    clone() {
        return new AbsoluteLocation(this.lat, this.lon, this.display);
    }
}
AbsoluteLocation.prototype.isAbsolute = true;
Location.Absolute = AbsoluteLocation;

class RelativeLocation extends Location {
    constructor(relativeTag) {
        super(null);
        assert(typeof relativeTag === 'string');
        this.relativeTag = relativeTag;
    }

    toString() {
        return `Relative(${this.relativeTag})`;
    }

    clone() {
        return new RelativeLocation(this.relativeTag);
    }
}
RelativeLocation.prototype.isRelative = true;
Location.Relative = RelativeLocation;

class UnresolvedLocation extends Location {
    constructor(name) {
        super(null);
        this.name = name;
    }

    toString() {
        return `Unresolved(${this.name})`;
    }

    clone() {
        return new UnresolvedLocation(this.name);
    }
}
UnresolvedLocation.prototype.isUnresolved = true;
Location.Unresolved = UnresolvedLocation;

class DateEdge {
    constructor(edge, unit) {
        assert(edge === 'start_of' || edge === 'end_of');
        this.edge = edge;
        assert(typeof unit === 'string');
        this.unit = unit;
    }
}
DateEdge.prototype.isDateEdge = true;
module.exports.DateEdge = DateEdge;

class Time extends AstNode {
}
module.exports.Time = Time;

class AbsoluteTime extends Time {
    constructor(hour, minute, second) {
        super(null);
        assert(typeof hour === 'number');
        this.hour = hour;
        assert(typeof minute === 'number');
        this.minute = minute;
        assert(typeof second === 'number');
        this.second = second;
    }

    clone() {
        return new AbsoluteTime(this.hour, this.minute, this.second);
    }
}
AbsoluteTime.prototype.isAbsolute = true;
Time.Absolute = AbsoluteTime;

class RelativeTime extends Time {
    constructor(relativeTag) {
        super(null);
        assert(typeof relativeTag === 'string');
        this.relativeTag = relativeTag;
    }

    clone() {
        return new RelativeTime(this.relativeTag);
    }
}
RelativeTime.prototype.isRelative = true;
Time.Relative = RelativeTime;

/**
 * An AST node that represents a scalar value.
 *
 * This could be a constant, a slot-filling placeholder, the name of a variable in scope,
 * a compound type expression (array or object literal) or a computation expression.
 *
 * Note that AST node representations are different from runtime representations
 * (in {@link Builtin}. AST nodes carry type information, can carry
 * additional information that might not be available at runtime, and can represent
 * unspecified or unresolved values. Code using the library to manipulate programs statically
 * will make use of this class, while code using the library to implement or call Thingpedia
 * functions will make use of the runtime representations.
 *
 * @alias Ast.Value
 * @class
 * @abstract
 */
class Value extends AstNode {
}
module.exports.Value = Value;

class ArrayValue extends Value {
    constructor(value) {
        super(null);
        assert(Array.isArray(value));
        this.value = value;
    }

    toString() {
        return `Array(${this.value})`;
    }

    clone() {
        return new ArrayValue(this.value.map((v) => v.clone()));
    }
}
ArrayValue.prototype.isArray = true;
Value.Array = ArrayValue;

class VarRefValue extends Value {
    constructor(name) {
        super(null);
        assert(typeof name === 'string');
        this.name = name;
    }

    toString() {
        return `VarRef(${this.name})`;
    }

    clone() {
        return new VarRefValue(this.name);
    }
}
VarRefValue.prototype.isVarRef = true;
Value.VarRef = VarRefValue;

class ComputationValue extends Value {
    constructor(op, operands) {
        super(null);
        assert(typeof op === 'string');
        this.op = op;
        assert(Array.isArray(operands));
        this.operands = operands;
    }

    toString() {
        return `Computation(${this.op}, ${this.operands})`;
    }

    clone() {
        return new ComputationValue(this.op, this.operands.map((v) => v.clone()));
    }
}
ComputationValue.prototype.isComputation = true;
Value.Computation = ComputationValue;

class ArrayFieldValue extends Value {
    constructor(value, field) {
        super(null);
        assert(value instanceof Value);
        this.value = value;
        assert(typeof field === 'string');
        this.field = field;
    }

    toString() {
        return `ArrayField(${this.value}, ${this.field})`;
    }

    clone() {
        return new ArrayFieldValue(this.value.clone(), this.field);
    }
}
ArrayFieldValue.prototype.isArrayField = true;
Value.ArrayField = ArrayFieldValue;

class FilterValue extends Value {
    constructor(value, filter) {
        super(null);
        assert(value instanceof Value);
        this.value = value;
        // note we cannot check for BooleanExpression here as it would create a cyclic dep
        this.filter = filter;
    }

    toString() {
        return `Filter(${this.value}, ${this.filter})`;
    }

    clone() {
        return new FilterValue(this.value.clone(), this.filter.clone());
    }
}
FilterValue.prototype.isFilter = true;
Value.Filter = FilterValue;

/**
 * A special placeholder for values that must be slot-filled.
 */
class UndefinedValue extends Value {
    constructor(local = true) {
        super(null);
        assert(local === true || local === false);
        this.local = local;
    }

    toString() {
        return `Undefined(${this.local})`;
    }

    clone() {
        return new UndefinedValue(this.local);
    }
}
UndefinedValue.prototype.isUndefined = true;
Value.Undefined = UndefinedValue;

class ContextRefValue extends Value {
    constructor(name, type) {
        super(null);
        assert(typeof name === 'string');
        this.name = name;
        assert(type instanceof Type);
        this.type = type;
    }

    toString() {
        return `ContextRef(${this.name}, ${this.type})`;
    }

    clone() {
        return new ContextRefValue(this.name, this.type);
    }
}
ContextRefValue.prototype.isContextRef = true;
Value.ContextRef = ContextRefValue;

class BooleanValue extends Value {
    constructor(value) {
        super(null);
        assert(typeof value === 'boolean');
        this.value = value;
    }

    toString() {
        return `Boolean(${this.value})`;
    }

    clone() {
        return new BooleanValue(this.value);
    }
}
BooleanValue.prototype.isBoolean = true;
Value.Boolean = BooleanValue;

class StringValue extends Value {
    constructor(value) {
        super(null);
        assert(typeof value === 'string');
        this.value = value;
    }

    toString() {
        return `String(${this.value})`;
    }

    clone() {
        return new StringValue(this.value);
    }
}
StringValue.prototype.isString = true;
Value.String = StringValue;

class NumberValue extends Value {
    constructor(value) {
        super(null);
        assert(typeof value === 'number');
        this.value = value;
    }

    toString() {
        return `Number(${this.value})`;
    }

    clone() {
        return new NumberValue(this.value);
    }
}
NumberValue.prototype.isNumber = true;
Value.Number = NumberValue;

class MeasureValue extends Value {
    constructor(value, unit) {
        super(null);
        assert(typeof value === 'number');
        this.value = value;
        assert(typeof unit === 'string');
        this.unit = unit;
    }

    toString() {
        return `Measure(${this.value}, ${this.unit})`;
    }

    clone() {
        return new MeasureValue(this.value, this.unit);
    }
}
MeasureValue.prototype.isMeasure = true;
Value.Measure = MeasureValue;

class CurrencyValue extends Value {
    constructor(value, code) {
        super(null);
        assert(typeof value === 'number');
        this.value = value;
        assert(typeof code === 'string');
        this.code = code;
    }

    toString() {
        return `Currency(${this.value}, ${this.code})`;
    }

    clone() {
        return new CurrencyValue(this.value, this.code);
    }
}
CurrencyValue.prototype.isCurrency = true;
Value.Currency = CurrencyValue;

class LocationValue extends Value {
    constructor(value) {
        super(null);
        assert(value instanceof Location);
        this.value = value;
    }

    toString() {
        return `Location(${this.value})`;
    }

    clone() {
        return new LocationValue(this.value.clone());
    }
}
LocationValue.prototype.isLocation = true;
Value.Location = LocationValue;

class DateValue extends Value {
    constructor(value) {
        super(null);
        assert(value === null || value instanceof Date || value instanceof DateEdge);
        this.value = value;
    }

    toString() {
        return `Date(${this.value})`;
    }

    clone() {
        return new DateValue(this.value);
    }
}
DateValue.prototype.isDate = true;
Value.Date = DateValue;

class TimeValue extends Value {
    constructor(value) {
        super(null);
        assert(value instanceof Time);
        this.value = value;
    }

    toString() {
        return `Time(${this.value})`;
    }

    clone() {
        return new TimeValue(this.value.clone());
    }
}
TimeValue.prototype.isTime = true;
Value.Time = TimeValue;

class EntityValue extends Value {
    constructor(value, type, display = null) {
        super(null);
        assert(value === null || typeof value === 'string');
        this.value = value;
        assert(typeof type === 'string');
        this.type = type;
        assert(display === null || typeof display === 'string');
        this.display = display;
    }

    toString() {
        return `Entity(${this.value}, ${this.type}, ${this.display})`;
    }

    clone() {
        return new EntityValue(this.value, this.type, this.display);
    }
}
EntityValue.prototype.isEntity = true;
Value.Entity = EntityValue;

class EnumValue extends Value {
    constructor(value) {
        super(null);
        assert(typeof value === 'string');
        this.value = value;
    }

    toString() {
        return `Enum(${this.value})`;
    }

    clone() {
        return new EnumValue(this.value);
    }
}
EnumValue.prototype.isEnum = true;
Value.Enum = EnumValue;

class EventValue extends Value {
    constructor(name) {
        super(null);
        assert(name === null || typeof name === 'string');
        this.name = name;
    }

    toString() {
        return `Event(${this.name})`;
    }

    clone() {
        return new EventValue(this.name);
    }
}
EventValue.prototype.isEvent = true;
Value.Event = EventValue;

class ArgMapValue extends Value {
    constructor(value) {
        super(null);
        assert(typeof value === 'object');
        this.value = value;
    }

    toString() {
        return `ArgMap(${this.value})`;
    }

    clone() {
        const clone = {};
        for (let key in this.value)
            clone[key] = this.value[key].clone();
        return new ArgMapValue(clone);
    }
}
ArgMapValue.prototype.isArgMap = true;
Value.ArgMap = ArgMapValue;

class ObjectValue extends Value {
    constructor(value) {
        super(null);
        assert(typeof value === 'object');
        this.value = value;
    }

    toString() {
        return `Object(${this.value})`;
    }

    clone() {
        const clone = {};
        for (let key in this.value)
            clone[key] = this.value[key].clone();
        return new ObjectValue(clone);
    }
}
ObjectValue.prototype.isObject = true;
Value.Object = ObjectValue;

function parseTime(v) {
    if (typeof v === 'string') {
        let [hour, minute, second] = v.split(':');
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (second === undefined)
            second = 0;
        else
            second = parseInt(second);
        return new Value.Time(new Time.Absolute(hour, minute, second));
    } else {
        return new Value.Time(new Time.Absolute(v.hour, v.minute, v.second));
    }
}

Value.prototype.visit = function visit(visitor) {
    // TODO more finegrained visit functions
    visitor.enter(this);
    if (visitor.visitValue(this)) {
        if (this.isArrayField || this.isFilter) {
            this.value.visit(visitor);
        } else if (this.isComputation) {
            for (let v of this.operands)
                v.visit(visitor);
        } else if (this.isArray || this.isCompoundMeasure) {
            for (let v of this.value)
                v.visit(visitor);
        } else if (this.isObject) {
            for (let key in this.value)
                this.value[key].visit(visitor);
        }
    }
    visitor.exit(this);
};

/**
 * Convert a normalized JS value to the corresponding AST node.
 *
 * This is the inverse operation of {@link Ast.Value#toJS}.
 *
 * @param {Type} type - the ThingTalk type
 * @param {any} v - the JS value to convert
 * @return {Ast.Value} the converted value
 */
Value.fromJS = function fromJS(type, v) {
    if (type.isBoolean)
        return new Value.Boolean(v);
    if (type.isString)
        return new Value.String(v);
    if (type.isNumber)
        return new Value.Number(v);
    if (type.isCurrency)
        return typeof v === 'number' ? new Value.Currency(v, 'usd') : new Value.Currency(v.value, v.code);
    if (type.isEntity)
        return new Value.Entity((v.value ? v.value : String(v)), type.type, v.display||null);
    if (type.isMeasure)
        return new Value.Measure(v, type.unit);
    if (type.isEnum)
        return new Value.Enum(v);
    if (type.isTime)
        return parseTime(v);
    if (type.isDate)
        return new Value.Date(v);
    if (type.isLocation)
        return new Value.Location(new Location.Absolute(v.y, v.x, v.display||null));
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
 * This is similar to {@link Ast.Value.fromJS} but handles JSON
 * serialization of Date values.
 *
 * @param {Type} type - the ThingTalk type
 * @param {any} v - the JSON value to convert
 * @return {Ast.Value} the converted value
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
    if (this.isMeasure && this.unit.startsWith("default"))
        return false;
    return true;
};

/**
 * Check if this AST node represent a compile-time constant value.
 *
 * Certain expressions in ThingTalk must be constant.
 *
 * @reutrn {boolean} whether the value is constant
 */
Value.prototype.isConstant = function isConstant() {
    if (this.isArray)
        return this.value.every((v) => v.isConstant());
    if (this.isObject)
        return Object.values(this.value).every((v) => v.isConstant());
    if (this.isVarRef)
        return this.name.startsWith('__const_');
    if (this.isComputation || this.isArrayField || this.isContextRef ||
        this.isEvent || this.isUndefined)
        return false;

    return this.isConcrete();
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
    if (v.isArrayField)
        return v.value.toJS().map((el) => el[v.field]);
    if (v.isVarRef || v.isEvent || v.isContextRef || v.isComputation)
        throw new TypeError("Value is not constant");
    if (v.isUndefined)
        return undefined;
    if (v.isLocation && v.value.isAbsolute)
        return new builtin.Location(v.value.lat, v.value.lon, v.value.display);
    if (v.isLocation)
        throw new TypeError('Location ' + v + ' is unknown');
    if (v.isTime && v.value.isAbsolute)
        return new builtin.Time(v.value.hour, v.value.minute, v.value.second);
    if (v.isTime)
        throw new TypeError('Time is unknown');
    if (v.isMeasure)
        return Units.transformToBaseUnit(v.value, v.unit);
    if (v.isCurrency)
        return new builtin.Currency(v.value, v.code);
    if (v.isEntity)
        return new builtin.Entity(v.value, v.display);
    if (v.isDate)
        return normalizeDate(v.value);
    if (v.isObject) {
        let obj = {};
        Object.entries(v.value).forEach(([key, value]) => {
            obj[key] = value instanceof Value ? value.toJS() : value;
        });
        return obj;
    }
    return v.value;
};


function unescape(symbol) {
    return symbol.replace(/_([0-9a-fA-Z]{2}|_)/g, (match, ch) => {
        if (ch === '_') return ch;
        return String.fromCharCode(parseInt(ch, 16));
    });
}

const TYPES = {
    QUOTED_STRING: Type.String,
    NUMBER: Type.Number,
    CURRENCY: Type.Currency,
    DURATION: Type.Measure('ms'),
    LOCATION: Type.Location,
    DATE: Type.Date,
    TIME: Type.Time,

    EMAIL_ADDRESS: Type.Entity('tt:email_address'),
    PHONE_NUMBER: Type.Entity('tt:phone_number'),
    HASHTAG: Type.Entity('tt:hashtag'),
    USERNAME: Type.Entity('tt:username'),
    URL: Type.Entity('tt:url'),
    PATH_NAME: Type.Entity('tt:path_name'),
};

function entityTypeToTTType(entityType) {
    if (entityType.startsWith('GENERIC_ENTITY_'))
        return Type.Entity(entityType.substring('GENERIC_ENTITY_'.length));
    else if (entityType.startsWith('MEASURE_'))
        return Type.Measure(entityType.substring('MEASURE_'.length));
    else
        return TYPES[entityType];
}

function typeForConstant(name) {
    let measure = /__const_NUMBER_([0-9]+)__([a-z0-9A-Z]+)/.exec(name);
    if (measure !== null)
        return Type.Measure(measure[2]);
    measure = /__const_MEASURE__([a-z0-9A-Z]+)_([0-9]+)/.exec(name);
    if (measure !== null)
        return Type.Measure(measure[1]);

    const underscoreindex = name.lastIndexOf('_');
    const entitytype = unescape(name.substring('__const_'.length, underscoreindex));

    const type = entityTypeToTTType(entitytype);
    if (!type)
        throw new TypeError(`Invalid __const variable ${name}`);
    return type;
}

/**
 * Retrieve the ThingTalk type of this value.
 *
 * @return {Type} the type
 */
Value.prototype.getType = function getType() {
    const v = this;
    if (v.type instanceof Type)
        return v.type;
    if (v.isVarRef && v.name.startsWith('__const_'))
        return typeForConstant(v.name);
    if (v.isVarRef || v.isUndefined)
        return Type.Any;
    if (v.isArrayField || v.isComputation)
        return Type.Any;
    if (v.isContextRef)
        return v.type;
    if (v.isBoolean)
        return Type.Boolean;
    if (v.isString)
        return Type.String;
    if (v.isMeasure)
        return Type.Measure(v.unit);
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
        return Type.Enum([v.value, '*']);
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
    return new Value.Date(null);
};
