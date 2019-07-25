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
const Type = require('../type');

class AbstractSlot {
    constructor(prim, scope) {
        this._prim = prim;
        this._scope = scope;
    }

    get primitive() {
        return this._prim;
    }
    get scope() {
        return this._scope;
    }

    /* istanbul ignore next */
    get type() {
        throw new Error('Abstract method');
    }
    /* istanbul ignore next */
    get() {
        throw new Error('Abstract method');
    }
    /* istanbul ignore next */
    set(value) {
        throw new Error('Abstract method');
    }

    isUndefined() {
        return this.get().isUndefined;
    }
    isConcrete() {
        return this.get().isConcrete();
    }
}

class InputParamSlot extends AbstractSlot {
    constructor(prim, scope, arg, slot) {
        super(prim, scope);
        this._arg = arg;
        this._slot = slot;
    }

    toString() {
        return `InputParamSlot(${this._slot.name} : ${this.type})`;
    }

    get type() {
        if (this._arg)
            return this._arg.type;
        else
            return Type.Any;
    }
    get() {
        return this._slot.value;
    }
    set(value) {
        this._slot.value = value;
    }
}

class FilterSlot extends AbstractSlot {
    constructor(prim, scope, arg, filter) {
        super(prim, scope);
        this._arg = arg;
        this._filter = filter;
    }

    toString() {
        return `FilterSlot(${this._filter.name} ${this._filter.operator} : ${this.type})`;
    }

    get type() {
        if (this._arg) {
            switch (this._filter.operator) {
            case 'contains':
                return this._arg.type.elem;
            case 'in_array':
                return new Type.Array(this._arg.type);
            default:
                return this._arg.type;
            }
        } else {
            return Type.Any;
        }
    }
    get() {
        return this._filter.value;
    }
    set(value) {
        this._filter.value = value;
    }
}

class ArrayIndexSlot extends AbstractSlot {
    constructor(prim, scope, type, array, index) {
        super(prim, scope);
        this._type = type;
        this._array = array;
        this._index = index;
    }

    toString() {
        return `ArrayIndexSlot([${this._index}] : ${this.type})`;
    }

    get type() {
        return this._type;
    }
    get() {
        return this._array[this._index];
    }
    set(value) {
        this._array[this._index] = value;
    }
}

class FieldSlot extends AbstractSlot {
    constructor(prim, scope, type, container, field) {
        super(prim, scope);
        this._type = type;
        this._container = container;
        this._field = field;
    }

    toString() {
        return `FieldSlot(${this._field} : ${this.type})`;
    }

    get type() {
        return this._type;
    }
    get() {
        return this._container[this._field];
    }
    set(value) {
        this._container[this._field] = value;
    }
}

function* recursiveYieldArraySlots(slot) {
    yield slot;
    const value = slot.get();
    if (!value.isArray)
        return;

    const type = slot.type;
    assert(type.isArray);
    for (let i = 0; i < value.value.length; i++)
        yield* recursiveYieldArraySlots(new ArrayIndexSlot(slot.prim, slot.scope, type.elem, value.value, i));
}

module.exports = {
    recursiveYieldArraySlots,
    InputParamSlot,
    FilterSlot,
    ArrayIndexSlot,
    FieldSlot
};
