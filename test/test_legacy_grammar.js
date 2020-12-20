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

import * as Ast from '../lib/ast';

import NodeVisitor from '../lib/ast/visitor';
import AstNode from '../lib/ast/base';
import { Value } from '../lib/ast/values';

import * as AppGrammar from '../lib/syntax_api';
import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
import _mockMemoryClient from './mock_memory_client';
const _schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

const debug = false;

const expectedsingletons = new Set([
    Ast.BooleanExpression.True, Ast.BooleanExpression.False,
    Ast.PermissionFunction.Builtin, Ast.PermissionFunction.Star
]);
class TestVisitor extends NodeVisitor {
    constructor() {
        super();

        this._stack = [];
        this._nodes = new Set;
    }

    enter(node) {
        assert(node instanceof AstNode);
        if (this._nodes.has(node) && !expectedsingletons.has(node))
            throw new Error(`Node ${node} was entered multiple times`);
        if (node instanceof Value) {
            const fullname = node.constructor.name;
            assert(fullname.endsWith('Value'));
            const name = fullname.substring(0, fullname.length-'Value'.length);
            assert(node instanceof Value[name]);
            assert(node['is' + name] === true, `bad isX property for ${name}`);
        }

        this._nodes.add(node);
        this._stack.push(node);
    }
    exit(node) {
        assert(this._stack.length > 0);
        assert.strictEqual(node, this._stack.pop());
    }
}
for (let method of Object.getOwnPropertyNames(NodeVisitor.prototype)) {
    if (!method.startsWith('visit'))
        continue;
    let className = method.substring('visit'.length);
    TestVisitor.prototype[method] = function(node) {
        if (className !== 'Value')
            assert.strictEqual(node.constructor.name, className);
        assert(this._stack.length > 0);
        assert.strictEqual(node, this._stack[this._stack.length-1]);
        return true;
    };
}

export default async function main() {
    const testFile = fs.readFileSync(process.argv[2] || './test/test_legacy_syntax.tt').toString('utf8').split('====');

    for (let i = 0; i < testFile.length; i++) {
        console.log('# Test Case ' + (i+1));
        const code = testFile[i].trim();

        let ast;
        try {
            ast = AppGrammar.parse(code, AppGrammar.SyntaxType.Legacy);
            //console.log(String(ast.statements));
        } catch(e) {
            console.error('Parsing failed');
            console.error(code);
            console.error(e);
            return;
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

        let ast2, codegenned2;
        try {
            ast2 = ast.clone();
            codegenned2 = ast2.prettyprint();
            assert(ast !== ast2);
            assert.strictEqual(codegenned2, codegenned);
        } catch(e) {
            console.error('Codegen failed for the clone');
            console.error('AST:');
            console.error(ast);
            console.error('Cloned AST:');
            console.error(ast2);
            console.error('Original Codegenned:');
            console.error(codegenned);
            console.error('Clone Codegenned:');
            console.error(codegenned2);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }

        await ast.visit(new TestVisitor());

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

        if (code.indexOf(`** typecheck: expect TypeError **`) >= 0)
            continue;

        try {
            await ast.typecheck(_schemaRetriever);

            const codegenned2 = ast.prettyprint();
            assert.strictEqual(codegenned2, codegenned);
        } catch(e) {
            console.error('Typecheck failed');
            console.log('Code:');
            console.log(code);
            console.log('New ThingTalk:');
            console.log(codegenned);
            console.log(ast.declarations ? ast.declarations.map((d) => d.statements[0].expression.expressions) : null);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
            continue;
        }

        let legacyCodegenned;
        try {
            legacyCodegenned = AppGrammar.serialize(ast, AppGrammar.SyntaxType.Legacy);
            const ast2 = AppGrammar.parse(legacyCodegenned, AppGrammar.SyntaxType.Legacy);
            const codegenned2 = ast2.prettyprint();
            assert.strictEqual(codegenned2, codegenned);
        } catch(e) {
            console.error('Failed to serialize to legacy syntax');
            console.error('New ThingTalk:');
            console.error(codegenned);
            console.error('Legacy ThingTalk:');
            console.error(legacyCodegenned);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }

        let legacyCodegenned2;
        try {
            legacyCodegenned2 = AppGrammar.serialize(ast, AppGrammar.SyntaxType.Normal, undefined, {
                compatibility: '1.10.0'
            });
            assert.strictEqual(legacyCodegenned2, legacyCodegenned);
        } catch(e) {
            console.error('Failed to serialize to legacy syntax');
            console.error('New ThingTalk:');
            console.error(codegenned);
            console.error('Legacy ThingTalk:');
            console.error(legacyCodegenned);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }
    }
}
if (!module.parent)
    main();
