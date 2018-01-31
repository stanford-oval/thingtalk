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
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');
const { optimizeProgram } = require('../lib/optimize');
const { typeCheckPermissionRule } = require('../lib/typecheck');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');

var TEST_CASES = [
    // manually written test cases
    ['now => @twitter.sink',
     'anyone is allowed to tweet any status'],

    ['now => @twitter.sink, status = "foo"',
     'anyone is allowed to tweet "foo"'],

    ['now => @twitter.sink, status =~ "foo"',
     'anyone is allowed to tweet any status if status contains "foo"'],

    ['now => @twitter.sink, status = "foo" || status = "bar"',
     'anyone is allowed to tweet any status if status is equal to "foo" or status is equal to "bar"'],

    ['now => @twitter.search, query = "foo" => notify',
     'anyone is allowed to search "foo" on Twitter'],

    ['now => @twitter.search, query = "foo" || query = "bar" => notify',
     'anyone is allowed to search any query on Twitter if query is equal to "foo" or query is equal to "bar"'],

    ['now => @twitter.search, query = "foo" && text =~ "lol" => notify',
     'anyone is allowed to search "foo" on Twitter if text contains "lol"'],

    ['now => @twitter.search, (query = "foo" || query = "bar") && text =~ "lol" => notify',
     'anyone is allowed to search any query on Twitter if query is equal to "foo" or query is equal to "bar" and text contains "lol"']
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
        }
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
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
