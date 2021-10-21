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
import { Value, VarRefValue, EnumValue, BooleanValue } from './values';
import { Invocation, DeviceSelector, InputParam } from './invocation';
import {
    Stream,
    Table,
    Action,
    VarRefAction,
} from './legacy';
import {
    Expression,
    ChainExpression
} from './expression';
import { FunctionDef } from './function_def';
import { ClassDef } from './class_def';
import { Program } from './program';
import {
    AbstractSlot,
    OldSlot
} from './slots';
import TypeChecker from '../typecheck';
import SchemaRetriever from '../schema';
import * as Optimizer from '../optimize';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';

/**
 * The base class of all AST nodes that represent complete ThingTalk
 * statements.
 *
 */
export abstract class Statement extends Node {
    /**
     * Iterate all slots (scalar value nodes) in this statement.
     *
     * @deprecated This method is only appropriate for filters and input parameters.
     *   You should use {@link Ast.Statement.iterateSlots2} instead.
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

    let declarations : FunctionDeclaration[], statements : TopLevelExecutableStatement[];
    if (self instanceof Example) {
        declarations = [];
        statements = [new ExpressionStatement(null, self.value.clone())];
    } else {
        declarations = self.declarations.map((d) => d.clone());
        statements = self.statements.map((s) => {
            if (s instanceof ReturnStatement)
                return new ExpressionStatement(s.location, s.expression.clone());
            else
                return s.clone();
        });
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
 */
export class FunctionDeclaration extends Statement {
    /**
     * The name of the declared function.
     */
    name : string;
    /**
     * Arguments available to the function.
     */
    args : Type.TypeMap;
    declarations : FunctionDeclaration[];
    statements : ExecutableStatement[];
    /**
     * The declaration natural language annotations (translatable annotations).
     */
    nl_annotations : NLAnnotationMap;
    /**
     * The declaration annotations.
     */
    impl_annotations : AnnotationMap;
    /**
     * The type definition corresponding to this function.
     *
     * This property is guaranteed not `null` after type-checking.
     */
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
                args : Type.TypeMap,
                declarations : FunctionDeclaration[],
                statements : ExecutableStatement[],
                annotations : AnnotationSpec = {},
                schema : FunctionDef|null = null) {
        super(location);

        assert(typeof name === 'string');
        this.name = name;

        assert(typeof args === 'object');
        this.args = args;

        this.declarations = declarations;
        this.statements = statements;

        this.nl_annotations = annotations.nl || {};
        this.impl_annotations = annotations.impl || {};

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
 */
export class Assignment extends Statement {
    /**
     * The name being assigned to.
     */
    name : string;
    /**
     * The expression being assigned.
     */
    value : Expression;
    /**
     * The signature corresponding to this assignment.
     *
     * This is the type that the assigned name has after the assignment statement.
     * This property is guaranteed not `null` after type-checking.
     */
    schema : FunctionDef|null;

    /**
     * Construct a new assignment statement.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the name being assigned to
     * @param {Ast.Table} value - the expression being assigned
     * @param {Ast.FunctionDef | null} schema - the signature corresponding to this assignment
     */
    constructor(location : SourceRange|null,
                name : string,
                value : Expression,
                schema : FunctionDef|null = null) {
        super(location);

        assert(typeof name === 'string');
        this.name = name;

        assert(value instanceof Expression);
        this.value = value;
        this.schema = schema;
    }

    toSource() : TokenStream {
        return List.concat('let', this.name, ' ', '=', ' ', this.value.toSource(), ';');
    }

    /**
     * Whether this assignment calls an action or executes a query.
     *
     * This will be `undefined` before typechecking, and then either `true` or `false`.
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

class IsExecutableVisitor extends NodeVisitor {
    isExecutable = true;

    visitInvocation(invocation : Invocation) {
        const schema = invocation.schema;
        assert(schema instanceof FunctionDef);

        const params = new Map<string, Value>();
        for (const in_param of invocation.in_params)
            params.set(in_param.name, in_param.value);

        const requireEither = schema.getImplementationAnnotation<string[][]>('require_either');
        if (requireEither) {
            for (const requirement of requireEither) {
                let satisfied = false;
                for (const option of requirement) {
                    if (params.has(option)) {
                        satisfied = true;
                        break;
                    }
                }
                if (!satisfied)
                    this.isExecutable = false;
            }
        }

        for (const arg of schema.iterateArguments()) {
            const requiredIf = arg.getImplementationAnnotation<string[]>('required_if');
            if (requiredIf && !params.has(arg.name)) {
                let required = false;
                for (const requirement of requiredIf) {
                    const [param, value] = requirement.split('=');
                    const current = params.get(param);
                    if (!current)
                        continue;
                    if ((current instanceof EnumValue && current.value === value) ||
                        (current instanceof BooleanValue && current.value === (value === 'true'))) {
                        required = true;
                        break;
                    }
                }
                if (required)
                    this.isExecutable = false;
            }
        }

        return true;
    }

    visitValue(value : Value) {
        if (value.isUndefined || !value.isConcrete())
            this.isExecutable = false;
        return true;
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
        const actionIntoParams : InputParam[] = [];
        const convertedAction = action ? action.toLegacy(actionIntoParams, scope_params) : null;
        assert(convertedAction === null || convertedAction instanceof Action);
        if (convertedAction && convertedAction instanceof VarRefAction)
            convertedAction.in_params.push(...actionIntoParams);

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

    isExecutable() {
        const visitor = new IsExecutableVisitor;
        this.visit(visitor);
        return visitor.isExecutable;
    }
}

/**
 * A statement that explicitly sets the result of the current function.
 *
 * Only available inside a user-defined function.
 */
export class ReturnStatement extends Statement {
    constructor(location : SourceRange|null,
                public expression : Expression) {
        super(location);
    }

    toSource() : TokenStream {
        return List.concat('return', this.expression.toSource(), ';');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitReturnStatement(this))
            this.expression.visit(visitor);
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        yield* this.expression.iterateSlots({});
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.expression.iterateSlots2({});
    }

    clone() : ReturnStatement {
        return new ReturnStatement(this.location, this.expression.clone());
    }

    toLegacy(scope_params : string[] = []) : Command {
        const chain = this.expression instanceof ChainExpression ? this.expression : new ChainExpression(null, [this.expression], this.expression.schema);
        const last = chain.last;
        const action = last.schema!.functionType === 'action' ? last : null;
        let head : Table|null = null;
        if (action) {
            const remaining = chain.expressions.slice(0, chain.expressions.length-1);
            if (remaining.length > 0) {
                const converted = new ChainExpression(null, remaining, null).toLegacy([], scope_params);
                assert(converted instanceof Table);
                head = converted;
            }
        } else {
            const converted  = chain.toLegacy([], scope_params);
            assert(converted instanceof Table);
            head = converted;
        }
        const convertedAction = action ? action.toLegacy([], scope_params) : null;
        assert(convertedAction === null || convertedAction instanceof Action);

        return new Command(this.location, head, convertedAction ? [convertedAction] : [Action.notifyAction()]);
    }
}

export type ExecutableStatement = Assignment | ExpressionStatement | ReturnStatement;
export type TopLevelStatement = ClassDef | Dataset | FunctionDeclaration | TopLevelExecutableStatement;
export type TopLevelExecutableStatement = Assignment | ExpressionStatement;

/**
 * A single example (primitive template) in a ThingTalk dataset
 *
 */
export class Example extends Node {
    isExample = true;
    id : number;
    type : string;
    args : Type.TypeMap;
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
                args : Type.TypeMap,
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
        const metadata : NLAnnotationMap = {};
        if (this.utterances.length > 0)
            metadata.utterances = this.utterances;
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
     * @deprecated Use {@link Ast.Example.iterateSlots2} instead.
     */
    *iterateSlots() : Generator<OldSlot, void> {
        yield* this.value.iterateSlots({});
    }

    /**
     * Iterate all slots (scalar value nodes) in this example.
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
 * A statement that declares a ThingTalk dataset (collection of primitive
 * templates).
 *
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
