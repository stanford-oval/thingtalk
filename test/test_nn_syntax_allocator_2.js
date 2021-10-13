// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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


import assert from 'assert';

import * as Grammar from '../lib/syntax_api';
import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);


const TEST_CASES = [
    [`now => @com.twitter.post ( status = " hello " ) ;`,
     { 'QUOTED_STRING_0': 'hello' },
     `now => @com.twitter.post ( status = " world " ) ;`,
     { 'QUOTED_STRING_0': 'hello', 'QUOTED_STRING_1': 'world' }
    ],

    [`now => @org.thingpedia.weather.current ( location = new Location ( " stanford california " ) ) => notify ;`,
     { 'LOCATION_0': { display: 'stanford california', latitude: NaN, longitude: NaN } },
     `now => @org.thingpedia.weather.current ( location = new Location ( " palo alto california " ) ) => notify ;`,
     {
         'LOCATION_0': { display: 'stanford california', latitude: NaN, longitude: NaN },
         'LOCATION_1': { display: 'palo alto california', latitude: NaN, longitude: NaN },
     },
    ],

    [`now => @org.thingpedia.weather.current ( location = new Location ( 37.442156 , -122.1634471 , " palo alto " ) ) => notify ;`,
     {
         'LOCATION_0': { display: 'palo alto', latitude: 37.442156, longitude: -122.1634471 }
     },
     `now => @org.thingpedia.weather.current ( location = new Location ( 37.445523 , -122.1607073261 ) ) => notify ;`,
     {
         'LOCATION_0': { display: 'palo alto', latitude: 37.442156, longitude: -122.1634471 },
         'LOCATION_1': { display: null, latitude: 37.445523, longitude: -122.1607073261 },
     },
    ],

    [`now => @org.thingpedia.weather.current ( location = new Location ( " stanford california " ) ) => notify ;`,
     { 'LOCATION_0': { display: 'stanford california', latitude: NaN, longitude: NaN } },
     `now => @org.thingpedia.weather.current ( location = new Location ( " stanford california " ) ) => notify ;`,
     { 'LOCATION_0': { display: 'stanford california', latitude: NaN, longitude: NaN } },
    ],

    [
     `now => @com.cryptonator.get_price ( currency = " btc " ^^tt:cryptocurrency_code ) => notify ;`,
     { 'GENERIC_ENTITY_tt:cryptocurrency_code_0': { value: 'btc', display: null } },
     `now => @com.cryptonator.get_price ( currency = " btc " ^^tt:cryptocurrency_code ) => notify ;`,
     { 'GENERIC_ENTITY_tt:cryptocurrency_code_0': { value: 'btc', display: null } }
    ],

    [
     `now => @com.cryptonator.get_price ( currency = " btc " ^^tt:cryptocurrency_code ) => notify ;`,
     { 'GENERIC_ENTITY_tt:cryptocurrency_code_0': { value: 'btc', display: null } },
     `now => @com.cryptonator.get_price ( currency = " eth " ^^tt:cryptocurrency_code ) => notify ;`,
     { 'GENERIC_ENTITY_tt:cryptocurrency_code_0': { value: 'btc', display: null }, 'GENERIC_ENTITY_tt:cryptocurrency_code_1': { value: 'eth', display: null } }
    ],

    [
     `now => @com.cryptonator.get_price ( currency = null ^^tt:cryptocurrency_code ( " btc " ) ) => notify ;`,
     { 'GENERIC_ENTITY_tt:cryptocurrency_code_0': { display: 'btc', value: null } },
     `now => @com.cryptonator.get_price ( currency = null ^^tt:cryptocurrency_code ( " btc " ) ) => notify ;`,
     { 'GENERIC_ENTITY_tt:cryptocurrency_code_0': { display: 'btc', value: null } }
    ],

    [
     `now => @com.cryptonator.get_price ( currency = null ^^tt:cryptocurrency_code ( " btc " ) ) => notify ;`,
     { 'GENERIC_ENTITY_tt:cryptocurrency_code_0': { display: 'btc', value: null } },
     `now => @com.cryptonator.get_price ( currency = null ^^tt:cryptocurrency_code ( " eth " ) ) => notify ;`,
     { 'GENERIC_ENTITY_tt:cryptocurrency_code_0': { display: 'btc', value: null }, 'GENERIC_ENTITY_tt:cryptocurrency_code_1': { display: 'eth', value: null } }
    ],
];

async function testCase(test, i) {
    if (test.length !== 4)
        throw new Error('invalid test ' + test[0]);
    let [sequence1, entities1, sequence2, entities2] = test;

    console.log('Test Case #' + (i+1));
    try {
        let program1 = Grammar.parse(sequence1.split(' '), Grammar.SyntaxType.Tokenized, {}, {
            timezone: 'America/Los_Angeles'
        });
        await program1.typecheck(schemaRetriever);

        const into = {};
        const allocator1 = new Grammar.SequentialEntityAllocator(into, {
            timezone: 'America/Los_Angeles'
        });
        Grammar.serialize(program1, Grammar.SyntaxType.Tokenized, allocator1).join(' ');
        assert.deepStrictEqual(into, entities1);

        const allocator2 = new Grammar.SequentialEntityAllocator(into, {
            timezone: 'America/Los_Angeles'
        });
        const program2 = Grammar.parse(sequence2.split(' '), Grammar.SyntaxType.Tokenized, {});
        await program2.typecheck(schemaRetriever);
        Grammar.serialize(program2, Grammar.SyntaxType.Tokenized, allocator2).join(' ');
        assert.deepStrictEqual(into, entities2);
    } catch(e) {
        console.error('Test Case #' + (i+1) + ' failed with exception');
        console.error(sequence1);
        console.error(e);
        if (process.env.TEST_MODE)
            throw e;
    }
}

export default async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await testCase(TEST_CASES[i], i);
}
if (!module.parent)
    main();
