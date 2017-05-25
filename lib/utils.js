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
const Builtin = require('./builtin');

const builtins = {
    triggers: Builtin.Triggers,
    actions: Builtin.Actions,
    queries: Builtin.Queries
};

module.exports = {
    normalizeConstant(value) {
        if (value.isMeasure) {
            var baseunit = Internal.UnitsToBaseUnit[value.unit];
            if (baseunit === undefined)
                throw new TypeError("Invalid unit " + value.unit);
            var transformed = Internal.transformToBaseUnit(value.value, value.unit);
            return Ast.Value.Measure(transformed, baseunit);
        } else {
            return value;
        }
    },

    getSchemaForSelector(schemas, type, name, schema) {
        if (type === 'remote') // FIXME accept anything for now
            return Q(null);
        return schemas.getSchemaAndNames(type, schema, name).then((schema) => {
            var inReqParams = {};
            var inOptParams = {};
            var outParams = {};
            var argIndex = {};

            schema.types.forEach((t, i) => {
                var argname = schema.args[i];
                argIndex[argname] = i;
                if (!schema.required)
                    schema.required = [];

                // FIXME until Thingpedia is fixed, actions have all their arguments required
                var argrequired = !!schema.required[i] || schema === 'actions';
                if (argrequired) {
                    inReqParams[argname] = t;
                } else {
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
                out: outParams
            };
        });
    }
};
