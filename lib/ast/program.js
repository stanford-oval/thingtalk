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
//         Silei Xu <silei@cs.stanford.edu>
import assert from 'assert';

import Type from '../type';
import Node from './base';
import { Value } from './values';
import { BooleanExpression } from './expression';
import { Stream, Table, Action, PermissionFunction } from './primitive';
import {
    recursiveYieldArraySlots,
    FieldSlot
} from './slots';
import {
    prettyprint,
    prettyprintExample,
    prettyprintDataset
} from '../prettyprint';
import * as Typechecking from '../typecheck';
import * as Optimizer from '../optimize';
import convertToPermissionRule from './convert_to_permission_rule';
import lowerReturn from './lower_return';

/**
 * The base class of all AST nodes that represent complete ThingTalk
 * statements.
 *
 * @alias Ast.Statement
 * @extends Ast~Node
 * @abstract
 */
export class Statement extends Node {
    /**
     * Iterate all slots (scalar value nodes) in this statement.
     *
     * @function iterateSlots
     * @memberof Ast.Statement.prototype
     * @generator
     * @yields {Ast.Value}
     * @abstract
     * @deprecated This method is only appropriate for filters and input parameters.
     *   You should use {@link Ast.Statement#iterateSlots2} instead.
     */

    /**
     * Iterate all slots (scalar value nodes) in this statement.
     *
     * @function iterateSlots2
     * @memberof Ast.Statement.prototype
     * @generator
     * @yields {Ast~AbstractSlot}
     * @abstract
     */

    /**
     * Clone this statement.
     *
     * This is a deep-clone operation, so the resulting object can be modified freely.
     *
     * @function clone
     * @memberof Ast.Statement.prototype
     * @return {Ast.Statement} a new statement with the same property.
     * @abstract
     */
}

/**
 * `let` statements, that bind a ThingTalk expression to a name.
 *
 * A declaration statement creates a new, locally scoped, function
 * implemented as ThingTalk expression. The name can then be invoked
 * in subsequent statements.
 *
 * @alias Ast.Statement.Declaration
 * @extends Ast.Statement
 */
export class Declaration extends Statement {
    /**
     * Construct a new declaration statement.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the name being bound by this statement
     * @param {string} type - what type of function is being declared,
     *                        either `stream`, `query`, `action`, `program` or `procedure`
     * @param {Object.<string, Type>} args - any arguments available to the function
     * @param {Ast.Table|Ast.Stream|Ast.Action|Ast.Program} - the declaration body
     * @param {Object.<string, any>} metadata - declaration metadata (translatable annotations)
     * @param {Object.<string, Ast.Value>} annotations - declaration annotations
     * @param {Ast.FunctionDef|null} schema - the type definition corresponding to this declaration
     */
    constructor(location, name, type, args, value, metadata = {}, annotations = {}, schema = null) {
        super(location);

        assert(typeof name === 'string');
        /**
         * The name being bound by this statement.
         * @type {string}
         */
        this.name = name;

        assert(['stream', 'query', 'action', 'program', 'procedure'].indexOf(type) >= 0);
        /**
         * What type of function is being declared, either `stream`, `query`, `action`,
         * `program` or `procedure`.
         * @type {string}
         */
        this.type = type;

        assert(typeof args === 'object');
        /**
         * Arguments available to the function.
         * @type {Object.<string,Type>}
         */
        this.args = args;

        assert(value instanceof Stream || value instanceof Table || value instanceof Action || value instanceof Program);
        /**
         * The declaration body.
         * @type {Ast.Table|Ast.Stream|Ast.Action|Ast.Program}
         */
        this.value = value;

        /**
         * The declaration natural language annotations (translatable annotations).
         * @type {Object.<string, any>}
         */
        this.nl_annotations = metadata;
        /**
         * The declaration annotations.
         * @type {Object.<string, Ast.Value>}
         */
        this.impl_annotations = annotations;
        /**
         * The type definition corresponding to this declaration.
         *
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.FunctionDef|null}
         */
        this.schema = schema;
    }

    get metadata() {
        return this.nl_annotations;
    }
    get annotations() {
        return this.impl_annotations;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitDeclaration(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    *iterateSlots() {
        // if the declaration refers to a nested scope, we don't need to
        // slot fill it now
        if (this.type === 'program' || this.type === 'procedure')
            return;

        yield* this.value.iterateSlots({});
    }
    *iterateSlots2() {
        // if the declaration refers to a nested scope, we don't need to
        // slot fill it now
        if (this.type === 'program' || this.type === 'procedure')
            return;

        yield* this.value.iterateSlots2({});
    }

    clone() {
        const newArgs = {};
        Object.assign(newArgs, this.args);

        const newMetadata = {};
        Object.assign(newMetadata, this.nl_annotations);
        const newAnnotations = {};
        Object.assign(newAnnotations, this.impl_annotations);
        return new Declaration(this.location, this.name, this.type, newArgs,
            this.value.clone(), newMetadata, newAnnotations, this.schema);
    }
}
Declaration.prototype.isDeclaration = true;
Statement.Declaration = Declaration;

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
    /**
     * Construct a new assignment statement.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the name being assigned to
     * @param {Ast.Table} value - the expression being assigned
     * @param {Ast.ExpressionSignature | null} schema - the signature corresponding to this assignment
     */
    constructor(location, name, value, schema = null, isAction) {
        super(location);

        assert(typeof name === 'string');
        /**
         * The name being assigned to.
         * @type {string}
         */
        this.name = name;

        assert(value instanceof Table);
        /**
         * The expression being assigned.
         * @type {Ast.Table}
         */
        this.value = value;

        /**
         * The signature corresponding to this assignment.
         *
         * This is the type that the assigned name has after the assignment statement.
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.ExpressionSignature|null}
         */
        this.schema = schema;

        /**
         * Whether this assignment calls an action or executes a query.
         *
         * This will be `undefined` before typechecking, and then either `true` or `false`.
         * @type {boolean}
         */
        this.isAction = isAction;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitAssignment(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    *iterateSlots() {
        yield* this.value.iterateSlots({});
    }
    *iterateSlots2() {
        yield* this.value.iterateSlots2({});
    }

    clone() {
        return new Assignment(this.location, this.name, this.value.clone(), this.schema, this.isAction);
    }
}
Assignment.prototype.isAssignment = true;
Statement.Assignment = Assignment;

/**
 * A statement that executes one or more actions for each element
 * of a stream.
 *
 * @alias Ast.Statement.Rule
 * @extends Ast.Statement
 */
export class Rule extends Statement {
    /**
     * Construct a new rule statement.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Stream} stream - the stream to react to
     * @param {Ast.Action[]} actions - the actions to execute
     */
    constructor(location, stream, actions) {
        super(location);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(Array.isArray(actions));
        this.actions = actions;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitRule(this)) {
            this.stream.visit(visitor);
            for (let action of this.actions)
                action.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() {
        let [,scope] = yield* this.stream.iterateSlots({});
        for (let action of this.actions)
            yield* action.iterateSlots(scope);
    }
    *iterateSlots2() {
        let [,scope] = yield* this.stream.iterateSlots2({});
        for (let action of this.actions)
            yield* action.iterateSlots2(scope);
    }

    clone() {
        return new Rule(this.location, this.stream.clone(), this.actions.map((a) => a.clone()));
    }
}
Rule.prototype.isRule = true;
Statement.Rule = Rule;

/**
 * A statement that executes one or more actions immediately, potentially
 * reading data from a query.
 *
 * @alias Ast.Statement.Command
 * @extends Ast.Statement
 */
export class Command extends Statement {
    /**
     * Construct a new command statement.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Table|null} table - the table to read from
     * @param {Ast.Action[]} actions - the actions to execute
     */
    constructor(location, table, actions) {
        super(location);

        assert(table === null || table instanceof Table);
        this.table = table;

        assert(Array.isArray(actions));
        this.actions = actions;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitCommand(this)) {
            if (this.table !== null)
                this.table.visit(visitor);
            for (let action of this.actions)
                action.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() {
        let scope = {};
        if (this.table)
            [,scope] = yield* this.table.iterateSlots({});
        for (let action of this.actions)
            yield* action.iterateSlots(scope);
    }
    *iterateSlots2() {
        let scope = {};
        if (this.table)
            [,scope] = yield* this.table.iterateSlots2({});
        for (let action of this.actions)
            yield* action.iterateSlots2(scope);
    }

    clone() {
        return new Command(this.location,
            this.table !== null ? this.table.clone() : null,
            this.actions.map((a) => a.clone()));
    }
}
Command.prototype.isCommand = true;
Statement.Command = Command;

/**
 * A statement that interactively prompts the user for one or more choices.
 *
 * @alias Ast.Statement.OnInputChoice
 * @extends Ast.Statement
 */
export class OnInputChoice extends Statement {
    /**
     * Construct a new on-input statement.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Table|null} table - the table to read from
     * @param {Ast.Action[]} actions - the actions to execute
     * @param {Object.<string, any>} [metadata={}] - natural language annotations of the statement (translatable annotations)
     * @param {Object.<string, Ast.Value>} [annotations={}]- implementation annotations
     */
    constructor(location, table, actions, metadata = {}, annotations = {}) {
        super(location);

        assert(table === null || table instanceof Table);
        this.table = table;

        assert(Array.isArray(actions));
        this.actions = actions;

        this.nl_annotations = metadata;
        this.impl_annotations = annotations;
    }

    get metadata() {
        return this.nl_annotations;
    }
    get annotations() {
        return this.impl_annotations;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitOnInputChoice(this)) {
            if (this.table !== null)
                this.table.visit(visitor);
            for (let action of this.actions)
                action.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() {
        let scope = {};
        if (this.table)
            [,scope] = yield* this.table.iterateSlots({});
        for (let action of this.actions)
            yield* action.iterateSlots(scope);
    }
    *iterateSlots2() {
        let scope = {};
        if (this.table)
            [,scope] = yield* this.table.iterateSlots2({});
        for (let action of this.actions)
            yield* action.iterateSlots2(scope);
    }

    clone() {
        const newMetadata = {};
        Object.assign(newMetadata, this.nl_annotations);

        const newAnnotations = {};
        Object.assign(newAnnotations, this.impl_annotations);
        return new OnInputChoice(
            this.location,
            this.table !== null ? this.table.clone() : null,
            this.actions.map((a) => a.clone()),
            newMetadata,
            newAnnotations);
    }
}
OnInputChoice.prototype.isOnInputChoice = true;
Statement.OnInputChoice = OnInputChoice;

/**
 * A statement that declares a ThingTalk dataset (collection of primitive
 * templates).
 *
 * @alias Ast.Dataset
 * @extends Ast.Statement
 */
export class Dataset extends Statement {
    /**
     * Construct a new dataset.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the name of this dataset
     * @param {string} language - the language code of this dataset, as 2 letter ISO code
     * @param {Ast.Example[]} examples - the examples in this dataset
     * @param {Object.<string, Ast.Value>} [annotations={}]- dataset annotations
     */
    constructor(location, name, language, examples, annotations) {
        super(location);

        assert(typeof name === 'string');
        this.name = name;

        assert(typeof language === 'string');
        this.language = language;

        assert(Array.isArray(examples)); // of Example
        this.examples = examples;

        assert(typeof annotations === 'object');
        this.annotations = annotations;
    }

    /**
     * Convert this dataset to prettyprinted ThingTalk code.
     *
     * @param {string} [prefix] - prefix each output line with this string (for indentation)
     * @return {string} the prettyprinted code
     */
    prettyprint(prefix = '') {
        return prettyprintDataset(this, prefix);
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitDataset(this)) {
            for (let example of this.examples)
                example.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() {
        for (let ex of this.examples)
            yield* ex.iterateSlots();
    }
    *iterateSlots2() {
        for (let ex of this.examples)
            yield* ex.iterateSlots2();
    }

    clone() {
        const newAnnotations = {};
        Object.assign(newAnnotations, this.annotations);
        return new Dataset(this.location,
            this.name, this.language, this.examples.map((e) => e.clone()), newAnnotations);
    }
}
Dataset.prototype.isDataset = true;
Statement.Dataset = Dataset;

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
export class Input extends Node {
    *iterateSlots() {
    }
    *iterateSlots2() {
    }

    /**
     * Convert this ThingTalk input to prettyprinted ThingTalk code.
     *
     * @param {string} [prefix] - prefix each output line with this string (for indentation)
     * @return {string} the prettyprinted code
     */
    prettyprint(short) {
        return prettyprint(this, short);
    }

    /**
     * Typecheck this ThingTalk input.
     *
     * This is the main API to typecheck a ThingTalk input.
     *
     * @method Ast.Input#typecheck
     * @param {SchemaRetriever} schemas - schema retriever object to retrieve Thingpedia information
     * @param {boolean} [getMeta=false] - retreive natural language metadata during typecheck
     */
}

/**
 * An executable ThingTalk program (containing at least one executable
 * statement).
 *
 * @alias Ast.Program
 * @extends Ast.Input
 */
export class Program extends Input {
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
    constructor(location, classes, declarations, rules, principal = null, oninputs = []) {
        super(location);
        assert(Array.isArray(classes));
        this.classes = classes;
        assert(Array.isArray(declarations));
        this.declarations = declarations;
        assert(Array.isArray(rules));
        this.rules = rules;
        assert(principal === null || principal instanceof Value);
        this.principal = principal;
        assert(Array.isArray(oninputs));
        this.oninputs = oninputs;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitProgram(this)) {
            if (this.principal !== null)
                this.principal.visit(visitor);
            for (let classdef of this.classes)
                classdef.visit(visitor);
            for (let decl of this.declarations)
                decl.visit(visitor);
            for (let rule of this.rules)
                rule.visit(visitor);
            for (let onInput of this.oninputs)
                onInput.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() {
        for (let decl of this.declarations)
            yield* decl.iterateSlots();
        for (let rule of this.rules)
            yield* rule.iterateSlots();
        for (let oninput of this.oninputs)
            yield* oninput.iterateSlots();
    }
    *iterateSlots2() {
        if (this.principal !== null)
            yield* recursiveYieldArraySlots(new FieldSlot(null, {}, Type.Entity('tt:contact'), this, 'program', 'principal'));
        for (let decl of this.declarations)
            yield* decl.iterateSlots2();
        for (let rule of this.rules)
            yield* rule.iterateSlots2();
        for (let oninput of this.oninputs)
            yield* oninput.iterateSlots2();
    }

    clone() {
        return new Program(
            this.location,
            this.classes.map((c) => c.clone()),
            this.declarations.map((d) => d.clone()),
            this.rules.map((r) => r.clone()),
            this.principal !== null ? this.principal.clone() : null,
            this.oninputs.map((o) => o.clone())
        );
    }

    optimize() {
        return Optimizer.optimizeProgram(this);
    }

    /**
     * Attempt to convert this program to an equivalent permission rule.
     *
     * @param {string} principal - the principal to use as source
     * @param {string|null} contactName - the display value for the principal
     * @return {Ast.Input.PermissionRule|null} the new permission rule, or `null` if conversion failed
     * @alias Ast.Input.Program#convertToPermissionRule
     */
    convertToPermissionRule(principal, contactName) {
        return convertToPermissionRule(this, principal, contactName);
    }

    lowerReturn(messaging) {
        return lowerReturn(this, messaging);
    }

    typecheck(schemas, getMeta = false) {
        return Typechecking.typeCheckProgram(this, schemas, getMeta).then(() => this);
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
    constructor(location, principal, query, action) {
        super(location);

        assert(principal instanceof BooleanExpression);
        this.principal = principal;

        assert(query instanceof PermissionFunction);
        this.query = query;

        assert(action instanceof PermissionFunction);
        this.action = action;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitPermissionRule(this)) {
            this.principal.visit(visitor);
            this.query.visit(visitor);
            this.action.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() {
        yield* this.principal.iterateSlots(null, null, {});

        if (this.query.isSpecified)
            yield* this.query.filter.iterateSlots(this.query.schema, this.query, {});
        if (this.action.isSpecified)
            yield* this.action.filter.iterateSlots(this.action.schema, this.action, this.query.isSpecified ? this.query.schema.out : {});
    }
    *iterateSlots2() {
        yield* this.principal.iterateSlots2(null, this, {});

        if (this.query.isSpecified)
            yield* this.query.filter.iterateSlots2(this.query.schema, this.query, {});
        if (this.action.isSpecified)
            yield* this.action.filter.iterateSlots2(this.action.schema, this.action, this.query.isSpecified ? this.query.schema.out : {});
    }

    clone() {
        return new PermissionRule(this.location,
            this.principal.clone(), this.query.clone(), this.action.clone());
    }

    typecheck(schemas, getMeta = false) {
        return Typechecking.typeCheckPermissionRule(this, schemas, getMeta).then(() => this);
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
    /**
     * Construct a new ThingTalk library.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.ClassDef[]} classes - classes defined in the library
     * @param {Ast.Dataset[]} datasets - datasets defined in the library
     */
    constructor(location, classes, datasets) {
        super(location);
        assert(Array.isArray(classes));
        this.classes = classes;
        assert(Array.isArray(datasets));
        this.datasets = datasets;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitLibrary(this)) {
            for (let classdef of this.classes)
                classdef.visit(visitor);
            for (let dataset of this.datasets)
                dataset.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() {
        for (let dataset of this.datasets)
            yield* dataset.iterateSlots();
    }
    *iterateSlots2() {
        for (let dataset of this.datasets)
            yield* dataset.iterateSlots2();
    }

    clone() {
        return new Library(this.location,
            this.classes.map((c) => c.clone()), this.datasets.map((d) => d.clone()));
    }

    typecheck(schemas, getMeta = false) {
        return Typechecking.typeCheckMeta(this, schemas, getMeta).then(() => this);
    }
}
Library.prototype.isLibrary = true;
Input.Library = Library;
// API backward compat
Library.prototype.isMeta = true;
Input.Meta = Library;

/**
 * A single example (primitive template) in a ThingTalk dataset
 *
 * @alias Ast.Example
 */
export class Example extends Node {
    /**
     * Construct a new example.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {number} id - the ID of the example, or -1 if the example has no ID
     * @param {string} type - the type of this example, one of `stream`, `query`,
     *        `action`, or `program`
     * @param {Ast.Stream|Ast.Table|Ast.Action|Ast.Program} - the code this example
     *        maps to
     * @param {string[]} utterances - raw, unprocessed utterances for this example
     * @param {string[]} preprocessed - preprocessed (tokenized) utterances for this example
     * @param {Object.<string, any>} annotations - other annotations for this example
     */
    constructor(location, id, type, args, value, utterances, preprocessed, annotations) {
        super(location);

        assert(typeof id === 'number');
        this.id = id;

        assert(['stream', 'query', 'action', 'program'].includes(type));
        this.type = type;

        assert(typeof args === 'object');
        this.args = args;

        assert(value instanceof Stream || value instanceof Table || value instanceof Action || value instanceof Input);
        this.value = value;

        assert(Array.isArray(utterances) && Array.isArray(preprocessed));
        this.utterances = utterances;
        this.preprocessed = preprocessed;

        assert(typeof annotations === 'object');
        this.annotations = annotations;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitExample(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    clone() {
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
     * Convert this example to prettyprinted ThingTalk code.
     *
     * @param {string} [prefix] - prefix each output line with this string (for indentation)
     * @return {string} the prettyprinted code
     */
    prettyprint(prefix = '') {
        return prettyprintExample(this, prefix);
    }

    /**
     * Typecheck this example.
     *
     * This method can be used to typecheck an example is isolation,
     * outside of a ThingTalk program. This is useful to typecheck a dataset
     * and discard examples that do not typecheck without failing the whole dataset.
     *
     * @param {SchemaRetriever} schemas - schema retriever object to retrieve Thingpedia information
     * @param {boolean} [getMeta=false] - retrieve natural language metadata during typecheck
     */
    typecheck(schemas, getMeta = false) {
        return Typechecking.typeCheckExample(this, schemas, {}, getMeta);
    }

    /**
     * Iterate all slots (scalar value nodes) in this example.
     *
     * @generator
     * @yields {Ast~OldSlot}
     * @deprecated Use {@link Ast.Example#iterateSlots2} instead.
     */
    *iterateSlots() {
        yield* this.value.iterateSlots();
    }

    /**
     * Iterate all slots (scalar value nodes) in this example.
     *
     * @generator
     * @yields {Ast~AbstractSlot}
     */
    *iterateSlots2() {
        yield* this.value.iterateSlots2();
    }
}
Example.prototype.isExample = true;


/**
 * An `import` statement inside a ThingTalk class.
 *
 * @alias Ast.ImportStmt
 * @extends Ast~Node
 * @abstract
 */
export class ImportStmt extends Node {}
ImportStmt.prototype.isImportStmt = true;

/**
 * A `import` statement that imports a whole ThingTalk class.
 *
 * @alias Ast.ImportStmt.Class
 * @extends Ast.ImportStmt
 * @deprecated Class imports were never implemented and are unlikely to be implemented soon.
 */
export class ClassImportStmt extends ImportStmt {
    /**
     * Construct a new class import statement.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} kind - the class identifier to import
     * @param {string|null} alias - rename the imported class to the given alias
     */
    constructor(location, kind, alias) {
        super(location);

        assert(typeof kind === 'string');
        this.kind = kind;

        assert(alias === null || typeof alias === 'string');
        this.alias = alias;
    }

    clone() {
        return new ClassImportStmt(this.location, this.kind, this.alias);
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitClassImportStmt(this);
        visitor.exit(this);
    }
}
ImportStmt.Class = ClassImportStmt;
ImportStmt.Class.prototype.isClass = true;

/**
 * A `import` statement that imports a mixin.
 *
 * Mixins add implementation functionality to ThingTalk classes, such as specifying
 * how the class is loaded (which language, which format, which version of the SDK)
 * and how devices are configured.
 *
 * @alias Ast.ImportStmt.Mixin
 * @extends Ast.ImportStmt
 */
export class MixinImportStmt extends ImportStmt {
    /**
     * Construct a new mixin import statement.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string[]} facets - which facets to import from the mixin (`config`, `auth`, `loader`, ...)
     * @param {string} module - the mixin identifier to import
     * @param {Ast.InputParam[]} in_params - input parameters to pass to the mixin
     */
    constructor(location, facets, module, in_params) {
        super(location);

        assert(Array.isArray(facets));
        this.facets = facets;

        assert(typeof module === 'string');
        this.module = module;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new MixinImportStmt(
            this.location,
            this.facets.slice(0),
            this.module,
            this.in_params.map((p) => p.clone())
        );
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitMixinImportStmt(this)) {
            for (let in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }
}
ImportStmt.Mixin = MixinImportStmt;
ImportStmt.Mixin.prototype.isMixin = true;

/**
 * An `entity` statement inside a ThingTalk class.
 *
 * @alias Ast.EntityDef
 * @extends Ast~Node
 * @abstract
 */
export class EntityDef extends Node {
    /**
     * Construct a new entity declaration.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the entity name (the part after the ':')
     * @param {Object.<string, Object>} annotations - annotations of the entity type
     * @param {Object.<string, any>} [annotations.nl={}] - natural-language annotations (translatable annotations)
     * @param {Object.<string, Ast.Value>} [annotations.impl={}] - implementation annotations
     */
    constructor(location, name, annotations, metadata) {
        super(location);
        /**
         * The entity name.
         * @type {string}
         */
        this.name = name;
        /**
         * The entity metadata (translatable annotations).
         * @type {Object.<string,any>}
         */
        this.nl_annotations = annotations.nl || {};
        /**
         * The entity annotations.
         * @type {Object.<string,Ast.Value>}
         */
        this.impl_annotations = annotations.impl || {};
    }

    /**
     * Clone this entity and return a new object with the same properties.
     *
     * @return {Ast.EntityDef} the new instance
     */
    clone() {
        const nl = {};
        Object.assign(nl, this.nl_annotations);
        const impl = {};
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
    getImplementationAnnotation(name) {
        if (Object.prototype.hasOwnProperty.call(this.impl_annotations, name))
            return this.impl_annotations[name].toJS();
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
    getNaturalLanguageAnnotation(name) {
        if (Object.prototype.hasOwnProperty.call(this.nl_annotations, name))
            return this.nl_annotations[name];
        else
            return undefined;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitEntityDef(this);
        visitor.exit(this);
    }
}
EntityDef.prototype.isEntityDef = true;
