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
"use strict";

const adt = require('adt');
const assert = require('assert');

const Ast = require('../ast');

const ReduceOp = require('./reduceop');

// Low-level ThingTalk operations
// Each ThingTalk AST node can be implemented in terms of these low-level ops
// Each of these ops can be compiled into JS code individually

// PointWiseOp : operates on each produced tuple
const PointWiseOp = adt.data({
    Projection: { args: adt.only(Set) },
    Compute: {
        expression: adt.only(Ast.Value),
        alias: adt.only(String)
    }
});

class QueryInvocationHints {
    constructor(projection, filter = Ast.BooleanExpression.True, sort, limit) {
        assert(filter instanceof Ast.BooleanExpression);
        assert(sort === undefined || Array.isArray(sort));
        assert(projection instanceof Set);
        assert(limit === undefined || typeof limit === 'number');

        this.filter = filter;
        this.sort = sort;
        this.projection = projection;
        this.limit = limit;
    }

    clone() {
        return new QueryInvocationHints(new Set(this.projection), this.filter, this.sort, this.limit);
    }
}

// StreamOp : operates on streams
const StreamOp = adt.data(function() {
    return {
        Now: null,

        InvokeVarRef: {
            name: adt.only(String),
            in_params: adt.only(Array),
            ast: adt.only(Ast.Stream),
            hints: adt.only(QueryInvocationHints)
        },
        InvokeSubscribe: {
            invocation: adt.only(Ast.Invocation),
            ast: adt.only(Ast.Table),
            hints: adt.only(QueryInvocationHints)
        },
        Timer: {
            base: adt.only(Ast.Value),
            interval: adt.only(Ast.Value),
            frequency: adt.only(Ast.Value, null),
            ast: adt.only(Ast.Table, Ast.Stream)
        },
        AtTimer: {
            time: adt.only(Array),
            expiration_date: adt.only(Ast.Value, null),
            ast: adt.only(Ast.Stream)
        },
        Filter: {
            stream: adt.only(this),
            filter: adt.only(Ast.BooleanExpression),
            ast: adt.only(Ast.Table, Ast.Stream)
        },
        Map: {
            stream: adt.only(this),
            op: adt.only(PointWiseOp),
            ast: adt.only(Ast.Table, Ast.Stream)
        },
        EdgeNew: {
            stream: adt.only(this),
            ast: adt.only(Ast.Table, Ast.Stream)
        },
        EdgeFilter: {
            stream: adt.only(this),
            filter: adt.only(Ast.BooleanExpression),
            ast: adt.only(Ast.Table, Ast.Stream)
        },
        Union: {
            lhs: adt.only(this),
            rhs: adt.only(this),
            ast: adt.only(Ast.Table, Ast.Stream)
        },
    };
});

// TableOp : operates on in-memory table
const TableOp = adt.data(function() {
    return {
        InvokeVarRef: {
            name: adt.only(String),
            in_params: adt.only(Array),
            ast: adt.only(Ast.Table),
            hints: adt.only(QueryInvocationHints)
        },

        InvokeGet: {
            invocation: adt.only(Ast.Invocation),
            extra_in_params: adt.only(Array), // coming from a join
            device: adt.only(Ast.Selector, null),
            handle_thingtalk: adt.only(Boolean, null),
            ast: adt.only(Ast.Table),
            hints: adt.only(QueryInvocationHints)
        },

        Filter: {
            table: adt.only(this),
            filter: adt.only(Ast.BooleanExpression),
            device: adt.only(Ast.Selector, null),
            handle_thingtalk: adt.only(Boolean, null),
            ast: adt.only(Ast.Table)
        },
        Map: {
            table: adt.only(this),
            op: adt.only(PointWiseOp),
            device: adt.only(Ast.Selector, null),
            handle_thingtalk: adt.only(Boolean, null),
            ast: adt.only(Ast.Table)
        },
        Reduce: {
            table: adt.only(this),
            op: adt.only(ReduceOp),
            device: adt.only(Ast.Selector, null),
            handle_thingtalk: adt.only(Boolean, null),
            ast: adt.only(Ast.Table)
        },
        Sort: {
            table: adt.only(this),
            field: adt.only(String),
            direction: adt.only('asc', 'desc'),
            device: adt.only(Ast.Selector, null),
            handle_thingtalk: adt.only(Boolean, null),
            ast: adt.only(Ast.Table)
        },

        CrossJoin: {
            lhs: adt.only(this),
            rhs: adt.only(this),
            device: adt.only(Ast.Selector, null),
            handle_thingtalk: adt.only(Boolean, null),
            ast: adt.only(Ast.Table)
        },
        NestedLoopJoin: {
            lhs: adt.only(this),
            rhs: adt.only(this),
            device: adt.only(Ast.Selector, null),
            handle_thingtalk: adt.only(Boolean, null),
            ast: adt.only(Ast.Table)
        }
    };
});

StreamOp.type('InvokeTable', {
    // when the stream fires, get the whole table (ignore the stream)
    // this is used to implement certain "monitor(table)" where the
    // table needs to be recomputed on subscribe
    stream: adt.only(StreamOp),
    table: adt.only(TableOp),
    ast: adt.only(Ast.Table)
});

StreamOp.type('Join', {
    // when the stream fires, get the whole table and join it
    stream: adt.only(StreamOp),
    table: adt.only(TableOp),
    ast: adt.only(Ast.Stream, Ast.Table)
});

// The overall structure of the rule
// this reflects the overall "when => get* => do" structure of ThingTalk
// which is what it optimizes for
const RuleOp = adt.newtype('RuleOp', {
    stream: adt.only(StreamOp),
    actions: adt.only(Array),
    ast: adt.only(Ast.Statement)
});

module.exports = {
    QueryInvocationHints,
    PointWiseOp,
    StreamOp,
    TableOp,
    RuleOp
};
