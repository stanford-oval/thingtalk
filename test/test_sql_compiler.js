// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
Q.longStackSupport = true;
const deq = require('deep-equal');

const AppGrammar = require('../lib/grammar_api');
const SqlCompiler = require('../lib/sql_compiler');
const SchemaRetriever = require('../lib/schema');

const _mockMemoryClient = require('./mock_memory_client');
const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

// TODO: scope is not tested since the command won't typecheck
const TEST_CASES = [
    // selection
    [`now => @com.mai-hub.get(), count >= 42 => notify;`, {},
     `select * from "patient_data" where 1 and count >= ?1`,
     { 1: 42 }
    ],

    // selection with more complicated predicates
    [`now => @com.mai-hub.get(), (count >= 42 || count <= 10) && starts_with(patient, "John") => notify;`, {},
     `select * from "patient_data" where 1 and ((count >= ?1 or count <= ?2) and instr(lower(patient), lower(?3)) = 1)`,
     { 1: 42, 2: 10, 3: "John"}
    ],
    [`now => @com.mai-hub.get(), count >= 42 || (count <= 10 && starts_with(patient, "John")) => notify;`, {},
     `select * from "patient_data" where 1 and (count >= ?1 or (count <= ?2 and instr(lower(patient), lower(?3)) = 1))`,
     { 1: 42, 2: 10, 3: "John"}
    ],

    // param passing
    [`now => @com.mai-hub.get() join @com.mai-hub.get() on (mtype = patient) => notify;`, {},
     `select * from ((select * from "patient_data" where 1 as _t0) join (select * from "patient_data" where 1 as _t1) on (_t0.mtype = _t1.patient)) where 1`, {}
    ],
    [`now => @com.mai-hub.get() join (@com.mai-hub.get(), patient == patient) => notify;`, {},
     `select * from ((select * from "patient_data" where 1) join (select * from "patient_data" where 1)) where 1`, {}
    ],

    // projection
    [`now => [patient, link] of @com.mai-hub.get() => notify;`, {},
     `select patient,link from "patient_data" where 1`, {}
    ],

    // join
    [`now => @com.mai-hub.get() join @com.mai-hub.get() => notify;`, {},
     `select * from ((select * from "patient_data" where 1) join (select * from "patient_data" where 1)) where 1`, {}
    ]
];

function test(i) {
    console.log('Test Case #' + (i+1));
    let [testCase, scope, expectedSql, expectedBinders] = TEST_CASES[i];

    return AppGrammar.parseAndTypecheck(testCase, schemaRetriever).then((prog) => {
        let ast = prog.rules[0];
        ast = ast.isRule? ast.stream : ast.table;

        let sqlCompiler = new SqlCompiler(ast, scope);

        let sql = sqlCompiler.compile();
        if (sql !== expectedSql) {
            console.error('Test Case #' + (i+1) + ': compiled SQL does not match what expected');
            console.error('Expected: ' + expectedSql);
            console.error('Compiled: ' + sql);
        }

        if (!deq(sqlCompiler.binders, expectedBinders)) {
            console.error('Test Case #' + (i+1) + ': bound variables do not match what expected');
            console.error('Expected: ' + expectedBinders);
            console.error('Compiled: ' + JSON.stringify(sqlCompiler.binders));
        }
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
    });
}

async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}

module.exports = main;

if (!module.parent)
    main();
