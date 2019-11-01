// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

function makeIndex(args) {
    var index = {};
    var i = 0;
    for (var a of args)
        index[a] = i++;
    return index;
}

function clean(name) {
    if (/^[vwgp]_/.test(name))
        name = name.substr(2);
    return name.replace(/_/g, ' ').replace(/([^A-Z ])([A-Z])/g, '$1 $2').toLowerCase();
}

function cleanKind(kind) {
    // thingengine.phone -> phone
    if (kind.startsWith('org.thingpedia.builtin.thingengine.'))
        kind = kind.substr('org.thingpedia.builtin.thingengine.'.length);
    // org.thingpedia.builtin.omlet -> omlet
    if (kind.startsWith('org.thingpedia.builtin.'))
        kind = kind.substr('org.thingpedia.builtin.'.length);
    // org.thingpedia.weather -> weather
    if (kind.startsWith('org.thingpedia.'))
        kind = kind.substr('org.thingpedia.'.length);
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

function* split(pattern, regexp) {
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

module.exports = {
    splitParams(utterance) {
        return Array.from(split(utterance, PARAM_REGEX));
    },
    split,
    makeIndex,
    clean,
    cleanKind,

    getSchemaForSelector(schemaRetriever, type, name, schemaType, getMeta = false, classes = {}) {
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
    },

    isUnaryTableToTableOp(table) {
        return table.isFilter ||
            table.isProjection ||
            table.isCompute ||
            table.isAlias ||
            table.isAggregation ||
            table.isSort ||
            table.isIndex ||
            table.isSlice ||
            table.isSequence ||
            table.isHistory;
    },
    isUnaryStreamToTableOp(table) {
        return table.isWindow || table.isTimeSeries;
    },
    isUnaryStreamToStreamOp(stream) {
        return stream.isEdgeNew ||
            stream.isEdgeFilter ||
            stream.isFilter ||
            stream.isProjection ||
            stream.isCompute ||
            stream.isAlias;
    },
    isUnaryTableToStreamOp(stream) {
        return stream.isMonitor;
    }
};
