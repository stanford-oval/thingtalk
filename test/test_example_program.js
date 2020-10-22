// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import * as Grammar from '../lib/syntax_api';
import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

let TEST_CASES = [
    // manually written test cases
    [`dataset @foo { action := @com.twitter.post() #_[utterances=['post']]; }`,
     '@com.twitter.post();'],
    [`dataset @foo { action (p_status : String) := @com.twitter.post(status=p_status) #_[utterances=['post $p_status']]; }`,
     '@com.twitter.post(status=__const_SLOT_0);'],

    [`dataset @foo { query () := @com.bing.web_search() #_[utterances=['bing search']]; }`,
     '@com.bing.web_search();'],
    [`dataset @foo { query (p_query : String) := @com.bing.web_search(query=p_query) #_[utterances=['search $p_query']]; }`,
     '@com.bing.web_search(query=__const_SLOT_0);'],
    [`dataset @foo { query (p_query : String, p_width : Number) := @com.bing.image_search(query=p_query), width >= p_width #_[utterances=['search $p_query pictures with width greater than $p_width']]; }`,
     '@com.bing.image_search(query=__const_SLOT_0) filter width >= __const_SLOT_1;'],

    [`dataset @foo { stream (p_author : Entity(tt:username)) := monitor (@com.twitter.search(), author == p_author) #_[utterances=['monitor tweets from $p_author']]; }`,
     `monitor(@com.twitter.search() filter author == __const_SLOT_0);`],

    [`dataset @foo { program := @com.twitter.post() #_[utterances=['post']]; }`,
     '@com.twitter.post();'],

    ['dataset @foo { action (p_song1 : String, p_song2 : String) := @com.spotify.play_songs(songs=[p_song1, p_song2]); }',
     '@com.spotify.play_songs(songs=[__const_SLOT_0, __const_SLOT_1]);'],

     ['dataset @foo { action (p_name : String) := @light-bulb(name=p_name).set_power(power=enum(on)); }',
     '@light-bulb(name=__const_SLOT_0).set_power(power=enum on);'],
];

function test(i) {
    console.log('Test Case #' + (i+1));
    let [code, expected] = TEST_CASES[i];

    return Grammar.parse(code).typecheck(schemaRetriever, true).then((meta) => {
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

export default async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}
if (!module.parent)
    main();
