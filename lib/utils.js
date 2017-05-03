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

    getSchemaForSelector(schemas, selector, name, globalScope, modules, inModule, schema) {
        if (selector.isBuiltin) {
            return Q(builtins[schema][name]);
        } else if (selector.isGlobalName) {
            var moduleName = selector.name;
            if (moduleName in globalScope) {
                if (!inModule)
                    throw new TypeError("Compute modules cannot be used in queries (yet)");
                if (!globalScope[moduleName].isModule)
                    throw new TypeError(moduleName + ' does not name a compute module');
                var module = modules[moduleName];
                if (!(name in module[inModule]))
                    throw new TypeError(moduleName + '.' + name + ' does not name a compute invocation');

                return Q(module[inModule][name]);
            } else {
                return schemas.getSchemaAndNames(selector.name, schema, name);
            }
        } else {
            var type = null;

            selector.attributes.forEach((attr) => {
                if (attr.name === 'type') {
                    if (type !== null)
                        throw new Error("Duplicate device attribute type");
                    type = attr.value;
                }
            });
            if (type === null)
                throw new Error("Device type missing in selector, cannot infer schema");
            if (type === '$remote')
                return Q(null);

            return schemas.getSchemaAndNames(type, schema, name).then((schema) => {
                if (schema.kind_type === 'app')
                    throw new Error("Invalid syntax to invoke an app");
                return schema;
            });
        }
    }
};
