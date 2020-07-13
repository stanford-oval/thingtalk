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

module.exports = class Scope {
    constructor(parent = null) {
        this._parent = parent;
        if (parent !== null && !(parent instanceof Scope))
            throw new TypeError(`wrong parent scope`);
        this._names = Object.create(null);
    }

    // catch refactoring bugs...
    get $outputType() {
        throw new TypeError('use get($outputType)');
    }
    get $output() {
        throw new TypeError('use get($output)');
    }

    get parent() {
        return this._parent;
    }

    get isTopLevel() {
        return this._parent === null;
    }

    hasOwnKey(name) {
        return name in this._names;
    }

    get(name) {
        // we don't need to check if the name is visible in some scope,
        // we know it is because the program typechecked
        if (name in this._names)
            return this._names[name];
        else
            return this._parent.get(name);
    }

    set(name, value) {
        this._names[name] = value;
    }

    *_doIterate(seen) {
        for (let name in this._names) {
            if (seen.has(name))
                continue;
            seen.add(name);
            yield [name, this._names[name]];
        }
        if (this._parent)
            yield* this._parent._doIterate(seen);
    }

    *[Symbol.iterator]() {
        const seen = new Set;
        yield* this._doIterate(seen);
    }

    *ownKeys() {
        for (let name in this._names)
            yield name;
    }
};
