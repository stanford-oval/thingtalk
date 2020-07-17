// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const applyCompatibility = require('../lib/nn-syntax/compat'); //(locale, results, entities, thingtalk_version)

const TEST_CASES = [
    [
    '1.9.0-beta.1', {},
    'now => @light-bulb.set_power attribute:name:String = " kitchen " param:power:Enum(on,off) = enum:off',
    'now => @light-bulb.set_power attribute:name:String = " kitchen " param:power:Enum(on,off) = enum:off',
    ],

    [
    '1.9.0-beta.1', {},
    'now => @light-bulb.set_power attribute:name:String = " kitchen ceiling " param:power:Enum(on,off) = enum:off',
    'now => @light-bulb.set_power attribute:name:String = " kitchen ceiling " param:power:Enum(on,off) = enum:off',
    ],

    [
    '1.9.0-beta.1', {},
    'now => @light-bulb.set_power attribute:name:String = context:selection:String param:power:Enum(on,off) = enum:off',
    'now => @light-bulb.set_power attribute:name:String = context:selection:String param:power:Enum(on,off) = enum:off',
    ],

    [
    '1.9.0', {},
    'now => @light-bulb.set_power attribute:name:String = " kitchen " param:power:Enum(on,off) = enum:off',
    'now => @light-bulb.set_power attribute:name:String = " kitchen " param:power:Enum(on,off) = enum:off',
    ],

    [
    '1.9.0', {},
    'now => @light-bulb.set_power attribute:name:String = context:selection:String param:power:Enum(on,off) = enum:off',
    'now => @light-bulb.set_power attribute:name:String = context:selection:String param:power:Enum(on,off) = enum:off',
    ],

    [
    '1.8.0', {},
    'now => @light-bulb.set_power attribute:name:String = " kitchen " param:power:Enum(on,off) = enum:off',
    'now => @light-bulb.set_power param:power:Enum(on,off) = enum:off',
    ],

    [
    '1.8.0', {},
    'now => @light-bulb.set_power attribute:name:String = " kitchen ceiling " param:power:Enum(on,off) = enum:off',
    'now => @light-bulb.set_power param:power:Enum(on,off) = enum:off',
    ],

    [
    '1.8.99', {},
    'now => @light-bulb.set_power attribute:name:String = " kitchen " param:power:Enum(on,off) = enum:off',
    'now => @light-bulb.set_power param:power:Enum(on,off) = enum:off',
    ],

    [
    '1.8.99', {},
    'now => @light-bulb.set_power attribute:name:String = context:selection:String param:power:Enum(on,off) = enum:off',
    'now => @light-bulb.set_power param:power:Enum(on,off) = enum:off',
    ],

    [
    '1.9.2', {},
    'edge (monitor (@org.thingpedia.weather.current)) on temperature >= 5 unit:defaultTemperature => notify;',
    'edge (monitor (@org.thingpedia.weather.current)) on temperature >= 5 unit:F => notify;'
    ],

    [
    '1.9.2', {},
    'now => (@org.thingpedia.weather.current), temperature >= 10 unit:defaultTemperature => notify;',
    'now => (@org.thingpedia.weather.current), temperature >= 10 unit:F => notify;'
    ],
];

async function test(i) {
    console.log(`Test Case #${i+1}`);
    const [version, entities, code, expected] = TEST_CASES[i];

    const results = [code.split(' ')];
    applyCompatibility('en-US', results, entities, version);

    assert.strictEqual(results[0].join(' '), expected);
}

async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}
module.exports = main;
if (!module.parent)
    main();
