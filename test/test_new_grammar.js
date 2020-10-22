// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

import assert from 'assert';
import * as fs from 'fs';

import * as AppGrammar from '../lib/syntax_api';

const debug = false;

export default async function main() {
    const testFile = fs.readFileSync(process.argv[2] || './test/test_syntax.tt').toString('utf8').split('====');

    for (let i = 0; i < testFile.length; i++) {
        console.log('# Test Case ' + (i+1));
        const code = testFile[i].trim();

        let ast;
        try {
            ast = AppGrammar.parse(code);
            //console.log(String(ast.statements));
        } catch(e) {
            if (code.indexOf(`** expect ${e.name} **`) >= 0)
                continue;
            console.error('Parsing failed');
            console.error(code);
            console.error(e);
            if (process.env.TEST_MODE)
                throw e;
            continue;
        }

        if (code.indexOf(`** expect SyntaxError **`) >= 0) {
            console.error('Failed (expected error)');
            console.error(code);
            if (process.env.TEST_MODE)
                assert.fail('Failed (expected error)');
            continue;
        }

        let codegenned;
        try {
            codegenned = ast.prettyprint();
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
            const codegenned2 = ast.prettyprint();
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
    }
}
if (!module.parent)
    main();
