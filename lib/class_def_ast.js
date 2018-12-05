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

const adt = require('adt');
const assert = require('assert');

const Ast = require('./ast');
const Type = require('./type');
const { prettyprintType, prettyprintValue, prettyprintJson, prettyprintClassDef } = require('./prettyprint');
const { clean } = require('./utils');

// Class and function definitions

function makeIndex(args) {
    var index = {};
    var i = 0;
    for (var a of args)
        index[a] = i++;
    return index;
}

function toJS(metadata) {
    if (Array.isArray(metadata))
        return Ast.Value.Array(metadata).toJS();
    return Ast.Value.Object(metadata).toJS();
}

function getString(value, fallback='') {
    if (!value) return fallback;
    if (value.isString) return value.value;
    if (typeof value === 'string') return value;
    throw new Error(`Invalid type for string value ${value}`);
}

const ArgDirection = {
    IN_REQ: 'in req',
    IN_OPT: 'in opt',
    OUT: 'out'
};
module.exports.ArgDirection = ArgDirection;

function legacyAnnotationToValue(value) {
    let v = null;
    if (typeof value === 'string')
        v = Ast.Value.String(value);
    else if (typeof value === 'boolean')
        v = Ast.Value.Boolean(value);
    else if (typeof value === 'number')
        v = Ast.Value.Number(value);
    return v;
}

class ArgumentDef {
    constructor(direction, name, type, metadata, annotations) {
        this.direction = direction;
        this.is_input = direction !== ArgDirection.OUT;
        this.required = direction === ArgDirection.IN_REQ;
        this.name = name;
        this.type = type;
        this.metadata = metadata ? toJS(metadata) : {};
        this.annotations = annotations || {};
    }

    getAnnotation(key) {
        if (this.annotations.hasOwnProperty(key))
            return this.annotations[key].toJS();
        else
            return undefined;
    }

    clone() {
        const metadata = {};
        Object.assign(metadata, this.metadata);
        const annotations = {};
        Object.assign(annotations, this.annotations);

        return new ArgumentDef(this.direction, this.name, this.type,
            metadata, annotations);
    }

    toString() {
        let annotations = '';
        Object.entries(this.metadata).forEach(([name, value]) => {
            if (typeof value === 'object' && Object.keys(value).length > 0 || value && value.length > 0)
                annotations += ` #_[${name}=${prettyprintJson(value)}]`;
        });
        Object.entries(this.annotations).forEach(([name, value]) => {
            if (!(!value || 'value' in value && value.value.length === 0))
                annotations += ` #[${name}=${prettyprintValue(value)}]`;
        });
        return `${this.direction} ${this.name}: ${this.type}${annotations}`;
    }
    prettyprint(prefix = '') {
        return `${prefix}${this}`;
    }

    toManifest() {
        const obj = {
            name: this.name,
            type: prettyprintType(this.type),
            question: this.metadata['prompt'] || '',
            is_input: this.is_input,
            required: this.required
        };
        for (let key in this.annotations)
            obj[key] = this.annotations[key].toJS();
        return obj;
    }

    static fromManifest(manifest) {
        let is_input = manifest.is_input;
        let required = manifest.required;
        let direction = is_input ? (required ? ArgDirection.IN_REQ : ArgDirection.IN_OPT) : ArgDirection.OUT;
        let name = manifest.name;
        let type = Type.fromString(manifest.type);
        let metadata = {};
        if (manifest.question && manifest.question.length > 0) metadata.prompt = manifest.question;
        let annotations = {};
        for (let key in manifest) {
            if (['is_input', 'required', 'type', 'name', 'question'].indexOf(key) >= 0)
                continue;
            const v = legacyAnnotationToValue(manifest[key]);
            if (v)
                annotations[key] = v;
        }

        return new ArgumentDef(direction, name, type, metadata, annotations);
    }
}
module.exports.ArgumentDef = ArgumentDef;

// the signature (functional type) of a TT expression,
// either a table, stream or action
class ExpressionSignature {
    constructor(functionType, args, is_list, is_monitorable) {
        // ignored, for compat only
        this.kind_type = 'other';

        let argnames, types, index, inReq, inOpt, out;
        let argcanonicals, questions, argmap = {};

        assert(functionType === 'stream' || functionType === 'query' || functionType === 'action');
        assert(Array.isArray(args));
        if (functionType === 'query') {
            assert(typeof is_list === 'boolean');
            assert(typeof is_monitorable === 'boolean');
        }

        argnames = args.map((a) => a.name);
        types = args.map((a) => a.type);
        index = makeIndex(argnames);

        inReq = {};
        inOpt = {};
        out = {};
        for (let arg of args) {
            if (arg.is_input && arg.required)
                inReq[arg.name] = arg.type;
            else if (arg.is_input)
                inOpt[arg.name] = arg.type;
            else
                out[arg.name] = arg.type;
        }

        argcanonicals = [];
        questions = [];

        for (let arg of args) {
            argcanonicals.push(arg.metadata.canonical || arg.name);
            questions.push(arg.metadata.question || arg.metadata.prompt || '');
            argmap[arg.name] = arg;
        }


        this._functionType = functionType;

        this.args = argnames;
        this._argmap = argmap;

        this._types = types;
        this._inReq = inReq;
        this._inOpt = inOpt;
        this._out = out;
        this._index = index;

        this.is_list = is_list;
        this.is_monitorable = is_monitorable;

        this.argcanonicals = argcanonicals;
        this.questions = questions;
    }

    hasArgument(arg) {
        return this._argmap[arg] !== undefined;
    }
    getArgument(arg) {
        return this._argmap[arg];
    }
    getArgType(arg) {
        return this._argmap[arg] ? this._argmap[arg].type : undefined;
    }
    getArgMetadata(arg) {
        return this._argmap[arg].metadata;
    }
    isArgInput(arg) {
        return this._argmap[arg].is_input;
    }
    isArgRequired(arg) {
        return this._argmap[arg].required;
    }

    _cloneInternal(args) {
        return new ExpressionSignature(this._functionType, args,
            this.is_list, this.is_monitorable);
    }

    clone() {
        return this._cloneInternal(this.args.map((a) => this._argmap[a]));
    }
    addArguments(toAdd) {
        const args = this.args.map((a) => this._argmap[a]);
        args.push(...toAdd);
        return this._cloneInternal(args);
    }
    removeArgument(arg) {
        const args = this.args.filter((a) => a !== arg).map((a) => this._argmap[a]);
        return this._cloneInternal(args);
    }
    filterArguments(filter) {
        const args = this.args.filter((a, i) => filter(this._argmap[a], i)).map((a) => this._argmap[a]);
        return this._cloneInternal(args);
    }

    // 'stream', 'query' or 'action'
    get functionType() {
        return this._functionType;
    }

    // for compatibility
    get types() {
        return this._types;
    }
    get inReq() {
        return this._inReq;
    }
    get inOpt() {
        return this._inOpt;
    }
    get out() {
        return this._out;
    }
    get index() {
        return this._index;
    }
}
module.exports.ExpressionSignature = ExpressionSignature;

class FunctionDef extends ExpressionSignature {
    constructor(functionType, name, args, is_list, is_monitorable, metadata, annotations, parent = null) {
        super(functionType, args, is_list, is_monitorable);
        metadata = metadata ? toJS(metadata) : {};
        annotations = annotations || {};

        this._name = name;
        this._metadata = metadata;
        this._annotations = annotations;

        this._parent = parent;
    }

    getAnnotation(key) {
        if (this._annotations.hasOwnProperty(key))
            return this._annotations[key].toJS();
        else
            return undefined;
    }

    // the function name
    get name() {
        return this._name;
    }

    // the associated classdef, or null if this functiondef came out of thin air
    get class() {
        return this._parent;
    }

    // NL metadata (canonical, confirmation, confirmation_remote)
    get metadata() {
        return this._metadata;
    }
    // implementation annotations (eg. "url", "poll_interval" or "json_key")
    get annotations() {
        return this._annotations;
    }

    toString(prefix = '') {
        let annotations = '';
        Object.entries(this.metadata).forEach(([name, value]) => {
            if (typeof value === 'object' && Object.keys(value).length > 0 || value && value.length > 0)
                annotations += `\n${prefix}#_[${name}=${prettyprintJson(value)}]`;
        });
        Object.entries(this.annotations).forEach(([name, value]) => {
            if (!(!value || 'value' in value && value.value.length === 0))
                annotations += `\n${prefix}#[${name}=${prettyprintValue(value)}]`;
        });

        const firstline = `${prefix}${this.is_monitorable ? 'monitorable ' : ''}${this.is_list ? 'list ' : ''}${this.functionType} ${this.name}`;

        if (this.args.length === 0)
            return `${firstline}()${annotations};`;
        if (this.args.length === 1)
            return `${firstline}(${this._argmap[this.args[0]]})${annotations};`;

        let buffer = `${firstline}(${this._argmap[this.args[0]]},\n`;
        let padding = ' '.repeat(firstline.length+1);
        for (let i = 1; i < this.args.length-1; i++)
            buffer += `${padding}${this._argmap[this.args[i]]},\n`;
        buffer += `${padding}${this._argmap[this.args[this.args.length-1]]})${annotations};`;
        return buffer;
    }
    prettyprint(prefix = '') {
        return this.toString(prefix);
    }

    // for compatibility
    // do not add new direct properties here - only what was in the old FunctionDef
    // should be exposed
    get canonical() {
        return this.metadata.canonical;
    }
    get confirmation() {
        return this.metadata.confirmation;
    }

    _cloneInternal(args) {
        let metadata = {}, annotations = {};
        Object.assign(metadata, this._metadata);
        Object.assign(annotations, this._annotations);

        return new FunctionDef(this._functionType, this._name, args,
            this.is_list, this.is_monitorable, metadata, annotations, this._parent);
    }

    toManifest() {
        let interval = this._annotations['poll_interval'];
        const obj = {
            args: this.args.map((a) => this._argmap[a].toManifest()),
            canonical: this.canonical,
            is_list: this.is_list,
            poll_interval: this.is_monitorable ? interval.toJS() : -1,
            confirmation: this.confirmation,
            formatted: this.metadata.formatted || [],
        };
        for (let key in this._annotations) {
            if (key === 'poll_interval')
                continue;
            obj[key] = this._annotations[key].toJS();
        }
        return obj;
    }

    static fromManifest(functionType, name, manifest) {
        let args = manifest.args.map((a) => ArgumentDef.fromManifest(a));
        let is_list = functionType === 'query' ? !!manifest.is_list : false;
        let is_monitorable = functionType === 'query' ? manifest.poll_interval !== -1 : false;
        let metadata = {
            canonical: manifest.canonical || '',
            confirmation: manifest.confirmation || '',
            confirmation_remote: manifest.confirmation_remote || '',
        };
        if (functionType === 'query')
            metadata.formatted = toJS(manifest.formatted);

        let annotations = {};
        if (is_monitorable)
            annotations['poll_interval'] = new Ast.Value.Measure(manifest.poll_interval, 'ms');
        for (let key in manifest) {
            if (['args', 'is_list', 'is_monitorable', 'poll_interval',
                 'canonical', 'confirmation', 'confirmation_remote', 'formatted'].indexOf(key) >= 0)
                continue;
            const v = legacyAnnotationToValue(manifest[key]);
            if (v)
                annotations[key] = v;
        }

        if (manifest.url)
            annotations.url = new Ast.Value.String(manifest.url);
        return new FunctionDef(functionType, name, args, is_list, is_monitorable, metadata, annotations);
    }
}
module.exports.FunctionDef = FunctionDef;

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
    else
        throw new Error(`Can't convert type ${type} to HTML`);//'
}

class ClassDef {
    constructor(kind, _extends, queries, actions, imports, metadata, annotations, is_abstract) {
        this.name = kind;
        this.kind = kind;

        assert(_extends === null || Array.isArray(_extends));
        this.extends = _extends;
        this.queries = queries;
        this.actions = actions;
        this._adjustParentPointers();
        this.imports = imports || [];
        this.metadata = metadata ? toJS(metadata) : {};
        this.annotations = annotations || {};
        this.is_abstract = is_abstract || false;
    }

    _adjustParentPointers() {
        for (let name in this.queries)
            this.queries[name]._parent = this;
        for (let name in this.actions)
            this.actions[name]._parent = this;
    }

    getAnnotation(key) {
        if (this.annotations.hasOwnProperty(key))
            return this.annotations[key].toJS();
        else
            return undefined;
    }

    prettyprint(prefix = '') {
        return prettyprintClassDef(this, prefix);
    }

    clone() {
        const queries = {};
        const actions = {};
        for (let name in this.queries)
            queries[name] = this.queries[name].clone();
        for (let name in this.actions)
            actions[name] = this.actions[name].clone();
        const metadata = {};
        Object.assign(metadata, this.metadata);
        const annotations = {};
        Object.assign(annotations, this.annotations);
        const imports = this.imports.map((i) => i.clone());

        const classDef = new ClassDef(this.kind, this.extends, queries, actions, imports, metadata, annotations);
        // adjust parent pointers to point to the clone, not the original class
        classDef._adjustParentPointers();
    }

    get loader() {
        return this.imports.find((i) => i.facets.includes('loader'));
    }

    get config() {
        return this.imports.find((i) => i.facets.includes('config'));
    }

    _params() {
        let params = {};
        const config = this.config;
        if (!config)
            return params;
        switch (config.module) {
        case 'org.thingpedia.config.form':
        case 'org.thingpedia.config.basic_auth': {
            let argMap = config.in_params[0].value;
            Object.entries(argMap.value).forEach(([name, type]) => {
                params[name] = [clean(name), typeToHTML(type)];
            });
        }
        }
        return params;
    }

    _auth() {
        let auth = {};
        let extraKinds = [];

        const config = this.config;
        config.in_params.forEach((param) => {
            if (param.value.isArgMap)
                return;
            switch (param.name) {
            case 'device_class':
                extraKinds.push('bluetooth-class-' + param.value.toJS());
                break;
            case 'uuids':
                for (let uuid of param.value.toJS())
                    extraKinds.push('bluetooth-uuid-' + uuid.toLowerCase());
                break;
            case 'search_target':
                for (let st of param.value.toJS())
                    extraKinds.push('upnp-' + st.toLowerCase().replace(/^urn:/, '').replace(/:/g, '-'));
                break;

            default:
                auth[param.name] = param.value.toJS();
            }
        });
        switch (config.module) {
        case 'org.thingpedia.config.oauth2':
            auth.type = 'oauth2';
            break;
        case 'org.thingpedia.config.custom_oauth':
            auth.type = 'custom_oauth';
            break;
        case 'org.thingpedia.config.basic_auth':
            auth.type = 'basic';
            break;
        case 'org.thingpedia.config.discovery.bluetooth':
            auth.type = 'discovery';
            auth.discoveryType = 'bluetooth';
            break;
        case 'org.thingpedia.config.discovery.upnp':
            auth.type = 'discovery';
            auth.discoveryType = 'upnp';
            break;
        case 'org.thingpedia.config.interactive':
            auth.type = 'interactive';
            break;
        case 'org.thingpedia.config.builtin':
            auth.type = 'builtin';
            break;
        default:
            auth.type = 'none';
        }
        return [auth, extraKinds];
    }

    _getCategory() {
        if (this.annotations.system && this.annotations.system.toJS())
            return 'system';
        const config = this.config;
        if (!config)
            return 'data';

        switch (config.module) {
        case 'org.thingpedia.config.builtin':
        case 'org.thingpedia.config.none':
            return 'data';
        case 'org.thingpedia.config.discovery.bluetooth':
        case 'org.thingpedia.config.discovery.upnp':
            return 'physical';
        default:
            return 'online';
        }
    }

    toManifest() {
        let [queries, actions] = [{}, {}];
        Object.entries(this.queries).forEach(([name, query]) => queries[name] = query.toManifest());
        Object.entries(this.actions).forEach(([name, action]) => actions[name] = action.toManifest());

        let [auth, extraKinds] = this._auth();
        let manifest = {
            module_type: this.loader ? this.loader.module : 'org.thingpedia.v2',
            kind: this.kind,
            params: this._params(),
            auth: auth,
            queries,
            actions,
            version: this.annotations.version ? this.annotations.version.value : undefined,
            types: (this.extends || []).concat(extraKinds),
            child_types: this.annotations.child_types ? this.annotations.child_types.value.map((v) => getString(v)) : [],
            category: this._getCategory()
        };
        if (this.metadata.name) manifest.name = this.metadata.name;
        if (this.metadata.description) manifest.description = this.metadata.description;
        return manifest;
    }

    static fromManifest(kind, manifest) {
        let _extends = (manifest.types || []).filter((t) => !t.startsWith('bluetooth-') && !t.startsWith('upnp-'));
        let imports = [];
        let queries = {};
        let actions = {};
        let metadata = {};
        if (manifest.name)
            metadata.name = Ast.Value.String(manifest.name);
        if (manifest.description)
            metadata.description = Ast.Value.String(manifest.description);
        let annotations = {
            version: manifest.version !== undefined ? Ast.Value.Number(manifest.version) : undefined,
            child_types: manifest.child_types ? Ast.Value.Array(manifest.child_types.map((t) => Ast.Value.String(t))) : Ast.Value.Array([]),

            system: manifest.category === 'system' ? Ast.Value.Boolean(true) : undefined
        };
        Object.entries(manifest.queries).forEach(([name, query]) => queries[name] = FunctionDef.fromManifest('query', name, query));
        Object.entries(manifest.actions).forEach(([name, action]) => actions[name] = FunctionDef.fromManifest('action', name, action));

        imports.push(new ImportStmt.Mixin(['loader'], manifest.module_type, []));
        let argmap = {};
        for (let param in manifest.params) {
            const [, htmlType] = manifest.params[param];
            argmap[param] = htmlTypeToTT(htmlType);
        }
        argmap = new Ast.Value.ArgMap(argmap);
        if (manifest.auth) {
            let params = [];
            Object.entries(manifest.auth).forEach(([param, value]) => {
                if (param === 'discoveryType' || param === 'type')
                    return;
                if (typeof value === 'string')
                    value = Ast.Value.String(value);
                params.push(new Ast.InputParam(param, value));
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
                if (!(params.some((param) => param.name === 'extra_params')))
                    params.push(new Ast.InputParam('extra_params', argmap));
                imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.basic_auth', params));
                break;
            case 'builtin':
                imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.builtin', params));
                break;
            case 'none':
                if (Object.keys(manifest.params).length > 0) {
                    if (!(params.some((param) => param.name === 'params')))
                        params.push(new Ast.InputParam('params', argmap));
                    imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.form', params));
                    break;
                }
            default:
                imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.none', params));
            }
        }
        let uuids = [], upnpSearchTarget = [], bluetoothclass = undefined;
        for (let type of (manifest.types || [])) {
            if (type.startsWith('bluetooth-uuid-'))
                uuids.push(type.substring('bluetooth-uuid-'.length));
            else if (type.startsWith('bluetooth-class-'))
                bluetoothclass = type.substring('bluetooth-class-'.length);
            else if (type.startsWith('upnp-'))
                upnpSearchTarget.push('urn:' + type.substring('upnp-'.length));
        }
        const config = imports.find((i) => i.facets.includes('config'));
        switch (config.module) {
        case 'org.thingpedia.config.discovery.bluetooth':
            config.in_params.push(Ast.InputParam('uuids', Ast.Value.fromJS(Type.Array(Type.String), uuids)));
            if (bluetoothclass)
                config.in_params.push(Ast.InputParam('device_class', Ast.Value.fromJS(Type.Enum(null), bluetoothclass)));
            break;
        case 'org.thingpedia.config.discovery.upnp':
            config.in_params.push(Ast.InputParam('search_target', Ast.Value.fromJS(Type.Array(Type.String), upnpSearchTarget)));
            break;
        }

        return new ClassDef(kind, _extends, queries, actions, imports, metadata, annotations);
    }
}
module.exports.ClassDef = ClassDef;

const ImportStmt = adt.data({
    Class: {
        kind: adt.only(String),
        alias: adt.only(String, null)
    },
    Mixin: {
        facets: adt.only(Array),
        module: adt.only(String),
        in_params: adt.only(Array) // of InputParams
    }
});
module.exports.ImportStmt = ImportStmt.seal();

