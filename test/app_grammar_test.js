"use strict";

const fs = require('fs');

const AppGrammar = require('../lib/grammar_api');
const { prettyprint } = require('../lib/prettyprint');

const debug = false;

function parserTest() {
    var code = fs.readFileSync('./test/sample.apps').toString('utf8').split('====');

    code.forEach((code, i) => {
        console.log('# Test Case ' + (i+1));

        code = code.trim();
        try {
            var ast = AppGrammar.parse(code);
            //console.log(String(ast.statements));
        } catch(e) {
            console.error('Parsing failed');
            console.error(code);
            console.error(e);
            return;
        }

        try {
            var codegenned = prettyprint(ast, true);
            AppGrammar.parse(codegenned);

            if (debug) {
                console.log('Code:');
                console.log(code);
                console.log('Codegenned:');
                console.log(codegenned);
                console.log('====');
                console.log();
            }
        } catch(e) {
            console.error('Codegen failed');
            console.error('AST:');
            console.error(String(ast));
            console.error('Codegenned:');
            console.error(codegenned);
            console.error('====\nCode:');
            console.error(code);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }
    });
}

parserTest();

