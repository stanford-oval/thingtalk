"use strict";

const assert = require('assert');

const __builtin = require('../lib/builtin_values');
const { equality } = require('../lib/builtin');

function testValueOf(what, expected) {
    assert.strictEqual(+what, expected);
}

function testToString(what, expected) {
    assert.strictEqual(String(what), expected);
}

function testEval(obj) {
    const jsSource = obj.toJSSource();

    const newobj = eval(jsSource);
    assert(equality(newobj, obj));
    assert.strictEqual(String(newobj), String(obj));
}

function main() {
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

    assert(equality(new __builtin.Currency(42, 'USD'), new __builtin.Currency(42, 'usd')));
    assert(!equality(new __builtin.Currency(42, 'USD'), new __builtin.Currency(44, 'usd')));
    assert(!equality(new __builtin.Currency(42, 'USD'), new __builtin.Currency(42, 'eur')));
    assert(equality(new __builtin.Currency(42, 'USD'), 42));
    assert(equality(new __builtin.Currency(42, 'EUR'), 42));
    assert(equality(42, new __builtin.Currency(42, 'usd')));
}
main();