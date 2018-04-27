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
const Describe = require('../lib/describe');
const Grammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');
const { typeCheckPermissionRule } = require('../lib/typecheck');

const ThingpediaClientHttp = require('./http_client');

var TEST_CASES = [
    // manually written test cases
    ['true : now => @com.twitter.post',
     'anyone is allowed to tweet any status'],

    ['source == "mom"^^tt:username : now => @com.twitter.post',
     '@mom is allowed to tweet any status'],

    ['group_member(source, "family"^^tt:contact_group_name) : now => @com.twitter.post',
     'anyone in the @family group is allowed to tweet any status'],

    ['source == "mom"^^tt:username || source == "dad"^^tt:username : now => @com.twitter.post',
     'anyone if they is equal to @mom or they is equal to @dad is allowed to tweet any status'],

    ['true : now => @com.twitter.post, status == "foo"',
     'anyone is allowed to tweet "foo"'],

    ['true : now => @com.twitter.post, status =~ "foo"',
     'anyone is allowed to tweet any status if status contains "foo"'],

    ['true : now => @com.twitter.post, status == "foo" || status == "bar"',
     'anyone is allowed to tweet any status if status is equal to "foo" or status is equal to "bar"'],

    ['true : @com.bing.web_search, query == "foo" => notify',
     'anyone is allowed to read search for "foo" on Bing'],

    ['true : @com.bing.web_search, query == "foo" || query == "bar" => notify',
     'anyone is allowed to read search for any query on Bing if query is equal to "foo" or query is equal to "bar"'],

    ['true : @com.bing.web_search, query == "foo" && description =~ "lol" => notify',
     'anyone is allowed to read search for "foo" on Bing if description contains "lol"'],

    ['true : @com.bing.web_search, (query == "foo" || query == "bar") && description =~ "lol" => notify',
     'anyone is allowed to read search for any query on Bing if query is equal to "foo" or query is equal to "bar" and description contains "lol"']
];

const schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);
const gettext = {
    dgettext: (domain, msgid) => msgid
};

function test(i) {
    console.log('Test Case #' + (i+1));
    var [code, expected] = TEST_CASES[i];

    const prog = Grammar.parsePermissionRule(code);
    return typeCheckPermissionRule(prog, schemaRetriever, true).then(() => {
        let reconstructed = Describe.describePermissionRule(gettext, prog);
        if (expected !== reconstructed) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + expected);
            console.error('Generated: ' + reconstructed);
            if (process.env.TEST_MODE)
                throw new Error(`testDescribePolicy ${i+1} FAILED`);
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
