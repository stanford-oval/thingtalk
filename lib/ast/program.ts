// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2021 The Board of Trustees of the Leland Stanford Junior University
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
//         Silei Xu <silei@cs.stanford.edu>

import assert from 'assert';

import Type from '../type';
import Node, {
    SourceRange,
    NLAnnotationMap,
    AnnotationMap,
    AnnotationSpec,
    implAnnotationsToSource,
    nlAnnotationsToSource,
} from './base';
import NodeVisitor from './visitor';
import { Value } from './values';
import { DeviceSelector } from './invocation';
import { BooleanExpression } from './boolean_expression';
import { PermissionFunction } from './permissions';
import { Dataset, FunctionDeclaration, TopLevelExecutableStatement } from './statement';
import { ClassDef } from './class_def';
import {
    FieldSlot,
    AbstractSlot,
    OldSlot
} from './slots';
import * as Optimizer from '../optimize';
import TypeChecker from '../typecheck';
import convertToPermissionRule from './convert_to_permission_rule';
import SchemaRetriever from '../schema';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';

/**
 * A collection of Statements from the same source file.
 *
 * It is somewhat organized for "easier" API handling,
 * and for backward compatibility with API users.
 *
 */
export abstract class Input extends Node {
    static ControlCommand : any;
    isControlCommand ! : boolean;
    static Program : any;
    isProgram ! : boolean;
    static Library : any;
    isLibrary ! : boolean;
    static PermissionRule : any;
    isPermissionRule ! : boolean;
    static DialogueState : any;
    isDialogueState ! : boolean;

    *iterateSlots() : Generator<OldSlot, void> {
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
    }

    optimize() : Input {
        return this;
    }
    abstract clone() : Input;

    /**
     * Typecheck this ThingTalk input.
     *
     * This is the main API to typecheck a ThingTalk input.
     *
     * @param schemas - schema retriever object to retrieve Thingpedia information
     * @param [getMeta=false] - retreive natural language metadata during typecheck
     */
    abstract typecheck(schemas : SchemaRetriever, getMeta ?: boolean) : Promise<this>;
}
Input.prototype.isControlCommand = false;
Input.prototype.isProgram = false;
Input.prototype.isLibrary = false;
Input.prototype.isPermissionRule = false;
Input.prototype.isDialogueState = false;

/**
 * An executable ThingTalk program (containing at least one executable
 * statement).
 *
 */
export class Program extends Input {
    classes : ClassDef[];
    declarations : FunctionDeclaration[];
    statements : TopLevelExecutableStatement[];
    nl_annotations : NLAnnotationMap;
    impl_annotations : AnnotationMap;

    /**
     * Construct a new ThingTalk program.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.ClassDef[]} classes - locally defined classes
     * @param {Ast.Statement.Declaration[]} declarations - declaration statements
     * @param {Ast.Statement[]} rules - executable statements (rules and commands)
     * @param {Ast.Value|null} principal - executor of this program
     * @param {Ast.Statement.OnInputChoice[]} - on input continuations of this program
     */
    constructor(location : SourceRange|null,
                classes : ClassDef[],
                declarations : FunctionDeclaration[],
                statements : TopLevelExecutableStatement[],
                { nl, impl } : AnnotationSpec = {}) {
        super(location);
        assert(Array.isArray(classes));
        this.classes = classes;
        assert(Array.isArray(declarations));
        this.declarations = declarations;
        assert(Array.isArray(statements));
        this.statements = statements;

        this.nl_annotations = nl || {};
        this.impl_annotations = impl || {};
    }

    /**
     * @deprecated
     */
    get principal() : Value|null {
        return this.impl_annotations.executor || null;
    }

    toSource() : TokenStream {
        let input : TokenStream = List.concat(
            nlAnnotationsToSource(this.nl_annotations),
            implAnnotationsToSource(this.impl_annotations),
            '\n',
        );
        for (const classdef of this.classes)
            input = List.concat(input, classdef.toSource(), '\n');
        for (const decl of this.declarations)
            input = List.concat(input, decl.toSource(), '\n');
        for (const stmt of this.statements)
            input = List.concat(input, stmt.toSource(), '\n');
        return input;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitProgram(this)) {
            for (const classdef of this.classes)
                classdef.visit(visitor);
            for (const decl of this.declarations)
                decl.visit(visitor);
            for (const rule of this.statements)
                rule.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        for (const decl of this.declarations)
            yield* decl.iterateSlots();
        for (const rule of this.statements)
            yield* rule.iterateSlots();
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        if (this.principal)
            yield new FieldSlot(null, {}, new Type.Entity('tt:contact'), this.impl_annotations, 'program', 'executor');

        for (const decl of this.declarations)
            yield* decl.iterateSlots2();
        for (const rule of this.statements)
            yield* rule.iterateSlots2();
    }

    clone() : Program {
        // clone annotations
        const nl : NLAnnotationMap = {};
        Object.assign(nl, this.nl_annotations);
        const impl : AnnotationMap = {};
        Object.assign(impl, this.impl_annotations);
        const annotations : AnnotationSpec = { nl, impl };

        return new Program(
            this.location,
            this.classes.map((c) => c.clone()),
            this.declarations.map((d) => d.clone()),
            this.statements.map((s) => s.clone()),
            annotations);
    }

    optimize() : this {
        return Optimizer.optimizeProgram(this);
    }

    async typecheck(schemas : SchemaRetriever, getMeta = false) : Promise<this> {
        const typeChecker = new TypeChecker(schemas, getMeta);
        await typeChecker.typeCheckProgram(this);
        return this;
    }

    /**
     * Attempt to convert this program to an equivalent permission rule.
     *
     * @param principal - the principal to use as source
     * @param contactName - the display value for the principal
     * @return the new permission rule, or `null` if conversion failed
     */
    convertToPermissionRule(principal : string, contactName : string|null) : PermissionRule|null {
        return convertToPermissionRule(this, principal, contactName);
    }
}
Program.prototype.isProgram = true;
Input.Program = Program;

/**
 * An ThingTalk program definining a permission control policy.
 *
 */
export class PermissionRule extends Input {
    principal : BooleanExpression;
    query : PermissionFunction;
    action : PermissionFunction;

    /**
     * Construct a new permission rule.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.BooleanExpression} principal - the predicate selecting
     *        the source of the program this rule is applicable to
     * @param {Ast.PermissionFunction} query - a permission function for the query part
     * @param {Ast.PermissionFunction} action - a permission function for the action part
     */
    constructor(location : SourceRange|null,
                principal : BooleanExpression,
                query : PermissionFunction,
                action : PermissionFunction) {
        super(location);

        assert(principal instanceof BooleanExpression);
        this.principal = principal;

        assert(query instanceof PermissionFunction);
        this.query = query;

        assert(action instanceof PermissionFunction);
        this.action = action;
    }

    toSource() : TokenStream {
        let list : TokenStream = List.concat('$policy', '{', '\t+', '\n',
            this.principal.toSource(), ':');
        if (this.query.isBuiltin)
            list = List.concat(list, 'now');
        else
            list = List.concat(list, this.query.toSource());
        list = List.concat(list, '=>', this.action.toSource(), ';',
            '\t-', '\n', '}');
        return list;
    }

    optimize() : this {
        this.principal = this.principal.optimize();
        this.query.optimize();
        this.action.optimize();
        return this;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitPermissionRule(this)) {
            this.principal.visit(visitor);
            this.query.visit(visitor);
            this.action.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        yield* this.principal.iterateSlots(null, null, {});

        const [,scope] = yield* this.query.iterateSlots({});
        yield* this.action.iterateSlots(scope);
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.principal.iterateSlots2(null, null, {});

        const [,scope] = yield* this.query.iterateSlots2({});
        yield* this.action.iterateSlots2(scope);
    }

    clone() : PermissionRule {
        return new PermissionRule(this.location,
            this.principal.clone(), this.query.clone(), this.action.clone());
    }

    async typecheck(schemas : SchemaRetriever, getMeta = false) : Promise<this> {
        const typeChecker = new TypeChecker(schemas, getMeta);
        await typeChecker.typeCheckPermissionRule(this);
        return this;
    }
}
PermissionRule.prototype.isPermissionRule = true;
Input.PermissionRule = PermissionRule;

/**
 * An ThingTalk input file containing a library of classes and datasets.
 *
 */
export class Library extends Input {
    classes : ClassDef[];
    datasets : Dataset[];

    /**
     * Construct a new ThingTalk library.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.ClassDef[]} classes - classes defined in the library
     * @param {Ast.Dataset[]} datasets - datasets defined in the library
     */
    constructor(location : SourceRange|null,
                classes : ClassDef[],
                datasets : Dataset[]) {
        super(location);
        assert(Array.isArray(classes));
        this.classes = classes;
        assert(Array.isArray(datasets));
        this.datasets = datasets;
    }

    toSource() : TokenStream {
        let input : TokenStream = List.Nil;
        for (const classdef of this.classes)
            input = List.concat(input, classdef.toSource(), '\n');
        for (const dataset of this.datasets)
            input = List.concat(input, dataset.toSource(), '\n');
        return input;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitLibrary(this)) {
            for (const classdef of this.classes)
                classdef.visit(visitor);
            for (const dataset of this.datasets)
                dataset.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        for (const dataset of this.datasets)
            yield* dataset.iterateSlots();
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        for (const dataset of this.datasets)
            yield* dataset.iterateSlots2();
    }

    clone() : Library {
        return new Library(this.location,
            this.classes.map((c) => c.clone()), this.datasets.map((d) => d.clone()));
    }

    optimize() : Library {
        for (const d of this.datasets)
            d.optimize();
        return this;
    }

    async typecheck(schemas : SchemaRetriever, getMeta = false) : Promise<this> {
        const typeChecker = new TypeChecker(schemas, getMeta);
        await typeChecker.typeCheckLibrary(this);
        return this;
    }
}
Library.prototype.isLibrary = true;
Input.Library = Library;
