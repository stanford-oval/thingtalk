// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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

import {
    DeviceSelector,
    Invocation,
} from './invocation';
import { BooleanExpression } from './boolean_expression';
import {
    Expression,
    InvocationExpression,
    FilterExpression,
    ProjectionExpression,
    AliasExpression,
    MonitorExpression,
    ChainExpression
} from './expression';
import {
    SpecifiedPermissionFunction,
    PermissionFunction
} from './permissions';
import { Value } from './values';
import {
    isRemoteSend,
    isRemoteReceive
} from './remote_utils';
import { Assignment } from './statement';
import {
    Program,
    PermissionRule
} from './program';
import * as Optimizer from '../optimize';

function convertPrimitiveToPermission(prim : Invocation|null) : PermissionFunction|null {
    if (prim === null || isRemoteSend(prim) || isRemoteReceive(prim))
        return PermissionFunction.Builtin;

    const filterargs : BooleanExpression[] = [];
    for (const inParam of prim.in_params) {
        if (inParam.value.isUndefined)
            continue;
        filterargs.push(new BooleanExpression.Atom(null, inParam.name, '==', inParam.value));
    }
    const filter = new BooleanExpression.And(null, filterargs);
    return new PermissionFunction.Specified(null, (prim.selector as DeviceSelector).kind, prim.channel,
        filter, prim.schema);
}

function convertExpressionToPermissionFunction(expression : Expression) : PermissionFunction|null {
    if (expression instanceof InvocationExpression)
        return convertPrimitiveToPermission(expression.invocation);

    if (expression instanceof FilterExpression) {
        const inner = convertExpressionToPermissionFunction(expression.expression);
        if (!(inner instanceof SpecifiedPermissionFunction))
            return inner;
        return new PermissionFunction.Specified(null, inner.kind, inner.channel,
            new BooleanExpression.And(null, [inner.filter, expression.filter]), inner.schema);
    }

    if (expression instanceof ProjectionExpression ||
        expression instanceof AliasExpression ||
        expression instanceof MonitorExpression)
        return convertExpressionToPermissionFunction(expression.expression);

    if (expression instanceof ChainExpression) {
        if (expression.expressions.length === 1)
            return convertExpressionToPermissionFunction(expression.expressions[0]);
        console.log('NOT IMPLEMENTED: cannot support more than one permission primitive');
        return null;
    }

    console.log(`NOT IMPLEMENTED: converting expression ${expression} to permission function`);
    return null;
}

export default function convertToPermissionRule(program : Program,
                                                principal : string,
                                                contactName : string|null) : PermissionRule|null {
    if (program.statements.length > 1) {
        console.log('NOT IMPLEMENTED: cannot support more than one rule');
        return null;
    }
    const stmt = program.statements[0];
    if (stmt instanceof Assignment) {
        console.log('NOT IMPLEMENTED: declaration or assignment statements');
        return null;
    }

    const last = stmt.last;
    const action = last.schema!.functionType === 'action' ? last : null;
    let pfquery : PermissionFunction|null = PermissionFunction.Builtin,
        pfaction : PermissionFunction|null = PermissionFunction.Builtin;
    if (action) {
        const remaining = stmt.expression.expressions.slice(0, stmt.expression.expressions.length-1);
        if (remaining.length > 0)
            pfquery = convertExpressionToPermissionFunction(new ChainExpression(null, remaining, null));
        pfaction = convertExpressionToPermissionFunction(action);
    } else {
        pfquery = convertExpressionToPermissionFunction(stmt.expression);
    }
    if (!pfaction || !pfquery)
        return null;

    if (pfquery instanceof SpecifiedPermissionFunction)
        pfquery.filter = Optimizer.optimizeFilter(pfquery.filter);
    if (pfaction instanceof SpecifiedPermissionFunction)
        pfaction.filter = Optimizer.optimizeFilter(pfaction.filter);

    return new PermissionRule(null, new BooleanExpression.Atom(null,
        'source', '==',
        new Value.Entity(principal, 'tt:contact', contactName)
    ), pfquery, pfaction);
}
