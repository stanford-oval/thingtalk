// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
    [`monitor ( @com.xkcd . get_comic ( ) ) ;`, {}],

    [`@com.twitter . post ( status = QUOTED_STRING_0 ) ;`,
     { 'QUOTED_STRING_0': 'hello' }],

    [`@com.twitter . post ( status = "" ) ;`, {}],

    [`@com.xkcd . get_comic ( number = NUMBER_0 ) ;`,
     { 'NUMBER_0': 1234 }],

    [`@com.xkcd . get_comic ( number = NUMBER_0 ) => @com.twitter . post ( status = title ) ;`,
     { 'NUMBER_0': 1234 }],

    [`@org.thingpedia.builtin.thingengine.builtin . get_random_between ( high = NUMBER_0 , low = NUMBER_1 ) => @com.xkcd . get_comic ( number = random ) ;`,
     { 'NUMBER_0': 55, 'NUMBER_1': 1024 }],

    [`timer ( base = $now , interval = DURATION_0 ) => @org.thingpedia.builtin.thingengine.builtin . get_random_between ( high = NUMBER_0 , low = NUMBER_1 ) => @com.xkcd . get_comic ( number = random ) ;`,
    { 'NUMBER_0': 55, 'NUMBER_1': 1024, DURATION_0: { value: 24, unit: 'h' } }],

    [`timer ( base = $now , interval = DURATION_0 ) => @org.thingpedia.builtin.thingengine.builtin . get_random_between ( high = NUMBER_0 , low = NUMBER_1 ) => @com.xkcd . get_comic ( number = random ) ;`,
     { 'NUMBER_0': 55, 'NUMBER_1': 1024, DURATION_0: { value: 24, unit: 'h' } }],

    [`@org.thingpedia.builtin.thingengine.builtin . get_random_between ( high = NUMBER_0 , low = NUMBER_1 ) ;`,
    { 'NUMBER_0': 55, 'NUMBER_1': 1024 }],

    [`@org.thingpedia.builtin.thingengine.builtin . get_random_between ( high = NUMBER_0 , low = NUMBER_1 ) ;`,
    { 'NUMBER_0': 1024, 'NUMBER_1': 55 }],

    [`monitor ( @thermostat . get_temperature ( ) ) ;`, {}],

    [`monitor ( @thermostat . get_temperature ( ) filter value >= MEASURE_C_0 ) ;`,
     { 'MEASURE_C_0': { unit: 'F', value: 70 } }],

    [`@com.bing . image_search ( ) filter height >= NUMBER_0 || width >= NUMBER_1 ;`,
    { NUMBER_0: 100, NUMBER_1:200 }],

    [`@com.bing . image_search ( ) filter ( height >= NUMBER_0 || width <= NUMBER_1 ) && width >= NUMBER_2 ;`,
    { NUMBER_0: 100, NUMBER_1:200, NUMBER_2: 500 }],

    [`@com.bing . image_search ( ) filter height >= NUMBER_0 || width >= NUMBER_0 ;`,
    { NUMBER_0: 100 }],

    [`@com.bing . image_search ( ) filter width >= NUMBER_0 ;`,
     { NUMBER_0: 100 }],

    ['monitor ( @com.instagram . get_pictures ( count = NUMBER_0 ) filter in_array ( caption , [ QUOTED_STRING_0 , QUOTED_STRING_1 ] ) ) ;',
    { NUMBER_0: 100, QUOTED_STRING_0: 'abc', QUOTED_STRING_1: 'def' }],

    ['timer ( base = $now , interval = DURATION_0 ) ;',
     { DURATION_0: { value: 24, unit: 'h' } }],

    ['monitor ( @com.phdcomics . get_post ( ) filter ! ( title =~ QUOTED_STRING_0 ) ) ;',
     { QUOTED_STRING_0: 'abc' }],

    ['@com.uber . price_estimate ( end = $location . home , start = $location . work ) filter low_estimate >= CURRENCY_0 ;',
     { CURRENCY_0: { value: 50, unit: 'usd' } }],

    ['@com.nytimes . get_front_page ( ) filter updated >= $now - DURATION_0 ;',
     { DURATION_0: { value: 24, unit: 'h' } }],

    [`#[ executor = USERNAME_0 ] @com.twitter . post ( ) ;`,
     { USERNAME_0: 'bob' }],

    [`$policy { $source == GENERIC_ENTITY_tt:contact_0 : now => @com.twitter . post filter status =~ QUOTED_STRING_0 ; }`,
     { 'GENERIC_ENTITY_tt:contact_0': { value: 'bob', display: 'bob' }, QUOTED_STRING_0: 'foo' }],

    [`@org.thingpedia.weather . sunrise ( date = DATE_0 ) ;`,
     { DATE_0: new Date(2018, 5, 23, 0, 0, 0) }],

    [`@org.thingpedia.weather . sunrise ( date = DATE_0 ) ;`,
     { DATE_0: new Date(2018, 5, 23, 10, 40, 0) }],

    ['@com.bing . web_search ( ) => @com.yandex.translate . translate ( target_language = GENERIC_ENTITY_tt:iso_lang_code_0 , text = $result ) ;',
    { 'GENERIC_ENTITY_tt:iso_lang_code_0': { value: 'it', display: "Italian" } }],

    ['@com.gmail . inbox ( ) [ 1 : NUMBER_0 ] ;',
    { NUMBER_0: 15 }],

    ['@com.gmail . inbox ( ) [ NUMBER_0 : NUMBER_1 ] ;',
    { NUMBER_0: 21, NUMBER_1: 23 }],

    ['@com.gmail . inbox ( ) [ NUMBER_0 , NUMBER_1 , NUMBER_2 ] ;',
    { NUMBER_0: 21, NUMBER_1: 28, NUMBER_2: 22 }],

    ['@com.gmail . inbox ( ) [ NUMBER_0 , NUMBER_1 , NUMBER_0 ] ;',
    { NUMBER_0: 22, NUMBER_1: 29 }],

    ['$answer ( LOCATION_0 ) ;',
     { LOCATION_0: { latitude: 0, longitude: 0, display: "North Pole" } }],

    ['$answer ( TIME_0 ) ;',
     { TIME_0: { hour: 18, minute: 0, second: 0 } }],

    ['@com.thecatapi . get ( count = NUMBER_0 ) ;',
     { NUMBER_0: 13 }],

    ['@org.schema.full . Recipe ( ) filter nutrition . fatContent >= MEASURE_kg_0 ;',
     { MEASURE_kg_0: { value: 13, unit: 'kg' } }]
];

async function testCase(test, i) {
    if (test.length !== 2)
        throw new Error('invalid test ' + test[0]);
    let [sequence, entities] = test;

    console.log('Test Case #' + (i+1));
    try {
        sequence = sequence.split(' ');
        let program = Grammar.parse(sequence, Grammar.SyntaxType.Tokenized, entities, {
            timezone: 'America/Los_Angeles'
        });
        await program.typecheck(schemaRetriever);

        const into = {};
        const allocator = new Grammar.SequentialEntityAllocator(into, {
            timezone: 'America/Los_Angeles'
        });
        let reconstructed = Grammar.serialize(program, Grammar.SyntaxType.Tokenized, allocator).join(' ');
        if (reconstructed !== test[0]) {
            console.error('Test Case #' + (i+1) + ' failed (wrong NN syntax)');
            console.error('Expected:', test[0]);
            console.error('Generated:', reconstructed);
            if (process.env.TEST_MODE)
                throw new Error(`testNNSyntax ${i+1} FAILED`);
        }

        assert.deepStrictEqual(into, entities);
    } catch(e) {
        console.error('Test Case #' + (i+1) + ' failed with exception');
        console.error(sequence.join(' '));
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
