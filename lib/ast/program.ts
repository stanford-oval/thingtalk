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
//         Silei Xu <silei@cs.stanford.edu>
import assert from 'assert';

import Type, { TypeMap } from '../type';
import Node, {
    SourceRange,
    NLAnnotationMap,
    AnnotationMap,
    AnnotationSpec,
    implAnnotationsToSource,
    nlAnnotationsToSource,
} from './base';
import NodeVisitor from './visitor';
import { Value, VarRefValue } from './values';
import { DeviceSelector, InputParam, BooleanExpression } from './expression';
import {
    Stream,
    Table,
    Action,
    PermissionFunction
} from './primitive';
import {
    Expression,
    ChainExpression
} from './expression2';
import { ClassDef } from './class_def';
import { FunctionDef, ExpressionSignature } from './function_def';
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
 * The base class of all AST nodes that represent complete ThingTalk
 * statements.
 *
 * @alias Ast.Statement
 * @extends Ast~Node
 * @abstract
 */
export abstract class Statement extends Node {
    /**
     * Iterate all slots (scalar value nodes) in this statement.
     *
     * @deprecated This method is only appropriate for filters and input parameters.
     *   You should use {@link Ast.Statement#iterateSlots2} instead.
     */
    abstract iterateSlots() : Generator<OldSlot, void>;

    /**
     * Iterate all slots (scalar value nodes) in this statement.
     */
    abstract iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void>;

    /**
     * Clone this statement.
     */
    abstract clone() : Statement;
}

function declarationLikeToProgram(self : FunctionDeclaration|Example) : Program {
    const nametoslot : { [key : string] : number } = {};

    let i = 0;
    for (const name in self.args)
        nametoslot[name] = i++;

    let declarations : FunctionDeclaration[], statements : ExecutableStatement[];
    if (self instanceof Example) {
        declarations = [];
        statements = [new ExpressionStatement(null, self.value)];
    } else {
        declarations = self.declarations.map((d) => d.clone());
        statements = self.statements.map((s) => s.clone());
    }

    const program = new Program(null, [], declarations, statements);
    program.visit(new class extends NodeVisitor {
        visitVarRefValue(value : VarRefValue) {
            if (value.name in nametoslot)
                value.name = '__const_SLOT_' + nametoslot[value.name];
            return true;
        }
    });
    return program;
}

/**
 * A ThingTalk function declaration.
 *
 * A declaration statement creates a new, locally scoped, function
 * implemented as ThingTalk expression. The name can then be invoked
 * in subsequent statements.
 *
 * @alias Ast.Statement.Declaration
 * @extends Ast.Statement
 */
export class FunctionDeclaration extends Statement {
    name : string;
    args : TypeMap;
    declarations : FunctionDeclaration[];
    statements : ExecutableStatement[];
    nl_annotations : NLAnnotationMap;
    impl_annotations : AnnotationMap;
    schema : FunctionDef|null;

    /**
     * Construct a new declaration statement.
     *
     * @param location - the position of this node in the source code
     * @param name - the name being bound by this statement
     * @param type - what type of function is being declared,
     *                        either `stream`, `query`, `action`, `program` or `procedure`
     * @param args - any arguments available to the function
     * @param value - the declaration body
     * @param metadata - declaration metadata (translatable annotations)
     * @param annotations - declaration annotations
     * @param schema - the type definition corresponding to this declaration
     */
    constructor(location : SourceRange|null,
                name : string,
                args : TypeMap,
                declarations : FunctionDeclaration[],
                statements : ExecutableStatement[],
                annotations : AnnotationSpec = {},
                schema : FunctionDef|null = null) {
        super(location);

        assert(typeof name === 'string');
        /**
         * The name being bound by this statement.
         * @type {string}
         */
        this.name = name;

        assert(typeof args === 'object');
        /**
         * Arguments available to the function.
         */
        this.args = args;

        this.declarations = declarations;
        this.statements = statements;

        /**
         * The declaration natural language annotations (translatable annotations).
         */
        this.nl_annotations = annotations.nl || {};
        /**
         * The declaration annotations.
         */
        this.impl_annotations = annotations.impl || {};

        /**
         * The type definition corresponding to this function.
         *
         * This property is guaranteed not `null` after type-checking.
         */
        this.schema = schema;
    }

    optimize() : this {
        return Optimizer.optimizeProgram(this);
    }

    toSource() : TokenStream {
        let list : TokenStream = List.concat('function', this.name, '(', '\t=+');
        let first = true;
        for (const argname in this.args) {
            const argtype = this.args[argname];
            if (first)
                first = false;
            else
                list = List.concat(list, ',', '\n');
            list = List.concat(list, argname, ':', argtype.toSource());
        }
        list = List.concat(list, ')', '\t=-', ' ', '{', '\t+', '\n');
        for (const stmt of this.declarations)
            list = List.concat(list, stmt.toSource(), '\n');
        for (const stmt of this.statements)
            list = List.concat(list, stmt.toSource(), '\n');
        list = List.concat(list, '\t-', '}');
        return list;
    }

    get metadata() : NLAnnotationMap {
        return this.nl_annotations;
    }
    get annotations() : AnnotationMap {
        return this.impl_annotations;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitFunctionDeclaration(this)) {
            for (const decl of this.declarations)
                decl.visit(visitor);
            for (const stmt of this.statements)
                stmt.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        // the declaration refers to a nested scope, we don't need to
        // slot fill it now
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        // the declaration refers to a nested scope, we don't need to
        // slot fill it now
    }

    clone() : FunctionDeclaration {
        const newArgs = {};
        Object.assign(newArgs, this.args);

        const newMetadata = {};
        Object.assign(newMetadata, this.nl_annotations);
        const newAnnotations = {};
        Object.assign(newAnnotations, this.impl_annotations);
        return new FunctionDeclaration(this.location, this.name, newArgs,
            this.declarations.map((d) => d.clone()),
            this.statements.map((s) => s.clone()),
            { nl: newMetadata, impl: newAnnotations }, this.schema);
    }

    /**
     * Convert a declaration to a program.
     *
     * This will create a program that invokes the same code as the declaration value,
     * and will replace all parameters with slots.
     *
     * @return {Ast.Program} the new program
     */
    toProgram() : Program {
        return declarationLikeToProgram(this);
    }
}

/**
 * `let result` statements, that assign the value of a ThingTalk expression to a name.
 *
 * Assignment statements are executable statements that evaluate the ThingTalk expression
 * and assign the result to the name, which becomes available for later use in the program.
 *
 * @alias Ast.Statement.Assignment
 * @extends Ast.Statement
 */
export class Assignment extends Statement {
    name : string;
    /**
     * The expression being assigned.
     * @type {Ast.Table}
     */
    value : Expression;
    schema : ExpressionSignature|null;

    /**
     * Construct a new assignment statement.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the name being assigned to
     * @param {Ast.Table} value - the expression being assigned
     * @param {Ast.ExpressionSignature | null} schema - the signature corresponding to this assignment
     */
    constructor(location : SourceRange|null,
                name : string,
                value : Expression,
                schema : ExpressionSignature|null = null) {
        super(location);

        assert(typeof name === 'string');
        /**
         * The name being assigned to.
         * @type {string}
         */
        this.name = name;

        assert(value instanceof Expression);
        this.value = value;

        /**
         * The signature corresponding to this assignment.
         *
         * This is the type that the assigned name has after the assignment statement.
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.ExpressionSignature|null}
         */
        this.schema = schema;
    }

    toSource() : TokenStream {
        return List.concat('let', this.name, ' ', '=', ' ', this.value.toSource(), ';');
    }

    /**
     * Whether this assignment calls an action or executes a query.
     *
     * This will be `undefined` before typechecking, and then either `true` or `false`.
     * @type {boolean}
     */
    get isAction() : boolean {
        return this.schema!.functionType === 'action';
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAssignment(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        yield* this.value.iterateSlots({});
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.value.iterateSlots2({});
    }

    clone() : Assignment {
        return new Assignment(this.location, this.name, this.value.clone(), this.schema);
    }
}

/**
 * @deprecated Use {@link ExpressionStatement} instead.
 */
export class Rule extends Statement {
    stream : Stream;
    actions : Action[];
    isRule = true;

    /**
     * Construct a new rule statement.
     *
     * @param location - the position of this node
     *        in the source code
     * @param stream - the stream to react to
     * @param actions - the actions to execute
     */
    constructor(location : SourceRange|null,
                stream : Stream,
                actions : Action[]) {
        super(location);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(Array.isArray(actions));
        this.actions = actions;
    }

    toSource() : TokenStream {
        assert(this.actions.length === 1);
        return List.concat(this.stream.toSource(), '=>', this.actions[0].toSource(), ';');
    }

    toExpression() : ExpressionStatement {
        const exprs = [this.stream.toExpression()].concat(this.actions.filter((a) => !a.isNotify).map((a) => a.toExpression()));
        return new ExpressionStatement(this.location, new ChainExpression(this.location, exprs, null));
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitRule(this)) {
            this.stream.visit(visitor);
            for (const action of this.actions)
                action.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        const [,scope] = yield* this.stream.iterateSlots({});
        for (const action of this.actions)
            yield* action.iterateSlots(scope);
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        const [,scope] = yield* this.stream.iterateSlots2({});
        for (const action of this.actions)
            yield* action.iterateSlots2(scope);
    }

    clone() : Rule {
        return new Rule(this.location, this.stream.clone(), this.actions.map((a) => a.clone()));
    }
}

/**
 * @deprecated Use {@link ExpressionStatement} instead.
 */
export class Command extends Statement {
    table : Table|null;
    actions : Action[];
    isCommand = true;

    /**
     * Construct a new command statement.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Table|null} table - the table to read from
     * @param {Ast.Action[]} actions - the actions to execute
     */
    constructor(location : SourceRange|null,
                table : Table|null,
                actions : Action[]) {
        super(location);

        assert(table === null || table instanceof Table);
        this.table = table;

        assert(Array.isArray(actions));
        this.actions = actions;
    }

    toExpression() : ExpressionStatement {
        const exprs : Expression[] = [];
        if (this.table)
            exprs.push(this.table.toExpression([]));
        exprs.push(...this.actions.filter((a) => !a.isNotify).map((a) => a.toExpression()));
        return new ExpressionStatement(this.location, new ChainExpression(this.location, exprs, null));
    }

    toSource() : TokenStream {
        assert(this.actions.length === 1);
        if (this.table)
            return List.concat(this.table.toSource(), '=>', this.actions[0].toSource(), ';');
        else
            return List.concat(this.actions[0].toSource(), ';');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitCommand(this)) {
            if (this.table !== null)
                this.table.visit(visitor);
            for (const action of this.actions)
                action.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        let scope = {};
        if (this.table)
            [,scope] = yield* this.table.iterateSlots({});
        for (const action of this.actions)
            yield* action.iterateSlots(scope);
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        let scope = {};
        if (this.table)
            [,scope] = yield* this.table.iterateSlots2({});
        for (const action of this.actions)
            yield* action.iterateSlots2(scope);
    }

    clone() : Command {
        return new Command(this.location,
            this.table !== null ? this.table.clone() : null,
            this.actions.map((a) => a.clone()));
    }
}

/**
 * A statement that evaluates an expression and presents the results
 * to the user.
 */
export class ExpressionStatement extends Statement {
    expression : ChainExpression;

    constructor(location : SourceRange|null,
                expression : Expression) {
        super(location);

        if (!(expression instanceof ChainExpression))
            this.expression = new ChainExpression(location, [expression], expression.schema);
        else
            this.expression = expression;

        assert(this.expression.expressions.length > 0);
    }

    get first() : Expression {
        return this.expression.first;
    }

    get last() : Expression {
        return this.expression.last;
    }

    get stream() : Expression|null {
        const first = this.first;
        if (first.schema!.functionType === 'stream')
            return first;
        else
            return null;
    }

    get lastQuery() : Expression|null {
        return this.expression.lastQuery;
    }

    toLegacy(scope_params : string[] = []) : Rule|Command {
        const last = this.last;
        const action = last.schema!.functionType === 'action' ? last : null;
        let head : Stream|Table|null = null;
        if (action) {
            const remaining = this.expression.expressions.slice(0, this.expression.expressions.length-1);
            if (remaining.length > 0) {
                const converted = new ChainExpression(null, remaining, null).toLegacy([], scope_params);
                assert(converted instanceof Stream || converted instanceof Table);
                head = converted;
            }
        } else {
            const converted  = this.expression.toLegacy([], scope_params);
            assert(converted instanceof Stream || converted instanceof Table);
            head = converted;
        }
        const convertedAction = action ? action.toLegacy([], scope_params) : null;
        assert(convertedAction === null || convertedAction instanceof Action);

        if (head instanceof Stream)
            return new Rule(this.location, head, convertedAction ? [convertedAction] : [Action.notifyAction()]);
        else
            return new Command(this.location, head, convertedAction ? [convertedAction] : [Action.notifyAction()]);
    }

    toSource() : TokenStream {
        return List.concat(this.expression.toSource(), ';');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitExpressionStatement(this))
            this.expression.visit(visitor);
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        yield* this.expression.iterateSlots({});
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.expression.iterateSlots2({});
    }

    clone() : ExpressionStatement {
        return new ExpressionStatement(this.location, this.expression.clone());
    }
}

/**
 * A statement that declares a ThingTalk dataset (collection of primitive
 * templates).
 *
 * @alias Ast.Dataset
 * @extends Ast.Statement
 */
export class Dataset extends Statement {
    name : string;
    examples : Example[];
    nl_annotations : NLAnnotationMap;
    impl_annotations : AnnotationMap;

    /**
     * Construct a new dataset.
     *
     * @param location - the position of this node in the source code
     * @param name - the name of this dataset
     * @param language - the language code of this dataset, as 2 letter ISO code
     * @param examples - the examples in this dataset
     * @param [annotations={}]- dataset annotations
     */
    constructor(location : SourceRange|null,
                name : string,
                examples : Example[],
                annotations : AnnotationSpec = {}) {
        super(location);

        assert(typeof name === 'string');
        assert(!name.startsWith('@'));
        this.name = name;

        assert(Array.isArray(examples)); // of Example
        this.examples = examples;

        this.impl_annotations = annotations.impl||{};
        this.nl_annotations = annotations.nl||{};
    }

    toSource() : TokenStream {
        let list : TokenStream = List.concat('dataset', '@' + this.name,
            nlAnnotationsToSource(this.nl_annotations),
            implAnnotationsToSource(this.impl_annotations),
            ' ', '{', '\n', '\t+');

        let first = true;
        for (const ex of this.examples) {
            // force an additional \n between examples
            if (first)
                first = false;
            else
                list = List.concat(list, '\n');
            list = List.concat(list, ex.toSource(), '\n');
        }
        list = List.concat(list, '\t-', '}');
        return list;
    }

    get language() : string|undefined {
        const language = this.impl_annotations.language;
        if (language)
            return String(language.toJS());
        else
            return undefined;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDataset(this)) {
            for (const example of this.examples)
                example.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        for (const ex of this.examples)
            yield* ex.iterateSlots();
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        for (const ex of this.examples)
            yield* ex.iterateSlots2();
    }

    optimize() : Dataset {
        return Optimizer.optimizeDataset(this);
    }

    clone() : Dataset {
        const newMetadata = {};
        Object.assign(newMetadata, this.nl_annotations);
        const newAnnotations = {};
        Object.assign(newAnnotations, this.impl_annotations);
        return new Dataset(this.location,
            this.name, this.examples.map((e) => e.clone()), { nl: newMetadata, impl: newAnnotations });
    }
}

/**
 * A collection of Statements from the same source file.
 *
 * It is somewhat organized for "easier" API handling,
 * and for backward compatibility with API users.
 *
 * @alias Ast.Input
 * @extends Ast.Node
 * @abstract
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
     * @method Ast.Input#typecheck
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

export type ExecutableStatement = Assignment | ExpressionStatement;

/**
 * An executable ThingTalk program (containing at least one executable
 * statement).
 *
 * @alias Ast.Program
 * @extends Ast.Input
 */
export class Program extends Input {
    classes : ClassDef[];
    declarations : FunctionDeclaration[];
    statements : ExecutableStatement[];
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
                statements : ExecutableStatement[],
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
 * @alias Ast.PermissionRule
 * @extends Ast.Input
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
 * @alias Ast.Library
 * @extends Ast.Input
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

/**
 * A single example (primitive template) in a ThingTalk dataset
 *
 * @alias Ast.Example
 */
export class Example extends Node {
    isExample = true;
    id : number;
    type : string;
    args : TypeMap;
    value : Expression;
    utterances : string[];
    preprocessed : string[];
    annotations : AnnotationMap;

    /**
     * Construct a new example.
     *
     * @param location - the position of this node in the source code
     * @param id - the ID of the example, or -1 if the example has no ID
     * @param {string} type - the type of this example, one of `stream`, `query`,
     *        `action`, or `program`
     * @param {Ast.Stream|Ast.Table|Ast.Action|Ast.Program} - the code this example
     *        maps to
     * @param {string[]} utterances - raw, unprocessed utterances for this example
     * @param {string[]} preprocessed - preprocessed (tokenized) utterances for this example
     * @param {Object.<string, any>} annotations - other annotations for this example
     */
    constructor(location : SourceRange|null,
                id : number,
                type : string,
                args : TypeMap,
                value : Expression,
                utterances : string[],
                preprocessed : string[],
                annotations : AnnotationMap) {
        super(location);

        assert(typeof id === 'number');
        this.id = id;

        this.type = type;

        assert(typeof args === 'object');
        this.args = args;

        assert(value instanceof Expression);
        this.value = value;

        assert(Array.isArray(utterances) && Array.isArray(preprocessed));
        this.utterances = utterances;
        this.preprocessed = preprocessed;

        assert(typeof annotations === 'object');
        this.annotations = annotations;
    }

    toSource() : TokenStream {
        const annotations : AnnotationMap = {};
        if (this.id >= 0)
            annotations.id = new Value.Number(this.id);
        Object.assign(annotations, this.annotations);
        const metadata : NLAnnotationMap = {
            utterances: this.utterances
        };
        if (this.preprocessed.length > 0)
            metadata.preprocessed = this.preprocessed;

        let args : TokenStream = List.Nil;
        let first = true;
        for (const argname in this.args) {
            const argtype = this.args[argname];
            if (first)
                first = false;
            else
                args = List.concat(args, ',');
            args = List.concat(args, argname, ':', argtype.toSource());
        }

        let list : TokenStream = List.singleton(this.type);
        if (args !== List.Nil)
             list = List.concat(list, ' ', '(', args, ')');
        list = List.concat(list, ' ', '=', ' ', this.value.toSource(),
            nlAnnotationsToSource(metadata),
            implAnnotationsToSource(annotations),
            ';');
        return list;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitExample(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    clone() : Example {
        return new Example(
            this.location,
            this.id,
            this.type,
            Object.assign({}, this.args),
            this.value.clone(),
            this.utterances.slice(0),
            this.preprocessed.slice(0),
            Object.assign({}, this.annotations)
        );
    }

    /**
     * Typecheck this example.
     *
     * This method can be used to typecheck an example is isolation,
     * outside of a ThingTalk program. This is useful to typecheck a dataset
     * and discard examples that do not typecheck without failing the whole dataset.
     *
     * @param schemas - schema retriever object to retrieve Thingpedia information
     * @param [getMeta=false] - retrieve natural language metadata during typecheck
     */
    async typecheck(schemas : SchemaRetriever, getMeta = false) : Promise<this> {
        const typeChecker = new TypeChecker(schemas, getMeta);
        await typeChecker.typeCheckExample(this);
        return this;
    }

    /**
     * Iterate all slots (scalar value nodes) in this example.
     *
     * @generator
     * @yields {Ast~OldSlot}
     * @deprecated Use {@link Ast.Example#iterateSlots2} instead.
     */
    *iterateSlots() : Generator<OldSlot, void> {
        yield* this.value.iterateSlots({});
    }

    /**
     * Iterate all slots (scalar value nodes) in this example.
     *
     * @generator
     * @yields {Ast~AbstractSlot}
     */
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.value.iterateSlots2({});
    }

    /**
     * Convert a dataset example to a program.
     *
     * This will create a program that invokes the same code as the example value,
     * and will replace all parameters with slots.
     *
     * @return {Ast.Program} the new program
     */
    toProgram() : Program {
        return declarationLikeToProgram(this);
    }
}


/**
 * A `import` statement that imports a mixin inside a ThingTalk class.
 *
 * Mixins add implementation functionality to ThingTalk classes, such as specifying
 * how the class is loaded (which language, which format, which version of the SDK)
 * and how devices are configured.
 */
export class MixinImportStmt extends Node {
    facets : string[];
    module : string;
    in_params : InputParam[];

    /**
     * Construct a new mixin import statement.
     *
     * @param location - the position of this node in the source code
     * @param facets - which facets to import from the mixin (`config`, `auth`, `loader`, ...)
     * @param module - the mixin identifier to import
     * @param in_params - input parameters to pass to the mixin
     */
    constructor(location : SourceRange|null,
                facets : string[],
                module : string,
                in_params : InputParam[]) {
        super(location);

        assert(Array.isArray(facets));
        this.facets = facets;

        assert(typeof module === 'string');
        this.module = module;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    toSource() : TokenStream {
        return List.concat('import', List.join(this.facets.map((f) => List.singleton(f)), ','), ' ',
            'from', ' ', '@' + this.module,
            '(', List.join(this.in_params.map((ip) => ip.toSource()), ','), ')', ';');
    }

    clone() : MixinImportStmt {
        return new MixinImportStmt(
            this.location,
            this.facets.slice(0),
            this.module,
            this.in_params.map((p) => p.clone())
        );
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitMixinImportStmt(this)) {
            for (const in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }
}

/**
 * An `entity` statement inside a ThingTalk class.
 *
 * @alias Ast.EntityDef
 * @extends Ast~Node
 * @abstract
 */
export class EntityDef extends Node {
    isEntityDef = true;
    name : string;
    nl_annotations : NLAnnotationMap;
    impl_annotations : AnnotationMap;

    /**
     * Construct a new entity declaration.
     *
     * @param location - the position of this node in the source code
     * @param name - the entity name (the part after the ':')
     * @param annotations - annotations of the entity type
     * @param [annotations.nl={}] - natural-language annotations (translatable annotations)
     * @param [annotations.impl={}] - implementation annotations
     */
    constructor(location : SourceRange|null,
                name : string,
                annotations : AnnotationSpec) {
        super(location);
        /**
         * The entity name.
         */
        this.name = name;
        /**
         * The entity metadata (translatable annotations).
         */
        this.nl_annotations = annotations.nl || {};
        /**
         * The entity annotations.
         */
        this.impl_annotations = annotations.impl || {};
    }

    toSource() : TokenStream {
        return List.concat('entity', ' ', this.name, '\t+',
            nlAnnotationsToSource(this.nl_annotations),
            implAnnotationsToSource(this.impl_annotations),
        '\t-', ';');
    }

    /**
     * Clone this entity and return a new object with the same properties.
     *
     * @return the new instance
     */
    clone() : EntityDef {
        const nl : NLAnnotationMap = {};
        Object.assign(nl, this.nl_annotations);
        const impl : AnnotationMap = {};
        Object.assign(impl, this.impl_annotations);

        return new EntityDef(this.location, this.name, { nl, impl });
    }

    /**
     * Read and normalize an implementation annotation from this entity definition.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation normalized value, or `undefined` if the
     *         annotation is not present
     */
    getImplementationAnnotation<T>(name : string) : T|undefined {
        if (Object.prototype.hasOwnProperty.call(this.impl_annotations, name))
            return this.impl_annotations[name].toJS() as T;
        else
            return undefined;
    }

    /**
     * Read a natural-language annotation from this entity definition.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation value, or `undefined` if the
     *         annotation is not present
     */
    getNaturalLanguageAnnotation(name : string) : any|undefined {
        if (Object.prototype.hasOwnProperty.call(this.nl_annotations, name))
            return this.nl_annotations[name];
        else
            return undefined;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitEntityDef(this);
        visitor.exit(this);
    }
}
