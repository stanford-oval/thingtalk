// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
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

import assert from 'assert';
import * as fs from 'fs';

import * as AppGrammar from '../lib/syntax_api';
import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
import _mockMemoryClient from './mock_memory_client';

const _schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

export default async function main() {
    const tests = fs.readFileSync('./test/test_syntax.tt').toString('utf8').split('====');

    for (let i = 0; i < tests.length; i++) {
        console.log('# Test Case ' + (i+1));
        const code = tests[i].trim();

        let program;
        try {
            program = await AppGrammar.parse(code).typecheck(_schemaRetriever);
        } catch(e) {
            if (code.indexOf(`** expect ${e.name} **`) >= 0)
                continue;
            console.error('Failed');
            console.error(code);
            console.error(e);
            if (process.env.TEST_MODE)
                throw e;
            continue;
        }

        if (code.indexOf(`** expect `) >= 0) {
            console.error('Failed (expected error)');
            console.error(code);
            if (process.env.TEST_MODE)
                assert.fail('Failed (expected error)');
            continue;
        }

        try {
            Array.from(program.iterateSlots());
        } catch(e) {
            console.error('Iterate slots failed');
            console.log('Code:');
            console.log(code);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }

        try {
            Array.from(program.iterateSlots2());
        } catch(e) {
            console.error('Iterate slots failed');
            console.log('Code:');
            console.log(code);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }
    }
}
if (!module.parent)
    main();
