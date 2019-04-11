"use strict";

const assert = require('assert');
const fs = require('fs');

const AppGrammar = require('../lib/grammar_api');
const { prettyprint } = require('../lib/prettyprint');

const debug = false;

function main() {
    var code = fs.readFileSync('./test/sample.apps').toString('utf8').split('====');

    code.forEach((code, i) => {
        console.log('# Test Case ' + (i+1));

        code = code.trim();
        let ast;
        try {
            ast = AppGrammar.parse(code);
            //console.log(String(ast.statements));
        } catch(e) {
            console.error('Parsing failed');
            console.error(code);
            console.error(e);
            return;
        }

        let codegenned;
        try {
            codegenned = prettyprint(ast, true);
            AppGrammar.parse(codegenned);

            if (debug) {
                console.log('Code:');
                console.log(code);
                console.log('Codegenned:');
                console.log(codegenned);
                console.log('====');
                console.log();
            }

            const ast2 = ast.clone();
            const codegenned2 = prettyprint(ast2, true);
            assert(ast !== ast2);
            assert.strictEqual(codegenned2, codegenned);
        } catch(e) {
            console.error('Codegen failed');
            console.error('AST:');
            console.error(ast);
            console.error('Codegenned:');
            console.error(codegenned);
            console.error('====\nCode:');
            console.error(code);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }

        try {
            Array.from(ast.iteratePrimitives());
        } catch(e) {
            console.error('Iterate primitives failed');
            console.log('Code:');
            console.log(code);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }
    });
}
module.exports = main;
if (!module.parent)
    main();
