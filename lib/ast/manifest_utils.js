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

const Type = require('../type');
const { Value } = require('./values');
const { InputParam, ImportStmt } = require('./program');

function getString(value, fallback='') {
    if (!value) return fallback;
    if (value.isString) return value.value;
    if (typeof value === 'string') return value;
    throw new Error(`Invalid type for string value ${value}`);
}

function toJS(metadata) {
    if (Array.isArray(metadata))
        return Value.Array(metadata).toJS();
    return Value.Object(metadata).toJS();
}

function htmlTypeToTT(htmlType) {
    switch (htmlType) {
    case 'text':
        return Type.String;
    case 'password':
        return Type.Entity('tt:password');
    case 'number':
        return Type.Number;
    case 'url':
        return Type.Entity('tt:url');
    case 'email':
        return Type.Entity('tt:email_address');
    case 'tel':
        return Type.Entity('tt:phone_number');
    default:
        throw new Error(`Can't handle HTML input type ${htmlType}`);//'
    }
}
function typeToHTML(type) {
    if (type.isString)
        return 'text';
    else if (type.isNumber)
        return 'number';
    else if (type.isEntity && type.type === 'tt:password')
        return 'password';
    else if (type.isEntity && type.type === 'tt:url')
        return 'url';
    else if (type.isEntity && type.type === 'tt:email_address')
        return 'email';
    else if (type.isEntity && type.type === 'tt:phone_number')
        return 'tel';
    else if (type.isEntity)
        return 'text';
    else
        throw new Error(`Can't convert type ${type} to HTML`);//'
}

function extractImports(manifest) {
    let imports = [];
    if (manifest.module_type)
        imports.push(new ImportStmt.Mixin(['loader'], manifest.module_type, []));
    let argmap = {};
    for (let param in manifest.params) {
        const [, htmlType] = manifest.params[param];
        argmap[param] = htmlTypeToTT(htmlType);
    }
    argmap = new Value.ArgMap(argmap);
    if (manifest.auth) {
        let params = [];
        Object.entries(manifest.auth).forEach(([param, value]) => {
            if (param === 'discoveryType' || param === 'type')
                return;
            function fromJS(value) {
                if (typeof value === 'string')
                    value = Value.String(value);
                if (typeof value === 'boolean')
                    value = Value.Boolean(value);
                if (typeof value === 'number')
                    value = Value.Number(value);
                if (Array.isArray(value))
                    value = Value.Array(value.map(fromJS));
                return value;
            }
            params.push(new InputParam(param, fromJS(value)));
        });
        switch (manifest.auth.type) {
            case 'oauth2':
            case 'custom_oauth':
                imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.' + manifest.auth.type, params));
                break;
            case 'interactive':
                imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.interactive', params));
                break;
            case 'discovery':
                imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.discovery.' + manifest.auth.discoveryType, params));
                break;
            case 'basic':
                if (Object.keys(argmap.value).length > 0)
                    params.push(new InputParam('extra_params', argmap));
                imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.basic_auth', params));
                break;
            case 'builtin':
                imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.builtin', params));
                break;
            case 'none':
                if (Object.keys(manifest.params).length > 0) {
                    if (!(params.some((param) => param.name === 'params')))
                        params.push(new InputParam('params', argmap));
                    imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.form', params));
                    break;
                }
            default:
                imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.none', params));
        }
    }
    return imports;
}

module.exports = {
    getString,
    toJS,
    htmlTypeToTT,
    typeToHTML,
    extractImports
};
