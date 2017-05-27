// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const Internal = require('./internal');
const Ast = require('./ast');
const Type = require('./type');

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
            if (!schema.required)
                schema.required = [];

            // FIXME until Thingpedia is fixed, actions have all their arguments required
            var argrequired = !!schema.required[i] || schemaType === 'actions';
            if (argrequired) {
                inReqParams[argname] = t;
            } else if (!argname.startsWith('__')) {
                // FIXME until Thingpedia is fixed, optional arguments are both
                // inputs and outputs
                inOptParams[argname] = t;
                outParams[argname] = t;
            }
        });

        return {
            kind_type: schema.kind_type,
            args: schema.args,
            index: argIndex,
            inReq: inReqParams,
            inOpt: inOptParams,
            out: outParams,
            confirmation: schema.confirmation || '',
            confirmation_remote: schema.confirmation_remote || '',
            argcanonicals: schema.argcanonicals || schema.args,
            questions: schema.questions || [],
        };
    },

    getSchemaForSelector(schemaRetriever, type, name, schemaType, getMeta = false) {
        if (type === 'remote') // FIXME accept anything for now
            return Q(null);
        if (getMeta) {
            return schemaRetriever.getMeta(type, schemaType, name).then((meta) => module.exports.splitArgsForSchema(meta, schemaType, true));
        } else {
            return schemaRetriever.getSchemaAndNames(type, schemaType, name).then((schema) => module.exports.splitArgsForSchema(schema, schemaType, false));
        }
    }
};
