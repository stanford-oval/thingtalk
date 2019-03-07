// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Builtin = require('../lib/builtin');

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

function main() {
    console.log('testSort');
    testSort();
    console.log('testSlice');
    testSlice();
    console.log('testIndex');
    testIndex();
}
module.exports = main;
if (!module.parent)
    main();
