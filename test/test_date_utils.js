"use strict";

const assert = require('assert');

const { parseDate, normalizeDate } = require('../lib/date_utils');
const { DateEdge } = require('../lib/ast');

function test(value, expected) {
    expected = parseDate(expected);

    assert.strictEqual(+normalizeDate(value), +expected);
}

function main() {
    test(parseDate({ year: 2018, month: 5, day: 23 }), new Date(2018, 4, 23));
    test(parseDate({ year: 2018, month: 5, day: 23, hour: 10 }), new Date(2018, 4, 23, 10));
    test(parseDate({ year: 2018, month: 5, day: 23, hour: 10, minute: 15 }), new Date(2018, 4, 23, 10, 15));


    const today = new Date;
    today.setHours(0);
    today.setMinutes(0);
    today.setSeconds(0);
    today.setMilliseconds(0);
    test(new DateEdge('start_of', 'day'), today);

    const tomorrow = new Date;
    tomorrow.setDate(tomorrow.getDate()+1);
    tomorrow.setHours(0);
    tomorrow.setMinutes(0);
    tomorrow.setSeconds(0);
    tomorrow.setMilliseconds(0);
    test(new DateEdge('end_of', 'day'), tomorrow);

    const this_month = new Date;
    this_month.setDate(1);
    this_month.setHours(0);
    this_month.setMinutes(0);
    this_month.setSeconds(0);
    this_month.setMilliseconds(0);
    test(new DateEdge('start_of', 'mon'), this_month);

    const next_month = new Date;
    next_month.setDate(1);
    next_month.setHours(0);
    next_month.setMinutes(0);
    next_month.setSeconds(0);
    next_month.setMilliseconds(0);
    next_month.setMonth(next_month.getMonth()+1);
    test(new DateEdge('end_of', 'mon'), next_month);
}
module.exports = main;
if (!module.parent)
    main();
