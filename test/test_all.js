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
"use strict";

const Q = require('q');
Q.longStackSupport = true;
process.on('unhandledRejection', (up) => { throw up; });

process.env.TEST_MODE = '1';

async function seq(array) {
    for (let fn of array) {
        console.log(`Running ${fn}`);
        await require(fn)();
    }
}

seq([
    ('./test_version'),
    ('./test_date_utils'),
    ('./test_utils'),
    ('./test_builtin_values'),
    ('./test_builtin_sort_index'),
    ('./test_ast'),
    ('./test_generated_parser'),
    ('./test_compound_type'),
    ('./test_prettyprint'),
    ('./test_grammar'),
    ('./test_optimize'),
    ('./test_typecheck'),
    ('./test_sparql_converter'),
    ('./test_nn_syntax'),
    ('./test_nn_syntax_allocator'),
    ('./test_compiler'),
    ('./test_builtin'),
    ('./test_describe'),
    ('./test_describe_api'),
    ('./test_describe_policy'),
    ('./test_permissions'),
    ('./test_lowerings'),
    ('./test_declaration_program'),
    ('./test_example_program'),
    ('./test_convert_program_to_policy'),
    ('./test_iteration_apis'),
    ('./test_runtime'),
    ('./test_formatter'),
    ('./test_formatter_api'),
    ('./test_class_to_manifest'),
    ('./test_schema_retriever'),
    //('./test_sql_compiler'),
]);
