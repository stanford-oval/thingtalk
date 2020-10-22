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
    ['now => @com.twitter.post();',
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : now => @com.twitter.post;
}`],
    [`now => @com.twitter.post(status="foo");`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : now => @com.twitter.post filter status == "foo";
}`],

    [`now => @com.twitter.search(), text =~ "lol" => @com.twitter.post(status=text);`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.twitter.search filter text =~ "lol" => @com.twitter.post filter status == text;
}`],

    [`now => @com.bing.web_search(query="lol") => @com.twitter.post(status=description);`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search filter query == "lol" => @com.twitter.post filter status == description;
}`],

    [`now => @com.bing.web_search(query="lol"), description =~ "bar" => @com.twitter.post(status=description);`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search filter description =~ "bar" && query == "lol" => @com.twitter.post filter status == description;
}`],

    [`monitor(@com.bing.web_search(query="lol")) => @com.twitter.post(status=description);`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search filter query == "lol" => @com.twitter.post filter status == description;
}`],

    [`monitor(@com.bing.web_search(query="lol")), description =~ "bar" => @com.twitter.post(status=description);`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search filter description =~ "bar" && query == "lol" => @com.twitter.post filter status == description;
}`],

    [`monitor (@com.bing.web_search(query="lol"), description =~ "bar") => @com.twitter.post(status=description);`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search filter description =~ "bar" && query == "lol" => @com.twitter.post filter status == description;
}`],

    [`now => @com.twitter.search(), text =~ "lol" => notify;`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.twitter.search filter text =~ "lol" => notify;
}`],

    [`now => @com.bing.web_search(query="lol") => notify;`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search filter query == "lol" => notify;
}`],

    [`now => @com.bing.web_search(query="lol"), description =~ "bar" => notify;`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search filter description =~ "bar" && query == "lol" => notify;
}`],

    [`monitor(@com.bing.web_search(query="lol")) => notify;`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search filter query == "lol" => notify;
}`],

    [`monitor(@com.bing.web_search(query="lol")), description =~ "bar" => notify;`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search filter description =~ "bar" && query == "lol" => notify;
}`],

    [`monitor (@com.bing.web_search(query="lol"), description =~ "bar") => notify;`,
     `$policy {
  source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search filter description =~ "bar" && query == "lol" => notify;
}`],
];

function test(i) {
    console.log('Test Case #' + (i+1));
    let [code, expected] = TEST_CASES[i];

    return Grammar.parse(code).typecheck(schemaRetriever, true).then((prog) => {
        let rule = prog.convertToPermissionRule('test-account:foobar', 'Bob');
        let tt = rule.prettyprint(true);

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
