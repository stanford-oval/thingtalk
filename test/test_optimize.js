// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');
const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    [
        `now => [text] of (@com.twitter.home_timeline()) => @com.twitter.post(status=text);`,
        `now => @com.twitter.home_timeline() => @com.twitter.post(status=text);`
    ],
    [
        `now => ([text] of @com.twitter.home_timeline()), text =~ "lol" => notify;`,
        `now => [text] of ((@com.twitter.home_timeline()), text =~ "lol") => notify;`
    ],
    [
        `now => ([text] of @com.twitter.home_timeline()), text =~ "lol" => @com.twitter.post(status=text);`,
        `now => (@com.twitter.home_timeline()), text =~ "lol" => @com.twitter.post(status=text);`
    ],
    [
        `monitor ([text] of (@com.twitter.home_timeline())) => @com.twitter.post(status=text);`,
        `monitor (@com.twitter.home_timeline()) on new [text] => @com.twitter.post(status=text);`
    ],
    [
        `monitor (([text] of @com.twitter.home_timeline()), text =~ "lol") => notify;`,
        `[text] of (monitor ((@com.twitter.home_timeline()), text =~ "lol") on new [text]) => notify;`
    ],
    [
        `monitor (([text] of @com.twitter.home_timeline()), text =~ "lol") => @com.twitter.post(status=text);`,
        `monitor ((@com.twitter.home_timeline()), text =~ "lol") on new [text] => @com.twitter.post(status=text);`
    ],
    [
        `now => [count] of aggregate count of (@com.twitter.home_timeline()) => notify;`,
        `now => aggregate count of (@com.twitter.home_timeline()) => notify;`
    ],

    [
        `now => result(@com.thecatapi.get[-1]) => notify;`,
        `now => result(@com.thecatapi.get) => notify;`
    ],

    [
        `now => [text] of [text, author] of @com.twitter.home_timeline() => notify;`,
        `now => [text] of (@com.twitter.home_timeline()) => notify;`,
    ],

    [
        `now => [text] of (([text, author] of @com.twitter.home_timeline()), text =~ "lol") => notify;`,
        `now => [text] of ((@com.twitter.home_timeline()), text =~ "lol") => notify;`
    ],

    [
        `monitor ([text, author] of @com.twitter.home_timeline()) => notify;`,
        `[text, author] of (monitor (@com.twitter.home_timeline()) on new [text, author]) => notify;`
    ],

    [
        `monitor ([text, author] of @com.twitter.home_timeline()) on new [text] => notify;`,
        `[text, author] of (monitor (@com.twitter.home_timeline()) on new [text]) => notify;`
    ],

    [
        `monitor ([text, author] of @com.twitter.home_timeline()) => @com.twitter.post(status=text);`,
        `monitor (@com.twitter.home_timeline()) on new [text, author] => @com.twitter.post(status=text);`
    ],
];


function test(i) {
    console.log('Test Case #' + (i+1));
    let [testCase, expectedOptimized] = TEST_CASES[i];

    return AppGrammar.parseAndTypecheck(testCase, schemaRetriever).then((prog) => {
        let optimized = prog.prettyprint();
        if (optimized !== expectedOptimized) {
            console.error('Test Case #' + (i+1) + ': optimized program does not match what expected');
            console.error('Expected: ' + expectedOptimized);
            console.error('Generated: ' + optimized);
        }
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}


async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}

module.exports = main;
if (!module.parent)
    main();
