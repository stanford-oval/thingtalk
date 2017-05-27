// Unit Tests! Cause I'm testing units! Get it? Get it?

const assert = require('assert');

const Internal = require('../lib/internal');

function test(v1, u1, v2, u2) {
    let vn1 = Internal.transformToBaseUnit(v1, u1);
    let vn2 = Internal.transformToBaseUnit(v2, u2)
    assert(Math.abs(vn1 - vn2) < 0.00001);
}

function main() {
    test(1, 'KB', 1000, 'byte');
    test(1000, 'KB', 1000000, 'byte');
    test(1, 'kcal', 4.183995, 'kJ');
    test(100, 'C', 212, 'F');
    test(32, 'F', 0, 'C');
    test(100, 'C', 373.15, 'K');
    test(1, 'day', 86400, 's');
    test(1, 'week', 7, 'day');
    test(1, 'mon', 30, 'day');
    test(1, 'kg', 2.20462, 'lb');
    test(1, 'ft', 30.48, 'cm');
}
main();
