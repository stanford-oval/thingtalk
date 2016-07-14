// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const Immutable = require('immutable');

const Ast = require('./ast');
const Type = require('./type');
const Internal = require('./internal');

module.exports = {
    normalizeConstant(value) {
        if (value.isMeasure) {
            var baseunit = Internal.UnitsToBaseUnit[value.unit];
            if (baseunit === undefined)
                throw new TypeError("Invalid unit " + value.unit);
            var transform = Internal.UnitsTransformToBaseUnit[value.unit];
            var type = Type.Measure(baseunit);
            var transformed;
            if (typeof transform == 'function')
                transformed = transform(value.value);
            else
                transformed = value.value * transform;
            return Ast.Value.Measure(transformed, baseunit);
        } else {
            return value;
        }
    },

    getSchemaForSelector(schemas, selector, name, globalScope, modules, inModule, schema) {
        if (selector.isBuiltin) {
            return schemas.getSchema('$builtin', schema, selector.name);
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

                selector = Ast.Selector.ComputeModule(moduleName);
                return Q(module[inModule][name]);
            } else {
                return schemas.getSchema(selector.name, schema, name);
            }
        } else {
            var type = null;

            selector.attributes.forEach((attr) => {
                if (attr.name === 'type') {
                    if (!attr.value.isString)
                        throw new Error("Invalid type for device attribute \"type\"");
                    if (type !== null)
                        throw new Error("Duplicate device attribute type");
                    type = attr.value.value;
                }
                if (attr.value.isVarRef && !(attr.value.name in globalScope))
                    throw new Error("Undeclared variable " + attr.value.name);
            });
            if (type === null)
                throw new Error("Device type missing in selector, cannot infer schema");

            return schemas.getSchema(type, schema, name);
        }
    },

    convertToJS(type, value) {
        if (value === null)
            return null;
        if (type.isArray)
            return value.map((v) => toJS(type.elem, v));
        if (type.isMap) {
            if (value instanceof Immutable.Map) {
                return value.entrySeq().map(function(t) {
                    var k = t[0];
                    var v = t[1];
                    return [toJS(type.key, k), toJS(type.value, v)];
                }).toArray();
            } else {
                return value;
            }
        }
        if (type.isTuple) {
            if (type.schema !== null)
                return value.map((v, i) => toJS(type.schema[i], v));
            else
                return value;
        } else {
            return value;
        }
    }
};
