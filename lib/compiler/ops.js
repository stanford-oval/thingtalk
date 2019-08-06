// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const adt = require('adt');

const Ast = require('../ast');

const ReduceOp = require('./reduceop');

// Low-level ThingTalk operations
// Each ThingTalk AST node can be implemented in terms of these low-level ops
// Each of these ops can be compiled into JS code individually

// PointWiseOp : operates on each produced tuple
const PointWiseOp = adt.data({
    Projection: { args: adt.only(Array) },
    Compute: { expression: adt.only(Ast.ScalarExpression) }
});

// StreamOp : operates on streams
const StreamOp = adt.data(function() {
    return {
        Now: null,

        InvokeVarRef: {
            name: adt.only(String),
            in_params: adt.only(Array),
            ast: adt.only(Ast.Stream)
        },
        InvokeSubscribe: {
            invocation: adt.only(Ast.Invocation),
            filter: adt.only(Ast.BooleanExpression),
            ast: adt.only(Ast.Table)
        },
        Timer: {
            base: adt.only(Ast.Value),
            interval: adt.only(Ast.Value),
            ast: adt.only(Ast.Stream)
        },
        AtTimer: {
            time: adt.only(Array),
            expiration_date: adt.only(Ast.Value, null),
            ast: adt.only(Ast.Stream)
        },
        Filter: {
            stream: adt.only(this),
            filter: adt.only(Ast.BooleanExpression),
            ast: adt.only(Ast.Stream, Ast.Table)
        },
        Map: {
            stream: adt.only(this),
            op: adt.only(PointWiseOp),
            ast: adt.only(Ast.Table)
        },
        EdgeNew: {
            stream: adt.only(this),
            ast: adt.only(Ast.Table)
        },
        EdgeFilter: {
            stream: adt.only(this),
            filter: adt.only(Ast.BooleanExpression),
            ast: adt.only(Ast.Table)
        },
        Union: {
            lhs: adt.only(this),
            rhs: adt.only(this),
            ast: adt.only(Ast.Table)
        },
    };
});

// TableOp : operates on in-memory table
const TableOp = adt.data(function() {
    return {
        InvokeVarRef: {
            name: adt.only(String),
            in_params: adt.only(Array),
            ast: adt.only(Ast.Table)
        },

        ReadResult: {
            function: adt.only(String),
            index: adt.only(Ast.Value),
            schema: adt.only(Ast.ExpressionSignature),
            ast: adt.only(Ast.Table)
        },

        InvokeGet: {
            invocation: adt.only(Ast.Invocation),
            extra_in_params: adt.only(Array), // coming from a join
            filter: adt.only(Ast.BooleanExpression),
            device: adt.only(Ast.Selector, null),
            handle_thingtalk: adt.only(Boolean, null),
            ast: adt.only(Ast.Table)
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
    PointWiseOp,
    StreamOp,
    TableOp,
    RuleOp
};
