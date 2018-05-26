// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
Q.longStackSupport = true;

require('./polyfill');

const SchemaRetriever = require('../lib/schema');
const assert = require('assert');

const Formatter = require('../lib/formatter');
const builtin = require('../lib/builtin_values');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const formatter = new Formatter('en-US', 'America/Los_Angeles', schemaRetriever);

function main() {
    let date = new Date(2018, 4, 23, 21, 18, 0);

    assert.strictEqual(formatter.dateToString(date), 'Wednesday, May 23, 2018');
    assert.strictEqual(formatter.dateToString(date, { year: 'numeric' }), '2018');
    assert.strictEqual(formatter.dateAndTimeToString(date), '5/23/2018, 9:18:00 PM');
    assert.strictEqual(formatter.timeToString(date), '9:18:00 PM PDT');
    assert.strictEqual(formatter.anyToString(date), '5/23/2018, 9:18:00 PM');

    let location = new builtin.Location(-37, 113);
    assert.strictEqual(formatter.locationToString(location), '[Latitude: -37.000 deg, Longitude: 113.000 deg]');
    assert.strictEqual(formatter.anyToString(location), '[Latitude: -37.000 deg, Longitude: 113.000 deg]');

    location = new builtin.Location(-37, 113, "Somewhere");
    assert.strictEqual(formatter.locationToString(location), 'Somewhere');
    assert.strictEqual(formatter.anyToString(location), 'Somewhere');

    assert.strictEqual(formatter.anyToString([location, date]), 'Somewhere, 5/23/2018, 9:18:00 PM');

    assert.strictEqual(formatter.anyToString(3), '3');
    assert.strictEqual(formatter.anyToString(3.5), '3.500');

    assert.strictEqual(formatter.anyToString('string'), 'string');
    assert.strictEqual(formatter.anyToString({}), '[object Object]');

    assert.strictEqual(formatter.measureToString(21, 0, 'C'), '21');
    assert.strictEqual(formatter.measureToString(20.5, 0, 'C'), '21');
    assert.strictEqual(formatter.measureToString(21, 1, 'C'), '21.0');
    assert.strictEqual(formatter.measureToString(21, 0, 'F'), '70');
    assert.strictEqual(formatter.measureToString(20.5, 0, 'F'), '69');
    assert.strictEqual(formatter.measureToString(21, 1, 'F'), '69.8');

    assert.strictEqual(formatter.measureToString(1000, 0, 'm'), '1000');
    assert.strictEqual(formatter.measureToString(1000, 0, 'km'), '1');

    assert.deepStrictEqual(formatter.format([{ type: 'text', text: '$v1$$foo$$ ${v2} ${v3:F} ${v4:iso-date} ${v5:%} ${v6} ${v7}' }], {
        v1: 'lol',
        v2: null,
        v3: 21,
        v4: date,
        v5: 0.42,
        v6: 10,
        v7: 9.5
    }), [ 'lol$foo$ null 69.8 2018-05-24T04:18:00.000Z 42 10 9.50' ]);

    assert.deepStrictEqual(formatter.format([{ type: 'text', text: '$v1$$foo$$ ${v2} ${v3:F} ${v4:iso-date} ${v5:%} ${v6} ${v7}' }], {
        v1: 'lol',
        v2: null,
        v3: 21,
        v4: date,
        v5: 0.42,
        v6: 10,
        v7: 9.5
    }, 'string'), 'lol$foo$ null 69.8 2018-05-24T04:18:00.000Z 42 10 9.50');

    assert.deepStrictEqual(formatter.format(['$v1$$foo$$ ${v2} ${v3:F} ${v4:iso-date} ${v5:%} ${v6} ${v7}'], {
        v1: 'lol',
        v2: null,
        v3: 21,
        v4: date,
        v5: 0.42,
        v6: 10,
        v7: 9.5
    }, 'string'), 'lol$foo$ null 69.8 2018-05-24T04:18:00.000Z 42 10 9.50');

    assert.deepStrictEqual(formatter.format([{ type: 'rdl', displayTitle:'text', webCallback: '$v1$$foo$$ ${v2} ${v3:F} ${v4:iso-date} ${v5:%} ${v6} ${v7}' }], {
        v1: 'lol',
        v2: null,
        v3: 21,
        v4: date,
        v5: 0.42,
        v6: 10,
        v7: 9.5
    }, 'string'), 'Link: text <lol$foo$ null 69.8 2018-05-24T04:18:00.000Z 42 10 9.50>');
}
main();