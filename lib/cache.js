// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

function expired(obj, now) {
    return obj.expires >= 0 && obj.expires < Date.now();
}

/**
  A Map-like data structure where objects expire on their own based on timeouts.

  @package
 */
module.exports = class Cache {
    constructor(expiration) {
        this.store = new Map;
        this._expiration = expiration;
    }

    clear() {
        this.store.clear();
    }

    delete(key) {
        const obj = this.store.get(key);
        if (obj === undefined)
            return false;
        this.store.delete(key);
        // if the object was not expired, it was deleted
        // otherwise, it is as if the object was never there
        return !expired(obj, Date.now());
    }

    *entries() {
        const now = Date.now();
        for (let [key, obj] of this.store.entries()) {
            if (expired(obj, now))
                this.store.delete(key);
            else
                yield [key, obj.value];
        }
    }
    [Symbol.iterator]() {
        return this.entries();
    }

    *keys() {
        for (let [key,] of this.entries())
            yield key;
    }
    *values() {
        for (let [,value] of this.entries())
            yield value;
    }

    forEach(callback, thisArg) {
        for (let [key, value] of this.entries())
            callback.call(thisArg, value, key, this);
    }

    set(key, value, expires = this._expiration) {
        this.store.set(key, {
            value,
            expires: expires >= 0 ? Date.now() + expires : -1
        });
    }

    has(key) {
        const obj = this.store.get(key);
        if (obj === undefined)
            return false;
        if (expired(obj, Date.now())) {
            this.store.delete(key);
            return false;
        }
        return true;
    }

    get(key) {
        const obj = this.store.get(key);
        if (obj === undefined)
            return undefined;
        if (expired(obj, Date.now())) {
            this.store.delete(key);
            return undefined;
        }
        return obj.value;
    }
};
