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

const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);


const TEST_CASES = [
    ['com.xkcd:get_comic', { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png',
          alt_text: 'some alt text' }, null,
    [ { type: 'rdl',
        callback: undefined,
        webCallback: 'https://xkcd.com/1234/',
        displayTitle: 'Douglas Engelbart (1925-2013)',
        displayText: undefined },
      { type: 'picture',
        url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
      'some alt text' ]
    ],

    ['com.xkcd:get_comic', { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png',
          alt_text: 'some alt text' }, 'string',
    `Link: Douglas Engelbart (1925-2013) <https://xkcd.com/1234/>
Picture: https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png
some alt text`,
    ],

    ['org.thingpedia.weather:current',
        { location: new builtin.Location(37, -113, "Somewhere"),
          temperature: 21,
          wind_speed: 5,
          humidity: 60,
          cloudiness: 0,
          fog: 0,
          status: 'sunny',
          icon: 'http://example.com/sunny.png'
        }, null,
    [ 'Current weather for Somewhere: sunny, temperature 21.0 C, wind speed 5.0 m/s, humidity 60%, cloudiness 0%, fog 0%.' ]
    ],

    ['org.thingpedia.weather:current',
        { location: new builtin.Location(37, -113, "Somewhere"),
          temperature: 21,
          wind_speed: 5,
          humidity: 60,
          cloudiness: 0,
          fog: 0,
          status: 'sunny',
          icon: 'http://example.com/sunny.png'
        }, 'string',
    'Current weather for Somewhere: sunny, temperature 21.0 C, wind speed 5.0 m/s, humidity 60%, cloudiness 0%, fog 0%.'
    ],

    ['org.thingpedia.weather:current',
        { location: new builtin.Location(37, -113),
          temperature: 21,
          wind_speed: 5,
          humidity: 60,
          cloudiness: 0,
          fog: 0,
          status: 'sunny',
          icon: 'http://example.com/sunny.png'
        }, 'string',
    'Current weather for [Latitude: 37.000 deg, Longitude: -113.000 deg]: sunny, temperature 21.0 C, wind speed 5.0 m/s, humidity 60%, cloudiness 0%, fog 0%.'
    ],


    ['com.nest.security_camera:current_event', {
        start_time: new Date(2018, 4, 24, 11, 4, 0),
        has_person: false,
        has_motion: false,
        has_sound: false,
        picture_url: 'http://example.com/security-camera.jpg'
    }, null,
    [ 'Something detected on your camera at 5/24/2018, 11:04:00 AM',
      { type: 'picture',
        url: 'http://example.com/security-camera.jpg' } ]
    ],

    ['com.nest.security_camera:current_event', {
        start_time: new Date(2018, 4, 24, 11, 4, 0),
        has_person: false,
        has_motion: false,
        has_sound: false,
        picture_url: 'http://example.com/security-camera.jpg'
    }, 'string',
    `Something detected on your camera at 5/24/2018, 11:04:00 AM
Picture: http://example.com/security-camera.jpg`
    ],

    ['com.nest.security_camera:current_event', {
        start_time: new Date(2018, 4, 24, 11, 4, 0),
        has_person: true,
        has_motion: false,
        has_sound: false,
        picture_url: 'http://example.com/security-camera.jpg'
    }, null,
    [ 'Person detected on your camera at 5/24/2018, 11:04:00 AM',
      { type: 'picture',
        url: 'http://example.com/security-camera.jpg' } ]
    ],

    ['com.nest.security_camera:current_event', {
        start_time: new Date(2018, 4, 24, 11, 4, 0),
        has_person: true,
        has_motion: true,
        has_sound: false,
        picture_url: 'http://example.com/security-camera.jpg'
    }, null,
    [ 'Person detected on your camera at 5/24/2018, 11:04:00 AM',
      { type: 'picture',
        url: 'http://example.com/security-camera.jpg' } ]
    ],

    ['com.nest.security_camera:current_event', {
        start_time: new Date(2018, 4, 24, 11, 4, 0),
        has_person: false,
        has_motion: true,
        has_sound: false,
        picture_url: 'http://example.com/security-camera.jpg'
    }, null,
    [ 'Motion detected on your camera at 5/24/2018, 11:04:00 AM',
      { type: 'picture',
        url: 'http://example.com/security-camera.jpg' } ]
    ],

    ['com.nest.security_camera:current_event', {
        start_time: new Date(2018, 4, 24, 11, 4, 0),
        has_person: false,
        has_motion: false,
        has_sound: true,
        picture_url: 'http://example.com/security-camera.jpg'
    }, null,
    [ 'Sound detected on your camera at 5/24/2018, 11:04:00 AM',
      { type: 'picture',
        url: 'http://example.com/security-camera.jpg' } ]
    ],

    ['org.thingpedia.builtin.thingengine.builtin:get_time',
      {time: new Date(2018, 4, 24, 11, 4, 0) }, null,
    [ 'Current time is 11:04:00 AM PDT.' ]
    ],

    ['org.thingpedia.builtin.thingengine.builtin:get_date',
      {date: new Date(2018, 4, 24, 11, 4, 0) }, null,
    [ 'Today is Thursday, May 24, 2018.' ]
    ],

    [`count(com.bing:web_search)`, {
        count: 7,
    }, null,
    [ 'I found 7 results.' ]
    ],

    [`count(com.bing:web_search)`, {
        title: 7,
    }, null,
    [ 'I found 7 distinct values of title.' ]
    ],

    [`max(com.google.drive:list_drive_files)`, {
        file_size: 7,
    }, null,
    [ 'The maximum file size is 7.' ]
    ],

    [`min(com.google.drive:list_drive_files)`, {
        file_size: 7,
    }, null,
    [ 'The minimum file size is 7.' ]
    ],

    [`avg(com.google.drive:list_drive_files)`, {
        file_size: 7,
    }, null,
    [ 'The average file size is 7.' ]
    ],

    [`sum(com.google.drive:list_drive_files)`, {
        file_size: 7,
    }, null,
    [ 'The total file size is 7.' ]
    ],

    ['com.wikicfp:search', {
        start: new Date('TBD'),
        end: new Date('TBD'),
        deadline: new Date(2019, 2,4 ),
        link: 'http://www.abc.com',
        name: 'Some Computer Conference',
        abbr: 'SCC',
        city: 'North Pole'
    }, null,
    [ { type: 'rdl',
        callback: undefined,
        webCallback: 'http://www.abc.com',
        displayTitle: 'Some Computer Conference (SCC)',
        displayText: 'Where: North Pole,\nWhen: N/A - N/A,\nDeadline: Monday, March 4, 2019.' } ]
    ],

    ['org.thingpedia.weather:current',
        { location: undefined,
            temperature: undefined,
            wind_speed: undefined,
            humidity: undefined,
            cloudiness: undefined,
            fog: undefined,
            status: undefined,
            icon: 'http://example.com/sunny.png'
        }, null,
        [ '' ]
    ]
];

const gettext = {
    locale: 'en-US',
    dgettext: (domain, msgid) => msgid
};

const formatter = new Formatter('en-US', 'America/Los_Angeles', schemaRetriever, gettext);

function test(i) {
    console.log('Test Case #' + (i+1));

    let [outputType, outputValues, hint, expected] = TEST_CASES[i];

    return Q.try(() => {
        return formatter.formatForType(outputType, outputValues, hint).then((generated) => {
            try {
                assert.deepStrictEqual(generated, expected);
            } catch(e) {
                console.log(generated);
                throw e;
            }
        });
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return Q(test(i)).then(() => loop(i+1));
}
function main() {
    return loop(0);
}
module.exports = main;
if (!module.parent)
    main();
