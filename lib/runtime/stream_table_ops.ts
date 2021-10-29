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
import type { ExecEnvironment } from './exec_environment';

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

/**
 * Check if a query returned a new result, compared to the previously returned results.
 *
 * This function checks if the state contains an identical tuple (comparing only `keys`)
 * in the immediately previous round of polling (according to `__timestamp`)
 *
 * This is used to identify the delta between two polling queries in the `monitor`
 * operator.
 *
 * @param state the monitoring state, consisting of the results returned in the prior
 *   two polling rounds
 * @param tuple the result tuple to check
 * @param keys which keys of `tuple` should be compared
 * @returns `true` if this is a new tuple, `false` otherwise
 */
export function isNewTuple<T extends MonitorTupleLike, K extends keyof T>(state : T[]|null,
                                                                          tuple : T,
                                                                          keys : K[]) : boolean {
    // at the beginning no tuples are new, because we never polled and we don't want to spam
    // the results
    if (state === null)
        return false;

    // find the timestamp of the last round of polling in the state, and the immediately previous one
    let tlast, tprevious;
    for (let i = state.length-1; i >= 0; i--) {
        if (tlast === undefined)
            tlast = state[i].__timestamp;
        else if (tprevious === undefined && state[i].__timestamp < tlast)
            tprevious = state[i].__timestamp;
        else if (tprevious !== undefined && state[i].__timestamp < tprevious)
            break;
    }
    // if this tuple belongs to a round of polling already in the state, shift the timestamps forward
    if (tuple.__timestamp === tlast)
        tlast = tprevious;

    // if the state is empty (tlast === undefined before the if statement), or the state contains exactly
    // one round of polling and we're in the same round of polling (tlast was assigned to tprevious,
    // and tprevious === undefined), this is the first polling, and this is not a new tuple
    if (tlast === undefined)
        return false;

    for (let i = 0; i < state.length; i++) {
        if (state[i].__timestamp !== tlast)
            continue;
        if (tupleEquals(state[i], tuple, keys))
            return false;
    }
    return true;
}

/**
 * Update the state used to monitor queries.
 *
 * @param state the monitoring state
 * @param tuple the result tuple to add to the state
 */
export function addTuple<T extends MonitorTupleLike>(state : T[]|null, tuple : T) : T[] {
    if (state === null)
        return [tuple];
    state.push(tuple);

    // trim the state to the last two timestamps
    // (see the logic in isNewTuple)
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

export type ResultT<T> = [string, T];

export type EmitFunction<T> = (type : string, value : T) => void;
export type Stream<T> = (emit : EmitFunction<T>) => Promise<void>;

export function streamUnion<T>(lhs : Stream<T>, rhs : Stream<T>) : AsyncIterator<ResultT<T>> {
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

export function tableJoin<T1, T2>(lhs : Stream<T1>, rhs : Stream<T2>) : AsyncIterator<ResultT<T1 & T2>, void> {
    return new DelayedIterator(Promise.all([
        accumulateStream(lhs),
        accumulateStream(rhs)
    ]).then(([left, right]) => {
        return (function*() : Generator<ResultT<T1 & T2>, void> {
            for (const l of left) {
                for (const r of right) {
                    const [leftType, leftValue] = l;
                    const [rightType, rightValue] = r;
                    const newValue : Record<string, any> = {};
                    for (const [key, value] of Object.entries(leftValue))
                        newValue[`first.${key}`] = value;
                    for (const [key, value] of Object.entries(rightValue))
                        newValue[`second.${key}`] = value;
                    const newType = combineOutputTypes(leftType, rightType);
                    yield [newType, newValue as (T1 & T2)];
                }
            }
        })();
    }));
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

export type StreamFunction<T> = (env : ExecEnvironment, emit : EmitFunction<T>, ...args : any[]) => Promise<void>;

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

export interface IterableOrAsyncIterable<T> {
    [Symbol.iterator] ?: () => Iterator<T>;
    [Symbol.asyncIterator] ?: () => AsyncIterator<T>;
}

export function getAsyncIterator<T>(obj : IterableOrAsyncIterable<T>) : Iterator<T>|AsyncIterator<T> {
    const getAsync = obj[Symbol.asyncIterator];
    if (typeof getAsync === 'function')
        return getAsync.call(obj);
    return obj[Symbol.iterator]!();
}
