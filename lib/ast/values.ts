// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import assert from 'assert';
import * as Units from 'thingtalk-units';

import Type, { TypeMap, EntityType, MeasureType, ArrayType } from '../type';
import { normalizeDate } from '../date_utils';
import AstNode from './base';
import NodeVisitor from './visitor';
import { BooleanExpression } from './expression';

import * as builtin from '../builtin/values';

export abstract class Location {
    static Absolute : any;
    isAbsolute ! : boolean;
    static Relative : any;
    isRelative ! : boolean;
    static Unresolved : any;
    isUnresolved ! : boolean;

    abstract clone() : Location;
    abstract equals(x : unknown) : boolean;
}
Location.prototype.isAbsolute = false;
Location.prototype.isRelative = false;
Location.prototype.isUnresolved = false;

export class AbsoluteLocation extends Location {
    lat : number;
    lon : number;
    display : string|null;

    constructor(lat : number, lon : number, display : string|null = null) {
        super();
        assert(typeof lat === 'number');
        this.lat = lat;
        assert(typeof lon === 'number');
        this.lon = lon;
        assert(typeof display === 'string' || display === null);
        this.display = display;
    }

    toString() : string {
        return `Absolute(${this.lat}, ${this.lon}, ${this.display})`;
    }

    clone() : AbsoluteLocation {
        return new AbsoluteLocation(this.lat, this.lon, this.display);
    }

    equals(other : unknown) : boolean {
        return other instanceof AbsoluteLocation && this.lat === other.lat
            && this.lon === other.lon && this.display === other.display;
    }
}
AbsoluteLocation.prototype.isAbsolute = true;
Location.Absolute = AbsoluteLocation;

export class RelativeLocation extends Location {
    relativeTag : string;

    constructor(relativeTag : string) {
        super();
        assert(typeof relativeTag === 'string');
        this.relativeTag = relativeTag;
    }

    toString() : string {
        return `Relative(${this.relativeTag})`;
    }

    clone() : RelativeLocation {
        return new RelativeLocation(this.relativeTag);
    }

    equals(other : unknown) : boolean {
        return other instanceof RelativeLocation && this.relativeTag === other.relativeTag;
    }
}
RelativeLocation.prototype.isRelative = true;
Location.Relative = RelativeLocation;

export class UnresolvedLocation extends Location {
    name : string;

    constructor(name : string) {
        super();
        this.name = name;
    }

    toString() : string {
        return `Unresolved(${this.name})`;
    }

    clone() : UnresolvedLocation {
        return new UnresolvedLocation(this.name);
    }

    equals(other : unknown) : boolean {
        return other instanceof UnresolvedLocation && this.name === other.name;
    }
}
UnresolvedLocation.prototype.isUnresolved = true;
Location.Unresolved = UnresolvedLocation;

export class DateEdge {
    isDateEdge = true;
    edge : ('start_of' | 'end_of');
    unit : string;

    constructor(edge : ('start_of' | 'end_of'), unit : string) {
        assert(edge === 'start_of' || edge === 'end_of');
        this.edge = edge;
        assert(typeof unit === 'string');
        this.unit = unit;
    }

    equals(other : unknown) : boolean {
        return other instanceof DateEdge && this.edge === other.edge && this.unit === other.unit;
    }
}

export class DatePiece {
    isDatePiece = true;
    year : number|null;
    month : number|null;
    day : number|null;
    time : AbsoluteTime|null;

    constructor(year : number|null, month : number|null, day : number|null, time : AbsoluteTime|null) {
        assert((year !== null && year >= 0) || (month !== null && month > 0) || (day !== null && day > 0));
        assert(year === null || month === null || day === null);
        this.year = year;
        if (year !== null && year >= 0 && year < 100) { // then assume 1950-2050
            if (year >= 50)
                this.year = 1900 + year;
            else
                this.year = 2000 + year;
        }
        this.month = month;
        this.day = day;
        this.time = time;
    }

    equals(other : unknown) : boolean {
        if (!(other instanceof DatePiece))
            return false;
        if (!(this.year === other.year
            && this.month === other.month
            && this.day === other.day))
            return false;

        if (this.time === other.time)
            return true;

        if (this.time && other.time)
            return this.time.equals(other.time);
        return false;
    }
}

export type WeekDay = ('monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday');

export class WeekDayDate {
    isWeekDayDate = true;
    weekday : WeekDay;
    time : AbsoluteTime;

    constructor(weekday : WeekDay, time : AbsoluteTime) {
        assert(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(weekday));
        this.weekday = weekday;
        this.time = time;
    }

    equals(other : unknown) : boolean {
        return (other instanceof WeekDayDate && this.weekday === other.weekday
            && (this.time === other.time || (this.time && other.time && this.time.equals(other.time))));
    }
}

export abstract class Time {
    static Absolute : any;
    isAbsolute ! : boolean;
    static Relative : any;
    isRelative ! : boolean;

    abstract clone() : Time;
    abstract equals(x : unknown) : boolean;
}
Time.prototype.isAbsolute = false;
Time.prototype.isRelative = false;

interface TimeLike {
    hour : number;
    minute : number;
    second : number;
}

export class AbsoluteTime extends Time {
    hour : number;
    minute : number;
    second : number;

    constructor(hour : number, minute : number, second : number) {
        super();
        assert(typeof hour === 'number' && Number.isFinite(hour));
        this.hour = hour;
        assert(typeof minute === 'number' && Number.isFinite(minute));
        this.minute = minute;
        assert(typeof second === 'number' && Number.isFinite(second));
        this.second = second;
    }

    clone() : AbsoluteTime {
        return new AbsoluteTime(this.hour, this.minute, this.second);
    }

    equals(other : unknown) : boolean {
        return other instanceof AbsoluteTime && this.hour === other.hour
            && this.minute === other.minute && this.second === other.second;
    }

    static fromJS(v : string|TimeLike) : AbsoluteTime {
        if (typeof v === 'string') {
            const [hourstr, minutestr, secondstr] = v.split(':');
            const hour = parseInt(hourstr);
            const minute = parseInt(minutestr);
            let second : number;
            if (secondstr === undefined)
                second = 0;
            else
                second = parseInt(secondstr);
            return new AbsoluteTime(hour, minute, second);
        } else {
            return new AbsoluteTime(v.hour, v.minute, v.second);
        }
    }

    toJS() : builtin.Time {
        return new builtin.Time(this.hour, this.minute, this.second);
    }
}
AbsoluteTime.prototype.isAbsolute = true;
Time.Absolute = AbsoluteTime;

export class RelativeTime extends Time {
    relativeTag : string;

    constructor(relativeTag : string) {
        super();
        assert(typeof relativeTag === 'string');
        this.relativeTag = relativeTag;
    }

    clone() : RelativeTime{
        return new RelativeTime(this.relativeTag);
    }

    equals(other : unknown) : boolean {
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
 */
export abstract class Value extends AstNode {
    static Boolean : typeof BooleanValue;
    isBoolean ! : boolean;
    static String : typeof StringValue;
    isString ! : boolean;
    static Number : typeof NumberValue;
    isNumber ! : boolean;
    static Currency : typeof CurrencyValue;
    isCurrency ! : boolean;
    static Entity : typeof EntityValue;
    isEntity ! : boolean;
    static Measure : typeof MeasureValue;
    isMeasure ! : boolean;
    static Enum : typeof EnumValue;
    isEnum ! : boolean;
    static Time : typeof TimeValue;
    isTime ! : boolean;
    static Date : typeof DateValue;
    isDate ! : boolean;
    static Location : typeof LocationValue;
    isLocation ! : boolean;
    static RecurrentTimeSpecification : typeof RecurrentTimeSpecificationValue;
    isRecurrentTimeSpecification ! : boolean;
    static ArgMap : typeof ArgMapValue;
    isArgMap ! : boolean;
    static Array : typeof ArrayValue;
    isArray ! : boolean;
    static Object : typeof ObjectValue;
    isObject ! : boolean;
    static VarRef : typeof VarRefValue;
    isVarRef ! : boolean;
    static Event : typeof EventValue;
    isEvent ! : boolean;
    static ContextRef : typeof ContextRefValue;
    isContextRef ! : boolean;
    static Undefined : typeof UndefinedValue;
    isUndefined ! : boolean;
    static Filter : typeof FilterValue;
    isFilter ! : boolean;
    static ArrayField : typeof ArrayFieldValue;
    isArrayField ! : boolean;
    static Computation : typeof ComputationValue;
    isComputation ! : boolean;

    abstract clone() : Value;

    /**
     * Check if two Value nodes represent the same ThingTalk value.
     *
     * It is an error to call this method with a parameter that is not an Ast.Value
     *
     * @param other - the other value to compare
     * @return true if equal, false otherwise
     */
    abstract equals(other : Value) : boolean;

    /**
     * Convert a normalized JS value to the corresponding AST node.
     *
     * This is the inverse operation of {@link Ast.Value#toJS}.
     *
     * @param type - the ThingTalk type
     * @param v - the JS value to convert
     * @return the converted value
     */
    static fromJS(type : Type, v : unknown) : Value {
        if (type.isBoolean)
            return new Value.Boolean(v as boolean);
        if (type.isString)
            return new Value.String(v as string);
        if (type.isNumber)
            return new Value.Number(v as number);
        if (type.isCurrency) {
            if (typeof v === 'number')
                return new Value.Currency(v, 'usd');
            const o = v as ({ value : number, code : string });
            return new Value.Currency(o.value, o.code);
        }
        if (type instanceof EntityType) {
            if (typeof v === 'string')
                return new Value.Entity(v, type.type, null);
            const o = v as ({ value : string, display : string|null|undefined });
            return new Value.Entity(o.value, type.type, o.display||null);
        }
        if (type instanceof MeasureType)
            return new Value.Measure(v as number, type.unit);
        if (type.isEnum)
            return new Value.Enum(v as string);
        if (type.isTime)
            return new Value.Time(AbsoluteTime.fromJS(v as string|TimeLike));
        if (type.isDate)
            return new Value.Date(v as Date);
        if (type.isLocation) {
            const o = v as ({ x : number, y : number, display : string|null|undefined });
            return new Value.Location(new Location.Absolute(o.y, o.x, o.display||null));
        }
        if (type.isRecurrentTimeSpecification) {
            const o = v as builtin.RecurrentTimeRuleLike[];
            return new Value.RecurrentTimeSpecification(o.map((r) => RecurrentTimeRule.fromJS(r)));
        }
        if (type.isArgMap) {
            const map : TypeMap = {};
            Object.entries(v as ({ [key : string] : string })).forEach(([key, value]) => {
                map[key] = Type.fromString(value as string);
            });
            return new Value.ArgMap(map);
        }
        if (type instanceof ArrayType) {
            const array : Value[] = [];
            (v as unknown[]).forEach((elem) => {
                array.push(Value.fromJS(type.elem as Type, elem));
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
     * @param type - the ThingTalk type
     * @param v - the JSON value to convert
     * @return the converted value
     */
    static fromJSON(type : Type, v : unknown) : Value {
        if (type.isDate) {
            if (v === null)
                return new Value.Date(null);
            const date = new Date(v as string|number);
            return new Value.Date(date);
        } else {
            return Value.fromJS(type, v);
        }
    }

    /**
     * Retrieve the ThingTalk type of this value.
     *
     * @return the type
     */
    abstract getType() : Type;

    /**
     * Check if this AST node represent concrete (compilable) value.
     *
     * Values that are not concrete require normalization by the dialog agent
     * (such as entity or location resolution) before a program using them
     * is compiled and executed.
     *
     * @return {boolean} whether the value is concrete
     */
    isConcrete() : boolean {
        return true;
    }

    /**
     * Check if this AST node represent a compile-time constant value.
     *
     * Certain expressions in ThingTalk must be constant.
     *
     * @return {boolean} whether the value is constant
     */
    isConstant() : boolean {
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
    toJS() : unknown {
        throw new Error('Value is not a constant');
    }
}
Value.prototype.isBoolean = false;
Value.prototype.isString = false;
Value.prototype.isNumber = false;
Value.prototype.isCurrency = false;
Value.prototype.isEntity = false;
Value.prototype.isMeasure = false;
Value.prototype.isEnum = false;
Value.prototype.isTime = false;
Value.prototype.isDate = false;
Value.prototype.isLocation = false;
Value.prototype.isRecurrentTimeSpecification = false;
Value.prototype.isArgMap = false;
Value.prototype.isArray = false;
Value.prototype.isObject = false;
Value.prototype.isVarRef = false;
Value.prototype.isEvent = false;
Value.prototype.isContextRef = false;
Value.prototype.isUndefined = false;
Value.prototype.isFilter = false;
Value.prototype.isArrayField = false;
Value.prototype.isComputation = false;

export class ArrayValue extends Value {
    value : Value[];
    type : Type|null;

    constructor(value : Value[], type : Type|null = null) {
        super(null);
        assert(Array.isArray(value));
        this.value = value;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() : string {
        return `Array(${this.value})`;
    }

    clone() : ArrayValue {
        return new ArrayValue(this.value.map((v) => v.clone()), this.type);
    }

    equals(other : Value) : boolean {
        return other instanceof ArrayValue && this.value.length === other.value.length
            && this.value.every((v, i) => v.equals(other.value[i]));
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitArrayValue(this)) {
            for (const v of this.value)
                v.visit(visitor);
        }
        visitor.exit(this);
    }

    isConstant() : boolean {
        return this.value.every((v) => v.isConstant());
    }

    toJS() : unknown[] {
        return this.value.map((v) => v.toJS());
    }

    getType() : Type {
        if (this.type)
            return this.type;
        return new Type.Array(this.value.length ? this.value[0].getType() : Type.Any);
    }
}
ArrayValue.prototype.isArray = true;
Value.Array = ArrayValue;

export class VarRefValue extends Value {
    name : string;
    type : Type|null;

    constructor(name : string, type : Type|null = null) {
        super(null);
        assert(typeof name === 'string');
        this.name = name;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() : string {
        return `VarRef(${this.name})`;
    }

    clone() : VarRefValue {
        return new VarRefValue(this.name, this.type);
    }

    equals(other : Value) : boolean {
        return other instanceof VarRefValue && this.name === other.name;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitVarRefValue(this);
        visitor.exit(this);
    }

    isConstant() : boolean {
        return this.name.startsWith('__const_');
    }

    getType() : Type {
        if (this.type)
            return this.type;
        if (this.name.startsWith('__const_'))
            return typeForConstant(this.name);
        return Type.Any;
    }
}
VarRefValue.prototype.isVarRef = true;
Value.VarRef = VarRefValue;

export class ComputationValue extends Value {
    op : string;
    operands : Value[];
    overload : Type[]|null;
    type : Type|null;

    constructor(op : string,
                operands : Value[],
                overload : Type[]|null = null,
                type : Type|null = null) {
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

    toString() : string {
        return `Computation(${this.op}, ${this.operands})`;
    }

    clone() : ComputationValue {
        return new ComputationValue(this.op, this.operands.map((v) => v.clone()), this.overload, this.type);
    }

    equals(other : Value) : boolean {
        return other instanceof ComputationValue && this.op === other.op &&
            this.operands.length === other.operands.length &&
            this.operands.every((op, i) => op.equals(other.operands[i]));
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitComputationValue(this)) {
            for (const v of this.operands)
                v.visit(visitor);
        }
        visitor.exit(this);
    }

    isConstant() : boolean {
        return false;
    }

    getType() : Type {
        if (this.type)
            return this.type;
        return Type.Any;
    }
}
ComputationValue.prototype.isComputation = true;
Value.Computation = ComputationValue;

export class ArrayFieldValue extends Value {
    value : Value;
    field : string;
    type : Type|null;

    constructor(value : Value, field : string, type : Type|null = null) {
        super(null);
        assert(value instanceof Value);
        this.value = value;
        assert(typeof field === 'string');
        this.field = field;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() : string {
        return `ArrayField(${this.value}, ${this.field})`;
    }

    clone() : ArrayFieldValue {
        return new ArrayFieldValue(this.value.clone(), this.field, this.type);
    }

    equals(other : Value) : boolean {
        return other instanceof ArrayFieldValue && this.value.equals(other.value) &&
            this.field === other.field;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitArrayFieldValue(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    isConstant() : boolean {
        return false;
    }

    toJS() : unknown[] {
        return (this.value.toJS() as any[]).map((el) => el[this.field]);
    }

    getType() : Type {
        if (this.type)
            return this.type;
        return Type.Any;
    }
}
ArrayFieldValue.prototype.isArrayField = true;
Value.ArrayField = ArrayFieldValue;

export class FilterValue extends Value {
    value : Value;
    filter : BooleanExpression;
    type : Type|null;

    constructor(value : Value, filter : BooleanExpression, type : Type|null = null) {
        super(null);
        assert(value instanceof Value);
        this.value = value;
        this.filter = filter;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() : string {
        return `Filter(${this.value}, ${this.filter})`;
    }

    clone() : FilterValue {
        return new FilterValue(this.value.clone(), this.filter.clone(), this.type);
    }

    equals(other : Value) : boolean {
        return other instanceof FilterValue && this.value.equals(other.value) &&
            this.filter.equals(other.filter);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitFilterValue(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    isConstant() : boolean {
        return false;
    }

    getType() : Type {
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
export class UndefinedValue extends Value {
    local : boolean;

    constructor(local = true) {
        super(null);
        assert(local === true || local === false);
        this.local = local;
    }

    toString() : string {
        return `Undefined(${this.local})`;
    }

    clone() : UndefinedValue {
        return new UndefinedValue(this.local);
    }

    equals(other : Value) : boolean {
        return other instanceof UndefinedValue && this.local === other.local;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitUndefinedValue(this);
        visitor.exit(this);
    }

    isConstant() : boolean {
        return false;
    }

    getType() : Type {
        return Type.Any;
    }
}
UndefinedValue.prototype.isUndefined = true;
Value.Undefined = UndefinedValue;

export class ContextRefValue extends Value {
    name : string;
    type : Type;

    constructor(name : string, type : Type) {
        super(null);
        assert(typeof name === 'string');
        this.name = name;
        assert(type instanceof Type);
        this.type = type;
    }

    toString() : string {
        return `ContextRef(${this.name}, ${this.type})`;
    }

    clone() : ContextRefValue {
        return new ContextRefValue(this.name, this.type);
    }

    equals(other : Value) : boolean {
        return other instanceof ContextRefValue && this.name === other.name;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitContextRefValue(this);
        visitor.exit(this);
    }

    isConstant() : boolean {
        return false;
    }

    getType() : Type {
        return this.type;
    }
}
ContextRefValue.prototype.isContextRef = true;
Value.ContextRef = ContextRefValue;

export class BooleanValue extends Value {
    value : boolean;

    constructor(value : boolean) {
        super(null);
        assert(typeof value === 'boolean');
        this.value = value;
    }

    toString() : string {
        return `Boolean(${this.value})`;
    }

    clone() : BooleanValue {
        return new BooleanValue(this.value);
    }

    equals(other : Value) : boolean {
        return other instanceof BooleanValue && this.value === other.value;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitBooleanValue(this);
        visitor.exit(this);
    }

    toJS() : boolean {
        return this.value;
    }

    getType() : Type {
        return Type.Boolean;
    }
}
BooleanValue.prototype.isBoolean = true;
Value.Boolean = BooleanValue;

export class StringValue extends Value {
    value : string;

    constructor(value : string) {
        super(null);
        assert(typeof value === 'string');
        this.value = value;
    }

    toString() : string {
        return `String(${this.value})`;
    }

    clone() : StringValue {
        return new StringValue(this.value);
    }

    equals(other : Value) : boolean {
        return other instanceof StringValue && this.value === other.value;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitStringValue(this);
        visitor.exit(this);
    }

    toJS() : string {
        return this.value;
    }

    getType() : Type {
        return Type.String;
    }
}
StringValue.prototype.isString = true;
Value.String = StringValue;

export class NumberValue extends Value {
    value : number;

    constructor(value : number) {
        super(null);
        assert(typeof value === 'number');
        this.value = value;
    }

    toString() : string {
        return `Number(${this.value})`;
    }

    clone() : NumberValue {
        return new NumberValue(this.value);
    }

    equals(other : Value) : boolean {
        return other instanceof NumberValue && this.value === other.value;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitNumberValue(this);
        visitor.exit(this);
    }

    toJS() : number {
        return this.value;
    }

    getType() : Type {
        return Type.Number;
    }
}
NumberValue.prototype.isNumber = true;
Value.Number = NumberValue;

export class MeasureValue extends Value {
    value : number;
    unit : string;

    constructor(value : number, unit : string) {
        super(null);
        assert(typeof value === 'number');
        this.value = value;
        assert(typeof unit === 'string');
        this.unit = unit;
    }

    toString() : string {
        return `Measure(${this.value}, ${this.unit})`;
    }

    clone() : MeasureValue {
        return new MeasureValue(this.value, this.unit);
    }

    equals(other : Value) : boolean {
        return other instanceof MeasureValue && this.value === other.value
            && this.unit === other.unit;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitMeasureValue(this);
        visitor.exit(this);
    }

    isConcrete() : boolean {
        return !this.unit.startsWith("default");
    }

    toJS() : number {
        return Units.transformToBaseUnit(this.value, this.unit);
    }

    getType() : Type {
        return new Type.Measure(this.unit);
    }
}
MeasureValue.prototype.isMeasure = true;
Value.Measure = MeasureValue;

export class CurrencyValue extends Value {
    value : number;
    code : string;

    constructor(value : number, code : string) {
        super(null);
        assert(typeof value === 'number');
        this.value = value;
        assert(typeof code === 'string');
        this.code = code;
    }

    toString() : string {
        return `Currency(${this.value}, ${this.code})`;
    }

    clone() : CurrencyValue {
        return new CurrencyValue(this.value, this.code);
    }

    equals(other : Value) : boolean {
        return other instanceof CurrencyValue && this.value === other.value
            && this.code === other.code;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitCurrencyValue(this);
        visitor.exit(this);
    }

    toJS() : builtin.Currency {
        return new builtin.Currency(this.value, this.code);
    }

    getType() : Type {
        return Type.Currency;
    }
}
CurrencyValue.prototype.isCurrency = true;
Value.Currency = CurrencyValue;

export class LocationValue extends Value {
    value : Location;

    constructor(value : Location) {
        super(null);
        assert(value instanceof Location);
        this.value = value;
    }

    toString() : string {
        return `Location(${this.value})`;
    }

    clone() : LocationValue {
        return new LocationValue(this.value.clone());
    }

    equals(other : Value) : boolean {
        return other instanceof LocationValue && this.value.equals(other.value);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitLocationValue(this);
        visitor.exit(this);
    }

    isConstant() : boolean {
        // a relative location is considered a constant, even though it is not concrete
        return true;
    }

    isConcrete() : boolean {
        return this.value instanceof AbsoluteLocation;
    }

    toJS() : builtin.Location {
        if (this.value instanceof AbsoluteLocation)
            return new builtin.Location(this.value.lat, this.value.lon, this.value.display);
        else
            throw new TypeError('Location ' + this + ' is unknown');
    }

    getType() : Type {
        return Type.Location;
    }
}
LocationValue.prototype.isLocation = true;
Value.Location = LocationValue;

type DateLike = Date | DateEdge | DatePiece | WeekDayDate;

function isValidDate(value : unknown) : boolean {
    return value instanceof Date
        || value instanceof DateEdge
        || value instanceof DatePiece
        || value instanceof WeekDayDate;
}
function dateEquals(a : DateLike|null, b : DateLike|null) : boolean {
    if (a === null)
        return b === null;
    if (a instanceof Date)
        return b instanceof Date && +a === +b;
    return a.equals(b);
}

export class DateValue extends Value {
    value : DateLike|null;

    constructor(value : DateLike|null) {
        super(null);
        assert(value === null || isValidDate(value));
        this.value = value;
    }

    static now() : DateValue {
        return new DateValue(null);
    }

    toString() : string {
        return `Date(${this.value})`;
    }

    clone() : DateValue {
        return new DateValue(this.value);
    }

    equals(other : Value) : boolean {
        if (!(other instanceof DateValue))
            return false;
        return dateEquals(this.value, other.value);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitDateValue(this);
        visitor.exit(this);
    }

    toJS() : Date {
        return normalizeDate(this.value);
    }

    getType() : Type {
        return Type.Date;
    }
}
DateValue.prototype.isDate = true;
Value.Date = DateValue;

export class TimeValue extends Value {
    value : Time;

    constructor(value : Time) {
        super(null);
        assert(value instanceof Time);
        this.value = value;
    }

    toString() : string {
        return `Time(${this.value})`;
    }

    clone() : TimeValue {
        return new TimeValue(this.value.clone());
    }

    equals(other : Value) : boolean {
        return other instanceof TimeValue && this.value.equals(other.value);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitTimeValue(this);
        visitor.exit(this);
    }

    isConstant() : boolean {
        // a relative time is considered a constant, even though it is not concrete
        return true;
    }

    isConcrete() : boolean {
        return this.value instanceof AbsoluteTime;
    }

    toJS() : builtin.Time {
        if (this.value instanceof AbsoluteTime)
            return this.value.toJS();
        else
            throw new TypeError('Time is unknown');
    }

    getType() : Type {
        return Type.Time;
    }
}
TimeValue.prototype.isTime = true;
Value.Time = TimeValue;

interface RecurrentTimeRuleLike {
    beginTime : AbsoluteTime;
    endTime : AbsoluteTime;
    interval : MeasureValue;
    frequency : number;
    dayOfWeek : string|null;
    beginDate : DateLike|null;
    endDate : DateLike|null;
    subtract : boolean;
}

/**
 * An AST node representing a single rule for a recurrent event.
 *
 * @alias Ast.RecurrentTimeRule
 */
export class RecurrentTimeRule extends AstNode {
    beginTime : AbsoluteTime;
    endTime : AbsoluteTime;
    interval : MeasureValue;
    frequency : number;
    dayOfWeek : string|null;
    beginDate : DateLike|null;
    endDate : DateLike|null;
    subtract : boolean;

    constructor({ beginTime, endTime,
        interval = new MeasureValue(1, 'day'),
        frequency = 1,
        dayOfWeek = null,
        beginDate = null,
        endDate = null,
        subtract = false
    } : RecurrentTimeRuleLike) {
        super(null);
        assert(beginTime instanceof AbsoluteTime);
        assert(endTime instanceof AbsoluteTime);
        assert(interval instanceof MeasureValue);
        assert(typeof frequency === 'number');
        assert(dayOfWeek === null || typeof dayOfWeek === 'string');
        assert(beginDate === null || isValidDate(beginDate));
        assert(endDate === null || isValidDate(endDate));
        assert(typeof subtract === 'boolean');

        this.beginTime = beginTime;
        this.endTime = endTime;
        this.interval = interval;
        this.frequency = frequency;
        this.dayOfWeek = dayOfWeek;
        this.beginDate = beginDate;
        this.endDate = endDate;
        this.subtract = subtract;
    }

    toString() : string {
        return `RecurrentTimeRule(${this.subtract ? 'subtract' : 'add'} ${this.beginTime} -- ${this.endTime}; ${this.frequency} every ${this.interval}; from ${this.beginDate} to ${this.endDate})`;
    }

    clone() : RecurrentTimeRule {
        return new RecurrentTimeRule(this);
    }

    equals(other : RecurrentTimeRule) : boolean {
        return this.beginTime.equals(other.beginTime) &&
            this.endTime.equals(other.endTime) &&
            this.interval.equals(other.interval) &&
            this.frequency === other.frequency &&
            this.dayOfWeek === other.dayOfWeek &&
            dateEquals(this.beginDate, other.beginDate) &&
            dateEquals(this.endDate, other.endDate);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitRecurrentTimeRule(this))
            this.interval.visit(visitor);
        visitor.exit(this);
    }

    static fromJS(v : builtin.RecurrentTimeRuleLike) : RecurrentTimeRule {
        return new RecurrentTimeRule({
            beginTime: AbsoluteTime.fromJS(v.beginTime),
            endTime: AbsoluteTime.fromJS(v.endTime),
            interval: new MeasureValue(v.interval, 'ms'),
            frequency: v.frequency,
            dayOfWeek: v.dayOfWeek !== null ? ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][v.dayOfWeek] : null,
            beginDate: v.beginDate,
            endDate: v.endDate,
            subtract: v.subtract,
        });
    }

    toJS() : builtin.RecurrentTimeRule {
        return new builtin.RecurrentTimeRule({
            beginTime: this.beginTime.toJS(),
            endTime: this.endTime.toJS(),
            interval: this.interval.toJS(),
            frequency: this.frequency,
            dayOfWeek: this.dayOfWeek ? ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(this.dayOfWeek) : null,
            beginDate: this.beginDate ? normalizeDate(this.beginDate) : null,
            endDate: this.endDate ? normalizeDate(this.endDate) : null,
            subtract: this.subtract
        });
    }
}

export class RecurrentTimeSpecificationValue extends Value {
    rules : RecurrentTimeRule[];

    constructor(rules : RecurrentTimeRule[]) {
        super(null);

        this.rules = rules;
    }

    toString() : string {
        return `RecurrentTimeSpec([${this.rules.join(', ')}])`;
    }

    clone() : RecurrentTimeSpecificationValue {
        return new RecurrentTimeSpecificationValue(this.rules.map((r) => r.clone()));
    }

    equals(other : Value) : boolean {
        return other instanceof RecurrentTimeSpecificationValue
            && this.rules.length === other.rules.length
            && this.rules.every((v, i) => v.equals(other.rules[i]));
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitRecurrentTimeSpecificationValue(this)) {
            for (const rule of this.rules)
                rule.visit(visitor);
        }
        visitor.exit(this);
    }

    toJS() : builtin.RecurrentTimeRule[] {
        return this.rules.map((r) => r.toJS());
    }

    getType() : Type {
        return Type.RecurrentTimeSpecification;
    }
}
RecurrentTimeSpecificationValue.prototype.isRecurrentTimeSpecification = true;
Value.RecurrentTimeSpecification = RecurrentTimeSpecificationValue;

export class EntityValue extends Value {
    value : string|null;
    type : string;
    display : string|null;

    constructor(value : string|null, type : string, display : string|null = null) {
        super(null);
        assert(value === null || typeof value === 'string');
        this.value = value;
        assert(typeof type === 'string');
        this.type = type;
        assert(display === null || typeof display === 'string');
        this.display = display;
    }

    toString() : string {
        return `Entity(${this.value}, ${this.type}, ${this.display})`;
    }

    clone() : EntityValue {
        return new EntityValue(this.value, this.type, this.display);
    }

    equals(other : Value) : boolean {
        return other instanceof EntityValue && this.value === other.value && this.type === other.type;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitEntityValue(this);
        visitor.exit(this);
    }

    isConcrete() : boolean {
        return this.value !== null;
    }

    toJS() : builtin.Entity {
        assert(this.value !== null);
        return new builtin.Entity(this.value, this.display);
    }

    getType() : Type {
        return new Type.Entity(this.type);
    }
}
EntityValue.prototype.isEntity = true;
Value.Entity = EntityValue;

export class EnumValue extends Value {
    value : string;

    constructor(value : string) {
        super(null);
        assert(typeof value === 'string');
        this.value = value;
    }

    toString() : string {
        return `Enum(${this.value})`;
    }

    clone() : EnumValue {
        return new EnumValue(this.value);
    }

    equals(other : Value) : boolean {
        return other instanceof EnumValue && this.value === other.value;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitEnumValue(this);
        visitor.exit(this);
    }

    toJS() : string {
        return this.value;
    }

    getType() : Type {
        return new Type.Enum([this.value, '*']);
    }
}
EnumValue.prototype.isEnum = true;
Value.Enum = EnumValue;

export class EventValue extends Value {
    name : string|null;

    constructor(name : string|null) {
        super(null);
        assert(name === null || typeof name === 'string');
        this.name = name;
    }

    toString() : string {
        return `Event(${this.name})`;
    }

    clone() : EventValue {
        return new EventValue(this.name);
    }

    equals(other : Value) : boolean {
        return other instanceof EventValue && this.name === other.name;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitEventValue(this);
        visitor.exit(this);
    }

    isConstant() : boolean {
        return false;
    }

    getType() : Type {
        if (this.name === 'type')
        return new Type.Entity('tt:function');
        if (this.name === 'program_id')
            return new Type.Entity('tt:program_id');
        return Type.String;
    }
}
EventValue.prototype.isEvent = true;
Value.Event = EventValue;

export class ArgMapValue extends Value {
    value : TypeMap;

    constructor(value : TypeMap) {
        super(null);
        assert(typeof value === 'object');
        this.value = value;
    }

    toString() : string {
        return `ArgMap(${this.value})`;
    }

    clone() : ArgMapValue {
        const clone : TypeMap = {};
        for (const key in this.value)
            clone[key] = this.value[key];
        return new ArgMapValue(clone);
    }

    equals(other : Value) : boolean {
        if (!(other instanceof ArgMapValue))
            return false;
        const k1 = Object.keys(this.value);
        const k2 = Object.keys(other.value);
        if (k1.length !== k2.length)
            return false;
        for (const key of k1) {
            if (!other.value[key] || this.value[key].equals(other.value[key]))
                return false;
        }
        return true;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitValue(this) && visitor.visitArgMapValue(this);
        visitor.exit(this);
    }

    toJS() : TypeMap {
        return this.value;
    }

    getType() : Type {
        return Type.ArgMap;
    }
}
ArgMapValue.prototype.isArgMap = true;
Value.ArgMap = ArgMapValue;

export class ObjectValue extends Value {
    value : ({ [key : string] : Value });
    type : Type|null;

    constructor(value : ({ [key : string] : Value }), type : Type|null = null) {
        super(null);
        assert(typeof value === 'object');
        this.value = value;
        assert(type === null || type instanceof Type);
        this.type = type;
    }

    toString() : string {
        return `Object(${this.value})`;
    }

    clone() : ObjectValue {
        const clone : ({ [key : string] : Value }) = {};
        for (const key in this.value)
            clone[key] = this.value[key].clone();
        return new ObjectValue(clone, this.type);
    }

    equals(other : Value) : boolean {
        if (!(other instanceof ObjectValue))
            return false;
        const k1 = Object.keys(this.value);
        const k2 = Object.keys(other.value);
        if (k1.length !== k2.length)
            return false;
        for (const key of k1) {
            if (!other.value[key] || this.value[key].equals(other.value[key]))
                return false;
        }
        return true;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitValue(this) && visitor.visitObjectValue(this)) {
            for (const key in this.value)
                this.value[key].visit(visitor);
        }
        visitor.exit(this);
    }

    isConstant() : boolean {
        return Object.values(this.value).every((v) => v.isConstant());
    }

    toJS() : ({ [key : string] : unknown }) {
        const obj : ({ [key : string] : unknown }) = {};
        Object.entries(this.value).forEach(([key, value]) => {
            obj[key] = value.toJS();
        });
        return obj;
    }

    getType() : Type {
        if (this.type)
            return this.type;

        return Type.Object;
    }
}
ObjectValue.prototype.isObject = true;
Value.Object = ObjectValue;

function unescape(symbol : string) : string {
    return symbol.replace(/_([0-9a-fA-Z]{2}|_)/g, (match : string, ch : string) => {
        if (ch === '_') return ch;
        return String.fromCharCode(parseInt(ch, 16));
    });
}

const TYPES : ({ [key : string] : Type }) = {
    QUOTED_STRING: Type.String,
    NUMBER: Type.Number,
    CURRENCY: Type.Currency,
    DURATION: new Type.Measure('ms'),
    LOCATION: Type.Location,
    DATE: Type.Date,
    TIME: Type.Time,

    EMAIL_ADDRESS: new Type.Entity('tt:email_address'),
    PHONE_NUMBER: new Type.Entity('tt:phone_number'),
    HASHTAG: new Type.Entity('tt:hashtag'),
    USERNAME: new Type.Entity('tt:username'),
    URL: new Type.Entity('tt:url'),
    PATH_NAME: new Type.Entity('tt:path_name'),
};

function entityTypeToTTType(entityType : string) : Type {
    if (entityType.startsWith('GENERIC_ENTITY_'))
        return new Type.Entity(entityType.substring('GENERIC_ENTITY_'.length));
    else if (entityType.startsWith('MEASURE_'))
        return new Type.Measure(entityType.substring('MEASURE_'.length));
    else
        return TYPES[entityType];
}

function typeForConstant(name : string) : Type {
    let measure = /__const_NUMBER_([0-9]+)__([a-z0-9A-Z]+)/.exec(name);
    if (measure !== null)
        return new Type.Measure(measure[2]);
    measure = /__const_MEASURE__([a-z0-9A-Z]+)_([0-9]+)/.exec(name);
    if (measure !== null)
        return new Type.Measure(measure[1]);

    const underscoreindex = name.lastIndexOf('_');
    const entitytype = unescape(name.substring('__const_'.length, underscoreindex));

    const type = entityTypeToTTType(entitytype);
    if (!type)
        throw new TypeError(`Invalid __const variable ${name}`);
    return type;
}