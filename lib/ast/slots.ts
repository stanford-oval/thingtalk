// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
import Type from '../type';
import { clean } from '../utils';

import { Value, VarRefValue, ArrayValue, ComputationValue } from './values';
import { Invocation, DeviceSelector, InputParam } from './invocation';
import { AtomBooleanExpression }  from './boolean_expression';
import { ArgumentDef, FunctionDef } from './function_def';

export interface ScopeEntry {
    type : Type;
    value : Value;

    argcanonical ?: string;
    _prim ?: InvocationLike|null;
    kind ?: string|null;
    kind_canonical ?: string;
}
export type ScopeMap = { [key : string] : ScopeEntry };

interface ExternalBooleanExpressionLike {
    selector : DeviceSelector;
    channel : string;
    in_params : InputParam[];
    schema : FunctionDef|null;
}
interface PermissionFunctionLike {
    kind : string;
    channel : string;
    schema : FunctionDef|null;
}
interface VarRefLike {
    name : string;
    in_params : InputParam[];
    schema : FunctionDef|null;
}
export type InvocationLike = Invocation | ExternalBooleanExpressionLike |
    VarRefLike | PermissionFunctionLike;

/**
 * The abstract representation of a slot.
 *
 * A slot is a placeholder for a value that can be replaced or changed by
 * API user. This API is used to iterate all values (parameters and filters)
 * in a program.
 *
 */
export abstract class AbstractSlot {
    private _prim : InvocationLike|null;
    protected _scope : ScopeMap;
    protected _options : ScopeEntry[]|undefined;

    /**
     * Construct a new abstract slot.
     *
     * @param prim - the primitive associated with this slot, if any
     * @param scope - available names for parameter passing
     */
    protected constructor(prim : InvocationLike|null, scope : ScopeMap) {
        assert(prim || prim === null);
        this._prim = prim;

        this._scope = scope;
        this._options = undefined;
    }

    /**
     * The primitive associated with this slot, if any.
     */
    get primitive() : InvocationLike|null {
        return this._prim;
    }
    /**
     * The function argument associated with this slot, if any.
     */
    get arg() : ArgumentDef|null {
        return null;
    }
    /**
     * Names which are available for parameter passing into this slot.
     */
    get scope() : ScopeMap {
        return this._scope;
    }

    /**
     * The available options to parameter pass from.
     *
     * This is the subset of {@link AbstractSlot.scope} whose type matches
     * that of this slot.
     */
    get options() : ScopeEntry[] {
        // this is computed lazily because it needs this.type, which
        // is not available in the constructor

        if (this._options)
            return this._options;

        const options = [];
        const slotType = this.type;
        for (const vname in this._scope) {
            const option = this._scope[vname];
            if (Type.isAssignable(option.type, slotType))
                options.push(option);
        }
        return this._options = options;
    }

    /**
     * The type of this slot.
     */
    abstract get type() : Type;

    abstract get tag() : string;

    abstract get() : Value;

    abstract set(value : Value) : void;

    get _argcanonical() : string {
        return '';
    }

    isUndefined() : boolean {
        return this.get().isUndefined;
    }
    isConcrete() : boolean {
        return this.get().isConcrete();
    }
    isCompilable() : boolean {
        const value = this.get();
        if (value.isUndefined)
            return false;
        if (!value.isConcrete())
            return false;

        const valueType = value.getType();
        const slotType = this.type;
        if (valueType instanceof Type.Entity && slotType instanceof Type.Entity &&
            valueType.type === 'tt:username' && slotType.type !== 'tt:username')
            return false;

        return true;
    }
}

export class InputParamSlot extends AbstractSlot {
    private _arg : ArgumentDef|null;
    private _slot : InputParam;

    constructor(prim : InvocationLike|null,
                scope : ScopeMap,
                arg : ArgumentDef|null,
                slot : InputParam) {
        super(prim, scope);
        this._arg = arg;
        this._slot = slot;
    }

    toString() : string {
        return `InputParamSlot(${this._slot.name} : ${this.type})`;
    }

    get _argcanonical() : string {
        return this._arg ? this._arg.canonical : clean(this._slot.name);
    }

    get arg() : ArgumentDef|null {
        return this._arg || null;
    }
    get type() : Type {
        if (this._arg)
            return this._arg.type;
        else
            return Type.Any;
    }
    get tag() : string {
        return `in_param.${this._slot.name}`;
    }
    get() : Value {
        return this._slot.value;
    }
    set(value : Value) : void {
        this._slot.value = value;
    }
}

export class ResultSlot extends AbstractSlot {
    private _arg : ArgumentDef|null;
    private _object : any;
    private _key : string;

    constructor(prim : Invocation|null,
                scope : ScopeMap,
                arg : ArgumentDef|null,
                object : unknown,
                key : string) {
        super(prim, scope);
        this._arg = arg;
        this._object = object;
        this._key = key;
    }

    toString() : string {
        return `ResultSlot(${this._key} : ${this.type})`;
    }

    get _argcanonical() : string {
        return this._arg ? this._arg.canonical : clean(this._key);
    }

    get arg() : ArgumentDef|null {
        return this._arg || null;
    }
    get type() : Type {
        if (this._arg)
            return this._arg.type;
        else
            return this.get().getType();
    }
    get tag() : string {
        return `result.${this._key}`;
    }
    get() : Value {
        return this._object[this._key];
    }
    set(value : Value) : void {
        this._object[this._key] = value;
    }
}

export class DeviceAttributeSlot extends AbstractSlot {
    private _slot : InputParam;

    constructor(prim : Invocation|null, attr : InputParam) {
        super(prim, {});
        this._slot = attr;
        assert(this._slot.name === 'name');
    }

    toString() : string {
        return `DeviceAttributeSlot(${this._slot.name} : ${this.type})`;
    }

    get type() : Type {
        return Type.String;
    }
    get tag() : string {
        return `attribute.${this._slot.name}`;
    }
    get() : Value {
        return this._slot.value;
    }
    set(value : Value) : void {
        this._slot.value = value;
    }
}

export class FilterSlot extends AbstractSlot {
    private _arg : ArgumentDef|null;
    private _filter : AtomBooleanExpression;

    constructor(prim : InvocationLike|null,
                scope : ScopeMap,
                arg : ArgumentDef|null,
                filter : AtomBooleanExpression) {
        super(prim, scope);

        this._arg = arg;
        this._filter = filter;
    }

    toString() : string {
        return `FilterSlot(${this._filter.name} ${this._filter.operator} : ${this.type})`;
    }

    get _argcanonical() : string {
        return this._arg ? this._arg.canonical : clean(this._filter.name);
    }

    // overidde the default option handling to filter out non-sensical filters such as "x == x"
    get options() : ScopeEntry[] {
        if (this._options)
            return this._options;
        const options = [];

        const slotType = this.type;
        for (const vname in this._scope) {
            const option = this._scope[vname];
            if (Type.isAssignable(option.type, slotType)) {
                if (option.value instanceof VarRefValue && option.value.name === this._filter.name &&
                    option._prim === this.primitive)
                    continue;
                if (option.value.isEvent)
                    continue;
                options.push(option);
            }
        }
        return this._options = options;
    }

    get arg() : ArgumentDef|null {
        return this._arg || null;
    }
    get type() : Type {
        if (this._arg) {
            switch (this._filter.operator) {
            case 'contains':
                return (this._arg.type as Type.Array).elem as Type;
            case 'contains~':
                return Type.String;
            case '~contains':
                return Type.String;
            case 'in_array':
                return new Type.Array(this._arg.type);
            case 'in_array~':
                return new Type.Array(Type.String);
            case '~in_array':
                return Type.String;
            default:
                return this._arg.type;
            }
        } else {
            return Type.Any;
        }
    }
    get tag() : string {
        return `filter.${this._filter.operator}.${this._filter.name}`;
    }
    get() : Value {
        return this._filter.value;
    }
    set(value : Value) : void {
        this._filter.value = value;
    }
}

export class ArrayIndexSlot extends AbstractSlot {
    private _type : Type;
    private _array : Value[];
    private _parent : AbstractSlot|null;
    private _baseTag : string;
    private _index : number;

    constructor(prim : InvocationLike|null,
                scope : ScopeMap,
                type : Type,
                array : Value[],
                parent : AbstractSlot|string,
                index : number) {
        super(prim, scope);
        this._type = type;
        this._array = array;
        if (typeof parent === 'string') {
            this._baseTag = parent;
            this._parent = null;
        } else {
            this._baseTag = parent.tag;
            this._parent = parent;
        }
        this._index = index;
    }

    toString() : string {
        return `ArrayIndexSlot([${this._index}] : ${this.type})`;
    }

    get _argcanonical() : string {
        if (this._parent)
            return this._parent._argcanonical;
        return '';
    }

    get arg() : ArgumentDef|null {
        return this._parent ? this._parent.arg : null;
    }
    get type() : Type {
        return this._type;
    }
    get tag() : string {
        return `${this._baseTag}.${this._index}`;
    }
    get() : Value {
        return this._array[this._index];
    }
    set(value : Value) : void {
        this._array[this._index] = value;
    }
}

export class ComputationOperandSlot extends AbstractSlot {
    private _type : Type;
    private _operator : string;
    private _operands : Value[];
    private _parent : AbstractSlot|null;
    private _baseTag : string;
    private _index : number;

    constructor(prim : InvocationLike|null,
                scope : ScopeMap,
                type : Type,
                operator : string,
                operands : Value[],
                parent : AbstractSlot|string,
                index : number) {
        super(prim, scope);
        this._type = type;
        this._operator = operator;
        this._operands = operands;
        if (typeof parent === 'string') {
            this._baseTag = parent;
            this._parent = null;
        } else {
            this._baseTag = parent.tag;
            this._parent = parent;
        }
        this._index = index;
    }

    toString() : string {
        return `ComputationOperandSlot(${this._operator}[${this._index}] : ${this.type})`;
    }

    get _argcanonical() : string {
        if (this._parent)
            return this._parent._argcanonical;
        return '';
    }

    get arg() : ArgumentDef|null {
        return this._parent ? this._parent.arg : null;
    }
    get type() : Type {
        return this._type;
    }
    get tag() : string {
        return `${this._baseTag}.${this._operator}.${this._index}`;
    }
    get() : Value {
        return this._operands[this._index];
    }
    set(value : Value) : void {
        this._operands[this._index] = value;
    }
}

export class FieldSlot extends AbstractSlot {
    private _type : Type;
    private _container : any;
    private _tag : string;
    private _field : string;

    constructor(prim : InvocationLike|null,
                scope : ScopeMap,
                type : Type,
                container : unknown,
                baseTag : string,
                field : string) {
        super(prim, scope);
        this._type = type;
        this._container = container;
        this._tag = baseTag + '.' + field;
        this._field = field;
    }

    toString() : string {
        return `FieldSlot(${this._field} : ${this.type})`;
    }

    get type() : Type {
        return this._type;
    }
    get tag() : string {
        return this._tag;
    }

    get() : Value {
        return this._container[this._field];
    }
    set(value : Value) : void {
        this._container[this._field] = value;
    }
}

export function makeScope(invocation : InvocationLike) : ScopeMap {
    // make out parameters available in the "scope", which puts
    // them as possible options for a later slot fill
    const schema = invocation.schema;
    if (!schema)
        return {};
    const scope : ScopeMap = {};
    for (const argname in schema.out) {
        const argcanonical = schema.getArgCanonical(argname);

        let kind = null;
        if ((invocation as Invocation).selector)
            kind = (invocation as Invocation).selector.kind;
        else
            kind = null;
        scope[argname] = {
            value: new Value.VarRef(argname),
            type: schema.out[argname],
            argcanonical: argcanonical,

            _prim: invocation,
            kind: kind,
            kind_canonical: schema.class ? (schema.class.metadata.canonical || null) : null,
        };
    }
    scope['$event'] = {
        value: new Value.Event(null),
        type: Type.String,
    };
    return scope;
}

export function* recursiveYieldArraySlots(slot : AbstractSlot) : Generator<AbstractSlot> {
    // despite the name, this function also handles computation

    yield slot;
    const value = slot.get();
    if (value instanceof ArrayValue) {
        const type = slot.type;
        assert(type instanceof Type.Array);
        for (let i = 0; i < value.value.length; i++)
            yield* recursiveYieldArraySlots(new ArrayIndexSlot(slot.primitive, slot.scope, type.elem as Type, value.value, slot, i));
    } else if (value instanceof ComputationValue) {
        const overload = value.overload || [];
        if (overload.length !== value.operands.length+1)
            console.error('Missing overload on computation value: ' + value);
        for (let i = 0; i < value.operands.length; i++)
            yield* recursiveYieldArraySlots(new ComputationOperandSlot(slot.primitive, slot.scope, overload[i] || Type.Any, value.op, value.operands, slot, i));
    }
}

export function* iterateSlots2InputParams(prim : Invocation|VarRefLike|ExternalBooleanExpressionLike, scope : ScopeMap) : Generator<AbstractSlot, [InvocationLike, ScopeMap]> {
    for (const in_param of prim.in_params) {
        const arg = (prim.schema ? prim.schema.getArgument(in_param.name) : null) || null;
        yield* recursiveYieldArraySlots(new InputParamSlot(prim, scope, arg, in_param));
    }
    return [prim, makeScope(prim)];
}

/**
 * Type used by the old slot iteration API.
 *
 * @deprecated Use {@link Ast~AbstractSlot} and the new slot iteration API
 */
export type OldSlot = [FunctionDef|null, (InputParam|AtomBooleanExpression|DeviceSelector), InvocationLike|null, ScopeMap];
