// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import assert from 'assert';
import * as Grammar from '../grammar';
import { typeCheckProgram } from '../typecheck';
import { NotCompilableError, NotImplementedError } from '../utils/errors';
import * as Ast from '../ast';
import { TypeMap } from '../type';

import * as JSIr from './jsir';
import { compileStatementToOp, compileStreamToOps, compileTableToOps } from './ast-to-ops';
import { QueryInvocationHints } from './ops';
import { getDefaultProjection } from './utils';
import OpCompiler from './ops-to-jsir';
import Scope from './scope';
import type ExecEnvironment from '../runtime/exec_environment';
import type SchemaRetriever from '../schema';

export interface CompiledStatement {
    (env : ExecEnvironment) : Promise<void>;
}

export class CompiledProgram {
    hasTrigger : boolean;
    states : number;
    command : CompiledStatement|string|null;
    rules : Array<CompiledStatement|string>;

    constructor(states : number,
                command : CompiledStatement|string|null,
                rules : Array<CompiledStatement|string>) {
        this.hasTrigger = rules.length > 0;

        this.states = states;
        this.command = command;
        this.rules = rules;
    }
}

type TopLevelScope = {
    [key : string] : CompiledStatement|string
};

interface StatementCompileOptions {
    hasAnyStream : boolean;
    forProcedure : boolean;
}

export default class AppCompiler {
    private _testMode : boolean;
    private _declarations : Scope;
    private _toplevelscope : TopLevelScope;

    private _schemaRetriever : SchemaRetriever;
    private _nextStateVar : number;
    private _nextProcId : number;

    private _astVars : Ast.Node[];

    constructor(schemaRetriever : SchemaRetriever,
                testMode = false) {
        this._testMode = testMode;
        this._declarations = new Scope;
        this._toplevelscope = {};

        this._schemaRetriever = schemaRetriever;
        this._nextStateVar = 0;
        this._nextProcId = 0;

        this._astVars = [];
    }

    compileCode(code : string) : Promise<CompiledProgram> {
        return this.compileProgram(Grammar.parse(code));
    }

    _allocState() : number {
        return this._nextStateVar++;
    }

    _allocAst(v : Ast.Node) : number {
        this._astVars.push(v);
        return this._astVars.length-1;
    }

    private _declareArguments(args : TypeMap,
                              scope : Scope,
                              irBuilder : JSIr.IRBuilder) {
        const compiledArgs = [];

        for (const name in args) {
            const reg = irBuilder.allocArgument();
            scope.set(name, {
                type: 'scalar',
                tt_type: args[name],
                register: reg,
                direction: 'input',
                isInVarScopeNames: false
            });
            compiledArgs.push(name);
        }

        return compiledArgs;
    }

    private _compileDeclarationFunction(decl : Ast.Declaration,
                                        parentIRBuilder : JSIr.IRBuilder|null) : void {
        const irBuilder = new JSIr.IRBuilder(parentIRBuilder ? parentIRBuilder.nextRegister : 0, ['__emit']);

        const functionScope = new Scope(this._declarations);
        const args = this._declareArguments(decl.args, functionScope, irBuilder);
        const opCompiler = new OpCompiler(this, functionScope, irBuilder, false);
        let op;

        const schema = decl.schema;
        assert(schema);
        const hints = new QueryInvocationHints(new Set(getDefaultProjection(schema)));

        switch (decl.type) {
        case 'query':
            assert(decl.value instanceof Ast.Table);
            op = compileTableToOps(decl.value, [], hints);
            opCompiler.compileQueryDeclaration(op);
            break;

        case 'stream':
            assert(decl.value instanceof Ast.Stream);
            op = compileStreamToOps(decl.value, hints);
            opCompiler.compileStreamDeclaration(op);
            break;

        case 'action':
            assert(decl.value instanceof Ast.Action);
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
            code = this._testMode ? irBuilder.codegen() : irBuilder.compile(this._toplevelscope, this._astVars);
            this._toplevelscope[decl.name] = code;
        }

        this._declarations.set(decl.name, {
            type: 'declaration',
            args, code, register, schema,
        });
    }

    private _compileAssignment(assignment : Ast.Assignment,
                               irBuilder : JSIr.IRBuilder,
                               { hasAnyStream, forProcedure } : StatementCompileOptions) {
        const opCompiler = new OpCompiler(this, this._declarations, irBuilder, forProcedure);

        // at the top level, assignments can be referred to by streams, so
        // they need to be persistent (save to disk) such that when the program
        // is restarted, the result can be reused.
        // (this is only needed in top-level since stream is not allowed within
        // procedures)
        const isPersistent = hasAnyStream;

        let register;

        if (assignment.isAction) {
            assert(assignment.value instanceof Ast.InvocationTable ||
                   assignment.value instanceof Ast.VarRefTable);
            register = opCompiler.compileActionAssignment(assignment.value, isPersistent);
        } else {
            const schema = assignment.value.schema;
            assert(schema);
            const hints = new QueryInvocationHints(new Set(getDefaultProjection(schema)));
            const tableop = compileTableToOps(assignment.value, [], hints);
            register = opCompiler.compileAssignment(tableop, isPersistent);
        }

        const schema = assignment.schema;
        assert(schema);
        this._declarations.set(assignment.name, {
            type: 'assignment',
            isPersistent, register, schema
        });
    }

    private _compileProcedure(decl : Ast.Declaration,
                              parentIRBuilder : JSIr.IRBuilder|null) {
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

        assert(decl.value instanceof Ast.Program);
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
            code = this._testMode ? irBuilder.codegen() : irBuilder.compile(this._toplevelscope, this._astVars);
            this._toplevelscope[decl.name] = code;
        }

        this._declarations = saveScope;

        assert(decl.schema);
        this._declarations.set(decl.name, {
            type: 'procedure',
            args, code, register,
            schema: decl.schema,
        });
    }

    private _doCompileStatement(stmt : Ast.Rule|Ast.Command,
                                irBuilder : JSIr.IRBuilder,
                                forProcedure : boolean) {
        const opCompiler = new OpCompiler(this, this._declarations, irBuilder, forProcedure);
        const ruleop = compileStatementToOp(stmt);
        opCompiler.compileStatement(ruleop);
    }

    private _compileRule(rule : Ast.Rule|Ast.Command) : string|CompiledStatement {
        // each rule goes into its own JS function
        const irBuilder = new JSIr.IRBuilder();
        this._doCompileStatement(rule, irBuilder, false);

        return this._testMode ? irBuilder.codegen() : irBuilder.compile(this._toplevelscope, this._astVars);
    }

    private _compileInScope(program : Ast.Program,
                            stmts : Ast.ExecutableStatement[],
                            irBuilder : JSIr.IRBuilder|null,
                            { hasAnyStream, forProcedure } : StatementCompileOptions) {
        for (const decl of program.declarations) {
            if (['stream', 'query', 'action'].indexOf(decl.type) >= 0)
                this._compileDeclarationFunction(decl, irBuilder);
            else if (decl.type === 'procedure')
                this._compileProcedure(decl, irBuilder);
            else
                throw new NotImplementedError(String(decl));
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

            const stmt = stmts[i];
            if (stmt instanceof Ast.Assignment)
                this._compileAssignment(stmt, irBuilder, { hasAnyStream, forProcedure });
            else
                this._doCompileStatement(stmt, irBuilder, forProcedure);
        }

        return irBuilder;
    }

    private _verifyCompilable(program : Ast.Program) {
        if (program.principal !== null)
            throw new NotCompilableError(`Remote programs cannot be compiled, they must be sent to a different runtime instead`);

        for (const slot of program.iterateSlots2()) {
            if (slot instanceof Ast.DeviceSelector) {
                if (slot.principal !== null)
                    throw new NotCompilableError(`Remote primitives cannot be compiled, they must be lowered and sent to a different runtime instead`);
                continue;
            }
            if (!slot.isCompilable())
                throw new NotCompilableError(`Programs with slots or unresolved values cannot be compiled, and must be slot-filled first`);
        }
    }

    async compileProgram(program : Ast.Program) : Promise<CompiledProgram> {
        await typeCheckProgram(program, this._schemaRetriever);
        this._verifyCompilable(program);

        const compiledRules : Array<string|CompiledStatement> = [];
        const immediate : Array<Ast.Assignment|Ast.Command> = [];
        const rules : Ast.Rule[] = [];

        for (const stmt of program.rules) {
            if (stmt instanceof Ast.Assignment || stmt instanceof Ast.Command)
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
        for (const rule of rules)
            compiledRules.push(this._compileRule(rule));

        return new CompiledProgram(this._nextStateVar, compiledCommand, compiledRules);
    }
}
