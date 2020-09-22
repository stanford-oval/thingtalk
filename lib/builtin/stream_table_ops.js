// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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
import AsyncQueue from 'consumer-queue';

import { combineOutputTypes } from './output_type_ops';
import { equality } from './primitive_ops';

// Library helpers used by the compiled TT code

function tupleEquals(a, b, keys) {
    for (let key of keys) {
        if (!equality(a[key], b[key]))
            return false;
    }
    return true;
}

export function isNewTuple(state, tuple, keys) {
    if (state === null)
        return true;

    let tlast, tprevious;
    for (let i = state.length-1; i >= 0; i--) {
        if (tlast === undefined)
            tlast = state[i].__timestamp;
        else if (tprevious === undefined && state[i].__timestamp < tlast)
            tprevious = state[i].__timestamp;
        else if (state[i].__timestamp < tprevious)
            break;
    }
    if (tuple.__timestamp === tlast)
        tlast = tprevious;
    if (tlast === undefined)
        return true;

    for (let i = 0; i < state.length; i++) {
        if (state[i].__timestamp !== tlast)
            continue;
        if (tupleEquals(state[i], tuple, keys))
            return false;
    }
    return true;
}

export function addTuple(state, tuple) {
    if (state === null)
        return [tuple];
    state.push(tuple);

    // trim the state to
    let tlast, tprevious;
    let i;
    for (i = state.length-1; i >= 0; i--) {
        if (tlast === undefined)
            tlast = state[i].__timestamp;
        else if (tprevious === undefined && state[i].__timestamp < tlast)
            tprevious = state[i].__timestamp;
        else if (state[i].__timestamp < tprevious)
            break;
    }
    if (i >= 0) {
        assert(state[i].__timestamp < tprevious);
        state = state.slice(i+1);
    }

    return state;
}

export function streamUnion(lhs, rhs) {
    let queue = new AsyncQueue();

    let currentLeft = null;
    let currentRight = null;
    let doneLeft = false;
    let doneRight = false;
    function emit() {
        if (currentLeft === null || currentRight === null)
            return;
        let [leftType, leftValue] = currentLeft;
        let [rightType, rightValue] = currentRight;
        let newValue = {};
        Object.assign(newValue, leftValue);
        Object.assign(newValue, rightValue);
        let newType = combineOutputTypes(leftType, rightType);
        queue.push({ value: [newType, newValue], done: false });
    }
    function checkDone() {
        if (doneLeft && doneRight)
            queue.push({ done: true });
    }

    lhs((...v) => {
        currentLeft = v;
        emit();
    }).then(() => {
        doneLeft = true;
        checkDone();
    }).catch((err) => queue.cancelWait(err));

    rhs((...v) => {
        currentRight = v;
        emit();
    }).then(() => {
        doneRight = true;
        checkDone();
    }).catch((err) => queue.cancelWait(err));

    return queue;
}

function accumulateStream(stream) {
    let into = [];

    return stream((...v) => {
        into.push(v);
    }).then(() => into);
}

class DelayedIterator {
    constructor(promise) {
        this._promise = promise;
        this._iterator = null;
    }

    next() {
        if (this._iterator !== null)
            return Promise.resolve(this._iterator.next());
        return this._promise.then((iterator) => {
            this._iterator = iterator;
            return this._iterator.next();
        });
    }
}

export function tableCrossJoin(lhs, rhs) {
    return new DelayedIterator(Promise.all([
        accumulateStream(lhs),
        accumulateStream(rhs)
    ]).then(([left, right]) => {
        return (function*() {
            for (let l of left) {
                for (let r of right) {
                    let [leftType, leftValue] = l;
                    let [rightType, rightValue] = r;
                    let newValue = {};
                    Object.assign(newValue, leftValue);
                    Object.assign(newValue, rightValue);
                    let newType = combineOutputTypes(leftType, rightType);
                    yield [newType, newValue];
                }
            }
        })();
    }));
}

export function invokeStreamVarRef(env, varref, ...args) {
    let queue = new AsyncQueue();

    function emit(...value) {
        queue.push({ value, done: false });
    }
    varref(env, emit, ...args).then(() => {
        queue.push({ done: true });
    }).catch((err) => {
        queue.cancelWait(err);
    });

    return queue;
}
