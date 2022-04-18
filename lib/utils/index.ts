// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
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

import * as Ast from '../ast';
import type SchemaRetriever from '../schema';

export function clean(name : string) : string {
    if (/^[vwgp]_/.test(name))
        name = name.substr(2);
    return name.replace(/_/g, ' ').replace(/([^A-Z ])([A-Z])/g, '$1 $2').toLowerCase();
}

export function cleanKind(kind : string) : string {
    // thingengine.phone -> phone
    if (kind.startsWith('org.thingpedia.builtin.thingengine.'))
        kind = kind.substr('org.thingpedia.builtin.thingengine.'.length);
    // org.thingpedia.builtin.omlet -> omlet
    if (kind.startsWith('org.thingpedia.builtin.'))
        kind = kind.substr('org.thingpedia.builtin.'.length);
    // org.thingpedia.weather -> weather
    if (kind.startsWith('org.thingpedia.'))
        kind = kind.substr('org.thingpedia.'.length);
    // io.home-assistant.battery -> battery
    if (kind.startsWith('io.home-assistant.'))
        kind = kind.substr('io.home-assistant.'.length);
    // com.xkcd -> xkcd
    if (kind.startsWith('com.'))
        kind = kind.substr('com.'.length);
    if (kind.startsWith('gov.'))
        kind = kind.substr('gov.'.length);
    if (kind.startsWith('org.'))
        kind = kind.substr('org.'.length);
    if (kind.startsWith('uk.co.'))
        kind = kind.substr('uk.co.'.length);
    kind = kind.replace(/[.-]/g, ' ');
    return clean(kind);
}

export function* split(pattern : string, regexp : string|RegExp) : Generator<string|string[], void> {
    // a split that preserves capturing parenthesis

    const clone = new RegExp(regexp, 'g');
    let match = clone.exec(pattern);

    let i = 0;
    while (match !== null) {
        if (match.index > i)
            yield pattern.substring(i, match.index);
        yield match;
        i = clone.lastIndex;
        match = clone.exec(pattern);
    }
    if (i < pattern.length)
        yield pattern.substring(i, pattern.length);
}

export function getScalarExpressionName(ast : Ast.Value) : string {
    if (ast instanceof Ast.VarRefValue)
        return ast.name;
    if (ast instanceof Ast.ComputationValue && /^[a-zA-Z0-9]+$/.test(ast.op))
        return ast.op;
    else if (ast instanceof Ast.FilterValue || ast instanceof Ast.ArrayFieldValue)
        return getScalarExpressionName(ast.value);
    else
        return 'result';
}

export function getPropertyPathName(sequence : Ast.PropertyPathSequence) : string {
    return sequence.map((elem) => elem.toString()).join('/');
}

export async function getSchemaForSelector(schemaRetriever : SchemaRetriever,
                                           kind : string,
                                           name : string,
                                           schemaType : 'query' | 'action' | 'both',
                                           getMeta = false,
                                           classes : { [key : string] : Ast.ClassDef } = {}) : Promise<Ast.FunctionDef> {
    if (kind in classes) {
        const classDef = classes[kind];
        const where = schemaRetriever._where(schemaType);

        if (where === 'both') {
            if (!(name in classDef.queries) && !(name in classDef.actions))
                throw new TypeError(`Class ${kind} has no function ${name}`);
            return classDef.queries[name] || classDef.actions[name];
        } else {
            if (!(name in classDef[where]))
                throw new TypeError(`Class ${kind} has no ${schemaType} ${name}`);
            return classDef[where][name];
        }
    }
    if (getMeta)
        return schemaRetriever.getMeta(kind, schemaType, name);
    else
        return schemaRetriever.getSchemaAndNames(kind, schemaType, name);
}

interface UnaryTableToTableOp extends Ast.Table {
    table : Ast.Table;
}

export function isUnaryTableToTableOp(table : Ast.Table) : table is UnaryTableToTableOp {
    return table.isFilter ||
        table.isProjection ||
        table.isCompute ||
        table.isAlias ||
        table.isAggregation ||
        table.isSort ||
        table.isIndex ||
        table.isSlice;
}

interface UnaryStreamToTableOp extends Ast.Table {
    stream : Ast.Stream;
}

export function isUnaryStreamToTableOp(table : Ast.Table) : table is UnaryStreamToTableOp {
    return false;
}

interface UnaryStreamToStreamOp extends Ast.Stream {
    stream : Ast.Stream;
}

export function isUnaryStreamToStreamOp(stream : Ast.Stream) : stream is UnaryStreamToStreamOp {
    return stream.isEdgeNew ||
        stream.isEdgeFilter ||
        stream.isFilter ||
        stream.isProjection ||
        stream.isCompute ||
        stream.isAlias;
}

interface UnaryTableToStreamOp extends Ast.Stream {
    table : Ast.Table;
}

export function isUnaryTableToStreamOp(stream : Ast.Stream) : stream is UnaryTableToStreamOp {
    return stream.isMonitor;
}

interface UnaryExpressionOp extends Ast.Expression {
    expression : Ast.Expression;
}

export function isUnaryExpressionOp(expression : Ast.Expression) : expression is UnaryExpressionOp {
    return expression instanceof Ast.FilterExpression ||
        expression instanceof Ast.ProjectionExpression ||
        expression instanceof Ast.AliasExpression ||
        expression instanceof Ast.AggregationExpression ||
        expression instanceof Ast.SortExpression ||
        expression instanceof Ast.IndexExpression ||
        expression instanceof Ast.SliceExpression;
}

export function flipOperator(op : string) : string {
    switch (op) {
    case '==':
    case '!=':
        return op;
    case '<':
        return '>';
    case '<=':
        return '>=';
    case '>':
        return '<';
    case '>=':
        return '<=';
    case 'contains':
        return 'in_array';
    case 'contains~':
        return '~in_array';
    case '~contains':
        return 'in_array~';
    case 'in_array':
        return 'contains';
    case 'in_array~':
        return '~contains';
    case '~in_array':
        return 'contains~';
    case '=~':
        return '~=';
    case '~=':
        return '=~';
    case 'group_member':
        return 'has_member';
    case 'has_member':
        return 'group_member';
    case 'starts_with':
        return 'prefix_of';
    case 'prefix_of':
        return 'starts_with';
    case 'ends_with':
        return 'suffix_of';
    case 'suffix_of':
        return 'ends_with';
    default:
        throw new TypeError('invalid operator ' + op);
    }
}
