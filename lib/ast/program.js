// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//         Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";
const assert = require('assert');

const Type = require('../type');
const Base = require('./base');
const { Value } = require('./values');
const { BooleanExpression } = require('./expression');
const { Stream, Table, Action, PermissionFunction } = require('./primitive');
const toJS = require('./toJS');
const { recursiveYieldArraySlots, FieldSlot } = require('./slots');

/**
 * The base class of all AST nodes that represent complete ThingTalk
 * statements.
 *
 * @alias Ast.Statement
 * @extends Ast.Base
 * @abstract
 */
class Statement extends Base {
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
     * Iterate all primitives (Thingpedia function invocations) in this statement.
     *
     * @function iteratePrimitives
     * @param {boolean} includeVarRef - whether to include local function calls (VarRef nodes)
     *                                  in the iteration
     * @memberof Ast.Statement.prototype
     * @generator
     * @yields {Ast.Invocation}
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
module.exports.Statement = Statement;

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
class Declaration extends Statement {
    /**
     * Construct a new declaration statement.
     *
     * @param {string} name - the name being bound by this statement
     * @param {string} type - what type of function is being declared,
     *                        either `stream`, `query`, `action`, `program` or `procedure`
     * @param {Object.<string, Type>} args - any arguments available to the function
     * @param {Ast.Table|Ast.Stream|Ast.Action|Ast.Program} - the declaration body
     * @param {Object.<string, any>} metadata - declaration metadata (translatable annotations)
     * @param {Object.<string, Ast.Value>} annotations - declaration annotations
     * @param {Ast.FunctionDef|null} schema - the type definition corresponding to this declaration
     */
    constructor(name, type, args, value, metadata = {}, annotations = {}, schema = null) {
        super();

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
         * The declaration metadata (translatable annotations).
         * @type {Object.<string, any>}
         */
        this.metadata = toJS(metadata);
        /**
         * The declaration annotations.
         * @type {Object.<string, Ast.Value>}
         */
        this.annotations = annotations;
        /**
         * The type definition corresponding to this declaration.
         *
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.FunctionDef|null}
         */
        this.schema = schema;
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
    *iteratePrimitives(includeVarRef) {
        // if the declaration refers to a nested scope, we don't need to
        // slot fill it now
        if (this.type === 'program' || this.type === 'procedure')
            return;

        yield* this.value.iteratePrimitives(includeVarRef);
    }

    clone() {
        const newArgs = {};
        Object.assign(newArgs, this.args);

        const newMetadata = {};
        Object.assign(newMetadata, this.metadata);
        const newAnnotations = {};
        Object.assign(newAnnotations, this.annotations);
        return new Declaration(this.name, this.type, newArgs, this.value.clone(), newMetadata, newAnnotations);
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
class Assignment extends Statement {
    /**
     * Construct a new assignment statement.
     *
     * @param {string} name - the name being assigned to
     * @param {Ast.Table} value - the expression being assigned
     * @param {Ast.ExpressionSignature | null} schema - the signature corresponding to this assignment
     */
    constructor(name, value, schema = null) {
        super();

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
    }

    *iterateSlots() {
        yield* this.value.iterateSlots({});
    }
    *iterateSlots2() {
        yield* this.value.iterateSlots2({});
    }
    *iteratePrimitives(includeVarRef) {
        yield* this.value.iteratePrimitives(includeVarRef);
    }

    clone() {
        return new Assignment(this.name, this.value.clone());
    }
}
Assignment.prototype.isAssignment = true;
Statement.Assignment = Assignment;

class Rule extends Statement {
    constructor(stream, actions) {
        super();

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(Array.isArray(actions));
        this.actions = actions;
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
    *iteratePrimitives(includeVarRef) {
        yield* this.stream.iteratePrimitives(includeVarRef);
        for (let action of this.actions)
            yield* action.iteratePrimitives(includeVarRef);
    }

    clone() {
        return new Rule(this.stream.clone(), this.actions.map((a) => a.clone()));
    }
}
Rule.prototype.isRule = true;
Statement.Rule = Rule;

class Command extends Statement {
    constructor(table, actions) {
        super();

        assert(table === null || table instanceof Table);
        this.table = table;

        assert(Array.isArray(actions));
        this.actions = actions;
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
    *iteratePrimitives(includeVarRef) {
        if (this.table)
            yield* this.table.iteratePrimitives(includeVarRef);
        for (let action of this.actions)
            yield* action.iteratePrimitives(includeVarRef);
    }

    clone() {
        return new Command(this.table !== null ? this.table.clone() : null,
            this.actions.map((a) => a.clone()));
    }
}
Command.prototype.isCommand = true;
Statement.Command = Command;

class OnInputChoice extends Statement {
    constructor(table, actions, metadata = {}, annotations = {}) {
        super();

        assert(table === null || table instanceof Table);
        this.table = table;

        assert(Array.isArray(actions));
        this.actions = actions;

        this.metadata = metadata;
        this.annotations = annotations;
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
    *iteratePrimitives(includeVarRef) {
        if (this.table)
            yield* this.table.iteratePrimitives(includeVarRef);
        for (let action of this.actions)
            yield* action.iteratePrimitives(includeVarRef);
    }

    clone() {
        const newMetadata = {};
        Object.assign(newMetadata, this.metadata);

        const newAnnotations = {};
        Object.assign(newAnnotations, this.annotations);
        return new OnInputChoice(
            this.table !== null ? this.table.clone() : null,
            this.actions.map((a) => a.clone()),
            newMetadata,
            newAnnotations);
    }
}
module.exports.OnInputChoice = OnInputChoice;
OnInputChoice.prototype.isOnInputChoice = true;
Statement.OnInputChoice = OnInputChoice;

class Dataset extends Statement {
    constructor(name, language, examples, annotations) {
        super();

        assert(typeof name === 'string');
        this.name = name;

        assert(typeof language === 'string');
        this.language = language;

        assert(Array.isArray(examples)); // of Example
        this.examples = examples;

        assert(typeof annotations === 'object');
        this.annotations = annotations;
    }

    *iterateSlots() {
        for (let ex of this.examples)
            yield* ex.iterateSlots();
    }
    *iterateSlots2() {
        for (let ex of this.examples)
            yield* ex.iterateSlots2();
    }
    *iteratePrimitives(includeVarRef) {
        for (let ex of this.examples)
            yield* ex.iteratePrimitives(includeVarRef);
    }

    clone() {
        const newAnnotations = {};
        Object.assign(newAnnotations, this.annotations);
        return new Dataset(this.name, this.language, this.examples.map((e) => e.clone()), newAnnotations);
    }
}
Dataset.prototype.isDataset = true;
Statement.Dataset = Dataset;
module.exports.Dataset = Dataset;

// An Input is basically a collection of Statement
// It is somewhat organized for "easier" API handling,
// and for backward compatibility with API users
class Input {
    *iterateSlots() {
    }
    *iterateSlots2() {
    }
    *iteratePrimitives(includeVarRef) {
    }
    optimize() {
        return this;
    }
}

class Program extends Input {
    constructor(classes, declarations, rules, principal = null, oninputs = []) {
        super();
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
    *iteratePrimitives(includeVarRef) {
        for (let decl of this.declarations)
            yield* decl.iteratePrimitives(includeVarRef);
        for (let rule of this.rules)
            yield* rule.iteratePrimitives(includeVarRef);
        for (let oninput of this.oninputs)
            yield* oninput.iteratePrimitives(includeVarRef);
    }

    clone() {
        return new Program(
            this.classes.map((c) => c.clone()),
            this.declarations.map((d) => d.clone()),
            this.rules.map((r) => r.clone()),
            this.principal !== null ? this.principal.clone() : null,
            this.oninputs.map((o) => o.clone())
        );
    }
}
Program.prototype.isProgram = true;
Input.Program = Program;

class PermissionRule extends Input {
    constructor(principal, query, action) {
        super();

        assert(principal instanceof BooleanExpression);
        this.principal = principal;

        assert(query instanceof PermissionFunction);
        this.query = query;

        assert(action instanceof PermissionFunction);
        this.action = action;
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
    *iteratePrimitives() {
    }

    clone() {
        return new PermissionRule(this.principal.clone(), this.query.clone(), this.action.clone());
    }
}
PermissionRule.prototype.isPermissionRule = true;
Input.PermissionRule = PermissionRule;

class Library extends Input {
    constructor(classes, datasets) {
        super();
        assert(Array.isArray(classes));
        this.classes = classes;
        assert(Array.isArray(datasets));
        this.datasets = datasets;
    }

    *iterateSlots() {
        for (let dataset of this.datasets)
            yield* dataset.iterateSlots();
    }
    *iterateSlots2() {
        for (let dataset of this.datasets)
            yield* dataset.iterateSlots2();
    }
    *iteratePrimitives(includeVarRef) {
        for (let dataset of this.datasets)
            yield* dataset.iteratePrimitives(includeVarRef);
    }

    clone() {
        return new Library(this.classes.map((c) => c.clone()), this.datasets.map((d) => d.clone()));
    }
}
Library.prototype.isLibrary = true;
Input.Library = Library;
// API backward compat
Library.prototype.isMeta = true;
Input.Meta = Library;

module.exports.Input = Input;
module.exports.Program = Input.Program;
module.exports.PermissionRule = Input.PermissionRule;


class Example extends Base {
    constructor(id, type, args, value, utterances, preprocessed, annotations) {
        super();

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

    clone() {
        return new Example(
            this.id,
            this.type,
            Object.assign({}, this.args),
            this.value.clone(),
            this.utterances.slice(0),
            this.preprocessed.slice(0),
            Object.assign({}, this.annotations)
        );
    }
}
Example.prototype.isExample = true;
module.exports.Example = Example;


/**
 * An `import` statement inside a ThingTalk class.
 *
 * @alias Ast.ImportStmt
 * @extends Ast.Base
 * @abstract
 */
class ImportStmt extends Base {}
ImportStmt.prototype.isImportStmt = true;
/**
 * A `import` statement that imports a whole ThingTalk class.
 *
 * @alias Ast.ImportStmt.Class
 * @extends Ast.ImportStmt
 * @param {string} kind - the class identifier to import
 * @param {string|null} alias - rename the imported class to the given alias
 * @deprecated Class imports were never implemented and are unlikely to be implemented soon.
 */
class ClassImportStmt extends ImportStmt {
    constructor(kind, alias) {
        super();

        assert(typeof kind === 'string');
        this.kind = kind;

        assert(alias === null || typeof alias === 'string');
        this.alias = alias;
    }

    clone() {
        return new ClassImportStmt(this.kind, this.alias);

    }
}
ImportStmt.Class = ClassImportStmt;
ImportStmt.Class.prototype.isClass = true;
/**
 * A `import` statement that imports a mixin.
 *
 * Mixins add implementation functionality to ThingTalk classes, such as specifing
 * how the class is loaded (which language, which format, which version of the SDK)
 * and how devices are configured.
 *
 * @alias Ast.ImportStmt.Mixin
 * @extends Ast.ImportStmt
 * @param {string[]} facets - which facets to import from the mixin (`config`, `auth`, `loader`, ...)
 * @param {string} module - the mixin identifier to import
 * @param {Ast.InputParam[]} in_params - input parameters to pass to the mixin
 */
class MixinImportStmt extends ImportStmt {
    constructor(facets, module, in_params) {
        super();

        assert(Array.isArray(facets));
        this.facets = facets;

        assert(typeof module === 'string');
        this.module = module;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new MixinImportStmt(
            this.facets.slice(0),
            this.module,
            this.in_params.map((p) => p.clone())
        );
    }
}
ImportStmt.Mixin = MixinImportStmt;
ImportStmt.Mixin.prototype.isMixin = true;
module.exports.ImportStmt = ImportStmt;
