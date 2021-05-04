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

import assert from 'assert';

import * as Builtin from '../lib/runtime/builtins';

function testSort() {
    const array = [
        [{ a: 1, b: -1 }, 'com.foo:function'],
        [{ a: 0, b: 2 }, 'com.foo:function'],
        [{ a: 3, b: -0.5 }, 'com.foo:function'],
        [{ a: 2, b: -3 }, 'com.foo:function'],
    ];

    assert.deepStrictEqual(Builtin.sortasc(array.slice(), 'a'), [
        [{ a: 0, b: 2 }, 'com.foo:function'],
        [{ a: 1, b: -1 }, 'com.foo:function'],
        [{ a: 2, b: -3 }, 'com.foo:function'],
        [{ a: 3, b: -0.5 }, 'com.foo:function'],
    ]);

    assert.deepStrictEqual(Builtin.sortdesc(array.slice(), 'a'), [
        [{ a: 3, b: -0.5 }, 'com.foo:function'],
        [{ a: 2, b: -3 }, 'com.foo:function'],
        [{ a: 1, b: -1 }, 'com.foo:function'],
        [{ a: 0, b: 2 }, 'com.foo:function'],
    ]);

    assert.deepStrictEqual(Builtin.sortasc(array.slice(), 'b'), [
        [{ a: 2, b: -3 }, 'com.foo:function'],
        [{ a: 1, b: -1 }, 'com.foo:function'],
        [{ a: 3, b: -0.5 }, 'com.foo:function'],
        [{ a: 0, b: 2 }, 'com.foo:function'],
    ]);

    assert.deepStrictEqual(Builtin.sortdesc(array.slice(), 'b'), [
        [{ a: 0, b: 2 }, 'com.foo:function'],
        [{ a: 3, b: -0.5 }, 'com.foo:function'],
        [{ a: 1, b: -1 }, 'com.foo:function'],
        [{ a: 2, b: -3 }, 'com.foo:function'],
    ]);
}

function testSlice() {
    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], 1, 3),
        [1, 2, 3]);

    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], 1, 5),
        [1, 2, 3, 4]);

    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], 4, 1),
        [4]);

    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], -1, 3),
        [2, 3, 4]);

    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], -1, 1),
        [4]);

    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], 0, 3),
        [1, 2]);

    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], -5, 1),
        []);

    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], 5, 1),
        []);

    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], 1, 0),
        []);

    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], 2, 1),
        [2]);

    assert.deepStrictEqual(Builtin.sliceArray([1, 2, 3, 4], -2, 2),
        [2, 3]);
}

function testIndex() {
    assert.deepStrictEqual(Builtin.indexArray(['a', 'b', 'c', 'd', 'e'], [1, 2, 5]),
        ['a', 'b', 'e']);

    assert.deepStrictEqual(Builtin.indexArray(['a', 'b', 'c', 'd', 'e'], [-1, -2, -5]),
        ['e', 'd', 'a']);

    assert.deepStrictEqual(Builtin.indexArray(['a', 'b', 'c', 'd', 'e'], [1, -2, 1, 5, -1]),
        ['a', 'd', 'a', 'e', 'e']);
}

export default function main() {
    console.log('testSort');
    testSort();
    console.log('testSlice');
    testSlice();
    console.log('testIndex');
    testIndex();
}
if (!module.parent)
    main();
