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
const { Invocation, Selector, BooleanExpression, ScalarExpression } = require('./expression');
const { Value } = require('./values');
const {
    iterateSlots2InputParams,
    recursiveYieldArraySlots,
    makeScope,
    ArrayIndexSlot,
    FieldSlot,
} = require('./slots');
const { isUnaryStreamToStreamOp,
        isUnaryTableToTableOp,
        isUnaryStreamToTableOp,
        isUnaryTableToStreamOp } = require('../utils');
const Type = require('../type');
const Builtin = require('../builtin/defs');

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

    /**
     * Iterate all slots (scalar value nodes) in this table.
     *
     * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
     * @generator
     * @yields {Ast~OldSlot}
     * @deprecated Use {@link Ast.Table#iterateSlots2} instead.
     */
    *iterateSlots(scope) {
        if (this.isVarRef) {
            for (let in_param of this.in_params)
                yield [this.schema, in_param, this, scope];
            return [this, makeScope(this)];
        } else if (this.isResultRef) {
            return [this, makeScope(this)];
        } else if (this.isInvocation) {
            return yield* this.invocation.iterateSlots(scope);
        } else if (this.isFilter) {
            let [prim, newScope] = yield* this.table.iterateSlots(scope);
            yield* this.filter.iterateSlots(this.table.schema, prim, newScope);
            return [prim, newScope];
        } else if (this.isProjection) {
            let [prim, nestedScope] = yield* this.table.iterateSlots(scope);
            if (nestedScope === null)
                return [prim, null];
            let newScope = {};
            for (let name of this.args)
                newScope[name] = nestedScope[name];
            return [prim, newScope];
        } else if (isUnaryTableToTableOp(this)) {
            return yield* this.table.iterateSlots(scope);
        } else if (isUnaryStreamToTableOp(this)) {
            return yield* this.stream.iterateSlots(scope);
        } else if (this.isJoin) {
            let [, leftScope] = yield* this.lhs.iterateSlots(scope);
            let [, rightScope] = yield* this.rhs.iterateSlots(scope);
            if (leftScope === null || rightScope === null)
                return [null, null];
            let newScope = {};
            Object.assign(newScope, leftScope, rightScope);
            return [null, newScope];
        } else {
            throw new TypeError("Can't handle " + this);
        }
    }

    /**
     * Iterate all slots (scalar value nodes) in this table.
     *
     * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
     * @generator
     * @yields {Ast~AbstractSlot}
     */
    *iterateSlots2(scope) {
        if (this.isVarRef) {
            return yield* iterateSlots2InputParams(this, scope);
        } else if (this.isResultRef) {
            const innerScope = makeScope(this);
            yield* recursiveYieldArraySlots(new FieldSlot(this, innerScope, Type.Number, this, 'result_ref', 'index'));
            return [this, innerScope];
        } else if (this.isInvocation) {
            return yield* this.invocation.iterateSlots2(scope);
        } else if (this.isFilter) {
            let [prim, newScope] = yield* this.table.iterateSlots2(scope);
            yield* this.filter.iterateSlots2(this.table.schema, prim, newScope);
            return [prim, newScope];
        } else if (this.isProjection) {
            let [prim, nestedScope] = yield* this.table.iterateSlots2(scope);
            if (nestedScope === null)
                return [prim, null];
            let newScope = {};
            for (let name of this.args)
                newScope[name] = nestedScope[name];
            return [prim, newScope];
        } else if (this.isIndex) {
            const [prim, innerScope] = yield* this.table.iterateSlots2(scope);
            for (let i = 0; i < this.indices.length; i++)
                yield* recursiveYieldArraySlots(new ArrayIndexSlot(prim, innerScope, Type.Number, this.indices, 'table.index', i));
            return [prim, innerScope];
        } else if (this.isSlice) {
            const [prim, innerScope] = yield* this.table.iterateSlots2(scope);
            yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, Type.Number, this, 'slice', 'base'));
            yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, Type.Number, this, 'slice', 'limit'));
            return [prim, innerScope];
        } else if (isUnaryTableToTableOp(this)) {
            return yield* this.table.iterateSlots2(scope);
        } else if (isUnaryStreamToTableOp(this)) {
            return yield* this.stream.iterateSlots2(scope);
        } else if (this.isJoin) {
            let [, leftScope] = yield* this.lhs.iterateSlots2(scope);
            let [, rightScope] = yield* this.rhs.iterateSlots2(scope);
            if (leftScope === null || rightScope === null)
                return [null, null];
            let newScope = {};
            Object.assign(newScope, leftScope, rightScope);
            return [null, newScope];
        } else {
            throw new TypeError("Can't handle " + this);
        }
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitVarRefTable(this)) {
            for (let in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitResultRefTable(this))
            this.index.visit(visitor);
        visitor.exit(this);
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
class InvocationTable extends Table {
    constructor(location, invocation, schema) {
        super(location, schema);

        assert(invocation instanceof Invocation);
        this.invocation = invocation;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitInvocationTable(this))
            this.invocation.visit(visitor);
        visitor.exit(this);
    }

    clone() {
        return new InvocationTable(
            this.location,
            this.invocation.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Invocation = InvocationTable;
Table.Invocation.prototype.isInvocation = true;
class FilteredTable extends Table {
    constructor(location, table, filter, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitFilteredTable(this)) {
            this.table.visit(visitor);
            this.filter.visit(visitor);
        }
        visitor.exit(this);
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
class ProjectionTable extends Table {
    constructor(location, table, args, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(args));
        this.args = args;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitProjectionTable(this))
            this.table.visit(visitor);
        visitor.exit(this);
    }

    clone() {
        return new ProjectionTable(
            this.location,
            this.table.clone(),
            this.args.map((a) => (a)),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Projection = ProjectionTable;
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitComputeTable(this)) {
            this.table.visit(visitor);
            this.expression.visit(visitor);
        }
        visitor.exit(this);
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitAliasTable(this));
            this.table.visit(visitor);
        visitor.exit(this);
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitAggregationTable(this))
            this.table.visit(visitor);
        visitor.exit(this);
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitSortedTable(this))
            this.table.visit(visitor);
        visitor.exit(this);
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitIndexTable(this)) {
            this.table.visit(visitor);
            for (let index of this.indices)
                index.visit(visitor);
        }
        visitor.exit(this);
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitSlicedTable(this)) {
            this.table.visit(visitor);
            this.base.visit(visitor);
            this.limit.visit(visitor);
        }
        visitor.exit(this);
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
class JoinTable extends Table {
    constructor(location, lhs, rhs, in_params, schema) {
        super(location, schema);

        assert(lhs instanceof Table);
        this.lhs = lhs;

        assert(rhs instanceof Table);
        this.rhs = rhs;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitJoinTable(this)) {
            this.lhs.visit(visitor);
            this.rhs.visit(visitor);
            for (let in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() {
        return new JoinTable(
            this.location,
            this.lhs.clone(),
            this.rhs.clone(),
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Join = JoinTable;
Table.Join.prototype.isJoin = true;
class WindowTable extends Table {
    constructor(location, base, delta, stream, schema) {
        super(location, schema);

        assert(base instanceof Value); // : Number
        this.base = base;

        assert(delta instanceof Value); // : Number
        this.delta = delta;

        assert(stream instanceof Stream);
        this.stream = stream;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitWindowTable(this)) {
            this.stream.visit(visitor);
            this.base.visit(visitor);
            this.delta.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() {
        return new WindowTable(
            this.location,
            this.base.clone(),
            this.delta.clone(),
            this.stream.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Window = WindowTable;
Table.Window.prototype.isWindow = true;
class TimeSeriesTable extends Table {
    constructor(location, base, delta, stream, schema) {
        super(location, schema);

        assert(base instanceof Value); // : Date
        this.base = base;

        assert(delta instanceof Value); // : Measure(ms)
        this.delta = delta;

        assert(stream instanceof Stream);
        this.stream = stream;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitTimeSeriesTable(this)) {
            this.stream.visit(visitor);
            this.base.visit(visitor);
            this.delta.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() {
        return new TimeSeriesTable(
            this.location,
            this.base.clone(),
            this.delta.clone(),
            this.stream.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.TimeSeries = TimeSeriesTable;
Table.TimeSeries.prototype.isTimeSeries = true;
class SequenceTable extends Table {
    constructor(location, base, delta, table, schema) {
        super(location, schema);

        assert(base instanceof Value); // : Number
        this.base = base;

        assert(delta instanceof Value); // : Number
        this.delta = delta;

        assert(table instanceof Table);
        this.table = table;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitSequenceTable(this)) {
            this.table.visit(visitor);
            this.base.visit(visitor);
            this.delta.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() {
        return new SequenceTable(
            this.location,
            this.base.clone(),
            this.delta.clone(),
            this.table.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.Sequence = SequenceTable;
Table.Sequence.prototype.isSequence = true;
class HistoryTable extends Table {
    constructor(location, base, delta, table, schema) {
        super(location, schema);

        assert(base instanceof Value); // : Date
        this.base = base;

        assert(delta instanceof Value); // : Measure(ms)
        this.delta = delta;

        assert(table instanceof Table);
        this.table = table;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitHistoryTable(this)) {
            this.table.visit(visitor);
            this.base.visit(visitor);
            this.delta.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() {
        return new HistoryTable(
            this.location,
            this.base.clone(),
            this.delta.clone(),
            this.table.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Table.History = HistoryTable;
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

    /**
     * Iterate all slots (scalar value nodes) in this stream.
     *
     * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
     * @generator
     * @yields {Ast~OldSlot}
     * @deprecated Use {@link Ast.Stream#iterateSlots2} instead.
     */
    *iterateSlots(scope) {
        if (this.isVarRef) {
            for (let in_param of this.in_params)
                yield [this.schema, in_param, this, scope];
            return [this, makeScope(this)];
        } else if (this.isTimer || this.isAtTimer) {
            // no primitive here
            return [null, {}];
        } else if (this.isFilter || this.isEdgeFilter) {
            let [prim, newScope] = yield* this.stream.iterateSlots(scope);
            yield* this.filter.iterateSlots(this.stream.schema, prim, newScope);
            return [prim, newScope];
        } else if (this.isProjection) {
            let [prim, nestedScope] = yield* this.stream.iterateSlots(scope);
            if (nestedScope === null)
                return [prim, null];
            let newScope = {};
            for (let name of this.args)
                newScope[name] = nestedScope[name];
            return [prim, newScope];
        } else if (isUnaryStreamToStreamOp(this)) {
            return yield* this.stream.iterateSlots(scope);
        } else if (isUnaryTableToStreamOp(this)) {
            return yield* this.table.iterateSlots(scope);
        } else if (this.isJoin) {
            let [, leftScope] = yield* this.stream.iterateSlots(scope);
            let [, rightScope] = yield* this.table.iterateSlots(scope);
            if (leftScope === null || rightScope === null)
                return [null, null];
            let newScope = {};
            Object.assign(newScope, leftScope, rightScope);
            return [null, newScope];
        } else {
            throw new TypeError("Can't handle " + this);
        }
    }

    /**
     * Iterate all slots (scalar value nodes) in this stream.
     *
     * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
     * @generator
     * @yields {Ast~AbstractSlot}
     */
    *iterateSlots2(scope) {
        if (this.isVarRef) {
            return yield* iterateSlots2InputParams(this, scope);
        } else if (this.isTimer) {
            // no primitive here
            yield* recursiveYieldArraySlots(new FieldSlot(null, scope, Type.Date, this, 'timer', 'base'));
            yield* recursiveYieldArraySlots(new FieldSlot(null, scope, Type.Measure('ms'), this, 'timer', 'interval'));
            return [null, {}];
        } else if (this.isAtTimer) {
            for (let i = 0; i < this.time.length; i++)
                yield* recursiveYieldArraySlots(new ArrayIndexSlot(null, scope, Type.Time, this.time, 'attimer.time', i));
            if (this.expiration_date !== null)
                yield* recursiveYieldArraySlots(new FieldSlot(null, scope, Type.Date, this, 'attimer', 'expiration_date'));
            return [null, {}];
        } else if (this.isWindow || this.isTimeSeries) {
            const [prim, innerScope] = this.stream.iterateSlots2(scope);
            yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, this.isWindow ? Type.Number : Type.Date, this, 'history', 'base'));
            yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, this.isWindow ? Type.Number : Type.Measure('ms'), this, 'history', 'delta'));
            return [prim, innerScope];
        } else if (this.isHistory || this.isSequence) {
            const [prim, innerScope] = this.table.iterateSlots2(scope);
            yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, this.isSequence ? Type.Number : Type.Date, this, 'history', 'base'));
            yield* recursiveYieldArraySlots(new FieldSlot(prim, innerScope, this.isSequence ? Type.Number : Type.Measure('ms'), this, 'history', 'delta'));
            return [prim, innerScope];
        } else if (this.isFilter || this.isEdgeFilter) {
            let [prim, newScope] = yield* this.stream.iterateSlots2(scope);
            yield* this.filter.iterateSlots2(this.stream.schema, prim, newScope);
            return [prim, newScope];
        } else if (this.isProjection) {
            let [prim, nestedScope] = yield* this.stream.iterateSlots2(scope);
            if (nestedScope === null)
                return [prim, null];
            let newScope = {};
            for (let name of this.args)
                newScope[name] = nestedScope[name];
            return [prim, newScope];
        } else if (isUnaryStreamToStreamOp(this)) {
            return yield* this.stream.iterateSlots2(scope);
        } else if (isUnaryTableToStreamOp(this)) {
            return yield* this.table.iterateSlots2(scope);
        } else if (this.isJoin) {
            let [, leftScope] = yield* this.stream.iterateSlots2(scope);
            let [, rightScope] = yield* this.table.iterateSlots2(scope);
            if (leftScope === null || rightScope === null)
                return [null, null];
            let newScope = {};
            Object.assign(newScope, leftScope, rightScope);
            return [null, newScope];
        } else {
            throw new TypeError("Can't handle " + this);
        }
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitVarRefStream(this)) {
            for (let in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
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
class TimerStream extends Stream {
    constructor(location, base, interval, frequency, schema) {
        super(location, schema);

        assert(base instanceof Value);
        this.base = base;

        assert(interval instanceof Value);
        this.interval = interval;

        assert(frequency === null || frequency instanceof Value);
        this.frequency = frequency;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitTimerStream(this)) {
            this.base.visit(visitor);
            this.interval.visit(visitor);
            if (this.frequency !== null)
                this.frequency.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() {
        return new TimerStream(
            this.location,
            this.base.clone(),
            this.interval.clone(),
            this.frequency ? this.frequency.clone() : null,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Timer = TimerStream;
Stream.Timer.prototype.isTimer = true;
class AtTimerStream extends Stream {
    constructor(location, time, expiration_date, schema) {
        super(location, schema);

        assert(Array.isArray(time));
        this.time = time;

        assert(expiration_date === null || expiration_date instanceof Value);
        this.expiration_date = expiration_date;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitAtTimerStream(this)) {
            for (let time of this.time)
                time.visit(visitor);
            if (this.expiration_date !== null)
                this.expiration_date.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() {
        return new AtTimerStream(
            this.location,
            this.time.map((t) => t.clone()),
            this.expiration_date ? this.expiration_date.clone() : null,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.AtTimer = AtTimerStream;
Stream.AtTimer.prototype.isAtTimer = true;
class MonitorStream extends Stream {
    constructor(location, table, args, schema) {
        super(location, schema);

        assert(table instanceof Table);
        this.table = table;

        assert(args === null || Array.isArray(args));
        this.args = args;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitMonitorStream(this))
            this.table.visit(visitor);
        visitor.exit(this);
    }

    clone() {
        return new MonitorStream(
            this.location,
            this.table.clone(),
            this.args ? this.args.map((a) => a) : null,
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Monitor = MonitorStream;
Stream.Monitor.prototype.isMonitor = true;
class EdgeNewStream extends Stream {
    constructor(location, stream, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitEdgeNewStream(this))
            this.stream.visit(visitor);
        visitor.exit(this);
    }

    clone() {
        return new EdgeNewStream(
            this.location,
            this.stream.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.EdgeNew = EdgeNewStream;
Stream.EdgeNew.prototype.isEdgeNew = true;
class EdgeFilterStream extends Stream {
    constructor(location, stream, filter, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitEdgeFilterStream(this)) {
            this.stream.visit(visitor);
            this.filter.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() {
        return new EdgeFilterStream(
            this.location,
            this.stream.clone(),
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.EdgeFilter = EdgeFilterStream;
Stream.EdgeFilter.prototype.isEdgeFilter = true;
class FilteredStream extends Stream {
    constructor(location, stream, filter, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitFilteredStream(this)) {
            this.stream.visit(visitor);
            this.filter.visit(visitor);
        }
        visitor.exit(this);
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
class ProjectionStream extends Stream {
    constructor(location, stream, args, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(Array.isArray(args));
        this.args = args;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitProjectionStream(this))
            this.stream.visit(visitor);
        visitor.exit(this);
    }

    clone() {
        return new ProjectionStream(
            this.location,
            this.stream.clone(),
            this.args.map((a) => a),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Projection = ProjectionStream;
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitComputeStream(this)) {
            this.stream.visit(visitor);
            this.expression.visit(visitor);
        }
        visitor.exit(this);
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitAliasStream(this))
            this.stream.visit(visitor);
        visitor.exit(this);
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
class JoinStream extends Stream {
    constructor(location, stream, table, in_params, schema) {
        super(location, schema);

        assert(stream instanceof Stream);
        this.stream = stream;

        assert(table instanceof Table);
        this.table = table;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitJoinStream(this)) {
            this.stream.visit(visitor);
            this.table.visit(visitor);
            for (let in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }

    clone() {
        return new JoinStream(
            this.location,
            this.stream.clone(),
            this.table.clone(),
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone() : null
        );
    }
}
Stream.Join = JoinStream;
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

    /**
     * Utility function to create a `notify` or `return` action.
     *
     * @param {string} [what=notify] - what action to create
     * @return {Ast.Action} the action node
     */
    static notifyAction(what = 'notify') {
        return new InvocationAction(null,
            new Invocation(null, Selector.Builtin, what, [], Builtin.Actions[what]),
            Builtin.Actions[what]);
    }

    /**
     * Iterate all slots (scalar value nodes) in this action.
     *
     * @method Ast.Action#iterateSlots
     * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
     * @generator
     * @yields {Ast~OldSlot}
     * @deprecated Use {@link Ast.Action#iterateSlots2} instead.
     */

    /**
     * Iterate all slots (scalar value nodes) in this action.
     *
     * @method Ast.Action#iterateSlots2
     * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
     * @generator
     * @yields {Ast~AbstractSlot}
     */
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitVarRefAction(this)) {
            for (let in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
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

    *iterateSlots(scope) {
        for (let in_param of this.in_params)
            yield [this.schema, in_param, this, scope];
    }

    *iterateSlots2(scope) {
        yield* iterateSlots2InputParams(this, scope);
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
class InvocationAction extends Action {
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitInvocationAction(this))
            this.invocation.visit(visitor);
        visitor.exit(this);
    }

    clone() {
        return new InvocationAction(
            this.location,
            this.invocation.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope) {
        yield* this.invocation.iterateSlots(scope);
    }

    *iterateSlots2(scope) {
        yield* this.invocation.iterateSlots2(scope);
    }
}
Action.Invocation = InvocationAction;
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitSpecifiedPermissionFunction(this))
            this.filter.visit(visitor);
        visitor.exit(this);
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

    visit(visitor) {
        visitor.enter(this);
        visitor.visitBuiltinPermissionFunction(this);
        visitor.exit(this);
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

    visit(visitor) {
        visitor.enter(this);
        visitor.visitClassStarPermissionFunction(this);
        visitor.exit(this);
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

    visit(visitor) {
        visitor.enter(this);
        visitor.visitStarPermissionFunction(this);
        visitor.exit(this);
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
