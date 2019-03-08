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
const { compileStatementToOp } = require('./ast-to-ops');
const OpCompiler = require('./ops-to-jsir');

class CompiledProgram {
    constructor(states, declarations, command, rules) {
        this.hasTrigger = rules.length > 0;

        this.states = states;
        this.declarations = declarations;
        this.command = command;
        this.rules = rules;
    }
}

module.exports = class AppCompiler {
    constructor(schemaRetriever, testMode) {
        this._testMode = testMode;
        this._declarations = {};

        this._schemaRetriever = schemaRetriever;
        this._nextStateVar = 0;
    }

    compileCode(code) {
        return this.compileProgram(Grammar.parse(code));
    }

    _allocState() {
        return this._nextStateVar++;
    }

    _compileDeclarationFunction(decl) {
        throw new NotImplementedError(decl);
    }

    _doCompileStatement(stmt, irBuilder) {
        const opCompiler = new OpCompiler(this, irBuilder);
        let ruleop = compileStatementToOp(stmt);
        opCompiler.compile(ruleop);
    }

    _compileImmediateStatements(stmts) {
        if (stmts.length === 0)
            return null;

        // all immediate statements are compiled into a single function, so we
        // create a single irBuilder that we share
        const irBuilder = new JSIr.IRBuilder();
        for (let i = 0; i < stmts.length; i++) {
            // if this is not the first statement, clear the get cache before running it
            if (i !== 0)
                irBuilder.add(new JSIr.ClearGetCache());
            this._doCompileStatement(stmts[i], irBuilder);
        }

        return this._testMode ? irBuilder.codegen() : irBuilder.compile();
    }

    _compileRule(rule) {
        // each rule goes into its own JS function
        const irBuilder = new JSIr.IRBuilder();
        this._doCompileStatement(rule, irBuilder);

        return this._testMode ? irBuilder.codegen() : irBuilder.compile();
    }

    async compileProgram(program) {
        await typeCheckProgram(program, this._schemaRetriever);

        for (let decl of program.declarations)
            this._declarations[program.name] = this._compileDeclarationFunction(decl);

        const immediate = [];
        const rules = [];

        for (let stmt of program.rules) {
            if (stmt.isAssignment || stmt.isCommand)
                immediate.push(stmt);
            else
                rules.push(stmt);
        }

        const compiledCommand = this._compileImmediateStatements(immediate);
        const compiledRules = [];
        for (let rule of rules)
            compiledRules.push(this._compileRule(rule));

        return new CompiledProgram(this._nextStateVar, this._declarations, compiledCommand, compiledRules);
    }
};
