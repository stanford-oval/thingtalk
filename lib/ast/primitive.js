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
const { Invocation, BooleanExpression, ScalarExpression } = require('./expression');
const { Value } = require('./values');

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
