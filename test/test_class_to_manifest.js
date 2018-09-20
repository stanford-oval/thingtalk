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
const assert = require('assert');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');

const { prettyprint } = require('../lib/prettyprint');
const { ClassDef } = require('../lib/ast');
const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    'class @com.foo {\n' +
    '  monitorable query get_power(out power: Enum(on,off))\n' +
    '  #_[canonical="power status of foo"]\n' +
    '  #_[confirmation="status of foo"]\n' +
    '  #[poll_interval=600000ms];\n' +
    '  action set_power(in req power: Enum(on,off) #_[prompt="do you want turn on or off?"])\n' +
    '  #_[canonical="set power of foo"]\n' +
    '  #_[confirmation="turn $power foo"];\n' +
    '}\n' +
    '#_[name="Foo"]\n' +
    '#_[description="This is Foo"]\n' +
    '#[category="physical"]\n' +
    '#[subcategory="home"]\n' // these annotations should be auto attached from a form
];

function test(i) {
    console.log('Test Case #' + (i+1));
    let tt = TEST_CASES[i];

    return Grammar.parseAndTypecheck(tt, schemaRetriever, true).then((meta) => {
        let manifest_from_tt = meta.classes[0].toManifest();
        let generated = prettyprint(new Ast.Input.Meta([new ClassDef(manifest_from_tt)], []));
        if (tt !== generated) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + tt);
            console.error('Generated: ' + generated);
            for (let i = 0; i < tt.length; i ++) {
                if (tt[i] !== generated[i]) {
                    console.error(`Different at ${i}'s character: ${tt[i-1]}`);
                    break;
                }
            }
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