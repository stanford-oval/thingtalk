// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";
const assert = require('assert');

const Node = require('./base');
const { ExpressionSignature } = require('./function_def');
const { Value } = require('./values');

/**
 * Base class of all expressions that select a device.
 *
 * Selectors correspond to the `@`-device part of the ThingTalk code,
 * up to but not including the function name.
 *
 * @alias Ast.Selector
 * @extends Ast~Node
 * @property {boolean} isSelector - true
 * @property {boolean} isDevice - true if this is an instance of {@link Ast.Selector.Device}
 * @property {boolean} isBuiltin - true if this is {@link Ast.Selector.Builtin}
 * @abstract
 */
class Selector extends Node {}
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
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} kind - the Thingpedia class ID
     * @param {string|null} id - the unique ID of the device being selected, or null
     *                           to select devices according to the attributes, or
     *                           all devices if no attributes are specified
     * @param {null} principal - reserved/deprecated, must be `null`
     * @param {Ast.InputParam[]} attributes - other attributes used to select a device, if ID is unspecified
     * @param {boolean} [all=false] - operate on all devices that match the attributes, instead of
     *                                having the user choose
     */
    constructor(location, kind, id, principal, attributes = [], all = false) {
        super(location);

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
        return new DeviceSelector(this.location, this.kind, this.id, this.principal, attributes, this.all);
    }

    toString() {
        return `Device(${this.kind}, ${this.id ? this.id : ''}, )`;
    }
}
DeviceSelector.prototype.isDevice = true;
Selector.Device = DeviceSelector;

class BuiltinDevice extends Selector {
    constructor() {
        super(null);
    }

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
 * @alias Ast.Invocation
 * @extends Ast~Node
 */
class Invocation extends Node {
    /**
     * Construct a new invocation.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Selector} selector - the selector choosing where the function is invoked
     * @param {string} channel - the function name
     * @param {Ast.InputParam[]} in_params - input parameters passed to the function
     * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
     * @property {boolean} isInvocation - true
     */
    constructor(location, selector, channel, in_params, schema) {
        super(location);

        assert(selector instanceof Selector);
        /**
         * The selector choosing where the function is invoked.
         * @type {Ast.Selector}
         * @readonly
         */
        this.selector = selector;

        assert(typeof channel === 'string');

        /**
         * The function name being invoked.
         * @type {string}
         * @readonly
         */
        this.channel = channel;

        assert(Array.isArray(in_params));
        /**
         * The input parameters passed to the function.
         * @type {Ast.InputParam[]}
         * @readonly
         */
        this.in_params = in_params;

        assert(schema === null || schema instanceof ExpressionSignature);
        /**
         * Type signature of the invoked function (not of the invocation itself).
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.ExpressionSignature|null}
         */
        this.schema = schema;
    }

    clone() {
        return new Invocation(
            this.location,
            this.selector.clone(),
            this.channel,
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone(): null
        );
    }

    toString() {
        const in_params = this.in_params && this.in_params.length > 0 ? this.in_params.toString() : '';
        return `Invocation(${this.selector.toString()}, ${this.channel}, ${in_params}, )`;
    }
}
Invocation.prototype.isInvocation = true;
module.exports.Invocation = Invocation;


/**
 * An expression that computes a boolean predicate.
 * This AST node is used in filter expressions.
 *
 * @class
 * @alias Ast.BooleanExpression
 * @extends Ast~Node
 * @abstract
 * @property {boolean} isBooleanExpression - true
 * @property {boolean} isAnd - true if this is an instance of {@link Ast.BooleanExpression.And}
 * @property {boolean} isOr - true if this is an instance of {@link Ast.BooleanExpression.Or}
 * @property {boolean} isAtom - true if this is an instance of {@link Ast.BooleanExpression.Atom}
 * @property {boolean} isNot - true if this is an instance of {@link Ast.BooleanExpression.Not}
 * @property {boolean} isExternal - true if this is an instance of {@link Ast.BooleanExpression.External}
 * @property {boolean} isTrue - true if this is {@link Ast.BooleanExpression.True}
 * @property {boolean} isFalse - true if this is {@link Ast.BooleanExpression.False}
 * @property {boolean} isVarRef - true if this is {@link Ast.BooleanExpression.VarRef}
 * @property {boolean} isCompute - true if this is {@link Ast.BooleanExpression.Compute}
 */
class BooleanExpression extends Node {}
BooleanExpression.prototype.isBooleanExpression = true;

/**
 * A conjunction boolean expression (ThingTalk operator `&&`)
 * @alias Ast.BooleanExpression.And
 * @extends Ast.BooleanExpression
 */
class AndBooleanExpression extends BooleanExpression {
    /**
     * Construct a new And expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.BooleanExpression[]} operands - the expression operands
     */
    constructor(location, operands) {
        super(location);

        assert(Array.isArray(operands));
        /**
         * The expression operands.
         * @type {Ast.BooleanExpression[]}
         * @readonly
         */
        this.operands = operands;
    }

    clone() {
        return new AndBooleanExpression(
            this.location,
            this.operands.map((operand) => operand.clone())
        );
    }
}
BooleanExpression.And = AndBooleanExpression;
BooleanExpression.And.prototype.isAnd = true;
/**
 * A disjunction boolean expression (ThingTalk operator `||`)
 * @alias Ast.BooleanExpression.Or
 * @extends Ast.BooleanExpression
 */
class OrBooleanExpression extends BooleanExpression {
    /**
     * Construct a new Or expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.BooleanExpression[]} operands - the expression operands
     */
    constructor(location, operands) {
        super(location);

        assert(Array.isArray(operands));
        /**
         * The expression operands.
         * @type {Ast.BooleanExpression[]}
         * @readonly
         */
        this.operands = operands;
    }

    clone() {
        return new OrBooleanExpression(
            this.location,
            this.operands.map((operand) => operand.clone())
        );
    }
}
BooleanExpression.Or = OrBooleanExpression;
BooleanExpression.Or.prototype.isOr = true;
/**
 * A comparison expression (predicate atom)
 * @alias Ast.BooleanExpression.Atom
 * @extends Ast.BooleanExpression
 */
class AtomBooleanExpression extends BooleanExpression {
    /**
     * Construct a new atom boolean expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the parameter name to compare
     * @param {string} operator - the comparison operator
     * @param {Ast.Value} value - the value being compared against
     */
    constructor(location, name, operator, value) {
        super(location);

        assert(typeof name === 'string');
        /**
         * The parameter name to compare.
         * @type {string}
         * @readonly
         */
        this.name = name;

        assert(typeof operator === 'string');
        /**
         * The comparison operator.
         * @type {string}
         * @readonly
         */
        this.operator = operator;

        assert(value instanceof Value);
        /**
          * The value being compared against.
          * @type {Ast.Value}
          * @readonly
          */
        this.value = value;
    }

    clone() {
        return new AtomBooleanExpression(
            this.location,
            this.name, this.operator, this.value.clone()
        );
    }

    toString() {
        return `Atom(${this.name}, ${this.operator}, ${this.value})`;
    }
}
BooleanExpression.Atom = AtomBooleanExpression;
BooleanExpression.Atom.prototype.isAtom = true;
/**
 * A negation boolean expression (ThingTalk operator `!`)
 * @alias Ast.BooleanExpression.Not
 * @extends Ast.BooleanExpression
 */
class NotBooleanExpression extends BooleanExpression {
    /**
     * Construct a new Not expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.BooleanExpression} expr - the expression being negated
     */
    constructor(location, expr) {
        super(location);

        assert(expr instanceof BooleanExpression);
        /**
         * The expression being negated.
         * @type {Ast.BooleanExpression}
         * @readonly
         */
        this.expr = expr;
    }

    clone() {
        return new NotBooleanExpression(this.location, this.expr.clone());
    }
}
BooleanExpression.Not = NotBooleanExpression;
BooleanExpression.Not.prototype.isNot = true;

/**
 * A boolean expression that calls a Thingpedia query function
 * and filters the result.
 *
 * The boolean expression is true if at least one result from the function
 * call satisfies the filter.
 *
 * @alias Ast.BooleanExpression.External
 * @extends Ast.BooleanExpression
 */
class ExternalBooleanExpression extends BooleanExpression {
    /**
     * Construct a new external boolean expression.
     *
     * @param {Ast.Selector.Device} selector - the selector choosing where the function is invoked
     * @param {string} channel - the function name
     * @param {Ast.InputParam[]} in_params - input parameters passed to the function
     * @param {Ast.BooleanExpression} filter - the filter to apply on the invocation's results
     * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
     */
    constructor(location, selector, channel, in_params, filter, schema) {
        super(location);

        assert(selector instanceof Selector);
        /**
         * The selector choosing where the function is invoked.
         * @type {Ast.Selector}
         * @readonly
         */
        this.selector = selector;

        assert(typeof channel === 'string');
        /**
         * The function name being invoked.
         * @type {string}
         * @readonly
         */
        this.channel = channel;

        assert(Array.isArray(in_params));
        /**
         * The input parameters passed to the function.
         * @type {Ast.InputParam[]}
         * @readonly
         */
        this.in_params = in_params;

        assert(filter instanceof BooleanExpression);
        /**
         * The predicate to apply on the invocation's results.
         * @type {Ast.BooleanExpression}
         * @readonly
         */
        this.filter = filter;

        assert(schema === null || schema instanceof ExpressionSignature);
        /**
         * Type signature of the invoked function (not of the boolean expression itself).
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.ExpressionSignature|null}
         */
        this.schema = schema;
    }

    clone() {
        return new ExternalBooleanExpression(
            this.location,
            this.selector.clone(),
            this.channel,
            this.in_params.map((p) => p.clone()),
            this.filter.clone(),
            this.schema ? this.schema.clone(): null
        );
    }
}
BooleanExpression.External = ExternalBooleanExpression;
BooleanExpression.External.prototype.isExternal = true;

class TrueBooleanExpression extends BooleanExpression {
    constructor() {
        super(null);
    }

    clone() {
        return new TrueBooleanExpression();
    }
}
TrueBooleanExpression.prototype.isTrue = true;
/**
 * The constant `true` boolean expression.
 *
 * This is a singleton, not a class.
 * @alias Ast.BooleanExpression.True
 * @type {Ast.BooleanExpression}
 * @readonly
 */
BooleanExpression.True = new TrueBooleanExpression();

class FalseBooleanExpression extends BooleanExpression {
    constructor() {
        super(null);
    }

    clone() {
        return new FalseBooleanExpression();
    }
}
FalseBooleanExpression.prototype.isFalse = true;
/**
 * The constant `false` boolean expression.
 *
 * This is a singleton, not a class.
 * @alias Ast.BooleanExpression.False
 * @type {Ast.BooleanExpression}
 * @readonly
 */
BooleanExpression.False = new FalseBooleanExpression();

/**
 * A boolean expression that calls a Thingpedia computation macro
 *
 * @alias Ast.BooleanExpression.VarRef
 * @extends Ast.BooleanExpression
 */
class VarRefBooleanExpression extends BooleanExpression {
    /**
     * Construct a new var ref boolean expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Selector.Device} selector - the selector choosing where the function is invoked
     * @param {string} name - the macro name
     * @param {Ast.InputParam[]} in_params - input parameters passed to the macro
     */
    constructor(location, selector, name, args) {
        super(location);

        assert(selector instanceof Selector);
        /**
         * The selector choosing where the function is invoked.
         * @type {Ast.Selector}
         * @readonly
         */
        this.selector = selector;

        assert(typeof name === 'string');
        /**
         * The input parameters passed to the function.
         * @type {Ast.InputParam[]}
         * @readonly
         */
        this.name = name;

        assert(Array.isArray(args));
        /**
         * The input parameters passed to the function.
         * @type {Ast.InputParam[]}
         * @readonly
         */
        this.args = args;
    }

    clone() {
        return new VarRefBooleanExpression(
            this.location,
            this.selector.clone(),
            this.name,
            this.args.map((a) => a)
        );
    }
}
BooleanExpression.VarRef = VarRefBooleanExpression;
BooleanExpression.VarRef.prototype.isVarRef = true;

/**
 * A boolean expression that computes a scalar expression and then does a comparison
 *
 * @alias Ast.BooleanExpression.Compute
 * @extends Ast.BooleanExpression
 */
class ComputeBooleanExpression extends BooleanExpression {
    /**
     * Construct a new compute boolean expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.ScalarExpression} lhs - the scalar expression to compute
     * @param {string} operator - the comparison operator
     * @param {Ast.Value} value - the value being compared against
     */
    constructor(location, lhs, operator, rhs) {
        super(location);

        assert(lhs instanceof ScalarExpression);
        /**
         * The scalar expression being compared.
         *
         * @type {Ast.ScalarExpression}
         * @readonly
         */
        this.lhs = lhs;

        assert(typeof operator === 'string');
        /**
         * The comparison operator.
         *
         * @type {string}
         * @readonly
         */
        this.operator = operator;

        assert(rhs instanceof Value);
        /**
         * The value being compared against.
         *
         * @type {Ast.Value}
         * @readonly
         */
        this.rhs = rhs;
    }

    clone() {
        return new ComputeBooleanExpression(
            this.location,
            this.lhs.clone(),
            this.operator,
            this.rhs.clone()
        );
    }
}
BooleanExpression.Compute = ComputeBooleanExpression;
BooleanExpression.Compute.prototype.isCompute = true;
module.exports.BooleanExpression = BooleanExpression;

/**
 * An expression that evaluates to a list of results.
 *
 * @alias Ast.ListExpression
 * @extends Ast~Node
 */
class ListExpression extends Node {
    /**
     * Construct a new list expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the parameter being iterated over
     * @param {Ast.BooleanExpression|null} - a filter to apply over each result
     */
    constructor(location, name, filter) {
        super(location);

        assert(typeof name === 'string');
        this.name = name;

        assert(filter === null || filter instanceof BooleanExpression);
        this.filter = filter;
    }

    clone() {
        return new ListExpression(
            this.location,
            this.name,
            this.filter ? this.filter.clone() : null
        );
    }
}
ListExpression.prototype.isListExpression = true;
module.exports.ListExpression = ListExpression;

/**
 * An expression that computes a single scalar result.
 *
 * @alias Ast.ScalarExpression
 * @extends Ast~Node
 * @abstract
 */
class ScalarExpression extends Node {}
ScalarExpression.prototype.isScalarExpression = true;

/**
 * A scalar expression that returns a variable or value.
 *
 * @alias Ast.ScalarExpression.Primary
 * @extends Ast.ScalarExpression
 */
class PrimaryScalarExpression extends ScalarExpression {
    /**
     * Construct a new primary scalar expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Value} value - the value returned by this expression
     */
    constructor(location, value) {
        super(location);

        assert(value instanceof Value);
        this.value = value;
    }

    clone() {
        return new PrimaryScalarExpression(this.location, this.value.clone());
    }
}
ScalarExpression.Primary = PrimaryScalarExpression;
ScalarExpression.Primary.prototype.isPrimary = true;

/**
 * A scalar expression that computes an expression over other
 * scalar expressions.
 *
 * @alias Ast.ScalarExpression.Derived
 * @extends Ast.ScalarExpression
 */
class DerivedScalarExpression extends ScalarExpression {
    /**
     * Construct a new derived scalar expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} op - the operator to apply
     * @param {Ast.ScalarExpression[]} operands - the operands of this expression
     */
    constructor(location, op, operands) {
        super(location);

        assert(typeof op === 'string');
        this.op = op;

        assert(Array.isArray(operands));
        this.operands = operands;
    }

    clone() {
        return new DerivedScalarExpression(
            this.location,
            this.op, this.operands.map((operand) => operand.clone()));
    }
}
ScalarExpression.Derived = DerivedScalarExpression;
ScalarExpression.Derived.prototype.isDerived = true;

/**
 * A scalar expression that aggregates over a list expression.
 *
 * @alias Ast.ScalarExpression.Aggregation
 * @extends Ast.ScalarExpression
 */
class AggregationScalarExpression extends ScalarExpression {
    /**
     * Construct a new aggregation scalar expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} operator - the aggregation operator to apply
     * @param {string|null} field - the field to use for aggregation
     * @param {Ast.ListExpression} list - the list expression to aggregate
     */
    constructor(location, operator, field, list) {
        super(location);

        assert(typeof operator === 'string');
        this.operator = operator;

        assert(field === null || typeof field === 'string');
        this.field = field;

        assert(list instanceof ListExpression);
        this.list = list;
    }

    clone() {
        return new AggregationScalarExpression(
            this.location,
            this.operator,
            this.field,
            this.list.clone()
        );
    }
}
ScalarExpression.Aggregation = AggregationScalarExpression;
ScalarExpression.Aggregation.prototype.isAggregation = true;

// XXX should be removed?
class FilterScalarExpression extends ScalarExpression {
    constructor(location, list) {
        super(location);

        assert(list instanceof ListExpression);
        this.list = list;
    }

    clone() {
        return new FilterScalarExpression(this.location, this.list.clone());
    }
}
ScalarExpression.Filter = FilterScalarExpression;
ScalarExpression.Filter.prototype.isFilter = true;

// XXX should be removed?
class FlattenedListScalarExpression extends ScalarExpression {
    constructor(location, list) {
        super(location);

        assert(list instanceof ListExpression);
        this.list = list;
    }

    clone() {
        return new FlattenedListScalarExpression(this.location, this.list.clone());
    }
}
ScalarExpression.FlattenedList = FlattenedListScalarExpression;
ScalarExpression.FlattenedList.prototype.isFlattenedList = true;

/**
 * A scalar expression that invokes a Thingpedia computation macro.
 *
 * @alias Ast.ScalarExpression.VarRef
 * @extends Ast.ScalarExpression
 */
class VarRefScalarExpression extends ScalarExpression {
    /**
     * Construct a new var ref scalar expression.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Selector.Device} selector - the selector choosing where the function is invoked
     * @param {string} name - the macro name
     * @param {Ast.InputParam[]} in_params - input parameters passed to the macro
     */
    constructor(location, selector, name, args) {
        super(location);

        assert(selector instanceof Selector);
        this.selector = selector;

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(args));
        this.args = args;
    }

    clone() {
        return new VarRefScalarExpression(
            this.location,
            this.selector.clone(),
            this.name,
            this.args.map((a) => a)
        );
    }
}
ScalarExpression.VarRef = VarRefScalarExpression;
ScalarExpression.VarRef.prototype.isVarRef = true;
module.exports.ScalarExpression = ScalarExpression;
