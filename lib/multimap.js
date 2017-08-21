// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

module.exports = class MultiMap {
    constructor() {
        this._storage = new Map;
        this._size = 0;
    }

    get size() {
        return this._size;
    }

    clear() {
        this._storage.clear();
        this._size = 0;
    }

    delete(key) {
        let len = (this._storage.get(key) || []).length;
        this._size -= len;
        this._storage.delete(key);
    }

    forEach(callback, thisArg) {
        this._storage.forEach((valueArray, key) => {
            valueArray.forEach((value) => callback.call(thisArg, value, key, this));
        });
    }

    get(key) {
        return this._storage.get(key) || [];
    }

    has(key) {
        return this._storage.has(key);
    }

    put(key, value) {
        let valueArray = this._storage.get(key);
        if (!valueArray) {
            valueArray = [];
            this._storage.set(key, valueArray);
        }
        valueArray.push(value);
        this._size ++;
        return valueArray.length;
    }
};
