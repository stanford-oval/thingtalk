// all tests, in batch form
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
    ('./test_units'),
    ('./test_date_utils'),
    ('./test_utils'),
    ('./test_builtin_values'),
    ('./test_builtin_sort_index'),
    ('./test_ast'),
    ('./test_generated_parser'),
    ('./test_grammar'),
    ('./test_typecheck'),
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
    ('./test_sql_compiler')
]);
