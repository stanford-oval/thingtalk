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

import * as NNSyntax from '../lib/nn-syntax';
//const NNOutputParser = require('../lib/nn_output_parser');
import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

/*class SimpleSequenceLexer {
    constructor(sequence) {
        this._sequence = sequence;
        this._i = 0;
    }

    next() {
        if (this._i >= this._sequence.length)
            return { done: true };

        let next = this._sequence[this._i++];
        if (/^[A-Z]/.test(next)) {
            // entity
            next = next.substring(0, next.lastIndexOf('_'));
        } else if (next.startsWith('@')) {
            next = 'FUNCTION';
        } else if (next.startsWith('enum:')) {
            next = 'ENUM';
        } else if (next.startsWith('param:')) {
            next = 'PARAM_NAME';
        } else if (next.startsWith('unit:')) {
            next = 'UNIT';
        }
        return { done: false, value: next };
    }
}*/

const TEST_CASES = [
    [`monitor ( @com.xkcd.get_comic ) => notify`, {}],

    [`now => @com.twitter.post param:status:String = QUOTED_STRING_0`,
     {'QUOTED_STRING_0': 'hello'}],

    [`now => @com.twitter.post param:status:String = ""`, {}],

    [`now => @com.xkcd.get_comic param:number:Number = NUMBER_0 => notify`,
     {'NUMBER_0': 1234}],

    [`now => @com.xkcd.get_comic param:number:Number = NUMBER_0 => @com.twitter.post on param:status:String = param:title:String`,
     {'NUMBER_0': 1234}],

    [`now => ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_0 param:low:Number = NUMBER_1 ) join ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number => notify`,
     {'NUMBER_0': 55, 'NUMBER_1': 1024}],

    [`( ( timer base = now , interval = DURATION_0 ) => ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_0 param:low:Number = NUMBER_1 ) ) => ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number => notify`,
    {'NUMBER_0': 55, 'NUMBER_1': 1024, DURATION_0: { value: 24, unit: 'h'}}],

    [`( timer base = now , interval = DURATION_0 ) => ( ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_0 param:low:Number = NUMBER_1 ) join ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number ) => notify`,
     {'NUMBER_0': 55, 'NUMBER_1': 1024, DURATION_0: { value: 24, unit: 'h'}}],

    [`now => @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_0 param:low:Number = NUMBER_1 => notify`,
    {'NUMBER_0': 55, 'NUMBER_1': 1024}],

    [`now => @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_0 param:low:Number = NUMBER_1 => notify`,
    {'NUMBER_0': 1024, 'NUMBER_1': 55}],

    [`monitor ( @thermostat.get_temperature ) => notify`, {}],

    [`monitor ( ( @thermostat.get_temperature ) filter param:value:Measure(C) >= MEASURE_C_0 ) => notify`,
     {'MEASURE_C_0': { unit: 'F', value: 70 }}],

    [`now => ( @com.bing.image_search ) filter param:width:Number >= NUMBER_0 or param:height:Number >= NUMBER_1 => notify`,
    { NUMBER_0: 100, NUMBER_1:200 }],

    [`now => ( @com.bing.image_search ) filter param:width:Number <= NUMBER_0 and param:width:Number >= NUMBER_1 or param:height:Number >= NUMBER_2 => notify`,
    {NUMBER_0: 100, NUMBER_1:200, NUMBER_2: 500}],

    [`now => ( @com.bing.image_search ) filter param:width:Number >= NUMBER_0 or param:height:Number >= NUMBER_0 => notify`,
    {NUMBER_0: 100}],

    [`now => ( @com.bing.image_search ) filter param:width:Number >= NUMBER_0 => notify`,
     {NUMBER_0: 100 }],

    ['monitor ( ( @com.instagram.get_pictures param:count:Number = NUMBER_0 ) filter param:caption:String in_array [ QUOTED_STRING_0 , QUOTED_STRING_1 ] ) => notify',
    {NUMBER_0: 100, QUOTED_STRING_0: 'abc', QUOTED_STRING_1: 'def'}],

    ['timer base = now , interval = DURATION_0 => notify',
     {DURATION_0: { value: 24, unit: 'h'}}],

    ['monitor ( ( @com.phdcomics.get_post ) filter not param:title:String =~ QUOTED_STRING_0 ) => notify',
     {QUOTED_STRING_0: 'abc'}],

    ['now => ( @com.uber.price_estimate param:end:Location = location:home param:start:Location = location:work ) filter param:low_estimate:Currency >= CURRENCY_0 => notify',
     {CURRENCY_0: { value: 50, unit: 'usd' } }],

    ['now => ( @com.nytimes.get_front_page ) filter param:updated:Date >= now - DURATION_0 => notify',
     { DURATION_0: { value: 24, unit: 'h' } }],

    [`executor = USERNAME_0 : now => @com.twitter.post`,
     { USERNAME_0: 'bob' }],


    [`policy param:source:Entity(tt:contact) == USERNAME_0 : now => @com.twitter.post filter param:status:String =~ QUOTED_STRING_0`,
     { USERNAME_0: 'bob', QUOTED_STRING_0: 'foo' }],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     { DATE_0: new Date(2018, 5, 23, 0, 0, 0) }],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     { DATE_0: new Date(2018, 5, 23, 10, 40, 0) }],

    ['now => ( @com.bing.web_search ) join ( @com.yandex.translate.translate param:target_language:Entity(tt:iso_lang_code) = GENERIC_ENTITY_tt:iso_lang_code_0 ) on param:text:String = event => notify',
    { 'GENERIC_ENTITY_tt:iso_lang_code_0': { value: 'it', display: "Italian" } }],

    ['now => ( @com.gmail.inbox ) [ 1 : NUMBER_0 ] => notify',
    { NUMBER_0: 15 }],

    ['now => ( @com.gmail.inbox ) [ NUMBER_0 : NUMBER_1 ] => notify',
    { NUMBER_0: 21, NUMBER_1: 23 }],

    ['now => ( @com.gmail.inbox ) [ NUMBER_0 , NUMBER_1 , NUMBER_2 ] => notify',
    { NUMBER_0: 21, NUMBER_1: 28, NUMBER_2: 22 }],

    ['now => ( @com.gmail.inbox ) [ NUMBER_0 , NUMBER_1 , NUMBER_0 ] => notify',
    { NUMBER_0: 22, NUMBER_1: 29 }],

    ['bookkeeping answer LOCATION_0',
     { LOCATION_0: { latitude: 0, longitude: 0, display: "North Pole" } }],

    ['bookkeeping answer TIME_0',
     { TIME_0: { hour: 18, minute: 0, second: 0 } }],

    ['now => @com.thecatapi.get param:count:Number = NUMBER_0 => notify',
     { NUMBER_0: 13 }],

    ['now => ( @org.schema.full.Recipe ) filter param:nutrition.fatContent:Measure(kg) >= MEASURE_kg_0 => notify',
     { MEASURE_kg_0: { value: 13, unit: 'kg' } }]
];

async function testCase(test, i) {
    if (test.length !== 2)
        throw new Error('invalid test ' + test[0]);
    let [sequence, entities] = test;

    console.log('Test Case #' + (i+1));
    try {
        sequence = sequence.split(' ');
        let program = NNSyntax.fromNN(sequence, entities);
        await program.typecheck(schemaRetriever);

        const into = {};
        let reconstructed = NNSyntax.toNN(program, '', into, { allocateEntities: true }).join(' ');
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
