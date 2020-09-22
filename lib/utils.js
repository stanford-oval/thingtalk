// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

export function makeIndex(args) {
    let index = {};
    let i = 0;
    for (let a of args)
        index[a] = i++;
    return index;
}

export function clean(name) {
    if (/^[vwgp]_/.test(name))
        name = name.substr(2);
    return name.replace(/_/g, ' ').replace(/([^A-Z ])([A-Z])/g, '$1 $2').toLowerCase();
}

export function cleanKind(kind) {
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

// this regexp is similar to the one in runtime/formatter.js, but it does not allow '%' as an option
// FIXME: unify
const PARAM_REGEX = /\$(?:\$|([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?})/;

export function* split(pattern, regexp) {
    // a split that preserves capturing parenthesis

    let clone = new RegExp(regexp, 'g');
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

export function getScalarExpressionName(ast) {
    if (ast.isVarRef)
        return ast.name;
    if (ast.isComputation && /^[a-zA-Z0-9]+$/.test(ast.op))
        return ast.op;
    else if (ast.isFilter || ast.isArrayField)
        return getScalarExpressionName(ast.value);
    else
        return 'result';
}

export function splitParams(utterance) {
    return Array.from(split(utterance, PARAM_REGEX));
}

export function getSchemaForSelector(schemaRetriever, type, name, schemaType, getMeta = false, classes = {}) {
    if (type in classes) {
        let where = schemaRetriever._where(schemaType);
        if (!classes[type][where][name])
            throw new TypeError("Schema " + type + " has no " + where + " " + name);
        return Promise.resolve(classes[type][where][name]);
    }
    if (getMeta)
        return schemaRetriever.getMeta(type, schemaType, name);
    else
        return schemaRetriever.getSchemaAndNames(type, schemaType, name);
}

export function isUnaryTableToTableOp(table) {
    return table.isFilter ||
        table.isProjection ||
        table.isCompute ||
        table.isAlias ||
        table.isAggregation ||
        table.isSort ||
        table.isIndex ||
        table.isSlice;
}
export function isUnaryStreamToTableOp(table) {
    return false;
}
export function isUnaryStreamToStreamOp(stream) {
    return stream.isEdgeNew ||
        stream.isEdgeFilter ||
        stream.isFilter ||
        stream.isProjection ||
        stream.isCompute ||
        stream.isAlias;
}
export function isUnaryTableToStreamOp(stream) {
    return stream.isMonitor;
}
