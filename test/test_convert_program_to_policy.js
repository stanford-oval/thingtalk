// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('./polyfill');

const Q = require('q');
Q.longStackSupport = true;
const Generate = require('../lib/generate');
const Grammar = require('../lib/grammar_api');
const Ast = require('../lib/ast');
const SchemaRetriever = require('../lib/schema');

const ThingpediaClientHttp = require('./http_client');

var TEST_CASES = [
    // manually written test cases
    ['now => @com.twitter.post();',
     'source == "test-account:foobar"^^tt:contact("Bob") : now => @com.twitter.post;'],
    [`now => @com.twitter.post(status="foo");`,
     'source == "test-account:foobar"^^tt:contact("Bob") : now => @com.twitter.post, status == "foo";'],

    [`now => @com.twitter.search(), text =~ "lol" => @com.twitter.post(status=text);`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.twitter.search, text =~ "lol" => @com.twitter.post, status == text;'],
    [`now => @com.bing.web_search(query="lol") => @com.twitter.post(status=description);`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search, query == "lol" => @com.twitter.post, status == description;'],
    [`now => @com.bing.web_search(query="lol"), description =~ "bar" => @com.twitter.post(status=description);`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search, (query == "lol" && description =~ "bar") => @com.twitter.post, status == description;'],
    [`monitor @com.bing.web_search(query="lol") => @com.twitter.post(status=description);`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search, query == "lol" => @com.twitter.post, status == description;'],
    [`monitor @com.bing.web_search(query="lol"), description =~ "bar" => @com.twitter.post(status=description);`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search, (query == "lol" && description =~ "bar") => @com.twitter.post, status == description;'],
    [`monitor (@com.bing.web_search(query="lol"), description =~ "bar") => @com.twitter.post(status=description);`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search, (query == "lol" && description =~ "bar") => @com.twitter.post, status == description;'],

    [`now => @com.twitter.search(), text =~ "lol" => notify;`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.twitter.search, text =~ "lol" => notify;'],
    [`now => @com.bing.web_search(query="lol") => notify;`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search, query == "lol" => notify;'],
    [`now => @com.bing.web_search(query="lol"), description =~ "bar" => notify;`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search, (query == "lol" && description =~ "bar") => notify;'],
    [`monitor @com.bing.web_search(query="lol") => notify;`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search, query == "lol" => notify;'],
    [`monitor @com.bing.web_search(query="lol"), description =~ "bar" => notify;`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search, (query == "lol" && description =~ "bar") => notify;'],
    [`monitor (@com.bing.web_search(query="lol"), description =~ "bar") => notify;`,
     'source == "test-account:foobar"^^tt:contact("Bob") : @com.bing.web_search, (query == "lol" && description =~ "bar") => notify;'],
];

const schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);

function test(i) {
    console.log('Test Case #' + (i+1));
    var [code, expected] = TEST_CASES[i];

    return Grammar.parseAndTypecheck(code, schemaRetriever, true).then((prog) => {
        let rule = Generate.convertProgramToPermissionRule('test-account:foobar', 'Bob', prog);
        let tt = Ast.prettyprintPermissionRule(rule, true);

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

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return Q(test(i)).then(() => loop(i+1));
}

function main() {
    loop(0).done();
}
main();