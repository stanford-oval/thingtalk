// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('./polyfill');

const Q = require('q');
Q.longStackSupport = true;
const Describe = require('../lib/describe');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');
const { optimizeProgram } = require('../lib/optimize');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');

var TEST_CASES = [
    // manually written test cases
    ['now => @com.twitter.post(status=$undefined);',
     'tweet ____'],
    ['monitor @com.twitter.home_timeline() => @com.twitter.post(status=text);',
    'tweet the text when tweets from anyone you follow changes'],
    [`monitor @thermostat(principal="foo"^^tt:username).get_temperature(), value >= 70F
     => notify;`,
    'notify you when get the temperature on @foo\'s thermostat changes and the value is greater than or equal to 70 F'],
    ['attimer(time=makeTime(8,30)) => @org.thingpedia.builtin.thingengine.builtin.say(message=$undefined);',
    'send me a message ____ every day at 8:30am'],
    ['attimer(time=makeTime(20,30)) => @org.thingpedia.builtin.thingengine.builtin.say(message=$undefined);',
    'send me a message ____ every day at 8:30pm'],

    [`now => @com.xkcd.get_comic() => notify;`,
    'get get an Xkcd comic and then notify you'],
    [`now => @com.xkcd.get_comic() => return;`,
    'get get an Xkcd comic and then send it to me'],
    [`monitor @com.xkcd.get_comic() => notify;`,
    'notify you when get an Xkcd comic changes'],
    [`monitor @com.xkcd.get_comic() => return;`,
    'send it to me when get an Xkcd comic changes']
];

const schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);
const gettext = {
    dgettext: (domain, msgid) => msgid
};

function test(i) {
    console.log('Test Case #' + (i+1));
    var [code, expected] = TEST_CASES[i];

    return Grammar.parseAndTypecheck(code, schemaRetriever, true).then((prog) => {
        let reconstructed = Describe.describeProgram(gettext, prog);
        if (expected !== reconstructed) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + expected);
            console.error('Generated: ' + reconstructed);
            if (process.env.TEST_MODE)
                throw new Error(`testDescribe ${i+1} FAILED`);
        }
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
    loop(0).done();
}
main();
