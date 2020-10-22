// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Silei Xu <silei@cs.stanford.edu>

import assert from 'assert';
import * as Grammar from '../lib/syntax_api';
import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
import _mockMemoryClient from './mock_memory_client';

const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

// test flattening compound arguments in function
const FUNC_TEST_CASES = [
  [`class @foo {
    list query bar(out a: String,
                   out b: {
                     c: Number,
                     d: {
                       e: String
                     }
                   });
  }`, [`a`, `b`, `b.c`, `b.d`, `b.d.e`]],

  [`class @foo {
    list query bar(out a: String,
                   out b: Array({
                     c: Number,
                     d: {
                       e: String
                     }
                   }));
  }`, [`a`, `b`]],

  [`class @foo {
    list query bar(out a: String,
                   out b: {
                     c: Number,
                     d: Array({
                       e: String
                     })
                   });
  }`, [`a`, `b`, `b.c`, `b.d`]]
];

// test flattening compound fields in arrays
const ARRAY_TEST_CASES = [
  [`class @foo {
    list query bar(out a: String,
                   out b: {
                     c: Number,
                     d: Array({
                       e: String
                     })
                   });
  }`, `b.d`, [`e`]],

  [`class @foo {
    list query bar(out a: String,
                   out b: Array({
                     c: Number,
                     d: {
                       e: String
                     }
                   }));
  }`, `b`, [`c`, `d`, `d.e`]],

  [`class @foo {
    list query bar(out a: String,
                   out b: {
                     c: {
                       d: Array({
                         e: {
                           f: {
                             g: Number
                           },
                           h: Array({
                             i: String
                           })
                         }
                       })
                     }
                   });
  }`, `b.c.d`, [`e`, `e.f`, `e.f.g`, `e.h`]],
];

async function testCompoundArguments(i) {
    console.log('Test Case #' + (i+1));
    let [tt, args] = FUNC_TEST_CASES[i];

    try {
        const parsed = await Grammar.parse(tt).typecheck(schemaRetriever, false);
        const q = Object.values(parsed.classes[0].queries)[0];
        assert.deepStrictEqual(q.args, args);
        const clone = q.clone();
        assert.deepStrictEqual(clone.args, args);
    } catch(e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    }
}

async function testArrayCompoundElements(i) {
    console.log('Test Case #' + (i+1));
    let [tt, arg, fields] = ARRAY_TEST_CASES[i];

    try {
        const parsed = await Grammar.parse(tt).typecheck(schemaRetriever, false);
        const q = Object.values(parsed.classes[0].queries)[0];
        const type = q.getArgType(arg);
        assert(type.isArray && type.elem.isCompound);
        assert.deepStrictEqual(Object.keys(type.elem.fields), fields);

        const clone = q.getArgument(arg).clone();
        assert(clone.type.isArray && clone.type.elem.isCompound);
        assert.deepStrictEqual(Object.keys(clone.type.elem.fields), fields);
    } catch(e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    }
}

export default async function main() {
    for (let i = 0; i < FUNC_TEST_CASES.length; i++)
        await testCompoundArguments(i);
    for (let i = 0; i < ARRAY_TEST_CASES.length; i++)
        await testArrayCompoundElements(i);
}
if (!module.parent)
    main();


