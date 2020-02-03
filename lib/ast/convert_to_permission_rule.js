// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { BooleanExpression } = require('./expression');
const { PermissionFunction } = require('./primitive');
const { Value } = require('./values');
const {
    isRemoteSend,
    isRemoteReceive
} = require('./remote_utils');
// we cannot unpack here, due to cyclic require()'s
const ProgramAst = require('./program');
const Optimizer = require('../optimize');

function convertPrimitiveToPermission(prim) {
    if (prim === null || isRemoteSend(prim) || isRemoteReceive(prim))
        return PermissionFunction.Builtin;

    let filter = [];
    for (let inParam of prim.in_params) {
        if (inParam.value.isUndefined)
            continue;
        filter.push(new BooleanExpression.Atom(null, inParam.name, '==', inParam.value));
    }
    filter = new BooleanExpression.And(null, filter);
    return new PermissionFunction.Specified(null, prim.selector.kind, prim.channel,
        filter, prim.schema);
}

function convertTableToPermissionFunction(table) {
    if (table.isInvocation)
        return convertPrimitiveToPermission(table.invocation);

    if (table.isFilter) {
        let inner = convertTableToPermissionFunction(table.table);
        if (!inner)
            return inner;
        return new PermissionFunction.Specified(null, inner.kind, inner.channel,
            new BooleanExpression.And(null, [inner.filter, table.filter]), inner.schema);
    }

    if (table.isProjection || table.isAlias || table.isCompute)
        return convertTableToPermissionFunction(table.table);

    if (table.isJoin) {
        console.log('NOT IMPLEMENTED: cannot support more than one permission primitive');
        return null;
    }

    console.log(`NOT IMPLEMENTED: converting table ${table} to permission function`);
    return null;
}

function convertStreamToPermissionFunction(stream) {
    if (stream.isMonitor)
        return convertTableToPermissionFunction(stream.table);
    if (stream.isProjection || stream.isAlias || stream.isCompute)
        return convertStreamToPermissionFunction(stream.stream);

    if (stream.isFilter || stream.isEdgeFilter) {
        let inner = convertStreamToPermissionFunction(stream.stream);
        if (!inner)
            return inner;
        return new PermissionFunction.Specified(null, inner.kind, inner.channel,
            BooleanExpression.And(null, [inner.filter, stream.filter]), inner.schema);
    }

    if (stream.isJoin) {
        console.log('NOT IMPLEMENTED: cannot support more than one permission primitive');
        return null;
    }

    console.log(`NOT IMPLEMENTED: converting stream ${stream} to permission function`);
    return null;
}

function convertActionToPermission(action) {
    if (action.isInvocation)
        return convertPrimitiveToPermission(action.invocation);
    if (action.isNotify)
        return PermissionFunction.Builtin;

    console.log(`NOT IMPLEMENTED: converting action ${action} to permission function`);
    return null;
}

module.exports = function convert(program, principal, contactName) {
    let rule;
    if (program.rules.length > 1) {
        console.log('NOT IMPLEMENTED: cannot support more than one rule');
        return null;
    }
    rule = program.rules[0];

    let query = null;
    if (rule.stream)
        query = convertStreamToPermissionFunction(rule.stream);
    else if (rule.table)
        query = convertTableToPermissionFunction(rule.table);
    else
        query = PermissionFunction.Builtin;
    if (rule.actions.length > 1) {
        console.log('NOT IMPLEMENTED: cannot support more than one action');
        return null;
    }
    const action = convertActionToPermission(rule.actions[0]);
    if (query.isSpecified)
        query.filter = Optimizer.optimizeFilter(query.filter);
    if (action.isSpecified)
        action.filter = Optimizer.optimizeFilter(action.filter);

    return new ProgramAst.PermissionRule(null, new BooleanExpression.Atom(null,
        'source', '==',
        new Value.Entity(principal, 'tt:contact', contactName)
    ), query, action);
};
