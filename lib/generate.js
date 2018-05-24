// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { isUnaryStreamToStreamOp,
        isUnaryTableToTableOp,
        isUnaryStreamToTableOp,
        isUnaryTableToStreamOp } = require('./utils');
const { optimizeFilter, optimizeProgram } = require('./optimize');

// Initialize the AST API
const { notifyAction } = require('./ast_api');

function declarationProgram(declaration) {
    return declaration.toProgram();
}

function factorProgram(messaging, program) {
    console.log('factorProgram is deprecated, please remove it');
    return [program, []];
}

function lowerReturn(messaging, program) {
    return program.lowerReturn(messaging);
}

function* iteratePrimitivesTable(table) {
    yield* table.iteratePrimitives();
}

function* iteratePrimitivesStream(stream) {
    yield* stream.iteratePrimitives();
}

function* iteratePrimitivesRule(rule) {
    yield* rule.iteratePrimitives();
}

function* iteratePrimitives(program) {
    yield* program.iteratePrimitives();
}

function* iterateSlotsFilter(schema, expr, prim, scope) {
    yield* expr.iterateSlots(schema, prim, scope);
}

function* iterateSlotsTable(table, scope) {
    yield* table.iterateSlots(scope);
}

function* iterateSlotsStream(stream, scope) {
    yield* stream.iterateSlots(scope);
}

function* iterateSlots(program) {
    yield* program.iterateSlots();
}

function convertProgramToPermissionRule(principal, contactName, program) {
    return program.convertToPermissionRule(principal, contactName);
}

module.exports = {
    notifyAction,
    declarationProgram,

    // iteration/slot-filling API
    iteratePrimitives,
    iteratePrimitivesRule,
    iteratePrimitivesStream,
    iteratePrimitivesTable,
    iterateSlots,
    iterateSlotsTable,
    iterateSlotsStream,
    iterateSlotsFilter,

    // factoring API
    factorProgram,
    lowerReturn,

    // recursive utilities
    isUnaryTableToTableOp,
    isUnaryStreamToTableOp,
    isUnaryStreamToStreamOp,
    isUnaryTableToStreamOp,

    // policy API
    convertProgramToPermissionRule,

    // optimization
    optimizeFilter,
    optimizeProgram
};
