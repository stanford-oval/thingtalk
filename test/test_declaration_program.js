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
    ['let action x := @com.twitter.post();',
     'now => @com.twitter.post(status=$?);'],
    [`let action x := \\(p_status : String) -> @com.twitter.post(status=p_status);`,
     'now => @com.twitter.post(status=__const_SLOT_0);'],

    ['let table x := @com.bing.web_search();',
     'now => @com.bing.web_search(query=$?) => notify;'],
    [`let table x := \\(p_query : String) -> @com.bing.web_search(query=p_query);`,
     'now => @com.bing.web_search(query=__const_SLOT_0) => notify;'],
    [`let table x := \\(p_query : String, p_width : Number) -> @com.bing.image_search(query=p_query), width >= p_width;`,
     'now => (@com.bing.image_search(query=__const_SLOT_0)), width >= __const_SLOT_1 => notify;'],

    [`let stream x := \\(p_author : Entity(tt:username)) -> monitor (@com.twitter.search()), author == p_author;`,
     `monitor (@com.twitter.search()), author == __const_SLOT_0 => notify;`],

    ['let action x := \\(p_song1 : String, p_song2 : String) -> @com.spotify.play_songs(songs=[p_song1, p_song2]);',
    'now => @com.spotify.play_songs(songs=[__const_SLOT_0, __const_SLOT_1]);'],
];

function test(i) {
    console.log('Test Case #' + (i+1));
    var [code, expected] = TEST_CASES[i];

    return Grammar.parseAndTypecheck(code, schemaRetriever, true).then((prog) => {
        let program = prog.declarations[0].toProgram();
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
