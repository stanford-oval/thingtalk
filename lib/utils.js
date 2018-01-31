// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const Ast = require('./ast');
const Type = require('./type');

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
                '', // canonical
                '', // confirmation
                '', // confirmation_remote,
                [], // argcanonicals,
                [] // questions
            );
        })
    }
};
