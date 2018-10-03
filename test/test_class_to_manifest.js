// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
Q.longStackSupport = true;

const Grammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');

const { prettyprint } = require('../lib/prettyprint');
const { fromManifest, toManifest } = require('../lib/ast_api');
const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    'class @com.foo\n' +
    '#_[name="Foo"]\n' +
    '#_[description="This is Foo"] {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.form(params=makeArgMap(url:Entity(tt:url),password:Entity(tt:password)));\n' +
    '\n' +
    '  monitorable query get_power(out power: Enum(on,off))\n' +
    '  #_[canonical="power status of foo"]\n' +
    '  #_[confirmation="status of foo"]\n' +
    '  #_[formatted=["Here is something for you", {type="rdl",displayTitle="$title",webCallback="$url"}]]\n' +
    '  #[poll_interval=600000ms];\n' +
    '\n' +
    '  action set_power(in req power: Enum(on,off) #_[prompt="do you want turn on or off?"])\n' +
    '  #_[canonical="set power of foo"]\n' +
    '  #_[confirmation="turn $power foo"];\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.oauth2(client_id="xxx", client_secret="yyy");\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.custom_oauth();\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.basic_auth(extra_params=makeArgMap(serial_number:String));\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.discovery(protocol=enum(bluetooth));\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.interactive();\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.builtin();\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.none();\n' +
    '}\n',

    'class @com.foo\n' +
    '#[version=1] {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.none();\n' +
    '}\n',

    'class @com.foo extends @com.twitter, @com.facebook {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.none();\n' +
    '}\n',

    'class @com.foo extends @com.twitter\n' +
    '#[child_types=["com.facebook"]] {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.none();\n' +
    '}\n'
];

function test(i) {
    console.log('Test Case #' + (i+1));
    let tt = TEST_CASES[i];

    return Grammar.parseAndTypecheck(tt, schemaRetriever, true).then((meta) => {
        let manifest_from_tt = toManifest(meta);
        let generated = prettyprint(fromManifest('com.foo', manifest_from_tt));
        if (tt !== generated) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + tt);
            console.error('Generated: ' + generated);
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
