// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const assert = require('assert');
const Units = require('thingtalk-units');

const Type = require('../type');
const { normalizeDate } = require('../date_utils');
const AstNode = require('./base');

const builtin = require('../builtin/values');

class Location {
}
module.exports.Location = Location;

class AbsoluteLocation extends Location {
    constructor(lat, lon, display = null) {
        super();
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

    equals(other) {
        return other instanceof AbsoluteLocation && this.lat === other.lat
            && this.lon === other.lon && this.display === other.display;
    }
}
AbsoluteLocation.prototype.isAbsolute = true;
Location.Absolute = AbsoluteLocation;

class RelativeLocation extends Location {
    constructor(relativeTag) {
        super();
        assert(typeof relativeTag === 'string');
        this.relativeTag = relativeTag;
    }

    toString() {
        return `Relative(${this.relativeTag})`;
    }

    clone() {
        return new RelativeLocation(this.relativeTag);
    }

    equals(other) {
        return other instanceof RelativeLocation && this.relativeTag === other.relativeTag;
    }
}
RelativeLocation.prototype.isRelative = true;
Location.Relative = RelativeLocation;

class UnresolvedLocation extends Location {
    constructor(name) {
        super();
        this.name = name;
    }

    toString() {
        return `Unresolved(${this.name})`;
    }

    clone() {
        return new UnresolvedLocation(this.name);
    }

    equals(other) {
        return other instanceof UnresolvedLocation && this.name === other.name;
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

    equals(other) {
        return other instanceof DateEdge && this.edge === other.edge && this.unit === other.unit;
    }
}
DateEdge.prototype.isDateEdge = true;
module.exports.DateEdge = DateEdge;

class DatePiece {
    constructor(year, month, day, time) {
        assert(year > 0 || month > 0 || day > 0);
        assert(year === -1 || month === -1 || day === -1);
        // Before processing the year, we need to save the original for the
        // NNSyntax, as it might be copied from the utterance.
        this.originalYear = year;
        this.year = year;
        if (year > 0 && year < 100) { // then assume 1950-2050
            if (year >= 50)
                this.year = 1900 + year;
            else
                this.year = 2000 + year;
        }
        this.month = month;
        this.day = day;
        this.time = time;
    }

    equals(other) {
        return (other instanceof DatePiece
                && this.originalYear === other.originalYear
                && this.month === other.month
                && this.day === other.day
                && this.time === other.time);
    }
}
DatePiece.prototype.isDatePiece = true;
module.exports.DatePiece = DatePiece;

class Time {
}
module.exports.Time = Time;

class AbsoluteTime extends Time {
    constructor(hour, minute, second) {
        super();
        assert(typeof hour === 'number' && Number.isFinite(hour));
        this.hour = hour;
        assert(typeof minute === 'number' && Number.isFinite(minute));
        this.minute = minute;
        assert(typeof second === 'number' && Number.isFinite(second));
        this.second = second;
    }

    clone() {
        return new AbsoluteTime(this.hour, this.minute, this.second);
    }

    equals(other) {
        return other instanceof AbsoluteTime && this.hour === other.hour
            && this.minute === other.minute && this.second === other.second;
    }
}
AbsoluteTime.prototype.isAbsolute = true;
Time.Absolute = AbsoluteTime;

class RelativeTime extends Time {
    constructor(relativeTag) {
        super();
        assert(typeof relativeTag === 'string');
        this.relativeTag = relativeTag;
    }

    clone() {
        return new RelativeTime(this.relativeTag);
    }

    equals(other) {
        return other instanceof RelativeTime && this.relativeTag === other.relativeTag;
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
    /* instanbul ignore next */
    /**
     * Check if two Value nodes represent the same ThingTalk value.
     *
     * It is an error to call this method with a parameter that is not an Ast.Value
     *
     * @param {Ast.Value} other - the other value to compare
     * @return {boolean} true if equal, false otherwise
     */
    equals() {
        throw new Error('Abstract method');
    }

    /**
     * Convert a normalized JS value to the corresponding AST node.
     *
     * This is the inverse operation of {@link Ast.Value#toJS}.
     *
     * @param {Type} type - the ThingTalk type
     * @param {any} v - the JS value to convert
     * @return {Ast.Value} the converted value
     */
    static fromJS(type, v) {
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
                array.push(Value.fromJS(type.elem, elem));
            });
            return new Value.Array(array);
        }
        throw new TypeError('Invalid type ' + type);
    }

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
    static fromJSON(type, v) {
        if (type.isDate) {
            if (v === null)
                return new Value.Date(null, null);
            let date = new Date(v);
            return new Value.Date(date, null);
        } else {
            return Value.fromJS(type, v);
        }
    }

    /* instanbul ignore next */
    /**
     * Retrieve the ThingTalk type of this value.
     *
     * @return {Type} the type
     */
    getType() {
        throw new Error('Abstract method');
    }

    /**
     * Check if this AST node represent concrete (compilable) value.
     *
     * Values that are not concrete require normalization by the dialog agent
     * (such as entity or location resolution) before a program using them
     * is compiled and executed.
     *
     * @return {boolean} whether the value is concrete
     */
    isConcrete() {
        return true;
    }

    /**
     * Check if this AST node represent a compile-time constant value.
     *
     * Certain expressions in ThingTalk must be constant.
     *
     * @return {boolean} whether the value is constant
     */
    isConstant() {
        return this.isConcrete();
    }

    /**
     * Normalize this AST value and convert it to JS-friendly representation.
     *
     * This converts the AST representation to something that can be passed to
     * a Thingpedia function. Note that the conversion is lossy and loses type
     * information.
     *
     * @return {any} the normlized value
     */
    toJS() {
        throw new Error('Value is not a constant');
    }
}
module.exports.Value = Value;

class ArrayValue extends Value {
    constructor(value, type = null) {
        super(null);
        assert(Array.isArray(value));
        this.value = value;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() {
        return `Array(${this.value})`;
    }

    clone() {
        return new ArrayValue(this.value.map((v) => v.clone()), this.type);
    }

    equals(other) {
        return other instanceof ArrayValue && this.value.length === other.value.length
            && this.value.every((v, i) => v.equals(other.value[i]));
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitArrayValue(this)) {
            for (let v of this.value)
                v.visit(visitor);
        }
        visitor.exit(this);
    }

    isConstant() {
        return this.value.every((v) => v.isConstant());
    }

    toJS() {
        return this.value.map((v) => v.toJS());
    }

    getType() {
        if (this.type)
            return this.type;
        return Type.Array(this.value.length ? this.value[0].getType() : Type.Any);
    }
}
ArrayValue.prototype.isArray = true;
Value.Array = ArrayValue;

class VarRefValue extends Value {
    constructor(name, type = null) {
        super(null);
        assert(typeof name === 'string');
        this.name = name;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() {
        return `VarRef(${this.name})`;
    }

    clone() {
        return new VarRefValue(this.name, this.type);
    }

    equals(other) {
        return other instanceof VarRefValue && this.name === other.name;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitVarRefValue(this);
        visitor.exit(this);
    }

    isConstant() {
        return this.name.startsWith('__const_');
    }

    getType() {
        if (this.type)
            return this.type;
        if (this.name.startsWith('__const_'))
            return typeForConstant(this.name);
        return Type.Any;
    }
}
VarRefValue.prototype.isVarRef = true;
Value.VarRef = VarRefValue;

class ComputationValue extends Value {
    constructor(op, operands, overload = null, type = null) {
        super(null);
        assert(typeof op === 'string');
        this.op = op;
        assert(Array.isArray(operands));
        this.operands = operands;
        assert(overload === null || Array.isArray(overload));
        this.overload = overload;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() {
        return `Computation(${this.op}, ${this.operands})`;
    }

    clone() {
        return new ComputationValue(this.op, this.operands.map((v) => v.clone()), this.overload, this.type);
    }

    equals(other) {
        return other instanceof ComputationValue && this.op === other.op &&
            this.operands.length === other.operands.length &&
            this.operands.every((op, i) => op.equals(other.operands[i]));
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitComputationValue(this)) {
            for (let v of this.operands)
                v.visit(visitor);
        }
        visitor.exit(this);
    }

    isConstant() {
        return false;
    }

    getType() {
        if (this.type)
            return this.type;
        return Type.Any;
    }
}
ComputationValue.prototype.isComputation = true;
Value.Computation = ComputationValue;

class ArrayFieldValue extends Value {
    constructor(value, field, type = null) {
        super(null);
        assert(value instanceof Value);
        this.value = value;
        assert(typeof field === 'string');
        this.field = field;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() {
        return `ArrayField(${this.value}, ${this.field})`;
    }

    clone() {
        return new ArrayFieldValue(this.value.clone(), this.field, this.type);
    }

    equals(other) {
        return other instanceof ArrayFieldValue && this.value.equals(other.value) &&
            this.field === other.field;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitArrayFieldValue(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    isConstant() {
        return false;
    }

    toJS() {
        return this.value.toJS().map((el) => el[this.field]);
    }

    getType() {
        if (this.type)
            return this.type;
        return Type.Any;
    }
}
ArrayFieldValue.prototype.isArrayField = true;
Value.ArrayField = ArrayFieldValue;

class FilterValue extends Value {
    constructor(value, filter, type = null) {
        super(null);
        assert(value instanceof Value);
        this.value = value;
        // note we cannot check for BooleanExpression here as it would create a cyclic dep
        this.filter = filter;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() {
        return `Filter(${this.value}, ${this.filter})`;
    }

    clone() {
        return new FilterValue(this.value.clone(), this.filter.clone(), this.type);
    }

    equals(other) {
        return other instanceof FilterValue && this.value.equals(other.value) &&
            this.filter.equals(other.filter);
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitFilterValue(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    isConstant() {
        return false;
    }

    getType() {
        if (this.type)
            return this.type;
        return Type.Any;
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

    equals(other) {
        return other instanceof UndefinedValue && this.local === other.local;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitUndefinedValue(this);
        visitor.exit(this);
    }

    isConstant() {
        return false;
    }

    getType() {
        return Type.Any;
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

    equals(other) {
        return other instanceof ContextRefValue && this.name === other.name;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitContextRefValue(this);
        visitor.exit(this);
    }

    isConstant() {
        return false;
    }

    getType() {
        return this.type;
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

    equals(other) {
        return other instanceof BooleanValue && this.value === other.value;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitBooleanValue(this);
        visitor.exit(this);
    }

    toJS() {
        return this.value;
    }

    getType() {
        return Type.Boolean;
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

    equals(other) {
        return other instanceof StringValue && this.value === other.value;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitStringValue(this);
        visitor.exit(this);
    }

    toJS() {
        return this.value;
    }

    getType() {
        return Type.String;
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

    equals(other) {
        return other instanceof NumberValue && this.value === other.value;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitNumberValue(this);
        visitor.exit(this);
    }

    toJS() {
        return this.value;
    }

    getType() {
        return Type.Number;
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

    equals(other) {
        return other instanceof MeasureValue && this.value === other.value
            && this.unit === other.unit;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitMeasureValue(this);
        visitor.exit(this);
    }

    isConcrete() {
        return !this.unit.startsWith("default");
    }

    toJS() {
        return Units.transformToBaseUnit(this.value, this.unit);
    }

    getType() {
        return Type.Measure(this.unit);
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

    equals(other) {
        return other instanceof CurrencyValue && this.value === other.value
            && this.code === other.code;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitCurrencyValue(this);
        visitor.exit(this);
    }

    toJS() {
        return new builtin.Currency(this.value, this.code);
    }

    getType() {
        return Type.Currency;
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

    equals(other) {
        return other instanceof LocationValue && this.value.equals(other.value);
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitLocationValue(this);
        visitor.exit(this);
    }

    isConcrete() {
        return this.value instanceof AbsoluteLocation;
    }

    toJS() {
        if (this.value instanceof AbsoluteLocation)
            return new builtin.Location(this.value.lat, this.value.lon, this.value.display);
        else
            throw new TypeError('Location ' + this + ' is unknown');
    }

    getType() {
        return Type.Location;
    }
}
LocationValue.prototype.isLocation = true;
Value.Location = LocationValue;

class DateValue extends Value {
    constructor(value) {
        super(null);
        assert(value === null
               || value instanceof Date
               || value instanceof DateEdge
               || value instanceof DatePiece);
        this.value = value;
    }

    static now() {
        return new DateValue(null);
    }

    toString() {
        return `Date(${this.value})`;
    }

    clone() {
        return new DateValue(this.value);
    }

    equals(other) {
        if (!(other instanceof DateValue))
            return false;
        if (this.value === null)
            return other.value === null;
        if (this.value instanceof Date)
            return other.value instanceof Date && +this.value === +other.value;
        return this.value.equals(other.value);
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitDateValue(this);
        visitor.exit(this);
    }

    toJS() {
        return normalizeDate(this.value);
    }

    getType() {
        return Type.Date;
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

    equals(other) {
        return other instanceof TimeValue && this.value.equals(other.value);
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitTimeValue(this);
        visitor.exit(this);
    }

    isConcrete() {
        return this.value instanceof AbsoluteTime;
    }

    toJS() {
        if (this.value instanceof AbsoluteTime)
            return new builtin.Time(this.value.hour, this.value.minute, this.value.second);
        else
            throw new TypeError('Time is unknown');
    }

    getType() {
        return Type.Time;
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

    equals(other) {
        return other instanceof EntityValue && this.value === other.value && this.type === other.type;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitEntityValue(this);
        visitor.exit(this);
    }

    isConcrete() {
        return this.value !== null;
    }

    toJS() {
        return new builtin.Entity(this.value, this.display);
    }

    getType() {
        return Type.Entity(this.type);
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

    equals(other) {
        return other instanceof EnumValue && this.value === other.value;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitEnumValue(this);
        visitor.exit(this);
    }

    toJS() {
        return this.value;
    }

    getType() {
        return Type.Enum([this.value, '*']);
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

    equals(other) {
        return other instanceof EventValue && this.name === other.name;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitEventValue(this);
        visitor.exit(this);
    }

    isConstant() {
        return false;
    }

    getType() {
        if (this.name === 'type')
        return Type.Entity('tt:function');
        if (this.name === 'program_id')
            return Type.Entity('tt:program_id');
        return Type.String;
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
            clone[key] = this.value[key];
        return new ArgMapValue(clone);
    }

    equals(other) {
        if (!(other instanceof ArgMapValue))
            return false;
        const k1 = Object.keys(this.value);
        const k2 = Object.keys(other.value);
        if (k1.length !== k2.length)
            return false;
        for (let key of k1) {
            if (!other.value[key] || this.value[key].equals(other.value[key]))
                return false;
        }
        return true;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitArgMapValue(this);
        visitor.exit(this);
    }

    toJS() {
        return this.value;
    }

    getType() {
        return Type.ArgMap;
    }
}
ArgMapValue.prototype.isArgMap = true;
Value.ArgMap = ArgMapValue;

class ObjectValue extends Value {
    constructor(value, type = null) {
        super(null);
        assert(typeof value === 'object');
        this.value = value;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() {
        return `Object(${this.value})`;
    }

    clone() {
        const clone = {};
        for (let key in this.value)
            clone[key] = this.value[key].clone();
        return new ObjectValue(clone, this.type);
    }

    equals(other) {
        if (!(other instanceof ObjectValue))
            return false;
        const k1 = Object.keys(this.value);
        const k2 = Object.keys(other.value);
        if (k1.length !== k2.length)
            return false;
        for (let key of k1) {
            if (!other.value[key] || this.value[key].equals(other.value[key]))
                return false;
        }
        return true;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitObjectValue(this)) {
            for (let key in this.value)
                this.value[key].visit(visitor);
        }
        visitor.exit(this);
    }

    isConstant() {
        return Object.values(this.value).every((v) => v.isConstant());
    }

    toJS() {
        let obj = {};
        Object.entries(this.value).forEach(([key, value]) => {
            obj[key] = value.toJS();
        });
        return obj;
    }

    getType() {
        if (this.type)
            return this.type;

        const type = {};
        for (let key in this.value)
            type[key] = this.value[key].getType();
        return Type.Object(type);
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
