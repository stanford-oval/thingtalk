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

const Q = require('q');
Q.longStackSupport = true;
const Grammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

var TEST_CASES = [
    // manually written test cases
    [`dataset foo { action := @com.twitter.post() #_[utterances=['post']]; }`,
     'now => @com.twitter.post(status=$?);'],
    [`dataset foo { action (p_status : String) := @com.twitter.post(status=p_status) #_[utterances=['post $p_status']]; }`,
     'now => @com.twitter.post(status=__const_SLOT_0);'],

    [`dataset foo { query () := @com.bing.web_search() #_[utterances=['bing search']]; }`,
     'now => @com.bing.web_search(query=$?) => notify;'],
    [`dataset foo { query (p_query : String) := @com.bing.web_search(query=p_query) #_[utterances=['search $p_query']]; }`,
     'now => @com.bing.web_search(query=__const_SLOT_0) => notify;'],
    [`dataset foo { query (p_query : String, p_width : Number) := @com.bing.image_search(query=p_query), width >= p_width #_[utterances=['search $p_query pictures with width greater than $p_width']]; }`,
     'now => (@com.bing.image_search(query=__const_SLOT_0)), width >= __const_SLOT_1 => notify;'],

    [`dataset foo { stream (p_author : Entity(tt:username)) := monitor (@com.twitter.search()), author == p_author #_[utterances=['monitor tweets from $p_author']]; }`,
     `monitor (@com.twitter.search()), author == __const_SLOT_0 => notify;`],

    [`dataset foo { program := { now => @com.twitter.post(); } #_[utterances=['post']]; }`,
     'now => @com.twitter.post(status=$?);'],

    ['dataset foo { action (p_song1 : String, p_song2 : String) := @com.spotify.play_songs(songs=[p_song1, p_song2]); }',
     'now => @com.spotify.play_songs(songs=[__const_SLOT_0, __const_SLOT_1]);'],
];

function test(i) {
    console.log('Test Case #' + (i+1));
    var [code, expected] = TEST_CASES[i];

    return Grammar.parseAndTypecheck(code, schemaRetriever, true).then((meta) => {
        let dataset = meta.datasets[0];
        let program = dataset.examples[0].toProgram();
        let tt = program.prettyprint(true);

        if (expected !== tt) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + expected);
            console.error('Generated: ' + tt);
            if (process.env.TEST_MODE)
                throw new Error(`testDeclarationProgram ${i+1} FAILED`);
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
    return loop(0);
}
module.exports = main;
if (!module.parent)
    main();
