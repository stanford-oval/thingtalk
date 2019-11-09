// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const adt = require('adt');
const assert = require('assert');

const Type = require('../type');
const { ExpressionSignature } = require('./function_def');
const { Value } = require('./values');
const toJS = require('./toJS');
const {
    recursiveYieldArraySlots,
    FieldSlot
} = require('./slots');

/**
 * Base class of all expressions that select a device.
 *
 * Selectors correspond to the `@`-device part of the ThingTalk code,
 * up to but not including the function name.
 *
 * @alias Ast.Selector
 * @property {boolean} isSelector - true
 * @property {boolean} isDevice - true if this is an instance of {@link Ast.Selector.Device}
 * @property {boolean} isBuiltin - true if this is {@link Ast.Selector.Builtin}
 * @abstract
 */
class Selector {}
Selector.prototype.isSelector = true;

/**
 * A selector that maps to one or more devices in Thingpedia.
 *
 * @alias Ast.Selector.Device
 * @extends Ast.Selector
 */
class DeviceSelector extends Selector {
    /**
     * Construct a new device selector.
     *
     * @param {string} kind - the Thingpedia class ID
     * @param {string|null} id - the unique ID of the device being selected, or null
     *                           to select devices according to the attributes, or
     *                           all devices if no attributes are specified
     * @param {null} principal - reserved/deprecated, must be `null`
     * @param {Ast.InputParam[]} attributes - other attributes used to select a device, if ID is unspecified
     * @param {boolean} [all=false] - operate on all devices that match the attributes, instead of
     *                                having the user choose
     */
    constructor(kind, id, principal, attributes = [], all = false) {
        super();

        assert(typeof kind === 'string');
        this.kind = kind;

        assert(typeof id === 'string' || id === null);
        this.id = id;

        assert(principal === null);
        this.principal = principal;

        this.attributes = attributes;

        this.all = all;
    }

    clone() {
        const attributes = this.attributes.map((attr) => attr.clone());
        return new DeviceSelector(this.kind, this.id, this.principal, attributes, this.all);
    }

    toString() {
        return `Device(${this.kind}, ${this.id ? this.id : ''}, )`;
    }
}
DeviceSelector.prototype.isDevice = true;
Selector.Device = DeviceSelector;


class BuiltinDevice extends Selector {
    clone() {
        return new BuiltinDevice();
    }

    toString() {
        return 'Builtin';
    }
}
BuiltinDevice.prototype.isBuiltin = true;

/**
 * A selector that maps the builtin `notify`, `return` and `save` functions.
 *
 * This is a singleton, not a class.
 *
 * @alias Ast.Selector.Builtin
 * @readonly
 */
Selector.Builtin = new BuiltinDevice();
module.exports.Selector = Selector;

/**
 * An invocation of a ThingTalk function.
 *
 * @class
 * @alias Ast.Invocation
 * @param {Ast.Selector} selector - the selector choosing where the function is invoked
 * @param {string} channel - the function name
 * @param {Ast.InputParam[]} in_params - input parameters passed to the function
 * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
 */
const Invocation = adt.newtype('Invocation', /** @lends Ast.Invocation.prototype */ {
    /**
     * The selector choosing where the function is invoked.
     * @type {Ast.Selector}
     * @readonly
     */
    selector: adt.only(Selector),
    /**
     * The function name being invoked.
     * @type {string}
     * @readonly
     */
    channel: adt.only(String),
    /**
     * The input parameters passed to the function.
     * @type {Ast.InputParam[]}
     * @readonly
     */
    in_params: adt.only(Array),
    /**
     * Type signature of the invoked function (not of the invocation itself).
     * This property is guaranteed not `null` after type-checking.
     * @type {Ast.ExpressionSignature|null}
     */
    schema: adt.only(ExpressionSignature, null),
});
module.exports.Invocation = Invocation.seal();

/**
 * An expression that computes a boolean predicate.
 * This AST node is used in filter expressions.
 *
 * @class
 * @alias Ast.BooleanExpression
 * @abstract
 * @property {boolean} isAnd - true if this is an instance of {@link Ast.BooleanExpression.And}
 * @property {boolean} isOr - true if this is an instance of {@link Ast.BooleanExpression.Or}
 * @property {boolean} isAtom - true if this is an instance of {@link Ast.BooleanExpression.Atom}
 * @property {boolean} isNot - true if this is an instance of {@link Ast.BooleanExpression.Not}
 * @property {boolean} isExternal - true if this is an instance of {@link Ast.BooleanExpression.External}
 * @property {boolean} isTrue - true if this is {@link Ast.BooleanExpression.True}
 * @property {boolean} isFalse - true if this is {@link Ast.BooleanExpression.False}
 */
const BooleanExpression = adt.data(function() {
    return /** @lends Ast.BooleanExpression */ {
        /**
         * A conjunction boolean expression (ThingTalk operator `&&`)
         * @class
         * @extends Ast.BooleanExpression
         * @param {Ast.BooleanExpression[]} operands - the expression operands
         */
        And: /** @lends Ast.BooleanExpression.And.prototype */ {
            /**
             * The expression operands.
             * @type {Ast.BooleanExpression[]}
             * @readonly
             */
            operands: adt.only(Array)
        },
        /**
         * A disjunction boolean expression (ThingTalk operator `||`)
         * @class
         * @extends Ast.BooleanExpression
         * @param {Ast.BooleanExpression[]} operands - the expression operands
         */
        Or: /** @lends Ast.BooleanExpression.Or.prototype */ {
            /**
             * The expression operands.
             * @type {Ast.BooleanExpression[]}
             * @readonly
             */
            operands: adt.only(Array)
        },
        /**
         * A comparison expression (predicate atom)
         * @class
         * @extends Ast.BooleanExpression
         * @param {string} name - the parameter name to compare
         * @param {string} operator - the comparison operator
         * @param {Ast.Value} value - the value being compared against
         */
        Atom: /** @lends Ast.BooleanExpression.Atom.prototype */ {
            /**
             * The parameter name to compare.
             * @type {string}
             * @readonly
             */
            name: adt.only(String),
            /**
             * The comparison operator.
             * @type {string}
             * @readonly
             */
            operator: adt.only(String),
            /**
             * The value being compared against.
             * @type {Ast.Value}
             * @readonly
             */
            value: adt.only(Value)
        },
        /**
         * A negation boolean expression (ThingTalk operator `!`)
         * @class
         * @extends Ast.BooleanExpression
         * @param {Ast.BooleanExpression} expr - the expression being negated
         */
        Not: /** @lends Ast.BooleanExpression.Not.prototype */ {
            /**
             * The expression being negated.
             * @type {Ast.BooleanExpression}
             * @readonly
             */
            expr: adt.only(this)
        },
        /**
         * A boolean expression that calls a Thingpedia query function
         * and filters the result.
         *
         * The boolean expression is true if at least one result from the function
         * call satisfies the filter.
         *
         * @class
         * @extends Ast.BooleanExpression
         * @param {Ast.Selector.Device} selector - the selector choosing where the function is invoked
         * @param {string} channel - the function name
         * @param {Ast.InputParam[]} in_params - input parameters passed to the function
         * @param {Ast.BooleanExpression} filter - the filter to apply on the invocation's results
         * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
         */
        External: /** @lends Ast.BooleanExpression.External.prototype */ {
            /**
             * The selector choosing where the function is invoked.
             * @type {Ast.Selector}
             * @readonly
             */
            selector: adt.only(Selector.Device),
            /**
             * The function name being invoked.
             * @type {string}
             * @readonly
             */
            channel: adt.only(String),
            /**
             * The input parameters passed to the function.
             * @type {Ast.InputParam[]}
             * @readonly
             */
            in_params: adt.only(Array),
            /**
             * The predicate to apply on the invocation's results.
             * @type {Ast.BooleanExpression}
             * @readonly
             */
            filter: adt.only(this),
            /**
             * Type signature of the invoked function (not of the boolean expression itself).
             * This property is guaranteed not `null` after type-checking.
             * @type {Ast.ExpressionSignature|null}
             */
            schema: adt.only(ExpressionSignature, null)
        },
        VarRef: {
            selector: adt.only(Selector),
            name: adt.only(String),
            args: adt.only(Array)
        },

        /**
         * The constant `true` boolean expression.
         *
         * This is a singleton, not a class.
         * @type {Ast.BooleanExpression}
         * @readonly
         */
        True: null,
        /**
         * The constant `true` boolean expression.
         *
         * This is a singleton, not a class.
         * @type {Ast.BooleanExpression}
         * @readonly
         */
        False: null
    };
});

const ListExpression = adt.newtype('ListExpression', {
    name: adt.only(String),
    filter: adt.only(BooleanExpression, null)
});
module.exports.ListExpression = ListExpression.seal();

// TODO
const ScalarExpression = adt.data({
    Primary: {
        value: adt.only(Value)
    },
    Derived: {
        op: adt.only(String),
        operands: adt.only(Array) // of ScalarExpression
    },
    Aggregation: {
        operator: adt.only(String), // max, min, sum, avg, count
        field: adt.only(String, null),
        list: adt.only(ListExpression)
    },
    Filter: {
        list: adt.only(ListExpression)
    },
    FlattenedList: {
        list: adt.only(ListExpression)
    },
    VarRef: {
        selector: adt.only(Selector),
        name: adt.only(String),
        args: adt.only(Array)
    }
});
module.exports.ScalarExpression = ScalarExpression.seal();

BooleanExpression.type('Compute', {
    lhs: adt.only(ScalarExpression),
    operator: adt.only(String),
    rhs: adt.only(Value)
});
module.exports.BooleanExpression = BooleanExpression.seal();

/**
 * AST node corresponding to an input parameter passed to a function.
 *
 * @class
 * @alias Ast.InputParam
 * @param {string} name - the input argument name
 * @param {Ast.Value} value - the value being passed
 */
const InputParam = adt.newtype('InputParam', /** @lends Ast.InputParam.prototype */ {
    /**
     * The input argument name.
     * @type {string}
     * @readonly
     */
    name: adt.only(String),
    /**
     * The value being passed.
     * @type {Ast.Value}
     * @readonly
     */
    value: adt.only(Value)
});
module.exports.InputParam = InputParam.seal();

// Stream and Table are mutually recursive
// hence we need to define them in this weird way

/**
 * The base class of all ThingTalk query expressions.
 *
 * @class
 * @alias Ast.Table
 * @abstract
 */
var Table = adt.data(/** @lends Ast.Table */ {
    VarRef: {
        name: adt.only(String),
        in_params: adt.only(Array),
        schema: adt.only(ExpressionSignature, null),
    },
    ResultRef: {
        kind: adt.only(String),
        channel: adt.only(String),
        index: adt.only(Value),
        schema: adt.only(ExpressionSignature, null),
    },
    Invocation: {
        invocation: adt.only(Invocation),
        schema: adt.only(ExpressionSignature, null)
    },
});
Table.type('Filter', {
    table: adt.only(Table),
    filter: adt.only(BooleanExpression),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Projection', {
    table: adt.only(Table),
    args: adt.only(Array), // of String
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Compute', {
    table: adt.only(Table),
    expression: adt.only(ScalarExpression),
    alias: adt.only(String, null),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Alias', {
    table: adt.only(Table),
    name: adt.only(String),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Aggregation', {
    table: adt.only(Table),
    field: adt.only(String),
    operator: adt.only(String),
    alias: adt.only(String, null),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Sort', {
    table: adt.only(Table),
    field: adt.only(String),
    direction: adt.only('asc', 'desc'),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Index', {
    table: adt.only(Table),
    indices: adt.only(Array), // of Value
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Slice', {
    table: adt.only(Table),
    base: adt.only(Value),
    limit: adt.only(Value),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Join', {
    lhs: adt.only(Table),
    rhs: adt.only(Table),
    in_params: adt.only(Array),
    schema: adt.only(ExpressionSignature, null)
});

/**
 * The base class of all ThingTalk stream expressions.
 *
 * @class
 * @alias Ast.Table
 * @abstract
 */
var Stream = adt.data(/** @lends Ast.Stream */ {
    VarRef: {
        name: adt.only(String),
        in_params: adt.only(Array),
        schema: adt.only(ExpressionSignature, null),
    },
    Timer: {
        base: adt.only(Value),
        interval: adt.only(Value),
        frequency: adt.only(Value, null),
        schema: adt.only(ExpressionSignature, null)
    },
    AtTimer: {
        time: adt.only(Array), // of Value
        expiration_date: adt.only(Value, null), // Date
        schema: adt.only(ExpressionSignature, null)
    },
    Monitor: {
        table: adt.only(Table),
        args: adt.only(Array, null),
        schema: adt.only(ExpressionSignature, null),
    }
});
Table.type('Window', {
    base: adt.only(Value), // : Number
    delta: adt.only(Value), // : Number
    stream: adt.only(Stream),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('TimeSeries', {
    base: adt.only(Value), // : Date
    delta: adt.only(Value), // : Measure(ms)
    stream: adt.only(Stream),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('Sequence', {
    base: adt.only(Value), // : Number
    delta: adt.only(Value), // : Number
    table: adt.only(Table),
    schema: adt.only(ExpressionSignature, null)
});
Table.type('History', {
    base: adt.only(Value), // : Date
    delta: adt.only(Value), // : Measure(ms)
    table: adt.only(Table),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('EdgeNew', {
    stream: adt.only(Stream),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('EdgeFilter', {
    stream: adt.only(Stream),
    filter: adt.only(BooleanExpression),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('Filter', {
    stream: adt.only(Stream),
    filter: adt.only(BooleanExpression),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('Projection', {
    stream: adt.only(Stream),
    args: adt.only(Array), // of String
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('Compute', {
    stream: adt.only(Stream),
    expression: adt.only(ScalarExpression),
    alias: adt.only(String, null),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('Alias', {
    stream: adt.only(Stream),
    name: adt.only(String),
    schema: adt.only(ExpressionSignature, null)
});
Stream.type('Join', {
    stream: adt.only(Stream),
    table: adt.only(Table),
    in_params: adt.only(Array),
    schema: adt.only(ExpressionSignature, null)
});
module.exports.Table = Table.seal();
module.exports.Stream = Stream.seal();

/**
 * Base class for all expressions that invoke an action.
 *
 * @class
 * @alias Ast.Action
 * @abstract
 * @property {boolean} isVarRef - true if this is an instance of {@link Ast.Action.VarRef}
 * @property {boolean} isInvocation - true if this is an instance of {@link Ast.Action.Invocation}
 */
const Action = adt.data(/** @lends Ast.Action */{
    /**
     * An invocation of a locally defined action (i.e. one defined with
     * a `let` statement).
     *
     * @class
     * @extends Ast.Action
     * @param {string} name - the name of the action to invoke
     * @param {Ast.InputParam[]} in_params - the input parameters to pass
     * @param {Ast.ExpressionSignature|null} schema - type signature of this action
     */
    VarRef: /** @lends Ast.Action.VarRef.prototype */ {
        /**
         * The name of the action to invoke.
         * @type {string}
         * @readonly
         */
        name: adt.only(String),
        /**
         * The input parameters to pass.
         * @type {Ast.InputParam[]}
         * @readonly
         */
        in_params: adt.only(Array),
        /**
         * Type signature of this action.
         *
         * Note that this _not_ the type signature of the invoked function,
         * because all input arguments that have a value are removed from the signature.
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.ExpressionSignature|null}
         */
        schema: adt.only(ExpressionSignature, null),
    },

    /**
     * An invocation of an action in Thingpedia.
     *
     * @class
     * @extends Ast.Action
     * @param {Ast.Invocation} invocation - the function invocation
     * @param {Ast.ExpressionSignature|null} schema - type signature of this action
     */
    Invocation: /** @lends Ast.Action.Invocation.prototype */ {
        /**
         * The actual invocation expression.
         * @type {Ast.Invocation}
         * @readonly
         */
        invocation: adt.only(Invocation),
        /**
         * Type signature of this action.
         *
         * Note that this _not_ the type signature of the invoked function,
         * because all input arguments that have a value are removed from the signature.
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.ExpressionSignature|null}
         */
        schema: adt.only(ExpressionSignature, null),
    }
});
module.exports.Action = Action.seal();

var PermissionFunction = adt.data({
    Specified: {
        kind: adt.only(String),
        channel: adt.only(String),
        filter: adt.only(BooleanExpression),
        schema: adt.only(ExpressionSignature, null),
    },
    Builtin: null,
    ClassStar: {
        kind: adt.only(String)
    },
    Star: null
});
module.exports.PermissionFunction = PermissionFunction.seal();

/**
 * The base class of all AST nodes that represent complete ThingTalk
 * statements.
 *
 * @alias Ast.Statement
 * @abstract
 */
class Statement {
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


const Example = adt.newtype('Example', {
    id: adt.only(Number), // default to -1 for newly created examples
    type: adt.only('stream', 'query', 'action', 'program'),
    args: adt.only(Object),
    value: adt.only(Stream, Table, Action, Input),
    utterances: adt.only(Array),
    preprocessed: adt.only(Array),
    annotations: adt.only(Object)
});
module.exports.Example = Example.seal();

/**
 * An `import` statement inside a ThingTalk class.
 *
 * @alias Ast.ImportStmt
 * @class
 * @abstract
 */
const ImportStmt = adt.data({
    /**
     * A `import` statement that imports a whole ThingTalk class.
     *
     * @name Ast.ImportStmt.Class
     * @extends Ast.ImportStmt
     * @class
     * @param {string} kind - the class identifier to import
     * @param {string|null} alias - rename the imported class to the given alias
     * @deprecated Class imports were never implemented and are unlikely to be implemented soon.
     */
    Class: /** @lends Ast.ImportStmt.Class.prototype */ {
        /**
         * The class identifier to import.
         * @type {string}
         */
        kind: adt.only(String),
        /**
         * The alias under which the import is made available.
         * @type {string|null}
         */
        alias: adt.only(String, null)
    },

    /**
     * A `import` statement that imports a mixin.
     *
     * Mixins add implementation functionality to ThingTalk classes, such as specifing
     * how the class is loaded (which language, which format, which version of the SDK)
     * and how devices are configured.
     *
     * @name Ast.ImportStmt.Mixin
     * @extends Ast.ImportStmt
     * @class
     * @param {string[]} facets - which facets to import from the mixin (`config`, `auth`, `loader`, ...)
     * @param {string} module - the mixin identifier to import
     * @param {Ast.InputParam[]} in_params - input parameters to pass to the mixin
     */
    Mixin: /** @lends Ast.ImportStmt.Mixin.prototype */ {
        /**
         * Which facets to import from the mixin.
         * @type {string[]}
         */
        facets: adt.only(Array),
        /**
         * The mixin identifier to import.
         * @type {string}
         */
        module: adt.only(String),
        /**
         * Input parameters to pass to the mixin.
         * @type {Ast.InputParam[]}
         */
        in_params: adt.only(Array)
    }
});
module.exports.ImportStmt = ImportStmt.seal();
