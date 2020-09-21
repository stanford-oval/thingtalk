// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

import Type from '../type';
import { Value } from './values';
import { InputParam } from './expression';
import { ImportStmt } from './program';

function getString(value, fallback='') {
    if (!value) return fallback;
    if (value.isString) return value.value;
    if (typeof value === 'string') return value;
    throw new Error(`Invalid type for string value ${value}`);
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
        imports.push(new ImportStmt.Mixin(null, ['loader'], manifest.module_type, []));
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
                    value = new Value.String(value);
                if (typeof value === 'boolean')
                    value = new Value.Boolean(value);
                if (typeof value === 'number')
                    value = new Value.Number(value);
                if (Array.isArray(value))
                    value = new Value.Array(value.map(fromJS));
                return value;
            }
            params.push(new InputParam(null, param, fromJS(value)));
        });
        switch (manifest.auth.type) {
            case 'oauth2':
            case 'custom_oauth':
                imports.push(new ImportStmt.Mixin(null, ['config'], 'org.thingpedia.config.' + manifest.auth.type, params));
                break;
            case 'interactive':
                imports.push(new ImportStmt.Mixin(null, ['config'], 'org.thingpedia.config.interactive', params));
                break;
            case 'discovery':
                imports.push(new ImportStmt.Mixin(null, ['config'], 'org.thingpedia.config.discovery.' + manifest.auth.discoveryType, params));
                break;
            case 'basic':
                if (Object.keys(argmap.value).length > 0)
                    params.push(new InputParam(null, 'extra_params', argmap));
                imports.push(new ImportStmt.Mixin(null, ['config'], 'org.thingpedia.config.basic_auth', params));
                break;
            case 'builtin':
                imports.push(new ImportStmt.Mixin(null, ['config'], 'org.thingpedia.config.builtin', params));
                break;
            case 'none':
                if (Object.keys(manifest.params).length > 0) {
                    if (!(params.some((param) => param.name === 'params')))
                        params.push(new InputParam(null, 'params', argmap));
                    imports.push(new ImportStmt.Mixin(null, ['config'], 'org.thingpedia.config.form', params));
                    break;
                }
            default:
                imports.push(new ImportStmt.Mixin(null, ['config'], 'org.thingpedia.config.none', params));
        }
    }
    return imports;
}

export {
    getString,
    htmlTypeToTT,
    typeToHTML,
    extractImports
};
