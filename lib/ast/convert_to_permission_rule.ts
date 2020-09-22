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
    BooleanExpression
} from './expression';
import {
    Table,
    InvocationTable,
    FilteredTable,
    ProjectionTable,
    AliasTable,
    ComputeTable,
    Stream,
    MonitorStream,
    FilteredStream,
    EdgeFilterStream,
    ProjectionStream,
    AliasStream,
    ComputeStream,
    SpecifiedPermissionFunction,
    Action,
    InvocationAction,
    NotifyAction,
    PermissionFunction
} from './primitive';
import { Value } from './values';
import {
    isRemoteSend,
    isRemoteReceive
} from './remote_utils';
import {
    Rule,
    Command,
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

function convertTableToPermissionFunction(table : Table) : PermissionFunction|null {
    if (table instanceof InvocationTable)
        return convertPrimitiveToPermission(table.invocation);

    if (table instanceof FilteredTable) {
        const inner = convertTableToPermissionFunction(table.table);
        if (!(inner instanceof SpecifiedPermissionFunction))
            return inner;
        return new PermissionFunction.Specified(null, inner.kind, inner.channel,
            new BooleanExpression.And(null, [inner.filter, table.filter]), inner.schema);
    }

    if (table instanceof ProjectionTable ||
        table instanceof AliasTable ||
        table instanceof ComputeTable)
        return convertTableToPermissionFunction(table.table);

    if (table.isJoin) {
        console.log('NOT IMPLEMENTED: cannot support more than one permission primitive');
        return null;
    }

    console.log(`NOT IMPLEMENTED: converting table ${table} to permission function`);
    return null;
}

function convertStreamToPermissionFunction(stream : Stream) : PermissionFunction|null {
    if (stream instanceof MonitorStream)
        return convertTableToPermissionFunction(stream.table);
    if (stream instanceof ProjectionStream ||
        stream instanceof AliasStream ||
        stream instanceof ComputeStream)
        return convertStreamToPermissionFunction(stream.stream);

    if (stream instanceof FilteredStream || stream instanceof EdgeFilterStream) {
        const inner = convertStreamToPermissionFunction(stream.stream);
        if (!(inner instanceof SpecifiedPermissionFunction))
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

function convertActionToPermission(action : Action) : PermissionFunction|null {
    if (action instanceof InvocationAction)
        return convertPrimitiveToPermission(action.invocation);
    if (action instanceof NotifyAction)
        return PermissionFunction.Builtin;

    console.log(`NOT IMPLEMENTED: converting action ${action} to permission function`);
    return null;
}

export default function convertToPermissionRule(program : Program,
                                                principal : string,
                                                contactName : string|null) : PermissionRule|null {
    if (program.rules.length > 1) {
        console.log('NOT IMPLEMENTED: cannot support more than one rule');
        return null;
    }
    const rule = program.rules[0];
    if (!(rule instanceof Rule || rule instanceof Command)) {
        console.log('NOT IMPLEMENTED: declaration or assignment statements');
        return null;
    }

    let query = null;
    if (rule instanceof Rule)
        query = convertStreamToPermissionFunction(rule.stream);
    else if (rule instanceof Command && rule.table)
        query = convertTableToPermissionFunction(rule.table);
    else
        query = PermissionFunction.Builtin;
    if (!query)
        return null;
    if (rule.actions.length > 1) {
        console.log('NOT IMPLEMENTED: cannot support more than one action');
        return null;
    }
    const action = convertActionToPermission(rule.actions[0]);
    if (!action)
        return null;
    if (query instanceof SpecifiedPermissionFunction)
        query.filter = Optimizer.optimizeFilter(query.filter);
    if (action instanceof SpecifiedPermissionFunction)
        action.filter = Optimizer.optimizeFilter(action.filter);

    return new PermissionRule(null, new BooleanExpression.Atom(null,
        'source', '==',
        new Value.Entity(principal, 'tt:contact', contactName)
    ), query, action);
}
