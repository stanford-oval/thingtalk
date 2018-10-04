"use strict";

const assert = require('assert');

const { parseDate, normalizeDate } = require('../lib/date_utils');
const { DateEdge } = require('../lib/ast');

function test(value, operator, offset, expected) {
    expected = parseDate(expected);

    assert.strictEqual(+normalizeDate(value, operator, offset), +expected);
}

function main() {
    test(parseDate({ year: 2018, month: 5, day: 23 }), '+', null, new Date(2018, 4, 23));
    test(parseDate({ year: 2018, month: 5, day: 23, hour: 10 }), '+', null, new Date(2018, 4, 23, 10));
    test(parseDate({ year: 2018, month: 5, day: 23, hour: 10, minute: 15 }), '+', null, new Date(2018, 4, 23, 10, 15));

    test(parseDate({ year: 2018, month: 5, day: 23 }), '+', 10*3600*1000, new Date(2018, 4, 23, 10));
    test(parseDate({ year: 2018, month: 5, day: 23 }), '-', 10*3600*1000, new Date(2018, 4, 22, 14));

    test(parseDate({ year: 2018, month: 5, day: 23, hour: 0, minute: 20 }), '+', 10*3600*1000, new Date(2018, 4, 23, 10, 20));
    test(parseDate({ year: 2018, month: 5, day: 23, hour: 0, minute: 20 }), '-', 10*3600*1000, new Date(2018, 4, 22, 14, 20));

    const today = new Date;
    today.setHours(0);
    today.setMinutes(0);
    today.setSeconds(0);
    today.setMilliseconds(0);
    test(DateEdge('start_of', 'day'), '+', null, today);

    const tomorrow = new Date;
    tomorrow.setDate(tomorrow.getDate()+1);
    tomorrow.setHours(0);
    tomorrow.setMinutes(0);
    tomorrow.setSeconds(0);
    tomorrow.setMilliseconds(0);
    test(DateEdge('end_of', 'day'), '+', null, tomorrow);
    test(DateEdge('start_of', 'day'), '+', 24*3600*1000, tomorrow);

    const this_month = new Date;
    this_month.setDate(1);
    this_month.setHours(0);
    this_month.setMinutes(0);
    this_month.setSeconds(0);
    this_month.setMilliseconds(0);
    test(DateEdge('start_of', 'mon'), '+', null, this_month);

    const next_month = new Date;
    next_month.setMonth(next_month.getMonth()+1);
    next_month.setDate(1);
    next_month.setHours(0);
    next_month.setMinutes(0);
    next_month.setSeconds(0);
    next_month.setMilliseconds(0);
    test(DateEdge('end_of', 'mon'), '+', null, next_month);
}
module.exports = main;
if (!module.parent)
    main();
