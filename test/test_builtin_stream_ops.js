// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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

import * as Builtin from '../lib/runtime/builtins';

function sleep(timeout) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, timeout);
    });
}

function testStream(spec) {
    return async function(emit) {
        let pos = 0;

        while (pos < spec.length) {
            let [delay, [type, value]] = spec[pos++];
            await sleep(delay);
            emit(type, value);
        }
    };
}

function timeout(timeout, promise) {
    return Promise.race([sleep(timeout).then((e) => {
        throw new Error('Timed out');
    }), promise]);
}

async function runStream(into, stream) {
    let iter = await stream.next();
    while (!iter.done) {
        into.push(iter.value);
        iter = await stream.next();
    }
}

function testStreamUnion() {
    let lhs = testStream([[1000, ['a', { a:1 }]], [5000, ['a', { a:2 }]], [0, ['a', { a:3 }]], [10000, ['a', { a:4 }]]]);
    let rhs = testStream([[500, ['b', { b:5 }]], [6000, ['b', { b:6 }]], [1000, ['b', { b:7 }]]]);
    let expect = JSON.stringify([
        ['a+b', { a: 1, b: 5 }],
        ['a+b', { a: 2, b: 5 }],
        ['a+b', { a: 3, b: 5 }],
        ['a+b', { a: 3, b: 6 }],
        ['a+b', { a: 3, b: 7 }],
        ['a+b', { a: 4, b: 7 }]
    ]);

    let acc = [];

    let union = Builtin.streamUnion(lhs, rhs);
    return runStream(acc, union).then(() => {
        if (JSON.stringify(acc) !== expect) {
            console.error('Expected:', expect);
            console.error('Computed:', acc);
            throw new Error();
        }
    }).catch((e) => {
        console.error('testStreamUnion FAILED', e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}

function testJoin() {
    let lhs = testStream([[1000, ['a', { a:1 }]], [5000, ['a', { a:2 }]], [0, ['a', { a:3 }]], [10000, ['a', { a:4 }]]]);
    let rhs = testStream([[500, ['b', { b:5 }]], [6000, ['b', { b:6 }]], [1000, ['b', { b:7 }]]]);
    let expect = JSON.stringify([
        ['a+b', { 'first.a': 1, 'second.b': 5 }],
        ['a+b', { 'first.a': 1, 'second.b': 6 }],
        ['a+b', { 'first.a': 1, 'second.b': 7 }],
        ['a+b', { 'first.a': 2, 'second.b': 5 }],
        ['a+b', { 'first.a': 2, 'second.b': 6 }],
        ['a+b', { 'first.a': 2, 'second.b': 7 }],
        ['a+b', { 'first.a': 3, 'second.b': 5 }],
        ['a+b', { 'first.a': 3, 'second.b': 6 }],
        ['a+b', { 'first.a': 3, 'second.b': 7 }],
        ['a+b', { 'first.a': 4, 'second.b': 5 }],
        ['a+b', { 'first.a': 4, 'second.b': 6 }],
        ['a+b', { 'first.a': 4, 'second.b': 7 }],
    ]);

    let acc = [];

    let union = Builtin.tableJoin(lhs, rhs);
    return runStream(acc, union).then(() => {
        if (JSON.stringify(acc) !== expect) {
            console.error('Expected:', expect);
            console.error('Computed:', acc);
            throw new Error();
        }
    }).catch((e) => {
        console.error('testCrossJoin FAILED', e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}

function testCrossJoin() {
    let lhs = testStream([[1000, ['a', { a:1 }]], [5000, ['a', { a:2 }]], [0, ['a', { a:3 }]], [10000, ['a', { a:4 }]]]);
    let rhs = testStream([[500, ['b', { b:5 }]], [6000, ['b', { b:6 }]], [1000, ['b', { b:7 }]]]);
    let expect = JSON.stringify([
        ['a+b', { a: 1, b: 5 }],
        ['a+b', { a: 1, b: 6 }],
        ['a+b', { a: 1, b: 7 }],
        ['a+b', { a: 2, b: 5 }],
        ['a+b', { a: 2, b: 6 }],
        ['a+b', { a: 2, b: 7 }],
        ['a+b', { a: 3, b: 5 }],
        ['a+b', { a: 3, b: 6 }],
        ['a+b', { a: 3, b: 7 }],
        ['a+b', { a: 4, b: 5 }],
        ['a+b', { a: 4, b: 6 }],
        ['a+b', { a: 4, b: 7 }],
    ]);

    let acc = [];

    let union = Builtin.tableCrossJoin(lhs, rhs);
    return runStream(acc, union).then(() => {
        if (JSON.stringify(acc) !== expect) {
            console.error('Expected:', expect);
            console.error('Computed:', acc);
            throw new Error();
        }
    }).catch((e) => {
        console.error('testCrossJoin FAILED', e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}

function testEdgeNew() {
    let stream = [
        { __timestamp: 0, a: 1, x: 1 },
        { __timestamp: 0, a: 1, x: 2 },
        { __timestamp: 1, a: 1, x: 3 },
        { __timestamp: 1, a: 2, x: 4 },
        { __timestamp: 2, a: 3, x: 5 },
        { __timestamp: 3, a: 4, x: 6 },
        { __timestamp: 3, a: 1, x: 7 },
        { __timestamp: 4, a: 1, x: 8 },
    ];
    let expect = [
        // the first timestamp is ignored
        //{ __timestamp: 0, a: 1, x: 1 },
        //{ __timestamp: 0, a: 1, x: 2 },
        { __timestamp: 1, a: 2, x: 4 },
        { __timestamp: 2, a: 3, x: 5 },
        { __timestamp: 3, a: 4, x: 6 },
        { __timestamp: 3, a: 1, x: 7 },
    ];

    let state = null;
    let computed = [];
    for (let i = 0; i < stream.length; i++) {
        if (Builtin.isNewTuple(state, stream[i], ['a']))
            computed.push(stream[i]);
        state = Builtin.addTuple(state, stream[i]);
    }

    if (JSON.stringify(computed) !== JSON.stringify(expect)) {
        console.error('testEdgeNew FAILED');
        console.error('Expected:', expect);
        console.error('Computed:', computed);
        if (process.env.TEST_MODE)
            throw new Error('testEdgeNew FAILED');
    }
}

export default async function main() {
    console.log('testStreamUnion');
    await timeout(30000, testStreamUnion());
    console.log('testJoin');
    await timeout(30000, testJoin());
    console.log('testCrossJoin');
    await timeout(30000, testCrossJoin());
    console.log('testEdgeNew');
    await timeout(30000, testEdgeNew());
}
if (!module.parent)
    main();
