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
const { Invocation, BooleanExpression, ScalarExpression } = require('./expression');
const { Value } = require('./values');

/**
 * AST node corresponding to an input parameter passed to a function.
 *
 * @alias Ast.InputParam
 * @extends Ast~Node
 * @property {boolean} isInputParam - true
 */
class InputParam extends Node {
    /**
     * Construct a new input parameter node.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the input argument name
     * @param {Ast.Value} value - the value being passed
     */
    constructor(location, name, value) {
        super(location);

        assert(typeof name === 'string');
        /**
         * The input argument name.
         * @type {string}
         * @readonly
         */
        this.name = name;

        assert(value instanceof Value);
        /**
         * The value being passed.
         * @type {Ast.Value}
         * @readonly
         */
        this.value = value;
    }

    clone() {
        return new InputParam(this.location, this.name, this.value.clone());
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
 * @extends Ast~Node
 * @abstract
 */
class Table extends Node {
    /**
     * Construct a new table node.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.ExpressionSignature|null} schema - type signature of the invoked function
     */
    constructor(location, schema) {
        super(location);

        assert(schema === null || schema instanceof ExpressionSignature);
        this.schema = schema;
    }
}
Table.prototype.isTable = true;

class VarRefTable extends Table {
    constructor(location, name, in_params, schema) {
        super(location, schema);

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new VarRefTable(
            this.location,
            this.name,
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.VarRef = VarRefTable;
Table.VarRef.prototype.isVarRef = true;
class ResultRefTable extends Table {
    constructor(location, kind, channel, index, schema) {
        super(location, schema);

        assert(typeof kind === 'string');
        this.kind = kind;

        assert(typeof channel === 'string');
        this.channel = channel;

        assert(index instanceof Value);
        this.index = index;
    }

    clone() {
        return new ResultRefTable(
            this.location,
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
    constructor(location, invocation, schema) {
        super(location, schema);

        assert(invocation instanceof Invocation);
        this.invocation = invocation;
    }

    clone() {
        return new TableInvocation(
            this.location,
            this.invocation.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Invocation = TableInvocation;
Table.Invocation.prototype.isInvocation = true;
class FilteredTable extends Table {
    constructor(location, table, filter, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    clone() {
        return new FilteredTable(
            this.location,
            this.table.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Filter = FilteredTable;
Table.Filter.prototype.isFilter = true;
class TableProjection extends Table {
    constructor(location, table, args, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(args));
        this.args = args;
    }

    clone() {
        return new TableProjection(
            this.location,
            this.table.clone(),
            this.args.map((a) => (a)),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Projection = TableProjection;
Table.Projection.prototype.isProjection = true;
class ComputeTable extends Table {
    constructor(location, table, expression, alias, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(expression instanceof ScalarExpression);
        this.expression = expression;

        assert(alias === null || typeof alias === 'string');
        this.alias = alias;
    }

    clone() {
        return new ComputeTable(
            this.location,
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
    constructor(location, table, name, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(typeof name === 'string');
        this.name = name;
    }

    clone() {
        return new AliasTable(
            this.location,
            this.table.clone(),
            this.name,
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Alias = AliasTable;
Table.Alias.prototype.isAlias = true;
class AggregationTable extends Table {
    constructor(location, table, field, operator, alias, schema) {
        super(location, schema);

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
            this.location,
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
    constructor(location, table, field, direction, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(typeof field === 'string');
        this.field = field;

        assert(direction === 'asc' || direction === 'desc');
        this.direction = direction;
    }

    clone() {
        return new SortedTable(
            this.location,
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
    constructor(location, table, indices, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(indices));
        this.indices = indices;
    }

    clone() {
        return new IndexTable(
            this.location,
            this.table.clone(),
            this.indices.map((i) => i.clone()),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Index = IndexTable;
Table.Index.prototype.isIndex = true;
class SlicedTable extends Table {
    constructor(location, table, base, limit, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(base instanceof Value);
        this.base = base;

        assert(limit instanceof Value);
        this.limit = limit;
    }

    clone() {
        return new SlicedTable(
            this.location,
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
    constructor(location, lhs, rhs, in_params, schema) {
        super(location, schema);

        assert(lhs instanceof Table);
        this.lhs = lhs;

        assert(rhs instanceof Table);
        this.rhs = rhs;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new TableJoin(
            this.location,
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
    constructor(location, base, delta, stream, schema) {
        super(location, schema);

        assert(base instanceof Value); // : Number
        this.base = base;

        assert(delta instanceof Value); // : Number
        this.delta = delta;

        assert(stream instanceof Stream);
        this.stream = stream;
    }

    clone() {
        return new Window(
            this.location,
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
    constructor(location, base, delta, stream, schema) {
        super(location, schema);

        assert(base instanceof Value); // : Date
        this.base = base;

        assert(delta instanceof Value); // : Measure(ms)
        this.delta = delta;

        assert(stream instanceof Stream);
        this.stream = stream;
    }

    clone() {
        return new TimeSeries(
            this.location,
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
    constructor(location, base, delta, table, schema) {
        super(location, schema);

        assert(base instanceof Value); // : Number
        this.base = base;

        assert(delta instanceof Value); // : Number
        this.delta = delta;

        assert(table instanceof Table);
        this.table = table;
    }

    clone() {
        return new Sequence(
            this.location,
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
    constructor(location, base, delta, table, schema) {
        super(location, schema);

        assert(base instanceof Value); // : Date
        this.base = base;

        assert(delta instanceof Value); // : Measure(ms)
        this.delta = delta;

        assert(table instanceof Table);
        this.table = table;
    }

    clone() {
        return new History(
            this.location,
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
 * @extends Ast~Node
 * @abstract
 */
class Stream extends Node {
    /**
     * Construct a new stream node.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.ExpressionSignature|null} schema - type signature of the stream expression
     */
    constructor(location, schema) {
        super(location);

        assert(schema === null || schema instanceof ExpressionSignature);
        this.schema = schema;
    }
}
Stream.prototype.isStream = true;
class VarRefStream extends Stream {
    constructor(location, name, in_params, schema) {
        super(location, schema);

        assert(typeof name === 'string');
        this.name = name;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new VarRefStream(
            this.location,
            this.name,
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.VarRef = VarRefStream;
Stream.VarRef.prototype.isVarRef = true;
class Timer extends Stream {
    constructor(location, base, interval, frequency, schema) {
        super(location, schema);

        assert(base instanceof Value);
        this.base = base;

        assert(interval instanceof Value);
        this.interval = interval;

        assert(frequency === null || frequency instanceof Value);
        this.frequency = frequency;
    }

    clone() {
        return new Timer(
            this.location,
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
    constructor(location, time, expiration_date, schema) {
        super(location, schema);

        assert(Array.isArray(time));
        this.time = time;

        assert(expiration_date === null || expiration_date instanceof Value);
        this.expiration_date = expiration_date;
    }

    clone() {
        return new AtTimer(
            this.location,
            this.time.map((t) => t.clone()),
            this.expiration_date ? this.expiration_date.clone() : null,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.AtTimer = AtTimer;
Stream.AtTimer.prototype.isAtTimer = true;
class Monitor extends Stream {
    constructor(location, table, args, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(args === null || Array.isArray(args));
        this.args = args;
    }

    clone() {
        return new Monitor(
            this.location,
            this.table.clone(),
            this.args ? this.args.map((a) => a) : null,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Monitor = Monitor;
Stream.Monitor.prototype.isMonitor = true;
class EdgeNew extends Stream {
    constructor(location, stream, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;
    }

    clone() {
        return new EdgeNew(
            this.location,
            this.stream.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.EdgeNew = EdgeNew;
Stream.EdgeNew.prototype.isEdgeNew = true;
class EdgeFilter extends Stream {
    constructor(location, stream, filter, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    clone() {
        return new EdgeFilter(
            this.location,
            this.stream.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.EdgeFilter = EdgeFilter;
Stream.EdgeFilter.prototype.isEdgeFilter = true;
class FilteredStream extends Stream {
    constructor(location, stream, filter, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    clone() {
        return new FilteredStream(
            this.location,
            this.stream.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Filter = FilteredStream;
Stream.Filter.prototype.isFilter = true;
class StreamProjection extends Stream {
    constructor(location, stream, args, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(Array.isArray(args));
        this.args = args;
    }

    clone() {
        return new StreamProjection(
            this.location,
            this.stream.clone(),
            this.args.map((a) => a),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Projection = StreamProjection;
Stream.Projection.prototype.isProjection = true;
class ComputeStream extends Stream {
    constructor(location, stream, expression, alias, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(expression instanceof ScalarExpression);
        this.expression = expression;

        assert(alias === null || typeof alias === 'string');
        this.alias = alias;
    }

    clone() {
        return new ComputeStream(
            this.location,
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
    constructor(location, stream, name, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(typeof name === 'string');
        this.name = name;
    }

    clone() {
        return new AliasStream(
            this.location,
            this.stream.clone(),
            this.name,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Alias = AliasStream;
Stream.Alias.prototype.isAlias = true;
class StreamJoin extends Stream {
    constructor(location, stream, table, in_params, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    clone() {
        return new StreamJoin(
            this.location,
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
 * @extends Ast~Node
 * @abstract
 * @property {boolean} isAction - true
 * @property {boolean} isVarRef - true if this is an instance of {@link Ast.Action.VarRef}
 * @property {boolean} isInvocation - true if this is an instance of {@link Ast.Action.Invocation}
 */
class Action extends Node {
    /**
     * Construct a new action expression node.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.ExpressionSignature|null} schema - type signature of this action
     */
    constructor(location, schema) {
        super(location);

        assert(schema === null || schema instanceof ExpressionSignature);
        /**
         * Type signature of this action.
         *
         * Note that this _not_ the type signature of the invoked function,
         * because all input arguments that have a value are removed from the signature.
         * This property is guaranteed not `null` after type-checking.
         * @type {Ast.ExpressionSignature|null}
         */
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
 */
class VarRefAction extends Action {
    /**
     * Construct a new var ref action.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the name of the action to invoke
     * @param {Ast.InputParam[]} in_params - the input parameters to pass
     * @param {Ast.ExpressionSignature|null} schema - type signature of this action
     */
    constructor(location, name, in_params, schema) {
        super(location, schema);

        assert(typeof name === 'string');
        /**
         * The name of the action to invoke.
         * @type {string}
         * @readonly
         */
        this.name = name;

        assert(Array.isArray(in_params));
        /**
         * The input parameters to pass.
         * @type {Ast.InputParam[]}
         * @readonly
         */
        this.in_params = in_params;
    }

    clone() {
        return new VarRefAction(
            this.location,
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
 */
class ActionInvocation extends Action {
    /**
     * Construct a new var ref action.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Invocation} invocation - the function invocation
     * @param {Ast.ExpressionSignature|null} schema - type signature of this action
     */
    constructor(location, invocation, schema) {
        super(location, schema);

        assert(invocation instanceof Invocation);
        /**
         * The actual invocation expression.
         * @type {Ast.Invocation}
         * @readonly
         */
        this.invocation = invocation;
    }

    clone() {
        return new ActionInvocation(
            this.location,
            this.invocation.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Action.Invocation = ActionInvocation;
Action.Invocation.prototype.isInvocation = true;
module.exports.Action = Action;

/**
 * The base class of all function clauses in a ThingTalk
 * permission rule.
 *
 * @alias Ast.PermissionFunction
 * @extends Ast~Node
 * @abstract
 */
class PermissionFunction extends Node {}
PermissionFunction.prototype.isPermissionFunction = true;

/**
 * A permission function that applies only to a specific
 * Thingpedia function.
 *
 * @alias Ast.PermissionFunction.Specified
 * @extends Ast.PermissionFunction
 */
class SpecifiedPermissionFunction extends PermissionFunction {
    /**
     * Construct a new specified permission function.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} kind - the class that the function belongs to
     * @param {string} channel - the name of the function
     * @param {Ast.BooleanExpression} filter - a predicate on the input and output
     *        parameters of the function restricting when the permission applies
     * @param {Ast.ExpressionSignature|null} schema - type signature of the underlying
     *        Thingpedia function
     */
    constructor(location, kind, channel, filter, schema) {
        super(location);

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
            this.location,
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
    constructor() {
        super(null);
    }

    clone() {
        return new BuiltinPermissionFunction();
    }
}
BuiltinPermissionFunction.prototype.isBuiltin = true;

/**
 * A permission function that applies only to the builtins `now` and
 * `notify`.
 *
 * This is a singleton, not a class.
 * @alias Ast.PermissionFunction.Builtin
 * @type {Ast.PermissionFunction}
 * @readonly
 */
PermissionFunction.Builtin = new BuiltinPermissionFunction();

/**
 * A permission function that applies to all functions of a class,
 * unconditionally.
 *
 * @alias Ast.PermissionFunction.ClassStar
 * @extends Ast.PermissionFunction
 */
class ClassStarPermissionFunction extends PermissionFunction {
    /**
     * Construct a new class start permission function.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} kind - the class to apply the permission to
     */
    constructor(location, kind) {
        super(location);

        assert(typeof kind === 'string');
        this.kind = kind;
    }

    clone() {
        return new ClassStarPermissionFunction(this.location, this.kind);
    }
}
PermissionFunction.ClassStar = ClassStarPermissionFunction;
PermissionFunction.ClassStar.prototype.isClassStar = true;

class StarPermissionFunction extends PermissionFunction {
    constructor() {
        super(null);
    }

    clone() {
        return new StarPermissionFunction();
    }
}
StarPermissionFunction.prototype.isStar = true;

/**
 * The universal permission function, that applies to all functions
 * of all classes, unconditionally.
 *
 * This is a singleton, not a class.
 * @alias Ast.PermissionFunction.Star
 * @type {Ast.PermissionFunction}
 * @readonly
 */
PermissionFunction.Star = new StarPermissionFunction();
module.exports.PermissionFunction = PermissionFunction;
