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

import * as path from 'path';
import { promises as pfs } from 'fs';

import Compiler from '../lib/compiler';
import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
import _mockMemoryClient from './mock_memory_client';
let schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

// eslint-disable-next-line prefer-arrow-callback
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

async function loadTestCases() {
    const testCaseFile = path.resolve(path.dirname(module.filename), './test_compiler.txt');
    const testCases = await pfs.readFile(testCaseFile, { encoding: 'utf8' });

    return testCases.split('\n====\n').map((testCase) => {
        const parts = testCase.split('\n>>>>\n');
        const code = parts[0];
        const expected = parts.slice(1);
        return [code, expected];
    });
}

async function saveTestCases(TEST_CASES) {
    const testCaseFile = path.resolve(path.dirname(module.filename), './test_compiler.txt');

    const buffer = TEST_CASES.map(([code, expected]) => code + '\n>>>>\n' + expected.join('\n>>>>\n')).join('\n====\n');
    await pfs.writeFile(testCaseFile, buffer, { encoding: 'utf8' });
}

async function test(TEST_CASES, i) {
    console.log('Test Case #' + (i+1));

    let [code, expected] = TEST_CASES[i];

    try {
        const compiler = new Compiler(schemaRetriever, 'America/Los_Angeles', true);

        const compiled = await compiler.compileCode(code);

        const generated = [];
        for (let name in compiler._toplevelscope)
            generated.push(compiler._toplevelscope[name]);
        if (compiled.command)
            generated.push(compiled.command);
        generated.push(...compiled.rules);
        if (generated.length !== expected.length) {
            console.error('Test Case #' + (i+1) + ': wrong number of generated functions');
            console.error(`Expected ${expected.length}, Generated ${generated.length}`);
            if (process.env.TEST_MODE)
                throw new Error(`testCompiler ${i+1} FAILED`);
        }

        for (let j = 0; j < Math.max(expected.length, generated.length); j++) {
            let code = generated[j] || '';
            code = code.replace(/new Date\([0-9]+\)/g, 'new Date(XNOWX)');

            if (expected[j] === undefined || code.trim() !== expected[j].trim()) {
                console.error('Test Case #' + (i+1) + ': compiled code does not match what expected');
                //console.error('Expected: ' + expected[j]);
                console.error('Compiled: ' + code);
                expected[j] = code;
                if (process.env.TEST_MODE)
                    throw new Error(`testCompiler ${i+1} FAILED`);
            } else {
                new AsyncFunction('__builtin', '__scope', '__ast', '__env', code);
            }
        }
    } catch(e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Code: ' + code);
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    }
}

export default async function main() {
    const TEST_CASES = await loadTestCases();

    let updateMode = !module.parent && process.argv[2] === '--update';

    for (let i = 0; i < TEST_CASES.length; i++)
        await test(TEST_CASES, i);

    if (updateMode)
        await saveTestCases(TEST_CASES);
}
if (!module.parent)
    main();
