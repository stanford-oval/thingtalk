// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2021 The Board of Trustees of the Leland Stanford Junior University
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

import assert from 'assert';

import * as Builtin from '../lib/runtime/builtins';

function testLikeNormal() {
    assert(Builtin.like('foo', 'foo'));
    assert(Builtin.like('foo', 'oo'));
    assert(!Builtin.like('foo', 'bar'));

    // one character difference
    assert(Builtin.like('foo', 'too'));

    // words
    assert(Builtin.like('foo bar baz', 'bar'));

    const v1 = new Builtin.Entity('1234', 'foo');
    assert(Builtin.like(v1, 'foo'));
    assert(!Builtin.like(v1, '1234'));
    assert(!Builtin.like(v1, 'bar'));

    const v2 = new Builtin.Entity('1234', null);
    assert(!Builtin.like(v2, '1234'));
}

function testLikeOverridden() {
    const v1 = new Builtin.StringLike('foo', { softmatch(x) {
        return x === 'bar';
    } });

    // softmatch method is used when provided on the left
    assert(!Builtin.like(v1, 'foo'));
    assert(Builtin.like(v1, 'bar'));

    // softmatch method is ignored on the right
    assert(Builtin.like('foo', v1));
    assert(!Builtin.like('bar', v1));

    const v2 = new Builtin.Entity('1234', 'foo', { softmatch(x) {
        return x === 'bar';
    } });
    assert(!Builtin.like(v2, 'foo'));
    assert(Builtin.like(v2, 'bar'));
}

export default async function main() {
    console.log('testLikeNormal');
    testLikeNormal();

    console.log('testLikeOverridden');
    testLikeOverridden();
}
if (!module.parent)
    main();
