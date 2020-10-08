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

import * as Ast from './ast';
import type SchemaRetriever from './schema';

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

export function getSchemaForSelector(schemaRetriever : SchemaRetriever,
                                     type : string,
                                     name : string,
                                     schemaType : 'query' | 'action',
                                     getMeta = false,
                                     classes : { [key : string] : Ast.ClassDef } = {}) : Promise<Ast.FunctionDef> {
    if (type in classes) {
        const where = schemaRetriever._where(schemaType);
        if (!classes[type][where][name])
            throw new TypeError("Schema " + type + " has no " + where + " " + name);
        return Promise.resolve(classes[type][where][name]);
    }
    if (getMeta)
        return schemaRetriever.getMeta(type, schemaType, name);
    else
        return schemaRetriever.getSchemaAndNames(type, schemaType, name);
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
