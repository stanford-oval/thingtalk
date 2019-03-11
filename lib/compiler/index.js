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
const Scope = require('./scope');

class CompiledProgram {
    constructor(states, command, rules) {
        this.hasTrigger = rules.length > 0;

        this.states = states;
        this.command = command;
        this.rules = rules;
    }
}

module.exports = class AppCompiler {
    constructor(schemaRetriever, testMode) {
        this._testMode = testMode;
        this._declarations = null;
        this._toplevelscope = {};

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
        for (let [name, value] of this._declarations) {
            if (value.type === 'declaration')
                flatscope[name] = value.code;
        }
        return flatscope;
    }

    _declareArguments(args, scope, irBuilder) {
        const compiledArgs = [];

        for (let name in args) {
            const reg = irBuilder.allocArgument();
            scope.set(name, {
                type: 'scalar',
                tt_type: args[name],
                register: reg
            });
            compiledArgs.push(name);
        }

        return compiledArgs;
    }

    _compileDeclarationFunction(decl, parentIRBuilder) {
        const extraParams = decl.type === 'action' ? [] : ['emit'];

        const irBuilder = new JSIr.IRBuilder(parentIRBuilder ? parentIRBuilder.nextRegister : 0, extraParams);

        const functionScope = new Scope(this._declarations);
        const args = this._declareArguments(decl.args, functionScope, irBuilder);
        const opCompiler = new OpCompiler(this, functionScope, irBuilder);
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

        let code;
        let register;
        if (parentIRBuilder) {
            parentIRBuilder.skipRegisterRange(irBuilder.registerRange);

            register = parentIRBuilder.allocRegister();
            parentIRBuilder.add(new JSIr.AsyncFunctionDeclaration(register, irBuilder));
            code = null;
        } else {
            register = null;
            code = this._testMode ? irBuilder.codegen() : irBuilder.compile(this._toplevelscope);
            this._toplevelscope[decl.name] = code;
        }

        this._declarations.set(decl.name, {
            type: 'declaration',
            args, code, register,
            schema: decl.schema,
        });
    }

    _compileAssignment(assignment, irBuilder, hasAnyStream) {
        const opCompiler = new OpCompiler(this, this._declarations, irBuilder);
        const tableop = compileTableToOps(assignment.value, []);

        // at the top level, assignments can be referred to by streams, so
        // they need to be persistent
        const isPersistent = hasAnyStream;
        const register = opCompiler.compileAssignment(tableop, isPersistent);

        this._declarations.set(assignment.name, {
            type: 'assignment',
            isPersistent, register,
            schema: assignment.schema
        });
    }

    _compileProcedure(decl, parentIRBuilder) {
        const saveScope = this._declarations;

        const irBuilder = new JSIr.IRBuilder(parentIRBuilder ? parentIRBuilder.nextRegister : 0, []);

        const procedureScope = new Scope(this._declarations);
        const args = this._declareArguments(decl.args, procedureScope, irBuilder);

        this._declarations = procedureScope;

        this._compileInScope(decl.value, decl.value.rules, false, irBuilder);

        let code;
        let register;
        if (parentIRBuilder) {
            parentIRBuilder.skipRegisterRange(irBuilder.registerRange);

            register = parentIRBuilder.allocRegister();
            parentIRBuilder.add(new JSIr.AsyncFunctionDeclaration(register, irBuilder));
            code = null;
        } else {
            register = null;
            code = this._testMode ? irBuilder.codegen() : irBuilder.compile(this._toplevelscope);
            this._toplevelscope[decl.name] = code;
        }

        this._declarations = saveScope;

        this._declarations.set(decl.name, {
            type: 'procedure',
            args, code, register,
            schema: decl.schema,
        });
    }

    _doCompileStatement(stmt, irBuilder) {
        const opCompiler = new OpCompiler(this, this._declarations, irBuilder);
        let ruleop = compileStatementToOp(stmt);
        opCompiler.compileStatement(ruleop);
    }

    _compileRule(rule) {
        // each rule goes into its own JS function
        const irBuilder = new JSIr.IRBuilder();
        this._doCompileStatement(rule, irBuilder);

        return this._testMode ? irBuilder.codegen() : irBuilder.compile(this._toplevelscope);
    }

    _compileInScope(program, stmts, hasAnyStream, irBuilder) {
        for (let decl of program.declarations) {
            if (['stream', 'query', 'action'].indexOf(decl.type) >= 0)
                this._declarations[decl.name] = this._compileDeclarationFunction(decl, irBuilder);
            else if (decl.type === 'procedure')
                this._compileProcedure(decl, irBuilder);
            else
                throw new NotImplementedError(decl);
        }

        if (stmts.length === 0)
            return null;

        // all immediate statements are compiled into a single function, so we
        // create a single irBuilder that we share
        if (!irBuilder)
            irBuilder = new JSIr.IRBuilder();
        for (let i = 0; i < stmts.length; i++) {
            // if this is not the first statement, clear the get cache before running it
            if (i !== 0)
                irBuilder.add(new JSIr.ClearGetCache());
            if (stmts[i].isAssignment)
                this._compileAssignment(stmts[i], irBuilder, hasAnyStream);
            else
                this._doCompileStatement(stmts[i], irBuilder);
        }

        return irBuilder;
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
        const commandIRBuilder = this._compileInScope(program, immediate, rules.length > 0, null);
        let compiledCommand;
        if (commandIRBuilder !== null) {
            if (this._testMode)
                compiledCommand = commandIRBuilder.codegen();
            else
                compiledCommand = commandIRBuilder.compile(this._toplevelscope);
        } else {
            compiledCommand = null;
        }
        for (let rule of rules)
            compiledRules.push(this._compileRule(rule));

        return new CompiledProgram(this._nextStateVar, compiledCommand, compiledRules);
    }
};
