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

const Base = require('./base');
const { ExpressionSignature } = require('./function_def');
const { Value } = require('./values');

/**
 * Base class of all expressions that select a device.
 *
 * Selectors correspond to the `@`-device part of the ThingTalk code,
 * up to but not including the function name.
 *
 * @alias Ast.Selector
 * @extends Ast.Base
 * @property {boolean} isSelector - true
 * @property {boolean} isDevice - true if this is an instance of {@link Ast.Selector.Device}
 * @property {boolean} isBuiltin - true if this is {@link Ast.Selector.Builtin}
 * @abstract
 */
class Selector extends Base {}
Selector.prototype.isSelector = true;
/**
 * A selector that maps to one or more devices in Thingpedia.
 *
 * @alias Ast.Selector.Device
 * @extends Ast.Selector
 * @param {string} kind - the Thingpedia class ID
 * @param {string|null} id - the unique ID of the device being selected, or null
 *                           to select all devices
 * @param {null} principal - reserved/deprecated, must be `null`
 */
class DeviceSelector extends Selector {
    constructor(kind, id, principal) {
        super();

        assert(typeof kind === 'string');
        this.kind = kind;

        assert(typeof id === 'string' || id === null);
        this.id = id;

        assert(principal === null);
        this.principal = principal;
    }

    clone() {
        return new DeviceSelector(this.kind, this.id, this.principal);
    }

    toString() {
        return `Device(${this.kind}, ${this.id ? this.id : ''}, ${this.principal ? this.principal : ''})`;
    }
}
DeviceSelector.prototype.isDevice = true;
Selector.Device = DeviceSelector;
/**
 * A selector that maps the builtin `notify`, `return` and `save` functions.
 *
 * @alias Ast.Selector.Builtin
 * @extends Ast.Selector
 * @readonly
 */
class BuiltinDevice extends Selector {
    clone() {
        return new BuiltinDevice();
    }

    toString() {
        return 'Builtin';
    }
}
BuiltinDevice.prototype.isBuiltin = true;
Selector.Builtin = new BuiltinDevice();
module.exports.Selector = Selector;


/**
 * An invocation of a ThingTalk function.
 *
 * @alias Ast.Invocation
 * @extends Ast.Base
 * @param {Ast.Selector} selector - the selector choosing where the function is invoked
 * @param {string} channel - the function name
 * @param {Ast.InputParam[]} in_params - input parameters passed to the function
 * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
 * @property {boolean} isInvocation - true
 */
class Invocation extends Base {
    constructor(selector, channel, in_params, schema) {
        super();

        assert(selector instanceof Selector);
        this.selector = selector;

        assert(typeof channel === 'string');
        this.channel = channel;

        assert(Array.isArray(in_params));
        this.in_params = in_params;

        assert(schema === null || schema instanceof ExpressionSignature);
        this.schema = schema;
    }

    clone() {
        return new Invocation(
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
 * @extends Ast.Base
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
class BooleanExpression extends Base {}
BooleanExpression.prototype.isBooleanExpression = true;
/**
 * A conjunction boolean expression (ThingTalk operator `&&`)
 * @alias Ast.BooleanExpression.And
 * @extends Ast.BooleanExpression
 * @param {Ast.BooleanExpression[]} operands - the expression operands
 */
class AndBooleanExpression extends BooleanExpression {
    constructor(operands) {
        super();

        assert(Array.isArray(operands));
        this.operands = operands;
    }

    clone() {
        return new AndBooleanExpression(
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
 * @param {Ast.BooleanExpression[]} operands - the expression operands
 */
class OrBooleanExpression extends BooleanExpression {
    constructor(operands) {
        super();

        assert(Array.isArray(operands));
        this.operands = operands;
    }

    clone() {
        return new OrBooleanExpression(
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
 * @param {string} name - the parameter name to compare
 * @param {string} operator - the comparison operator
 * @param {Ast.Value} value - the value being compared against
 */
class AtomBooleanExpression extends BooleanExpression {
    constructor(name, operator, value) {
        super();

        assert(typeof name === 'string');
        this.name = name;

        assert(typeof operator === 'string');
        this.operator = operator;

        assert(value instanceof Value);
        this.value = value;
    }

    clone() {
        return new AtomBooleanExpression(
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
 * @param {Ast.BooleanExpression} expr - the expression being negated
 */
class NotBooleanExpression extends BooleanExpression {
    constructor(expr) {
        super();

        assert(expr instanceof BooleanExpression);
        this.expr = expr;
    }

    clone() {
        return new NotBooleanExpression(this.expr.clone());
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
 * @param {Ast.Selector.Device} selector - the selector choosing where the function is invoked
 * @param {string} channel - the function name
 * @param {Ast.InputParam[]} in_params - input parameters passed to the function
 * @param {Ast.BooleanExpression} filter - the filter to apply on the invocation's results
 * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
 */
class ExternalBooleanExpression extends BooleanExpression {
    constructor(selector, channel, in_params, filter, schema) {
        super();

        assert(selector instanceof Selector);
        this.selector = selector;

        assert(typeof channel === 'string');
        this.channel = channel;

        assert(Array.isArray(in_params));
        this.in_params = in_params;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;

        assert(schema === null || schema instanceof ExpressionSignature);
        this.schema = schema;
    }

    clone() {
        return new ExternalBooleanExpression(
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
/**
 * The constant `true` boolean expression.
 *
 * @alias Ast.BooleanExpression.True
 * @extends Ast.BooleanExpression
 * @readonly
 */
class TrueBooleanExpression extends BooleanExpression {
    clone() {
        return new TrueBooleanExpression();
    }
}
TrueBooleanExpression.prototype.isTrue = true;
BooleanExpression.True = new TrueBooleanExpression();
/**
 * The constant `false` boolean expression.
 *
 * @alias Ast.BooleanExpression.False
 * @extends Ast.BooleanExpression
 * @readonly
 */
class FalseBooleanExpression extends BooleanExpression {
    clone() {
        return new FalseBooleanExpression();
    }
}
FalseBooleanExpression.prototype.isFalse = true;
BooleanExpression.False = new FalseBooleanExpression();
/**
 * A boolean expression that calls a Thingpedia computation macro
 *
 *
 * @alias Ast.BooleanExpression.VarRef
 * @extends Ast.BooleanExpression
 * @param {Ast.Selector.Device} selector - the selector choosing where the function is invoked
 * @param {string} name - the macro name
 * @param {Ast.InputParam[]} in_params - input parameters passed to the macro
 */
class VarRefBooleanExpression extends BooleanExpression {
    constructor(selector, name, args) {
        super();

        assert(selector instanceof Selector);
        this.selector = selector;

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(args));
        this.args = args;
    }

    clone() {
        return new VarRefBooleanExpression(
            this.selector.clone(),
            this.name,
            this.args.map((a) => a)
        );
    }
}
BooleanExpression.VarRef = VarRefBooleanExpression;
BooleanExpression.VarRef.prototype.isVarRef = true;
/**
 * A boolean expression that computes a scalar expression and then do a comparison
 *
 *
 * @alias Ast.BooleanExpression.Compute
 * @extends Ast.BooleanExpression
 * @param {Ast.ScalarExpression} lhs - the scalar expression to compute
 * @param {string} operator - the comparison operator
 * @param {Ast.Value} value - the value being compared against
 */
class ComputeBooleanExpression extends BooleanExpression {
    constructor(lhs, operator, rhs) {
        super();

        assert(lhs instanceof ScalarExpression);
        this.lhs = lhs;

        assert(typeof operator === 'string');
        this.operator = operator;

        assert(rhs instanceof Value);
        this.rhs = rhs;
    }

    clone() {
        return new ComputeBooleanExpression(
            this.lhs.clone(),
            this.operator,
            this.rhs.clone()
        );
    }
}
BooleanExpression.Compute = ComputeBooleanExpression;
BooleanExpression.Compute.prototype.isCompute = true;
module.exports.BooleanExpression = BooleanExpression;


class ListExpression extends Base {
    constructor(name, filter) {
        super();

        assert(typeof name === 'string');
        this.name = name;

        assert(filter === null || filter instanceof BooleanExpression);
        this.filter = filter;
    }

    clone() {
        return new ListExpression(
            this.name,
            this.filter ? this.filter.clone() : null
        );
    }
}
ListExpression.prototype.isListExpression = true;
module.exports.ListExpression = ListExpression;


class ScalarExpression extends Base {}
ScalarExpression.prototype.isScalarExpression = true;
class PrimaryScalarExpression extends ScalarExpression {
    constructor(value) {
        super();

        assert(value instanceof Value);
        this.value = value;
    }

    clone() {
        return new PrimaryScalarExpression(this.value.clone());
    }
}
ScalarExpression.Primary = PrimaryScalarExpression;
ScalarExpression.Primary.prototype.isPrimary = true;
class DerivedScalarExpression extends ScalarExpression {
    constructor(op, operands) {
        super();

        assert(typeof op === 'string');
        this.op = op;

        assert(Array.isArray(operands));
        this.operands = operands;
    }

    clone() {
        return new DerivedScalarExpression(this.op, this.operands.map((operand) => operand.clone()));
    }
}
ScalarExpression.Derived = DerivedScalarExpression;
ScalarExpression.Derived.prototype.isDerived = true;
class AggregationScalarExpression extends ScalarExpression {
    constructor(operator, field, list) {
        super();

        assert(typeof operator === 'string');
        this.operator = operator;

        assert(field === null || typeof field === 'string');
        this.field = field;

        assert(list instanceof ListExpression);
        this.list = list;
    }

    clone() {
        return new AggregationScalarExpression(
            this.operator,
            this.field,
            this.list.clone()
        );
    }
}
ScalarExpression.Aggregation = AggregationScalarExpression;
ScalarExpression.Aggregation.prototype.isAggregation = true;
class FilterScalarExpression extends ScalarExpression {
    constructor(list) {
        super();

        assert(list instanceof ListExpression);
        this.list = list;
    }

    clone() {
        return new FilterScalarExpression(this.list.clone());
    }
}
ScalarExpression.Filter = FilterScalarExpression;
ScalarExpression.Filter.prototype.isFilter = true;
class FlattenedListScalarExpression extends ScalarExpression {
    constructor(list) {
        super();

        assert(list instanceof ListExpression);
        this.list = list;
    }

    clone() {
        return new FlattenedListScalarExpression(this.list.clone());
    }
}
ScalarExpression.FlattenedList = FlattenedListScalarExpression;
ScalarExpression.FlattenedList.prototype.isFlattenedList = true;
class VarRefScalarExpression extends ScalarExpression {
    constructor(selector, name, args) {
        super();

        assert(selector instanceof Selector);
        this.selector = selector;

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(args));
        this.args = args;
    }

    clone() {
        return new VarRefScalarExpression(
            this.selector.clone(),
            this.name,
            this.args.map((a) => a)
        );
    }
}
ScalarExpression.VarRef = VarRefScalarExpression;
ScalarExpression.VarRef.prototype.isVarRef = true;
module.exports.ScalarExpression = ScalarExpression;
