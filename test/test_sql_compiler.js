"use strict";

const Q = require('q');
Q.longStackSupport = true;
const deq = require('deep-equal');

const Ast = require('../lib/ast');
const AppGrammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SqlCompiler = require('../lib/sql_compiler');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');
const { optimizeProgram } = require('../lib/optimize');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');
const _mockMemoryClient = require('./mock_memory_client');
var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

const TEST_CASES = [
    // selection
    [`now => get_record(table="Q1"), col1 > 42 && (col1 <= 42.5 || col2 > 7), v_col1 := col1 => notify;`,
      {"Q1": 1}, {} /* scope */,
    `select col1 from "memory_Q1" where (col1 > 42 and (col1 <= 42.5 or col2 > 7)) and _id <= ?1`,
     { '1': 1 } /* binders */,
     { 'v_col1': 'col1' } /* outputs */],

    // min aggregation
    [`now => get_record(table="Q1"), col1 > 42 && (col1 <= 42.5 || col2 > 7), v_col1 := min(col1) => notify;`,
      {"Q1": 1}, {} /* scope */,
    `select min(col1) as __min_col1 from "memory_Q1" where (col1 > 42 and (col1 <= 42.5 or col2 > 7)) and _id <= ?1`,
     { '1': 1 } /* binders */,
     { 'v_col1': '__min_col1' } /* outputs */],

    // count aggregation
    [`now => get_record(table="Q1"), col1 > 42 && (col1 <= 42.5 || col2 > 7), v_count := count(*) => notify;`,
      {"Q1": 1}, {} /* scope */,
    `select count(*) as __count_star from "memory_Q1" where (col1 > 42 and (col1 <= 42.5 or col2 > 7)) and _id <= ?1`,
     { '1': 1 } /* binders */,
     { 'v_count': '__count_star' } /* outputs */],

    // subquery
    [`now => get_record(table="Q1"), col1 > 42 && (get_record(table="Q2") { col2 > 0 }), v_col1 := col1 => notify;`,
      {"Q1": 1, "Q2": 2}, {} /* scope */,
    `select col1 from "memory_Q1" where (col1 > 42 and exists (select 1 from "memory_Q2" where col2 > 0 and _id <= ?2)) and _id <= ?1`,
     { '1': 1, '2': 2 } /* binders */,
     { 'v_col1': 'col1' } /* outputs */],

    // parameter passing
    [`@twitter.source(), v_text := text => get_record(table="Q1"), str1 = v_text, v_col1 := col1 => notify;`,
      {"Q1": 1}, { 'v_text': 2 } /* scope */,
    `select col1 from "memory_Q1" where str1 = ?2 and _id <= ?1`,
     { '1': 1, '2': 2 } /* binders */,
     { 'v_col1': 'col1' } /* outputs */],

    // simple join
    [`now => get_record(table="Q1"), col1 > 42, v_col1 := col1 => get_record(table="Q2"), col2 > 0, v_col2 := col2 => notify;`,
     {"Q1": 1, "Q2": 2}, {} /* scope */,
    `select col2 from (select col1 from "memory_Q1" where col1 > 42 and _id <= ?1) as __q0 join "memory_Q2" where col2 > 0 and _id <= ?2`,
    { '1': 1, '2': 2  } /* binders */,
    { 'v_col2': 'col2' } /* outputs */],

    // param passing join
    [`now => get_record(table="Q1"), col1 > 42, v_col1 := col1 => get_record(table="Q2"), col2 > v_col1, v_col2 := col2 => notify;`,
     {"Q1": 1, "Q2": 2}, {} /* scope */,
    `select col2 from (select col1 from "memory_Q1" where col1 > 42 and _id <= ?1) as __q0 join "memory_Q2" where col2 > __q0.col1 and _id <= ?2`,
    { '1': 1, '2': 2  } /* binders */,
    { 'v_col2': 'col2' } /* outputs */],

    // aggregate join
    [`now => get_record(table="Q1"), col1 > 42, v_col1 := min(col1) => get_record(table="Q2"), col2 > v_col1, v_col2 := col2 => notify;`,
     {"Q1": 1, "Q2": 2}, {} /* scope */,
    `select col2 from (select min(col1) as __min_col1 from "memory_Q1" where col1 > 42 and _id <= ?1) as __q0 join "memory_Q2" where col2 > __q0.__min_col1 and _id <= ?2`,
    { '1': 1, '2': 2  } /* binders */,
    { 'v_col2': 'col2' } /* outputs */],
];

function test(i) {
    console.log('Test Case #' + (i+1));
    let [testCase, versions, scope, expectedSql, expectedBinders, expectedOutputs] = TEST_CASES[i];

    return AppGrammar.parseAndTypecheck(testCase, schemaRetriever).then((prog) => {
        let queries = prog.rules[0].queries;

        let sqlCompiler = new SqlCompiler(queries, versions, scope);

        let sql = sqlCompiler.compile();
        if (sql !== expectedSql) {
            console.error('Test Case #' + (i+1) + ': compiled SQL does not match what expected');
            console.error('Expected: ' + expectedSql);
            console.error('Compiled: ' + sql);
        }

        if (!deq(sqlCompiler.binders, expectedBinders)) {
            console.error('Test Case #' + (i+1) + ': bound variables are not what expected');
            console.error('Expected:', expectedBinders);
            console.error('Compiled:', sqlCompiler.binders);
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

loop(0).done();
