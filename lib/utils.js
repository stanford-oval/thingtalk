// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const Ast = require('./ast');

module.exports = {
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

        return Ast.FunctionDef(schema.kind_type || 'other',
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
            return Q(classes[type][schemaType][name]);
        }
        if (getMeta)
            return schemaRetriever.getMeta(type, schemaType, name).then((meta) => module.exports.splitArgsForSchema(meta, schemaType, true));
        else
            return schemaRetriever.getSchemaAndNames(type, schemaType, name).then((schema) => module.exports.splitArgsForSchema(schema, schemaType, false));
    }
};
