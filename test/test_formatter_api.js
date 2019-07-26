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

const Formatter = require('../lib/runtime/formatter');
const builtin = require('../lib/builtin/values');
const I18n = require('../lib/i18n');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const formatter = new Formatter('en-US', 'America/Los_Angeles', schemaRetriever);

function simpleFormatFunction(argMap, hint, formatter) {
    return argMap.v1 + ' ' + argMap.v2;
}

function complexFormatFunction(argMap, hint, formatter) {
    return [argMap.v1 + ' ' + argMap.v2, argMap.v3];
}

function main() {
    let date = new Date(2018, 4, 23, 21, 18, 0);
    let date2 = new Date(2018, 12, 7, 10, 30, 0);

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

    assert.deepStrictEqual(formatter.format([{ type: 'text', text: '$v1 ${v1} ${v1:enum}' }], {
        v1: 'some_enum'
    }), ['some_enum some_enum some enum']);

    assert.deepStrictEqual(formatter.format([{ type: 'text', text: '$v1 ${v2:F} ${v3} ${v3:iso-date} ${v4:%}' }], {
        v1: ['lol', 'cat'],
        v2: [21, 42],
        v3: [date, date2],
        v4: [0.42, 0.84],
    }), [ 'lol, cat 69.8, 107.6 5/23/2018, 9:18:00 PM, 1/7/2019, 10:30:00 AM 2018-05-24T04:18:00.000Z, 2019-01-07T18:30:00.000Z 42, 84' ]);

    assert.deepStrictEqual(formatter.format([simpleFormatFunction], {
        v1: 'one',
        v2: 'two'
    }), [ 'one two' ]);

    assert.deepStrictEqual(formatter.format([{ type: 'code', code: simpleFormatFunction.toString() }], {
        v1: 'one',
        v2: 'two'
    }), [ 'one two' ]);

    assert.deepStrictEqual(formatter.format([complexFormatFunction, '${v3} ${v1}'], {
        v1: 'one',
        v2: 'two',
        v3: 'three'
    }), [ 'one two', 'three', 'three one' ]);

    assert.deepStrictEqual(formatter.format([{ type: 'code', code: complexFormatFunction.toString() }, '${v3} ${v1}'], {
        v1: 'one',
        v2: 'two',
        v3: 'three'
    }), [ 'one two', 'three', 'three one'  ]);

    const [pic, rdl, bad] = formatter.format([
        { type: 'picture', url: '${v1}'},
        { type: 'rdl', webCallback: '${v1}', displayTitle: '${v2}' },
        { type: 'bad' }
    ], {
        v1: 'one',
        v2: 'two',
        v3: 'three'
    });
    assert.strictEqual(bad, undefined);
    assert.strictEqual(JSON.stringify(pic), '{"type":"picture","url":"one"}');
    assert.strictEqual(JSON.stringify(rdl), '{"type":"rdl","callback":"one","webCallback":"one","displayTitle":"two"}');

    const [rdl2] = formatter.format([
        { type: 'rdl', webCallback: '${v1}', displayTitle: '${v4}', displayText: '${v3}' }
    ], {
        v1: 'one',
        v2: 'two',
        v3: 'three'
    });
    assert.strictEqual(JSON.stringify(rdl2), '{"type":"rdl","callback":"one","webCallback":"one","displayTitle":"three"}');

    const [rdl3] = formatter.format([
        { type: 'rdl', callback: '${v1}', displayTitle: '${v4}', displayText: '${v3}' }
    ], {
        v1: 'one',
        v2: 'two',
        v3: 'three'
    });
    assert.strictEqual(JSON.stringify(rdl3), '{"type":"rdl","callback":"one","webCallback":"one","displayTitle":"three"}');

    const [rdl4] = formatter.format([
        { type: 'rdl', callback: '${v1}?foo', webCallback: '${v1}', displayTitle: '${v4}', displayText: '${v3}' }
    ], {
        v1: 'one',
        v2: 'two',
        v3: 'three'
    });
    assert.strictEqual(JSON.stringify(rdl4), '{"type":"rdl","callback":"one?foo","webCallback":"one","displayTitle":"three"}');

    assert.deepStrictEqual(formatter.format([
        { type: 'picture', url: '${v4}'},
        { type: 'rdl', webCallback: '${v4}', displayTitle: '${v2}' }
    ], {
        v1: 'one',
        v2: 'two',
        v3: 'three'
    }), []);

    assert.strictEqual(formatter.format([
        { type: 'picture', url: '${v1}'},
        { type: 'rdl', webCallback: '${v1}', displayTitle: '${v2}' },
        { type: 'bad' }
    ], {
        v1: 'one',
        v2: 'two',
        v3: 'three'
    }, 'string'), 'Picture: one\nLink: two <one>');

    const fakeGettext = {
        dgettext(domain, x) {
            if (x === 'Picture: %s')
                return 'Pacture: %s';
            else
                return x;
        }
    };
    I18n.init('en-Fake', fakeGettext);
    const formatter2 = new Formatter('en-Fake', 'America/Los_Angeles', schemaRetriever, fakeGettext);

    assert.strictEqual(formatter2.format([
        { type: 'picture', url: '${v1}'},
        { type: 'rdl', webCallback: '${v1}', displayTitle: '${v2}' },
    ], {
        v1: 'one',
        v2: 'two',
        v3: 'three'
    }, 'string'), 'Pacture: one\nLink: two <one>');

    const [map1, map2, map3, sound, media] = formatter.format([
        { type: 'map', lat: '${v1}', lon: '${v2}' },
        { type: 'map', lat: '${v4:lat}', lon: '${v4:lon}' },
        { type: 'map', lat: '${v5:lat}', lon: '${v5:lon}' },
        { type: 'sound', name: 'message-new-instant' },
        { type: 'media', url: '${v3}?y=${v1}&x=${v2}' }
    ], {
        v1: '1.0',
        v2: '2.0',
        v3: 'three',
        v4: { x: 11, y: 47 },
        v5: { x: 11, y: 47, display:"Somewhere" }
    });

    assert.strictEqual(JSON.stringify(map1), '{"type":"map","lat":1,"lon":2}');
    assert.strictEqual(JSON.stringify(map2), '{"type":"map","lat":47,"lon":11}');
    assert.strictEqual(JSON.stringify(map3), '{"type":"map","lat":47,"lon":11}');
    assert.strictEqual(JSON.stringify(sound), '{"type":"sound","name":"message-new-instant"}');
    assert.strictEqual(JSON.stringify(media), '{"type":"media","url":"three?y=1.0&x=2.0"}');

    assert.strictEqual(formatter.format([
        { type: 'map', lat: '${v1}', lon: '${v2}' },
        { type: 'sound', name: 'message-new-instant' },
        { type: 'media', url: '${v3}?y=${v1}&x=${v2}' }
    ], {
        v1: '1.0',
        v2: '2.0',
        v3: 'three'
    }, 'string'), 'Location: [Latitude: 1.000 deg, Longitude: 2.000 deg]\nSound effect: message-new-instant\nMedia: three?y=1.0&x=2.0');

    assert.strictEqual(formatter.format([
        { type: 'map', lat: '${v1}', lon: '${v2}', display: 'foo' },
        { type: 'sound', name: 'message-new-instant' },
        { type: 'media', url: '${v3}?y=${v1}&x=${v2}' }
    ], {
        v1: '1.0',
        v2: '2.0',
        v3: 'three'
    }, 'string'), 'Location: foo\nSound effect: message-new-instant\nMedia: three?y=1.0&x=2.0');
}
module.exports = main;
if (!module.parent)
    main();
