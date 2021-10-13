// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2021 The Board of Trustees of the Leland Stanford Junior University
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

import SchemaRetriever from '../lib/schema';
import * as Syntax from '../lib/syntax_api';

import _mockSchemaDelegate from './mock_schema_delegate';
import _mockMemoryClient from './mock_memory_client';
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

const TEST_CASES = [
// 1 simple
[`class @foo {
query q1(in req p1 : String);
}
@foo.q1();
`, false],

// 2 simple
[`class @foo {
query q1(in req p1 : String);
}
@foo.q1(p1="lol");
`, true],

// 3 explicit
[`class @foo {
query q1(in req p1 : String);
}
@foo.q1(p1=$?);
`, false],

// 4 optional
[`class @foo {
query q1(in opt p1 : String);
}
@foo.q1();
`, true],

// 5 optional explicit
[`class @foo {
query q1(in opt p1 : String);
}
@foo.q1(p1=$?);
`, false],

// 6 require either
[`class @foo {
query q1(in opt p1 : String,
         in opt p2 : String)
#[require_either=[["p1", "p2"]]];
}
@foo.q1();
`, false],

// 7 require either, provided
[`class @foo {
query q1(in opt p1 : String,
         in opt p2 : String)
#[require_either=[["p1", "p2"]]];
}
@foo.q1(p1="lol");
`, true],

// 8 require either, two requirements
[`class @foo {
query q1(in opt p1 : String,
         in opt p2 : String,
         in opt p3 : String,
         in opt p4 : String)
#[require_either=[["p1", "p2"], ["p3", "p4"]] ];
}
@foo.q1(p1="lol");
`, false],

// 9 require either, two requirements, fulfilled
[`class @foo {
query q1(in opt p1 : String,
         in opt p2 : String,
         in opt p3 : String,
         in opt p4 : String)
#[require_either=[["p1", "p2"], ["p3", "p4"]] ];
}
@foo.q1(p1="lol", p3="lal");
`, true],

// 10 required if
[`class @foo {
query q1(in opt p1 : Enum(a, b),
         in opt p2 : String #[required_if=["p1=a"]]);
}
@foo.q1();
`, true],

// 11 required if, param matches
[`class @foo {
query q1(in opt p1 : Enum(a, b),
         in opt p2 : String #[required_if=["p1=a"]]);
}
@foo.q1(p1=enum a);
`, false],

// 12 required if, param matches, provided
[`class @foo {
query q1(in opt p1 : Enum(a, b),
         in opt p2 : String #[required_if=["p1=a"]]);
}
@foo.q1(p1=enum a, p2="lol");
`, true],

// 13 required if, param matches, undefined
[`class @foo {
query q1(in opt p1 : Enum(a, b),
         in opt p2 : String #[required_if=["p1=a"]]);
}
@foo.q1(p1=enum a, p2=$?);
`, false],

// 14 required if, param does not match
[`class @foo {
query q1(in opt p1 : Enum(a, b),
         in opt p2 : String #[required_if=["p1=a"]]);
}
@foo.q1(p1=enum b);
`, true],

// 15 required if, boolean
[`class @foo {
query q1(in opt p1 : Boolean,
         in opt p2 : String #[required_if=["p1=true"]]);
}
@foo.q1(p1=true);
`, false],

// 16 required if, boolean
[`class @foo {
query q1(in opt p1 : Boolean,
         in opt p2 : String #[required_if=["p1=true"]]);
}
@foo.q1(p1=false);
`, true],

// 17 non-concrete values
[`class @foo {
query q1(in opt p1 : Location);
}
@foo.q1(p1=new Location("somewhere"));
`, false],

// 18 non-concrete values
[`class @foo {
query q1(in opt p1 : Location);
}
@foo.q1(p1=$location.home);
`, false],
];

async function test(i) {
    console.log('Test Case #' + (i+1));

    let [code, expected] = TEST_CASES[i];

    try {
        const parsed = Syntax.parse(code);
        await parsed.typecheck(schemaRetriever);

        const stmt = parsed.statements[0];

        const isExecutable = stmt.isExecutable();
        if (expected !== isExecutable) {
            console.error('Test Case #' + (i+1) + ': failed');
            if (process.env.TEST_MODE)
                throw new Error(`testIsExecutable ${i+1} FAILED`);
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
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}
if (!module.parent)
    main();
