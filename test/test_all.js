// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
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

process.on('unhandledRejection', (up) => {
    throw up;
});

process.env.TEST_MODE = '1';

async function seq(array) {
    for (let fn of array) {
        console.log(`Running ${fn}`);
        await (await import(fn)).default();
    }
}

// the order should roughly be most basic unit test to more functional tests
// so that things fail in an approximately cascading order

seq([
    // test the library packaging
    ('./test_version'),

    // test low-level utilities and in-memory data structures
    ('./test_date_utils'),
    ('./test_utils'),
    ('./test_builtin_values'),
    ('./test_ast'),
    ('./test_schema_retriever'),
    ('./test_compound_type'),
    ('./test_is_executable'),

    // test syntax (first test that the parser we generated is good, then use it)
    ('./test_generated_parser'),
    ('./test_new_grammar'),
    ('./test_legacy_grammar'),
    ('./test_prettyprint'),
    ('./test_optimize'),
    ('./test_typecheck'),
    ('./test_nn_syntax'),
    ('./test_nn_syntax_allocator'),
    ('./test_nn_syntax_allocator_2'),
    ('./test_legacy_nn_syntax'),

    // test AST transformations
    ('./test_compiler'),
    ('./test_declaration_program'),
    ('./test_example_program'),
    ('./test_convert_program_to_policy'),
    ('./test_iteration_apis'),

    // test runtime APIs
    ('./test_builtin_primitive_ops'),
    ('./test_builtin_sort_index'),
    ('./test_builtin_stream_ops'),
    ('./test_runtime'),

    // test converters and integrations
    ('./test_permissions'),
    ('./test_sparql_converter'),
    //('./test_sql_compiler'),
]);
