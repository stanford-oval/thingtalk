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
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const Grammar = require('../grammar');
const { typeCheckProgram } = require('../typecheck');
const { NotCompilableError, NotImplementedError } = require('../errors');
const Ast = require('../ast');

const JSIr = require('./jsir');
const { compileStatementToOp, compileStreamToOps, compileTableToOps } = require('./ast-to-ops');
const { QueryInvocationHints } = require('./ops');
const { getDefaultProjection } = require('./utils');
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
        this._nextProcId = 0;

        this._astVars = [];
    }

    compileCode(code) {
        return this.compileProgram(Grammar.parse(code));
    }

    _allocState() {
        return this._nextStateVar++;
    }

    _allocAst(v) {
        this._astVars.push(v);
        return this._astVars.length-1;
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
        const irBuilder = new JSIr.IRBuilder(parentIRBuilder ? parentIRBuilder.nextRegister : 0, ['__emit']);

        const functionScope = new Scope(this._declarations);
        const args = this._declareArguments(decl.args, functionScope, irBuilder);
        const opCompiler = new OpCompiler(this, functionScope, irBuilder);
        let op;

        const hints = new QueryInvocationHints(new Set(getDefaultProjection(decl.schema)));

        switch (decl.type) {
        case 'query':
            op = compileTableToOps(decl.value, [], hints);
            opCompiler.compileQueryDeclaration(op);
            break;

        case 'stream':
            op = compileStreamToOps(decl.value, hints);
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

    _compileAssignment(assignment, irBuilder, { hasAnyStream, forProcedure}) {
        const opCompiler = new OpCompiler(this, this._declarations, irBuilder, forProcedure);

        // at the top level, assignments can be referred to by streams, so
        // they need to be persistent (save to disk) such that when the program
        // is restarted, the result can be reused.
        // (this is only needed in top-level since stream is not allowed within
        // procedures)
        const isPersistent = hasAnyStream;

        let register;

        if (assignment.isAction) {
            register = opCompiler.compileActionAssignment(assignment.value, isPersistent);
        } else {
            const hints = new QueryInvocationHints(new Set(getDefaultProjection(assignment.value.schema)));
            const tableop = compileTableToOps(assignment.value, [], hints);
            register = opCompiler.compileAssignment(tableop, isPersistent);
        }

        this._declarations.set(assignment.name, {
            type: 'assignment',
            isPersistent, register,
            schema: assignment.schema
        });
    }

    _compileProcedure(decl, parentIRBuilder) {
        const saveScope = this._declarations;

        const irBuilder = new JSIr.IRBuilder(parentIRBuilder ? parentIRBuilder.nextRegister : 0, ['__emit']);

        const procid = this._nextProcId++;
        irBuilder.setBeginEndHooks(
            new JSIr.EnterProcedure(procid, decl.name),
            new JSIr.ExitProcedure(procid, decl.name)
        );

        const procedureScope = new Scope(this._declarations);
        const args = this._declareArguments(decl.args, procedureScope, irBuilder);
        this._declarations = procedureScope;

        this._compileInScope(decl.value, decl.value.rules, irBuilder, {
            hasAnyStream: false,
            forProcedure: true
        });

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

    _doCompileStatement(stmt, irBuilder, forProcedure) {
        const opCompiler = new OpCompiler(this, this._declarations, irBuilder, forProcedure);
        let ruleop = compileStatementToOp(stmt);
        opCompiler.compileStatement(ruleop);
    }

    _compileRule(rule) {
        // each rule goes into its own JS function
        const irBuilder = new JSIr.IRBuilder();
        this._doCompileStatement(rule, irBuilder);

        return this._testMode ? irBuilder.codegen() : irBuilder.compile(this._toplevelscope);
    }

    _compileInScope(program, stmts, irBuilder, { hasAnyStream, forProcedure }) {
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
        if (!irBuilder) {
            irBuilder = new JSIr.IRBuilder();
            const procid = this._nextProcId++;
            irBuilder.setBeginEndHooks(
                new JSIr.EnterProcedure(procid),
                new JSIr.ExitProcedure(procid)
            );
        }
        
        for (let i = 0; i < stmts.length; i++) {
            // if this is not the first statement, clear the get cache before running it
            if (i !== 0)
                irBuilder.add(new JSIr.ClearGetCache());
            if (stmts[i].isAssignment)
                this._compileAssignment(stmts[i], irBuilder, { hasAnyStream, forProcedure });
            else
                this._doCompileStatement(stmts[i], irBuilder, forProcedure);
        }

        return irBuilder;
    }

    _verifyCompilable(program) {
        if (program.principal !== null)
            throw new NotCompilableError(`Remote programs cannot be compiled, they must be sent to a different runtime instead`);

        for (let slot of program.iterateSlots2()) {
            if (slot instanceof Ast.Selector) {
                if (slot.principal !== null)
                    throw new NotCompilableError(`Remote primitives cannot be compiled, they must be lowered and sent to a different runtime instead`);
                continue;
            }
            if (!slot.isCompilable())
                throw new NotCompilableError(`Programs with slots or unresolved values cannot be compiled, and must be slot-filled first`);
        }
    }

    async compileProgram(program) {
        await typeCheckProgram(program, this._schemaRetriever);
        this._verifyCompilable(program);

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
        const commandIRBuilder = this._compileInScope(program, immediate, null, {
            hasAnyStream: rules.length > 0,
            forProcedure: false
        });
        let compiledCommand;
        if (commandIRBuilder !== null) {
            if (this._testMode)
                compiledCommand = commandIRBuilder.codegen();
            else
                compiledCommand = commandIRBuilder.compile(this._toplevelscope, this._astVars);
        } else {
            compiledCommand = null;
        }
        for (let rule of rules)
            compiledRules.push(this._compileRule(rule));

        return new CompiledProgram(this._nextStateVar, compiledCommand, compiledRules);
    }
};
