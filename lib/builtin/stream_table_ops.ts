// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import type ExecEnvironment from '../runtime/exec_environment';

// Library helpers used by the compiled TT code

interface MonitorTupleLike {
    __timestamp : number;
}

function tupleEquals<T, K extends keyof T>(a : T, b : T, keys : K[]) : boolean {
    for (const key of keys) {
        if (!equality(a[key], b[key]))
            return false;
    }
    return true;
}

export function isNewTuple<T extends MonitorTupleLike, K extends keyof T>(state : T[]|null,
                                                                          tuple : T,
                                                                          keys : K[]) : boolean {
    if (state === null)
        return true;

    let tlast, tprevious;
    for (let i = state.length-1; i >= 0; i--) {
        if (tlast === undefined)
            tlast = state[i].__timestamp;
        else if (tprevious === undefined && state[i].__timestamp < tlast)
            tprevious = state[i].__timestamp;
        else if (tprevious !== undefined && state[i].__timestamp < tprevious)
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

export function addTuple<T extends MonitorTupleLike>(state : T[]|null, tuple : T) : T[] {
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
        else if (tprevious !== undefined && state[i].__timestamp < tprevious)
            break;
    }
    if (i >= 0) {
        assert(tprevious !== undefined);
        assert(state[i].__timestamp < tprevious);
        state = state.slice(i+1);
    }

    return state;
}

type ResultT<T> = [string, T];

type EmitFunction<T> = (type : string, value : T) => void;
type Stream<T> = (emit : EmitFunction<T>) => Promise<void>;

export function streamUnion<T>(lhs : Stream<T>, rhs : Stream<T>) : AsyncQueue<IteratorResult<ResultT<T>, void>> {
    const queue = new AsyncQueue<IteratorResult<ResultT<T>, void>>();

    let currentLeft : ResultT<T>|null = null;
    let currentRight : ResultT<T>|null = null;
    let doneLeft = false;
    let doneRight = false;
    function emit() {
        if (currentLeft === null || currentRight === null)
            return;
        const [leftType, leftValue] = currentLeft;
        const [rightType, rightValue] = currentRight;
        const newValue = {} as T;
        Object.assign(newValue, leftValue);
        Object.assign(newValue, rightValue);
        const newType = combineOutputTypes(leftType, rightType);
        queue.push({ value: [newType, newValue], done: false });
    }
    function checkDone() {
        if (doneLeft && doneRight)
            queue.push({ value: undefined, done: true });
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

function accumulateStream<T>(stream : Stream<T>) : Promise<Array<ResultT<T>>> {
    const into : Array<ResultT<T>> = [];

    return stream((type : string, value : T) => {
        into.push([type, value]);
    }).then(() => into);
}

class DelayedIterator<T> implements AsyncIterator<T> {
    private _promise : Promise<Iterator<T>>;
    private _iterator : Iterator<T>|null;

    constructor(promise : Promise<Iterator<T>>) {
        this._promise = promise;
        this._iterator = null;
    }

    next() : Promise<IteratorResult<T>> {
        if (this._iterator !== null)
            return Promise.resolve(this._iterator.next());
        return this._promise.then((iterator) => {
            this._iterator = iterator;
            return this._iterator.next();
        });
    }
}

export function tableCrossJoin<T>(lhs : Stream<T>, rhs : Stream<T>) : AsyncIterator<ResultT<T>, void> {
    return new DelayedIterator(Promise.all([
        accumulateStream(lhs),
        accumulateStream(rhs)
    ]).then(([left, right]) => {
        return (function*() : Generator<ResultT<T>, void> {
            for (const l of left) {
                for (const r of right) {
                    const [leftType, leftValue] = l;
                    const [rightType, rightValue] = r;
                    const newValue = {} as T;
                    Object.assign(newValue, leftValue);
                    Object.assign(newValue, rightValue);
                    const newType = combineOutputTypes(leftType, rightType);
                    yield [newType, newValue];
                }
            }
        })();
    }));
}

type StreamFunction<T> = (env : ExecEnvironment, emit : EmitFunction<T>, ...args : any[]) => Promise<void>;

export function invokeStreamVarRef<T>(env : ExecEnvironment,
                                      varref : StreamFunction<T>,
                                      ...args : any[]) : AsyncQueue<IteratorResult<ResultT<T>, void>> {
    const queue = new AsyncQueue<IteratorResult<ResultT<T>, void>>();

    function emit(type : string, value : T) {
        queue.push({ value: [type, value], done: false });
    }
    varref(env, emit, ...args).then(() => {
        queue.push({ value: undefined, done: true });
    }).catch((err) => {
        queue.cancelWait(err);
    });

    return queue;
}
