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
        InvokeSubscribe: {
            invocation: adt.only(Ast.Invocation),
            filter: adt.only(Ast.BooleanExpression)
        },
        Timer: {
            base: adt.only(Ast.Value),
            interval: adt.only(Ast.Value),
        },
        AtTimer: {
            time: adt.only(Ast.Value),
        },
        Filter: {
            stream: adt.only(this),
            filter: adt.only(Ast.BooleanExpression)
        },
        Map: {
            stream: adt.only(this),
            op: adt.only(PointWiseOp)
        },
        EdgeNew: {
            stream: adt.only(this)
        },
        EdgeFilter: {
            stream: adt.only(this),
            filter: adt.only(Ast.BooleanExpression),
        },
        Union: {
            lhs: adt.only(this),
            rhs: adt.only(this)
        },
    };
});

// TableOp : operates on in-memory table
const TableOp = adt.data(function() {
    return {
        InvokeGet: {
            invocation: adt.only(Ast.Invocation),
            extra_in_params: adt.only(Array), // coming from a join
            filter: adt.only(Ast.BooleanExpression)
        },

        Filter: {
            table: adt.only(this),
            filter: adt.only(Ast.BooleanExpression)
        },
        Map: {
            table: adt.only(this),
            op: adt.only(PointWiseOp)
        },

        CrossJoin: {
            lhs: adt.only(this),
            rhs: adt.only(this)
        },
        NestedLoopJoin: {
            lhs: adt.only(this),
            rhs: adt.only(this),
        }
    };
});

StreamOp.type('Join', {
    // when the stream fires, get the whole table and join it
    stream: adt.only(StreamOp),
    table: adt.only(TableOp)
});

// The overall structure of the rule
// this reflects the overall "when => get* => do" structure of ThingTalk
// which is what it optimizes for
const RuleOp = adt.newtype('RuleOp', {
    stream: adt.only(StreamOp, null),
    actions: adt.only(Array)
});

module.exports = {
    PointWiseOp,
    StreamOp,
    TableOp,
    RuleOp
};
