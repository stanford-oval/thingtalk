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
const { ExpressionSignature } = require('./function_def');
const { Value } = require('./values');
const toJS = require('./toJS');
const { recursiveYieldArraySlots, FieldSlot } = require('./slots');

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


/**
 * AST node corresponding to an input parameter passed to a function.
 *
 * @class
 * @alias Ast.InputParam
 * @extends Ast.Base
 * @param {string} name - the input argument name
 * @param {Ast.Value} value - the value being passed
 * @property {boolean} isInputParam - true
 */
class InputParam extends Base {
    constructor(name, value) {
        super();

        assert(typeof name === 'string');
        this.name = name;

        assert(value instanceof Value);
        this.value = value;
    }

    clone() {
        return new InputParam(this.name, this.value.clone());
    }

    toString() {
        return `InputParam(${this.name}, ${this.value})`;
    }
}
InputParam.prototype.isInputParam = true;
module.exports.InputParam = InputParam;


/**
 * The base class of all ThingTalk query expressions.
 *
 * @alias Ast.Table
 * @extends Ast.Base
 * @abstract
 * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
 */
class Table extends Base {
    constructor(schema) {
        super();

        assert(schema === null || schema instanceof ExpressionSignature);
        this.schema = schema;
    }
}
Table.prototype.isTable = true;
class VarRefTable extends Table {
    constructor(name, in_params, schema) {
        super(schema);

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new VarRefTable(
            this.name,
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.VarRef = VarRefTable;
Table.VarRef.prototype.isVarRef = true;
class ResultRefTable extends Table {
    constructor(kind, channel, index, schema) {
        super(schema);

        assert(typeof kind === 'string');
        this.kind = kind;

        assert(typeof channel === 'string');
        this.channel = channel;

        assert(index instanceof Value);
        this.index = index;
    }

    clone() {
        return new ResultRefTable(
            this.kind,
            this.channel,
            this.index.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    toString() {
        return `ResultRef(${this.kind}, ${this.channel}, ${this.index}, )`;
    }
}
Table.ResultRef = ResultRefTable;
Table.ResultRef.prototype.isResultRef = true;
class TableInvocation extends Table {
    constructor(invocation, schema) {
        super(schema);

        assert(invocation instanceof Invocation);
        this.invocation = invocation;
    }

    clone() {
        return new TableInvocation(
            this.invocation.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Invocation = TableInvocation;
Table.Invocation.prototype.isInvocation = true;
class FilteredTable extends Table {
    constructor(table, filter, schema) {
        super(schema);

        assert(table instanceof Table);
        this.table = table;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    clone() {
        return new FilteredTable(
            this.table.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Filter = FilteredTable;
Table.Filter.prototype.isFilter = true;
class TableProjection extends Table {
    constructor(table, args, schema) {
        super(schema);

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(args));
        this.args = args;
    }

    clone() {
        return new TableProjection(
            this.table.clone(),
            this.args.map((a) => (a)),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Projection = TableProjection;
Table.Projection.prototype.isProjection = true;
class ComputeTable extends Table {
    constructor(table, expression, alias, schema) {
        super(schema);

        assert(table instanceof Table);
        this.table = table;

        assert(expression instanceof ScalarExpression);
        this.expression = expression;

        assert(alias === null || typeof alias === 'string');
        this.alias = alias;
    }

    clone() {
        return new ComputeTable(
            this.table.clone(),
            this.expression.clone(),
            this.alias,
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Compute = ComputeTable;
Table.Compute.prototype.isCompute = true;
class AliasTable extends Table {
    constructor(table, name, schema) {
        super(schema);

        assert(table instanceof Table);
        this.table = table;

        assert(typeof name === 'string');
        this.name = name;
    }

    clone() {
        return new AliasTable(
            this.table.clone(),
            this.name,
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Alias = AliasTable;
Table.Alias.prototype.isAlias = true;
class AggregationTable extends Table {
    constructor(table, field, operator, alias, schema) {
        super(schema);

        assert(table instanceof Table);
        this.table = table;

        assert(typeof field === 'string');
        this.field = field;

        assert(typeof operator === 'string');
        this.operator = operator;

        assert(alias === null || typeof alias === 'string');
        this.alias = alias;
    }

    clone() {
        return new AggregationTable(
            this.table.clone(),
            this.field,
            this.operator,
            this.alias,
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Aggregation = AggregationTable;
Table.Aggregation.prototype.isAggregation = true;
class SortedTable extends Table {
    constructor(table, field, direction, schema) {
        super(schema);

        assert(table instanceof Table);
        this.table = table;

        assert(typeof field === 'string');
        this.field = field;

        assert(direction === 'asc' || direction === 'desc');
        this.direction = direction;
    }

    clone() {
        return new SortedTable(
            this.table.clone(),
            this.field,
            this.direction,
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Sort = SortedTable;
Table.Sort.prototype.isSort = true;
class IndexTable extends Table {
    constructor(table, indices, schema) {
        super(schema);

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(indices));
        this.indices = indices;
    }

    clone() {
        return new IndexTable(
            this.table.clone(),
            this.indices.map((i) => i.clone()),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Index = IndexTable;
Table.Index.prototype.isIndex = true;
class SlicedTable extends Table {
    constructor(table, base, limit, schema) {
        super(schema);

        assert(table instanceof Table);
        this.table = table;

        assert(base instanceof Value);
        this.base = base;

        assert(limit instanceof Value);
        this.limit = limit;
    }

    clone() {
        return new SlicedTable(
            this.table.clone(),
            this.base.clone(),
            this.limit.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Slice = SlicedTable;
Table.Slice.prototype.isSlice = true;
class TableJoin extends Table {
    constructor(lhs, rhs, in_params, schema) {
        super(schema);

        assert(lhs instanceof Table);
        this.lhs = lhs;

        assert(rhs instanceof Table);
        this.rhs = rhs;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new TableJoin(
            this.lhs.clone(),
            this.rhs.clone(),
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Join = TableJoin;
Table.Join.prototype.isJoin = true;
class Window extends Table {
    constructor(base, delta, stream, schema) {
        super(schema);

        assert(base instanceof Value); // : Number
        this.base = base;

        assert(delta instanceof Value); // : Number
        this.delta = delta;

        assert(stream instanceof Stream);
        this.stream = stream;
    }

    clone() {
        return new Window(
            this.base.clone(),
            this.delta.clone(),
            this.stream.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Window = Window;
Table.Window.prototype.isWindow = true;
class TimeSeries extends Table {
    constructor(base, delta, stream, schema) {
        super(schema);

        assert(base instanceof Value); // : Date
        this.base = base;

        assert(delta instanceof Value); // : Measure(ms)
        this.delta = delta;

        assert(stream instanceof Stream);
        this.stream = stream;
    }

    clone() {
        return new TimeSeries(
            this.base.clone(),
            this.delta.clone(),
            this.stream.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.TimeSeries = TimeSeries;
Table.TimeSeries.prototype.isTimeSeries = true;
class Sequence extends Table {
    constructor(base, delta, table, schema) {
        super(schema);

        assert(base instanceof Value); // : Number
        this.base = base;

        assert(delta instanceof Value); // : Number
        this.delta = delta;

        assert(table instanceof Table);
        this.table = table;
    }

    clone() {
        return new Sequence(
            this.base.clone(),
            this.delta.clone(),
            this.table.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Sequence = Sequence;
Table.Sequence.prototype.isSequence = true;
class History extends Table {
    constructor(base, delta, table, schema) {
        super(schema);

        assert(base instanceof Value); // : Date
        this.base = base;

        assert(delta instanceof Value); // : Measure(ms)
        this.delta = delta;

        assert(table instanceof Table);
        this.table = table;
    }

    clone() {
        return new History(
            this.base.clone(),
            this.delta.clone(),
            this.table.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.History = History;
Table.History.prototype.isHistory = true;
module.exports.Table = Table;


/**
 * The base class of all ThingTalk stream expressions.
 *
 * @alias Ast.Stream
 * @extends Ast.Base
 * @abstract
 * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
 */
class Stream extends Base {
    constructor(schema) {
        super();

        assert(schema === null || schema instanceof ExpressionSignature);
        this.schema = schema;
    }
}
Stream.prototype.isStream = true;
class VarRefStream extends Stream {
    constructor(name, in_params, schema) {
        super(schema);

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new VarRefStream(
            this.name,
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.VarRef = VarRefStream;
Stream.VarRef.prototype.isVarRef = true;
class Timer extends Stream {
    constructor(base, interval, frequency, schema) {
        super(schema);

        assert(base instanceof Value);
        this.base = base;

        assert(interval instanceof Value);
        this.interval = interval;

        assert(frequency === null || frequency instanceof Value);
        this.frequency = frequency;
    }

    clone() {
        return new Timer(
            this.base.clone(),
            this.interval.clone(),
            this.frequency ? this.frequency.clone() : null,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Timer = Timer;
Stream.Timer.prototype.isTimer = true;
class AtTimer extends Stream {
    constructor(time, expiration_date, schema) {
        super(schema);

        assert(Array.isArray(time));
        this.time = time;

        assert(expiration_date === null || expiration_date instanceof Value);
        this.expiration_date = expiration_date;
    }

    clone() {
        return new AtTimer(
            this.time.map((t) => t.clone()),
            this.expiration_date ? this.expiration_date.clone() : null,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.AtTimer = AtTimer;
Stream.AtTimer.prototype.isAtTimer = true;
class Monitor extends Stream {
    constructor(table, args, schema) {
        super(schema);

        assert(table instanceof Table);
        this.table = table;

        assert(args === null || Array.isArray(args));
        this.args = args;
    }

    clone() {
        return new Monitor(
            this.table.clone(),
            this.args ? this.args.map((a) => a) : null,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Monitor = Monitor;
Stream.Monitor.prototype.isMonitor = true;
class EdgeNew extends Stream {
    constructor(stream, schema) {
        super(schema);

        assert(stream instanceof Stream);
        this.stream = stream;
    }

    clone() {
        return new EdgeNew(
            this.stream.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.EdgeNew = EdgeNew;
Stream.EdgeNew.prototype.isEdgeNew = true;
class EdgeFilter extends Stream {
    constructor(stream, filter, schema) {
        super(schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    clone() {
        return new EdgeFilter(
            this.stream.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.EdgeFilter = EdgeFilter;
Stream.EdgeFilter.prototype.isEdgeFilter = true;
class FilteredStream extends Stream {
    constructor(stream, filter, schema) {
        super(schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    clone() {
        return new FilteredStream(
            this.stream.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Filter = FilteredStream;
Stream.Filter.prototype.isFilter = true;
class StreamProjection extends Stream {
    constructor(stream, args, schema) {
        super(schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(Array.isArray(args));
        this.args = args;
    }

    clone() {
        return new StreamProjection(
            this.stream.clone(),
            this.args.map((a) => a),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Projection = StreamProjection;
Stream.Projection.prototype.isProjection = true;
class ComputeStream extends Stream {
    constructor(stream, expression, alias, schema) {
        super(schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(expression instanceof ScalarExpression);
        this.expression = expression;

        assert(alias === null || typeof alias === 'string');
        this.alias = alias;
    }

    clone() {
        return new ComputeStream(
            this.stream.clone(),
            this.expression.clone(),
            this.alias,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Compute = ComputeStream;
Stream.Compute.prototype.isCompute = true;
class AliasStream extends Stream {
    constructor(stream, name, schema) {
        super(schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(typeof name === 'string');
        this.name = name;
    }

    clone() {
        return new AliasStream(
            this.stream.clone(),
            this.name,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Alias = AliasStream;
Stream.Alias.prototype.isAlias = true;
class StreamJoin extends Stream {
    constructor(stream, table, in_params, schema) {
        super(schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new StreamJoin(
            this.stream.clone(),
            this.table.clone(),
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Join = StreamJoin;
Stream.Join.prototype.isJoin = true;
module.exports.Stream = Stream;


/**
 * Base class for all expressions that invoke an action.
 *
 * @alias Ast.Action
 * @abstract
 * @param {Ast.ExpressionSignature|null} schema - type signature of this action
 * @property {boolean} isAction - true
 * @property {boolean} isVarRef - true if this is an instance of {@link Ast.Action.VarRef}
 * @property {boolean} isInvocation - true if this is an instance of {@link Ast.Action.Invocation}
 */
class Action extends Base {
    constructor(schema) {
        super();

        assert(schema === null || schema instanceof ExpressionSignature);
        this.schema = schema;
    }
}
Action.prototype.isAction = true;
/**
 * An invocation of a locally defined action (i.e. one defined with
 * a `let` statement).
 *
 * @alias Ast.Action.VarRef
 * @extends Ast.Action
 * @param {string} name - the name of the action to invoke
 * @param {Ast.InputParam[]} in_params - the input parameters to pass
 */
class VarRefAction extends Action {
    constructor(name, in_params, schema) {
        super(schema);

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new VarRefAction(
            this.name,
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }

    toString() {
        return `VarRef(${this.name}, ${this.in_params.toString()}, )`;
    }
}
Action.VarRef = VarRefAction;
Action.VarRef.prototype.isVarRef = true;
/**
 * An invocation of an action in Thingpedia.
 *
 * @alias Ast.Action.Invocation
 * @extends Ast.Action
 * @param {Ast.Invocation} invocation - the function invocation
 * @param {Ast.ExpressionSignature|null} schema - type signature of this action
 */
class ActionInvocation extends Action {
    constructor(invocation, schema) {
        super(schema);

        assert(invocation instanceof Invocation);
        this.invocation = invocation;
    }

    clone() {
        return new ActionInvocation(
            this.invocation.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Action.Invocation = ActionInvocation;
Action.Invocation.prototype.isInvocation = true;
module.exports.Action = Action;


class PermissionFunction extends Base {}
PermissionFunction.prototype.isPermissionFunction = true;
class SpecifiedPermissionFunction extends PermissionFunction {
    constructor(kind, channel, filter, schema) {
        super();

        assert(typeof kind === 'string');
        this.kind = kind;

        assert(typeof channel === 'string');
        this.channel = channel;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;

        assert(schema === null || schema instanceof ExpressionSignature);
        this.schema = schema;
    }

    clone() {
        return new SpecifiedPermissionFunction(
            this.kind,
            this.channel,
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
PermissionFunction.Specified = SpecifiedPermissionFunction;
PermissionFunction.Specified.prototype.isSpecified = true;
class BuiltinPermissionFunction extends PermissionFunction {
    clone() {
        return new BuiltinPermissionFunction();
    }
}
BuiltinPermissionFunction.prototype.isBuiltin = true;
PermissionFunction.Builtin = new BuiltinPermissionFunction();
class ClassStarPermissionFunction extends PermissionFunction {
    constructor(kind) {
        super();

        assert(typeof kind === 'string');
        this.kind = kind;
    }

    clone() {
        return new ClassStarPermissionFunction(this.kind);
    }
}
PermissionFunction.ClassStar = ClassStarPermissionFunction;
PermissionFunction.ClassStar.prototype.isClassStar = true;
class StarPermissionFunction extends PermissionFunction {
    clone() {
        return new StarPermissionFunction();
    }
}
StarPermissionFunction.prototype.isStar = true;
PermissionFunction.Star = new StarPermissionFunction();
module.exports.PermissionFunction = PermissionFunction;


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
        )
    }
}
ImportStmt.Mixin = MixinImportStmt;
ImportStmt.Mixin.prototype.isMixin = true;
module.exports.ImportStmt = ImportStmt;
