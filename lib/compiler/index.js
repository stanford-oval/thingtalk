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
const { compileStatementToOp, compileStreamToOps, compileTableToOps } = require('./ast-to-ops');
const OpCompiler = require('./ops-to-jsir');

class CompiledProgram {
    constructor(states, command, rules) {
        this.hasTrigger = rules.length > 0;

        this.states = states;
        this.command = command;
        this.rules = rules;
    }
}

class Scope {
    constructor(parent = null) {
        this._parent = parent;
        this._names = Object.create(null);
    }

    get(name) {
        // we don't need to check if the name is visible in some scope,
        // we know it is because the program typechecked
        if (name in this._names)
            return this._names[name];
        else
            return this._parent.get(name);
    }

    set(name, value) {
        this._names[name] = value;
    }

    *_doIterate(seen) {
        for (let name in this._names) {
            if (seen.has(name))
                continue;
            seen.add(name);
            yield [name, this._names[name]];
        }
        if (this._parent)
            yield* this._parent._doIterate(seen);
    }

    *[Symbol.iterator]() {
        const seen = new Set;
        yield* this._doIterate(seen);
    }
}

module.exports = class AppCompiler {
    constructor(schemaRetriever, testMode) {
        this._testMode = testMode;
        this._declarations = null;
        this._alldeclarations = undefined;
        if (this._testMode)
            this._alldeclarations = [];

        this._schemaRetriever = schemaRetriever;
        this._nextStateVar = 0;
    }

    compileCode(code) {
        return this.compileProgram(Grammar.parse(code));
    }

    _allocState() {
        return this._nextStateVar++;
    }

    _getDeclaration(name) {
        return this._declarations.get(name);
    }

    _getCurrentScope() {
        let flatscope = {};
        for (let [name, value] of this._declarations)
            flatscope[name] = value.code;
        return flatscope;
    }

    _compileDeclarationFunction(decl) {
        const extraParams = decl.type === 'action' ? [] : ['emit'];

        const irBuilder = new JSIr.IRBuilder(extraParams);
        const opCompiler = new OpCompiler(this, irBuilder);
        const args = opCompiler.declareArguments(decl.args);
        let op;

        switch (decl.type) {
        case 'query':
            op = compileTableToOps(decl.value, []);
            opCompiler.compileQueryDeclaration(op);
            break;

        case 'stream':
            op = compileStreamToOps(decl.value);
            opCompiler.compileStreamDeclaration(op);
            break;

        case 'action':
            opCompiler.compileActionDeclaration(decl.value);
            break;
        }

        const code = this._testMode ? irBuilder.codegen() : irBuilder.compile(this._getCurrentScope());
        if (this._testMode)
            this._alldeclarations.push(code);

        const compiled = {
            args, code,
            schema: decl.schema,
        };
        this._declarations.set(decl.name, compiled);
    }

    _doCompileStatement(stmt, irBuilder) {
        const opCompiler = new OpCompiler(this, irBuilder);
        let ruleop = compileStatementToOp(stmt);
        opCompiler.compileStatement(ruleop);
    }

    _compileRule(rule) {
        // each rule goes into its own JS function
        const irBuilder = new JSIr.IRBuilder();
        this._doCompileStatement(rule, irBuilder);

        return this._testMode ? irBuilder.codegen() : irBuilder.compile(this._getCurrentScope());
    }

    _compileInScope(program, stmts) {
        for (let decl of program.declarations) {
            if (['stream', 'query', 'action'].indexOf(decl.type) >= 0)
                this._declarations[decl.name] = this._compileDeclarationFunction(decl);
            else
                throw new NotImplementedError(decl);
        }

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

        return this._testMode ? irBuilder.codegen() : irBuilder.compile(this._getCurrentScope());
    }

    async compileProgram(program) {
        await typeCheckProgram(program, this._schemaRetriever);

        const compiledRules = [];
        const immediate = [];
        const rules = [];

        for (let stmt of program.rules) {
            if (stmt.isAssignment || stmt.isCommand)
                immediate.push(stmt);
            else
                rules.push(stmt);
        }

        this._declarations = new Scope;
        const compiledCommand = this._compileInScope(program, immediate);
        for (let rule of rules)
            compiledRules.push(this._compileRule(rule));

        return new CompiledProgram(this._nextStateVar, compiledCommand, compiledRules);
    }
};
