// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Grammar = require('../grammar');
const { typeCheckProgram } = require('../typecheck');
const { NotImplementedError } = require('../errors');

const JSIr = require('./jsir');
const { CompiledRule } = require('./output');
const { compileStatementToOp } = require('./ast-to-ops');
const OpCompiler = require('./ops-to-jsir');

class RuleCompiler {
    constructor(compiler, rule, testMode) {
        this._testMode = testMode;
        this._compiler = compiler;
        this._rule = rule;
        this._irBuilder = new JSIr.IRBuilder();
        this._opCompiler = new OpCompiler(this._irBuilder);
    }

    compile() {
        let ruleop = compileStatementToOp(this._rule);
        const [functions, nextStateVar] = this._opCompiler.compile(ruleop);

        let result = this._testMode ? this._irBuilder.codegen() : this._irBuilder.compile();
        return new CompiledRule(this._rule.isRule, functions, nextStateVar, result);
    }
}

module.exports = class AppCompiler {
    constructor(testMode) {
        this._testMode = testMode;

        this._name = undefined;
        this._params = {};
        this._declarations = {};
        this._classes = {};
        this._rules = [];

        this._schemaRetriever = null;
    }

    setSchemaRetriever(schemaRetriever) {
        this._schemaRetriever = schemaRetriever;
    }

    get warnings() {
        return [];
    }

    get name() {
        return this._name;
    }

    get declarations() {
        return this._declarations;
    }

    get rules() {
        return this._rules;
    }

    compileCode(code) {
        return this.compileProgram(Grammar.parse(code));
    }

    verifyProgram(ast) {
        return typeCheckProgram(ast, this._schemaRetriever).then(() => {
            ast.classes.forEach((ast) => {
                this._classes[ast.name] = ast;
            });
            ast.declarations.forEach((ast) => {
                this._declarations[ast.name] = ast;
            });
        });
    }

    compileProgram(ast) {
        return this.verifyProgram(ast).then(() => {
            if (ast.declarations.length > 0)
                throw new NotImplementedError(ast.declarations);

            ast.rules.forEach((stmt) => {
                let compiler = new RuleCompiler(this, stmt, this._testMode);
                this._rules.push(compiler.compile());
            });
        });
    }
};
