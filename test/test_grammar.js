"use strict";

const assert = require('assert');
const fs = require('fs');

const NodeVisitor = require('../lib/ast/visitor');
const AstNode = require('../lib/ast/base');
const { Value } = require('../lib/ast/values');

const Ast = require('../lib/ast');

const AppGrammar = require('../lib/grammar_api');
const { prettyprint } = require('../lib/prettyprint');

const debug = false;

const expectedsingletons = new Set([
    Ast.Selector.Builtin, Ast.BooleanExpression.True, Ast.BooleanExpression.False,
    Ast.PermissionFunction.Builtin, Ast.PermissionFunction.Star
]);
class TestVisitor extends NodeVisitor {
    constructor() {
        super();

        this._stack = [];
        this._nodes = new Set;
    }

    enter(node) {
        assert(node instanceof Value || node instanceof AstNode);
        if (this._nodes.has(node) && !expectedsingletons.has(node))
            throw new Error(`Node ${node} was entered multiple times`);
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
    TestVisitor.prototype[method] = async function(node) {
        if (className !== 'Value')
            assert.strictEqual(node.constructor.name, className);
        assert(this._stack.length > 0);
        assert.strictEqual(node, this._stack[this._stack.length-1]);
        return true;
    };
}

async function main() {
    const testFile = fs.readFileSync('./test/sample.apps').toString('utf8').split('====');

    for (let i = 0; i < testFile.length; i++) {
        console.log('# Test Case ' + (i+1));
        const code = testFile[i].trim();

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
    }
}
module.exports = main;
if (!module.parent)
    main();
