// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const Ast = require('../lib/ast');
const NNSyntax = require('../lib/nn-syntax');
//const NNOutputParser = require('../lib/nn_output_parser');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);


const TEST_CASES = [
    [`now => @com.twitter.post param:status:String = " hello "`,
     {'QUOTED_STRING_0': 'hello'},
     `now => @com.twitter.post param:status:String = " world "`,
     {'QUOTED_STRING_0': 'hello', 'QUOTED_STRING_1': 'world'}
    ]
];

async function testCase(test, i) {
    if (test.length !== 4)
        throw new Error('invalid test ' + test[0]);
    let [sequence1, entities1, sequence2, entities2] = test;

    console.log('Test Case #' + (i+1));
    try {
        let program1 = NNSyntax.fromNN(sequence1.split(' '), {});
        await program1.typecheck(schemaRetriever);

        const into = {};
        NNSyntax.toNN(program1, '', into, { allocateEntities: true }).join(' ');
        assert.deepStrictEqual(into, entities1);

        let program2 = NNSyntax.fromNN(sequence2.split(' '), {});
        await program2.typecheck(schemaRetriever);
        NNSyntax.toNN(program2, '', into, { allocateEntities: true }).join(' ');
        assert.deepStrictEqual(into, entities2);
    } catch (e) {
        console.error('Test Case #' + (i+1) + ' failed with exception');
        console.error(sequence1);
        console.error(e);
        if (process.env.TEST_MODE)
            throw e;
    }
}

async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await testCase(TEST_CASES[i], i);
}
module.exports = main;
if (!module.parent)
    main();
