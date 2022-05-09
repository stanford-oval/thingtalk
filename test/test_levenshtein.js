// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2022 The Board of Trustees of the Leland Stanford Junior University
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

import * as AppGrammar from '../lib/syntax_api';

const TEST_CASES = [
    [
        "@org.wikidata.city();", 
        "$add_filter @org.wikidata.city:population <= 10000;", 
        "@org.wikidata.city() filter population <= 10000;"
    ],
    [
        "[id] of @org.wikidata.city();", 
        "$add_filter @org.wikidata.city:population <= 10000;", 
        "[id] of @org.wikidata.city() filter population <= 10000;"
    ],
    [
        "sort(population desc of @org.wikidata.city())[1];", 
        "$add_filter @org.wikidata.city:population <= 10000;", 
        "sort(population desc of (@org.wikidata.city() filter population <= 10000))[1];"
    ]
];

async function test(i) {
    console.log('Test Case #' + (i+1));
    let [oldProgram, levenshtein, newProgram] = TEST_CASES[i];

    try {
        const prog = AppGrammar.parse(oldProgram);
        const delta = AppGrammar.parse(levenshtein);
        const expected = AppGrammar.parse(newProgram);
        const generated = delta.apply(prog);

        if (generated.prettyprint() !== expected.prettyprint()) {
            console.error('Test Case #' + (i+1) + ': failed');
            console.error('Expected: ' + expected.prettyprint());
            console.error('Generated: ' + generated.prettyprint());
            if (process.env.TEST_MODE)
                throw new Error(`testLevenshtein ${i+1} FAILED`);
        }
    } catch(e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e);
        if (process.env.TEST_MODE)
            throw e;
    }
}

export default async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}
if (!module.parent)
    main();

