// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
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

import * as TTUnits from 'thingtalk-units';

import type * as Ast from './ast';
import * as Grammar from './grammar';

import { TokenStream } from './new-syntax/tokenstream';
import List from './utils/list';

function normalizeUnit(unit : string) : string {
    if (unit.startsWith('default')) {
        switch (unit) {
        case 'defaultTemperature':
            return 'C';
        default:
            throw new Error('Invalid default unit');
        }
    } else {
        return TTUnits.normalizeUnit(unit);
    }
}

export type TypeMap = ({ [key : string] : Type });
export type TypeScope = ({ [key : string] : Type|string });

// strictly speaking, Measure and Arrays are not types, they are type constructors
// (kind * -> *)
// isAssignable() has the magic to check types

/**
 * The base class of all ThingTalk types.
 */
export default abstract class Type {
    static Any : Type; // polymorphic hole
    isAny ! : boolean;
    static Boolean : Type;
    isBoolean ! : boolean;
    static String : Type;
    isString ! : boolean;
    static Number : Type;
    isNumber ! : boolean;
    static Currency : Type;
    isCurrency ! : boolean;
    static Entity : typeof EntityType; // a typed string (username, hashtag, url, picture...)
    isEntity ! : boolean;
    static Measure : typeof MeasureType;
    isMeasure ! : boolean;
    static Enum : typeof EnumType;
    isEnum ! : boolean;
    static Array : typeof ArrayType;
    isArray ! : boolean;
    static Time : Type;
    isTime ! : boolean;
    static Date : Type;
    isDate ! : boolean;
    static RecurrentTimeSpecification : Type;
    isRecurrentTimeSpecification ! : boolean;
    static Location : Type;
    isLocation ! : boolean;
    static ArgMap : Type;
    isArgMap ! : boolean;
    static Object : Type;
    isObject ! : boolean;
    static Compound : typeof CompoundType;
    isCompound ! : boolean;
    static Unknown : typeof UnknownType;
    isUnknown ! : boolean;

    static fromString(str : Type|string) : Type {
        if (str instanceof Type)
            return str;

        return Grammar.parse(str, { startRule: 'type_ref' }) as any;
    }

    isNumeric() : boolean {
        return this.isNumber || this.isMeasure || this.isCurrency;
    }
    isComparable() : boolean {
        return this.isNumeric() || this.isDate || this.isTime || this.isString;
    }

    abstract toSource() : TokenStream;
    abstract equals(other : Type) : boolean;

    static resolve(type : Type|string, typeScope : TypeScope) : Type {
        if (typeof type === 'string')
            return Type.resolve(typeScope[type], typeScope);

        if (type instanceof ArrayType)
            return new ArrayType(Type.resolve(type.elem, typeScope));
        if (type instanceof MeasureType && type.unit === '')
            return new MeasureType(typeScope['_unit'] as string);
        if (type instanceof EntityType && type.type === '')
            return new EntityType(typeScope['_entity'] as string);
        return type;
    }

    static isAssignable(type : Type, assignableTo : Type|string, typeScope : TypeScope = {}, lenient = false) : boolean {
        if (typeof assignableTo === 'string') {
            if (typeScope[assignableTo])
                return Type.isAssignable(type, typeScope[assignableTo] as Type, typeScope, lenient);
            typeScope[assignableTo] = type;
            return true;
        }
        if (type.equals(assignableTo))
            return true;

        // if the types are different, and one of them is unknown, we err to
        // fail to assign (which causes a type error) because we don't know
        // the assignment rules
        if (type instanceof UnknownType || assignableTo instanceof UnknownType)
            return false;

        // Any type matches everything (like "any" in TypeScript - this is unsound but okay)
        if (type.isAny || assignableTo.isAny)
            return true;

        // primitive type conversions
        if (type.isDate && assignableTo.isTime)
            return true;
        if (type.isNumber && assignableTo.isCurrency)
            return true;

        if (type instanceof MeasureType && assignableTo instanceof MeasureType && assignableTo.unit !== '') {
            if (type.unit === assignableTo.unit)
                return true;
        }
        if (type instanceof MeasureType && assignableTo instanceof MeasureType && assignableTo.unit === '') {
            if (!typeScope['_unit']) {
                typeScope['_unit'] = type.unit;
                return true;
            }
            if (typeScope['_unit'] && typeScope['_unit'] === type.unit)
                return true;
            return false;
        }
        if (type instanceof ArrayType && assignableTo instanceof ArrayType) {
            if (typeof assignableTo.elem === 'string') {
                if (typeof type.elem === 'string')
                    return true;

                if (typeScope[assignableTo.elem])
                    return Type.isAssignable(type.elem, typeScope[assignableTo.elem] as Type, typeScope, lenient);
                typeScope[assignableTo.elem] = type.elem;
                return true;
            }
            if (typeof type.elem === 'string') {
                if (typeScope[type.elem])
                    return Type.isAssignable(typeScope[type.elem] as Type, assignableTo.elem, typeScope, lenient);
                typeScope[type.elem] = assignableTo.elem;
                return true;
            }
            if (type.elem.isAny)
                return true;
            if (Type.isAssignable(type.elem, assignableTo.elem, typeScope, lenient))
                return true;
        }
        if (type instanceof ArrayType) {
            if (typeof type.elem === 'string')
                return false;
            if (assignableTo instanceof EntityType && assignableTo.type === 'tt:contact_group')
                return Type.isAssignable(type.elem, new Type.Entity('tt:contact'), typeScope, lenient);
        }

        if (lenient && type.isEntity && assignableTo.isString)
            return true;
        if (lenient && type.isString && assignableTo.isEntity) {
            //console.log('Using String for ' + assignableTo + ' is deprecated');
            return true;
        }
        if (type instanceof EnumType && assignableTo instanceof EnumType) {
            if (type.entries === null)
                return true;
            if (assignableTo.entries === null)
                return false;
            if (arrayEquals(type.entries, assignableTo.entries))
                return true;
            if (type.entries[type.entries.length-1] === '*' &&
                type.entries.slice(0, type.entries.length-1).every((entry) => (assignableTo.entries as string[]).includes(entry)))
                return true;
        }

        if (type instanceof EntityType && assignableTo instanceof EntityType) {
            if (assignableTo.type === '') {
                if (!typeScope['_entity']) {
                    typeScope['_entity'] = type.type;
                    return true;
                }
                if (typeScope['_entity'] && typeScope['_entity'] === type.type)
                    return true;
                return false;
            }
            if (entitySubType(type.type, assignableTo.type))
                return true;
        }
        return false;
    }
}
Type.prototype.isAny = false;
Type.prototype.isBoolean = false;
Type.prototype.isString = false;
Type.prototype.isNumber = false;
Type.prototype.isCurrency = false;
Type.prototype.isEntity = false;
Type.prototype.isMeasure = false;
Type.prototype.isEnum = false;
Type.prototype.isArray = false;
Type.prototype.isTime = false;
Type.prototype.isDate = false;
Type.prototype.isRecurrentTimeSpecification = false;
Type.prototype.isLocation = false;
Type.prototype.isArgMap = false;
Type.prototype.isObject = false;

class PrimitiveType extends Type {
    private name : string;

    constructor(name : string) {
        super();
        this.name = name;

        ((this as any)['is' + name] as boolean) = true;
    }

    toString() {
        return this.name;
    }
    toSource() : TokenStream {
        return List.singleton(this.name);
    }

    equals(other : Type) : boolean {
        // primitive types are singletons
        return this === other;
    }
}
Type.Any = new PrimitiveType('Any');
Type.Boolean = new PrimitiveType('Boolean');
Type.String = new PrimitiveType('String');
Type.Number = new PrimitiveType('Number');
Type.Currency = new PrimitiveType('Currency');
Type.Time = new PrimitiveType('Time');
Type.Date = new PrimitiveType('Date');
Type.RecurrentTimeSpecification = new PrimitiveType('RecurrentTimeSpecification');
Type.Location = new PrimitiveType('Location');
Type.ArgMap = new PrimitiveType('ArgMap');

export class EntityType extends Type {
    // the entity type, as RDF-style prefix:name
    constructor(public type : string) {
        super();
    }

    toString() : string {
        return `Entity(${this.type})`;
    }

    toSource() : TokenStream {
        return List.concat('Entity', '(', this.type, ')');
    }

    equals(other : Type) : boolean {
        return other instanceof EntityType && this.type === other.type;
    }
}
Type.Entity = EntityType;
EntityType.prototype.isEntity = true;

export class MeasureType extends Type {
    unit : string;

    // '' means any unit, creating a polymorphic type
    // any other value is a base unit (m for length, C for temperature)
    constructor(unit : string) {
        super();
        this.unit = normalizeUnit(unit);
    }

    toString() : string {
        return `Measure(${this.unit})`;
    }

    toSource() : TokenStream {
        return List.concat('Measure', '(', this.unit, ')');
    }

    equals(other : Type) : boolean {
        return other instanceof MeasureType && this.unit === other.unit;
    }
}
Type.Measure = MeasureType;
MeasureType.prototype.isMeasure = true;

export class EnumType extends Type {
    constructor(public entries : string[]|null) {
        super();
    }

    toString() : string {
        return `Enum(${this.entries})`;
    }

    toSource() : TokenStream {
        if (this.entries === null)
            return List.concat('Enum', '(', '*', ')');
        return List.concat('Enum', '(', List.join(this.entries.map((e) => List.singleton(e)), ','), ')');
    }

    equals(other : Type) : boolean {
        return other instanceof EnumType && arrayEquals(this.entries, other.entries);
    }
}
Type.Enum = EnumType;
EnumType.prototype.isEnum = true;

export class ArrayType extends Type {
    constructor(public elem : Type|string) {
        super();
    }

    toString() : string {
        return `Array(${this.elem})`;
    }

    toSource() : TokenStream {
        if (typeof this.elem === 'string')
            return List.concat('Array', '(', this.elem, ')');
        return List.concat('Array', '(', this.elem.toSource(), ')');
    }

    equals(other : Type) : boolean {
        if (!(other instanceof ArrayType))
            return false;
        if (typeof this.elem === 'string')
            return this.elem === other.elem;
        if (typeof other.elem === 'string')
            return false;
        return this.elem.equals(other.elem);
    }
}
Type.Array = ArrayType;
ArrayType.prototype.isArray = true;

type FieldMap = { [key : string] : Ast.ArgumentDef };

export class CompoundType extends Type {
    constructor(public name : string|null,
                public fields : FieldMap) {
        super();
    }

    toString() : string {
        if (this.name)
            return `Compound(${this.name})`;
        return `Compound`;
    }

    toSource() : TokenStream {
        let list : TokenStream = List.concat('{', '\t+', '\n');
        let first = true;
        for (const field in this.fields) {
            // ignored flattened nested compound arguments
            if (field.indexOf('.') >= 0)
                continue;
            const arg = this.fields[field];
            if (first)
                first = false;
            else
                list = List.concat(list, ',', '\n');
            list = List.concat(list, arg.toSource());
        }
        list = List.concat(list, '\n', '\t-', '}');
        return list;
    }

    equals(other : Type) : boolean {
        if (!(other instanceof CompoundType))
            return false;
        if (this.name !== other.name)
            return false;

        if (Object.keys(this.fields).length !== Object.keys(other.fields).length)
            return false;
        for (const f in this.fields) {
            if (!(f in other.fields))
                return false;
            if (!this.fields[f].type.equals(other.fields[f].type))
                return false;
        }
        return true;
    }
}
Type.Compound = CompoundType;
CompoundType.prototype.isCompound = true;

// forward compatibility: a type that we know nothing about,
// because it was introduced in a later version of the language
export class UnknownType extends Type {
    constructor(public name : string) {
        super();
    }

    toString() : string {
        return this.name;
    }

    toSource() : TokenStream {
        return List.singleton(this.name);
    }

    equals(other : Type) : boolean {
        return other instanceof UnknownType &&
            this.name === other.name;
    }
}
Type.Unknown = UnknownType;
UnknownType.prototype.isUnknown = true;

function arrayEquals(a : unknown[]|null, b : unknown[]|null) : boolean {
    if (a === null && b === null)
        return true;
    if (a === null || b === null)
        return false;
    if (a.length !== b.length)
        return false;

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }

    return true;
}

function entitySubType(type : string, assignableTo : string) : boolean {
    if (type === 'tt:username' || type === 'tt:contact_name') {
        return assignableTo === 'tt:phone_number' ||
            assignableTo === 'tt:email_address' ||
            assignableTo === 'tt:contact';
    }
    if (type === 'tt:contact_group_name')
        return assignableTo === 'tt:contact_group';
    if (type === 'tt:picture_url')
        return assignableTo === 'tt:url';
    return false;
}
