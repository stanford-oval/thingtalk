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
"use strict";

const assert = require('assert');
const Ast = require('../lib/ast');
const NNSyntax = require('../lib/nn-syntax');
//const NNOutputParser = require('../lib/nn_output_parser');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);


const TEST_CASES = [
    [`now => @com.twitter.post param:status:String = " hello "`,
     {'QUOTED_STRING_0': 'hello'},
     `now => @com.twitter.post param:status:String = " world "`,
     {'QUOTED_STRING_0': 'hello', 'QUOTED_STRING_1': 'world'}
    ],

    [`now => @org.thingpedia.weather.current param:location:Location = location: " stanford california " => notify`,
     {'LOCATION_0': { display: 'stanford california', latitude: NaN, longitude: NaN }},
     `now => @org.thingpedia.weather.current param:location:Location = location: " palo alto california " => notify`,
     {
         'LOCATION_0': { display: 'stanford california', latitude: NaN, longitude: NaN },
         'LOCATION_1': { display: 'palo alto california', latitude: NaN, longitude: NaN },
     },
    ],

    [`now => @org.thingpedia.weather.current param:location:Location = location: " stanford california " => notify`,
     {'LOCATION_0': { display: 'stanford california', latitude: NaN, longitude: NaN }},
     `now => @org.thingpedia.weather.current param:location:Location = location: " stanford california " => notify`,
     {'LOCATION_0': { display: 'stanford california', latitude: NaN, longitude: NaN }},
    ],

    [
     `now => @com.cryptonator.get_price param:currency:Entity(tt:cryptocurrency_code) = " btc " ^^tt:cryptocurrency_code => notify`,
     {'GENERIC_ENTITY_tt:cryptocurrency_code_0': { display: 'btc', value: null }},
     `now => @com.cryptonator.get_price param:currency:Entity(tt:cryptocurrency_code) = " btc " ^^tt:cryptocurrency_code => notify`,
     {'GENERIC_ENTITY_tt:cryptocurrency_code_0': { display: 'btc', value: null }}
    ],

    [
     `now => @com.cryptonator.get_price param:currency:Entity(tt:cryptocurrency_code) = " btc " ^^tt:cryptocurrency_code => notify`,
     {'GENERIC_ENTITY_tt:cryptocurrency_code_0': { display: 'btc', value: null }},
     `now => @com.cryptonator.get_price param:currency:Entity(tt:cryptocurrency_code) = " eth " ^^tt:cryptocurrency_code => notify`,
     {'GENERIC_ENTITY_tt:cryptocurrency_code_0': { display: 'btc', value: null }, 'GENERIC_ENTITY_tt:cryptocurrency_code_1': { display: 'eth', value: null }}
    ],
];

async function testCase(test, i) {
    if (test.length !== 4)
        throw new Error('invalid test ' + test[0]);
    let [sequence1, entities1, sequence2, entities2] = test;

    console.log('Test Case #' + (i+1));
    try {
        let program1 = NNSyntax.fromNN(sequence1.split(' '), {});
        await program1.typecheck(schemaRetriever);

        const into = {};
        NNSyntax.toNN(program1, '', into, { allocateEntities: true }).join(' ');
        assert.deepStrictEqual(into, entities1);

        let program2 = NNSyntax.fromNN(sequence2.split(' '), {});
        await program2.typecheck(schemaRetriever);
        NNSyntax.toNN(program2, '', into, { allocateEntities: true }).join(' ');
        assert.deepStrictEqual(into, entities2);
    } catch (e) {
        console.error('Test Case #' + (i+1) + ' failed with exception');
        console.error(sequence1);
        console.error(e);
        if (process.env.TEST_MODE)
            throw e;
    }
}

async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await testCase(TEST_CASES[i], i);
}
module.exports = main;
if (!module.parent)
    main();
