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

const Q = require('q');

const Ast = require('./ast');

function makeIndex(args) {
    var index = {};
    var i = 0;
    for (var a of args)
        index[a] = i++;
    return index;
}

function clean(name) {
    if (/^[vwg]_/.test(name))
        name = name.substr(2);
    return name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
}

module.exports = {
    makeIndex,
    clean,

    generatorToAsync(fn) {
        return function () {
            var gen = fn.apply(this, arguments);
            return new Promise((resolve, reject) => {
                function step(key, arg) {
                    try {
                        var info = gen[key](arg);
                        var value = info.value;
                    } catch (error) {
                        reject(error);
                        return;
                    }
                    if (info.done)
                        resolve(value);
                    else
                        Promise.resolve(value).then((value) => { step("next", value); }, (err) => { step("throw", err); });
                }
                step("next");
            });
        };
    },

    splitArgsForSchema(schema, schemaType, isMeta) {
        var inReqParams = {};
        var inOptParams = {};
        var outParams = {};
        var argIndex = {};

        var types;
        if (isMeta)
            types = schema.schema;
        else
            types = schema.types;
        types.forEach((t, i) => {
            var argname = schema.args[i];
            argIndex[argname] = i;

            var argrequired = !!schema.required[i];
            var arginput = !!schema.is_input[i];
            if (argrequired)
                inReqParams[argname] = t;
            else if (arginput)
                inOptParams[argname] = t;
            else
                outParams[argname] = t;
        });

        return new Ast.FunctionDef(schema.kind_type || 'other',
                               schema.args,
                               types,
                               argIndex,
                               inReqParams,
                               inOptParams,
                               outParams,
                               schema.is_list,
                               schema.is_monitorable,
                               schema.canonical || '',
                               schema.confirmation || '',
                               schema.confirmation_remote || '',
                               schema.argcanonicals || schema.args,
                               schema.questions || []);
    },

    getSchemaForSelector(schemaRetriever, type, name, schemaType, getMeta = false, classes = {}) {
        if (type in classes) {
            let classdef = classes[type];
            if (classdef.extends === 'remote')
                classdef.extends = 'org.thingpedia.builtin.thingengine.remote';
            if (classdef.extends !== 'org.thingpedia.builtin.thingengine.remote')
                throw new TypeError('Inline class definitions that extend other than @org.thingpedia.builtin.thingengine.remote are not supported');
            let where = schemaRetriever._where(schemaType);
            return Q(classes[type][where][name]);
        }
        if (getMeta)
            return schemaRetriever.getMeta(type, schemaType, name).then((meta) => module.exports.splitArgsForSchema(meta, schemaType, true));
        else
            return schemaRetriever.getSchemaAndNames(type, schemaType, name).then((schema) => module.exports.splitArgsForSchema(schema, schemaType, false));
    },

    ensureSaveSchema(schemas, ast, scope, getMeta = false) {
        return this.getMemorySchema(schemas, 'save', ast.table, null /* principal */, getMeta).then((schema) => {
            if (schema) {
                ast.tableschema = schema;
                return;
            }

            // make up something
            let args = Object.keys(scope).filter((a) => a !== '$has_event');
            let types = args.map((a) => scope[a]);
            let inOpt = {};
            args.forEach((arg, i) => {
                inOpt[arg] = types[i];
            });
            return schemas.createMemorySchema(ast.table, args, types).then(() => {
                ast.tableschema = new Ast.FunctionDef('builtin',
                    args, // args
                    types, // types
                    makeIndex(args), // index
                    {}, // inReq
                    scope, // inOpt
                    {}, // out
                    (getMeta ? clean(ast.table) : ''), // canonical
                    (getMeta ? clean(ast.table) : ''), // confirmation
                    '', // confirmation_remote,
                    (getMeta ? args.map(clean) : []), // argcanonicals,
                    [] // questions
                );
            });
        });
    },

    getMemorySchema(schemaRetriever, table, principal, getMeta = false) {
        return schemaRetriever.getMemorySchema(table, principal, getMeta).then((schema) => {
            if (!schema)
                return null;

            let args = schema.args;
            let types = schema.types;
            let inReq = {};
            let inOpt = {};
            let out = {};
            schema.args.forEach((arg, i) => {
                out[arg] = schema.types[i];
            });
            let index = makeIndex(args);

            return new Ast.FunctionDef('builtin',
                args, // args
                types, // types
                index, // index
                inReq, // inReq
                inOpt, // inOpt
                out, // out
                true, // is_list
                true, // is_monitorable
                '', // canonical
                '', // confirmation
                '', // confirmation_remote,
                [], // argcanonicals,
                [] // questions
            );
        });
    },

    isUnaryTableToTableOp(table) {
        return table.isFilter ||
            table.isProjection ||
            table.isCompute ||
            table.isAlias ||
            table.isAggregation ||
            table.isArgMinMax ||
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
