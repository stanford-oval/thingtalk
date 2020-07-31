// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

const assert = require('assert');

const { parseDate, normalizeDate } = require('../lib/date_utils');
const { DateEdge, DatePiece } = require('../lib/ast');

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

    const the_11th = new Date;
    the_11th.setDate(11);
    the_11th.setHours(0);
    the_11th.setMinutes(0);
    the_11th.setSeconds(0);
    the_11th.setMilliseconds(0);
    test(new DatePiece('day', 11), the_11th);

    const february = new Date;
    february.setDate(1);
    february.setHours(0);
    february.setMinutes(0);
    february.setSeconds(0);
    february.setMilliseconds(0);
    february.setMonth(1);
    test(new DatePiece('month', 2), february);

    const the_80s = new Date;
    the_80s.setMonth(0);
    the_80s.setDate(1);
    the_80s.setHours(0);
    the_80s.setMinutes(0);
    the_80s.setSeconds(0);
    the_80s.setMilliseconds(0);
    the_80s.setYear(1980);
    test(new DatePiece('year', 1980), the_80s);
}
module.exports = main;
if (!module.parent)
    main();
