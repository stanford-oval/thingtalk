"use strict";

const fs = require('fs');

const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const _mockMemoryClient = require('./mock_memory_client');

const _schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

async function main() {
    const tests = fs.readFileSync('./test/sample.apps').toString('utf8').split('====');

    for (let code of tests) {
        code = code.trim();
        let program;
        try {
            program = await AppGrammar.parseAndTypecheck(code, _schemaRetriever);
        } catch (e) {
            if (code.indexOf(`** typecheck: expect ${e.name} **`) >= 0)
                continue;
            console.error('Failed');
            console.error(code);
            console.error(e);
            if (process.env.TEST_MODE)
                throw e;
            continue;
        }

        if (code.indexOf(`** typecheck: expect `) >= 0) {
            console.error('Failed (expected error)');
            console.error(code);
            continue;
        }

        try {
            Array.from(program.iterateSlots());
        } catch(e) {
            console.error('Iterate slots failed');
            console.log('Code:');
            console.log(code);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }

        try {
            Array.from(program.iterateSlots2());
        } catch(e) {
            console.error('Iterate slots failed');
            console.log('Code:');
            console.log(code);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }
    }
}
module.exports = main;
if (!module.parent)
    main();
