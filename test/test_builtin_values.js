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

import assert from 'assert';

import * as __builtin from '../lib/runtime/values';
import { equality, like, setTime } from '../lib/runtime/primitive_ops';

function testValueOf(what, expected) {
    assert.strictEqual(what.valueOf(), expected);
}

function testToString(what, expected) {
    assert.strictEqual(String(what), expected);
}

function testEval(obj) {
    const jsSource = obj.toJSSource();

    // eslint-disable-next-line no-eval
    const newobj = eval(jsSource);
    assert(equality(newobj, obj));
    assert.strictEqual(String(newobj), String(obj));
}

export default function main() {
    assert.throws(() => new __builtin.Time());
    assert.throws(() => new __builtin.Time('x', 'x'));
    assert.throws(() => new __builtin.Time('x', -1));
    assert.throws(() => new __builtin.Time(-1, 'x'));
    assert.throws(() => new __builtin.Time(0, 0, 'x'));
    assert.throws(() => new __builtin.Time(-1));
    assert.throws(() => new __builtin.Time(0, -1));

    testValueOf(new __builtin.Time(0, 0), 0);
    testValueOf(new __builtin.Time(0, 0, 0), 0);
    testValueOf(new __builtin.Time(0, 0, 1), 1);
    testValueOf(new __builtin.Time(10, 40), (10*60+40)*60);
    testValueOf(new __builtin.Time(10, 40, 44), (10*60+40)*60+44);
    testValueOf(new __builtin.Currency(42, 'usd'), 42);
    testValueOf(new __builtin.Currency(0, 'usd'), 0);
    testValueOf(new __builtin.Currency(1000, 'usd'), 1000);
    testValueOf(new __builtin.Currency(16.67, 'usd'), 16.67);
    testValueOf(new __builtin.Currency(42, 'eur'), 42);
    testValueOf(new __builtin.Currency(0, 'eur'), 0);
    testValueOf(new __builtin.Currency(1000, 'eur'), 1000);
    testValueOf(new __builtin.Currency(16.67, 'eur'), 16.67);
    testValueOf(new __builtin.StringLike('foo'), 'foo');

    testToString(new __builtin.Time(6, 40), `6:40`);
    testToString(new __builtin.Time(6, 40, 44), `6:40:44`);
    testToString(new __builtin.Time(10, 40), `10:40`);
    testToString(new __builtin.Time(10, 40, 44), `10:40:44`);
    testToString(new __builtin.Location(-113, 37), `[Latitude: -113.00000 deg, Longitude: 37.00000 deg]`);
    testToString(new __builtin.Location(-113, 37, ''), `[Latitude: -113.00000 deg, Longitude: 37.00000 deg]`);
    testToString(new __builtin.Location(-113, 37, "Somewhere"), "Somewhere");
    testToString(new __builtin.Currency(42, 'USD'), `42 USD`);
    testToString(new __builtin.Currency(0, 'usd'), `0 USD`);
    testToString(new __builtin.Currency(1000, 'usd'), `1000 USD`);
    testToString(new __builtin.Currency(16.67, 'usd'), `16.67 USD`);
    testToString(new __builtin.Currency(42, 'eur'), `42 EUR`);
    testToString(new __builtin.Currency(0, 'eur'), `0 EUR`);
    testToString(new __builtin.Currency(1000, 'eur'), `1000 EUR`);
    testToString(new __builtin.Currency(16.67, 'eur'), `16.67 EUR`);
    testToString(new __builtin.Entity('xyz'), 'xyz');
    testToString(new __builtin.Entity('xyz', ''), 'xyz');
    testToString(new __builtin.Entity('xyz', "Display"), 'xyz');
    testToString(new __builtin.StringLike('foo'), 'foo');

    testEval(new __builtin.Time(2, 40));
    testEval(new __builtin.Time(10, 40));
    testEval(new __builtin.Time(10, 40, 47));
    testEval(new __builtin.Location(-113, 37));
    testEval(new __builtin.Location(-113, 37, "Somewhere"));
    testEval(new __builtin.Currency(42, 'USD'));
    testEval(new __builtin.Currency(42, 'eur'));
    testEval(new __builtin.Currency(16.67, 'eur'));
    testEval(new __builtin.Entity('xyz'));
    testEval(new __builtin.Entity('xyz', ''));
    testEval(new __builtin.Entity('xyz', "Display"));

    assert(equality(null, null));
    assert(!equality(null, undefined));

    assert(equality('', ''));
    assert(equality('a', 'a'));
    assert(!equality('a', 'b'));
    assert(equality(1, 1));
    assert(!equality(1, 0));
    assert(!equality(1, NaN));
    assert(!equality(1, '1'));
    assert(!equality('a', NaN));
    assert(!equality('', 0));
    assert(equality(+0.0, -0.0));
    assert(equality(NaN, NaN));

    assert(equality(new __builtin.Currency(42, 'USD'), new __builtin.Currency(42, 'usd')));
    assert(!equality(new __builtin.Currency(42, 'USD'), new __builtin.Currency(44, 'usd')));
    assert(!equality(new __builtin.Currency(42, 'USD'), new __builtin.Currency(42, 'eur')));
    assert(equality(new __builtin.Currency(42, 'USD'), 42));
    assert(equality(new __builtin.Currency(42, 'EUR'), 42));
    assert(equality(42, new __builtin.Currency(42, 'usd')));

    assert(equality(new __builtin.Entity('foo', null), new __builtin.Entity('foo', null)));
    assert(equality(new __builtin.Entity('foo', 'Foo'), new __builtin.Entity('foo', 'Foo')));
    assert(equality(new __builtin.Entity('foo', 'Foo'), new __builtin.Entity('foo', 'Bar')));
    assert(!equality(new __builtin.Entity('foo', null), new __builtin.Entity('bar', null)));
    assert(equality(new __builtin.Entity('foo', null), 'foo'));
    assert(equality(new __builtin.StringLike('foo'), 'foo'));
    assert(equality('foo', new __builtin.StringLike('foo')));
    assert(equality(new __builtin.StringLike('foo'), new __builtin.StringLike('foo')));

    assert(equality(new Date('2019-04-30T15:00:00.000Z'), '2019-04-30T15:00:00.000Z'));
    assert(equality('2019-04-30T15:00:00.000Z', new Date('2019-04-30T15:00:00.000Z')));
    assert(equality(new Date('2019-04-30T15:00:00.000Z'), new Date('2019-04-30T15:00:00.000Z')));
    assert(equality(new Date('2019-04-30T15:00:00.000Z'), 1556636400000));
    assert(equality(1556636400000, new Date('2019-04-30T15:00:00.000Z')));
    assert(equality(setTime({ timezone: 'America/Los_Angeles' }, new Date(2019, 4, 30), new __builtin.Time(9, 30)), new Date(2019, 4, 30, 9, 30, 0)));

    assert(equality([1, 2], [1, 2]));
    assert(equality([], []));
    assert(!equality([1, 2], [1]));
    assert(!equality([1], [1, 2]));
    assert(!equality([1, 2], [1, 3]));

    assert(like("queen", "queen"));
    assert(like("beyoncé", "beyonce"));
    assert(like("the rolling stones", "rolling stones"));
    assert(like("gigi d' agostino", "gigi dagostino"));
    assert(like("taylor swift", "taylor swiit"));
    assert(like("the beatles", "beetles"));
    assert(like("drake", "drakes"));
    assert(like("camila cabello", "camilla cabelo"));
    assert(like("the wall(remastered)", "the wall remastered"));
    assert(like("despacito - remix", "despacito remix"));
    assert(like("bohemian rhapsody", "bohemian rhapsody!!!"));
    assert(like("another brick in the wall, pt. 1", "another brick in the wall pt 1"));
    assert(like("k-pop", "kpop"));
    assert(like("r&b", "r & b"));
    assert(!like("john legend", "john the legend"));
    assert(!like("21", "twenty one"));

}
if (!module.parent)
    main();
