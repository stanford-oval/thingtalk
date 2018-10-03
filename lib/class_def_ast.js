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
const Units = require('./units');
const { prettyprintType, prettyprintValue, prettyprintJson, prettyprintClassDef } = require('./prettyprint');

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
        return {
            name: this.name,
            type: prettyprintType(this.type),
            question: this.metadata['prompt'] || '',
            is_input: this.is_input,
            required: this.required
        };
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
    constructor(functionType, name, args, is_list, is_monitorable, metadata, annotations) {
        if (arguments.length === 14) {
            // for API compatibility
            let [, argnames,,, inReq, inOpt, out, is_list, is_monitorable,
                canonical, confirmation, confirmation_remote, argcanonicals, questions] = arguments;

            name = 'unnamed';
            functionType = (is_list || is_monitorable ? 'query' : 'action'); // XXX buggy
            metadata = {
                canonical,
                confirmation,
                confirmation_remote,
            };

            const args = argnames.map((arg, i) => {
                const argmeta = {
                    canonical: argcanonicals[i] || arg,
                    question: questions[i] || ''
                };

                let direction;
                if (inReq[arg])
                    direction = ArgDirection.IN_REQ;
                else if (inOpt[arg])
                    direction = ArgDirection.IN_OPT;
                else
                    direction = ArgDirection.OUT;
                let type = inReq[arg] || inOpt[arg] || out[arg];
                assert(type instanceof Type);
                return new ArgumentDef(direction, arg, type, argmeta, {});
            });
            super(functionType, args, is_list, is_monitorable);

            annotations = {};
        } else {
            super(functionType, args, is_list, is_monitorable);
            metadata = metadata ? toJS(metadata) : {};
            annotations = annotations || {};
        }

        this._name = name;
        this._metadata = metadata;
        this._annotations = annotations;
    }

    // the function name
    get name() {
        return this._name;
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
    get confirmation_remote() {
        return this.metadata.confirmation_remote;
    }

    _cloneInternal(args) {
        let metadata = {}, annotations = {};
        Object.assign(metadata, this._metadata);
        Object.assign(annotations, this._annotations);

        return new FunctionDef(this._functionType, this._name, args,
            this.is_list, this.is_monitorable, metadata, annotations);
    }

    toManifest() {
        let interval = this._annotations['poll_interval'];
        return {
            args: this.args.map((a) => this._argmap[a].toManifest()),
            canonical: this.canonical,
            is_list: this.is_list,
            poll_interval: this.is_monitorable ? Units.transformToBaseUnit(interval.value, interval.unit) : -1,
            confirmation: this.confirmation,
            confirmation_remote: this.confirmation_remote,
            formatted: this.metadata.formatted || [],
            doc: this.annotations.doc ? this.annotations.doc.toJS() : undefined,
            url: this.annotations.url ? this.annotations.url.toJS() : undefined,
        };
    }

    static fromManifest(functionType, name, manifest) {
        let args = manifest.args.map((a) => ArgumentDef.fromManifest(a));
        let is_list = functionType === 'query' ? manifest.is_list : false;
        let is_monitorable = functionType === 'query' ? manifest.poll_interval !== -1 : false;
        let annotations = is_monitorable ? { 'poll_interval': new Ast.Value.Measure(manifest.poll_interval, 'ms') } : {};
        if (manifest.doc)
            annotations.doc = new Ast.Value.String(manifest.doc);
        if (manifest.url)
            annotations.url = new Ast.Value.String(manifest.url);
        let metadata = {
            canonical: manifest.canonical || '',
            confirmation: manifest.confirmation || '',
            confirmation_remote: manifest.confirmation_remote || '',
            formatted: toJS(manifest.formatted),
        };
        return new FunctionDef(functionType, name, args, is_list, is_monitorable, metadata, annotations);
    }
}
module.exports.FunctionDef = FunctionDef;

class ClassDef {
    constructor(kind, _extends, queries, actions, imports, metadata, annotations) {
        this.name = kind;
        this.kind = kind;

        assert(_extends === null || Array.isArray(_extends));
        this.extends = _extends;
        this.queries = queries;
        this.actions = actions;
        this.imports = imports || [];
        this.metadata = metadata ? toJS(metadata) : {};
        this.annotations = annotations || {};
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

        return new ClassDef(this.kind, this.extends, queries, actions, imports, metadata, annotations);
    }

    get loader() {
        return this.imports.find((i) => i.facets.includes('loader'));
    }

    get config() {
        return this.imports.find((i) => i.facets.includes('config'));
    }

    _params() {
        let params = {};
        if (this.config) {
            switch (this.config.module) {
                case 'org.thingpedia.config.form':
                case 'org.thingpedia.config.basic_auth': {
                    let argMap = this.config.in_params[0].value;
                    Object.entries(argMap.value).forEach(([name, type]) => {
                        if (Array.isArray(type))
                            params[name] = type;
                        else
                            params[name] = prettyprintType(type);
                    });
                }
            }
        }
        return params;
    }

    _auth() {
        let auth = {};
        this.config.in_params.forEach((param) => {
            if (param.name === 'protocol')
                auth['discoveryType'] = param.value.value;
            else if (param.value.isString)
                auth[param.name] = getString(param.value);
            else
                auth[param.name] = param.value;
        });
        if (this.config) {
            switch (this.config.module) {
                case 'org.thingpedia.config.oauth2':
                    auth.type = 'oauth2';
                    break;
                case 'org.thingpedia.config.custom_oauth':
                    auth.type = 'custom_oauth';
                    break;
                case 'org.thingpedia.config.basic_auth':
                    auth.type = 'basic';
                    break;
                case 'org.thingpedia.config.discovery':
                    auth.type = 'discovery';
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
        }
        return auth;
    }

    toManifest() {
        let [queries, actions] = [{}, {}];
        Object.entries(this.queries).forEach(([name, query]) => queries[name] = query.toManifest());
        Object.entries(this.actions).forEach(([name, action]) => actions[name] = action.toManifest());
        let manifest = {
            module_type: this.loader ? this.loader.module : 'org.thingpedia.v2',
            kind: this.kind,
            params: this._params(),
            auth: this._auth(),
            queries,
            actions,
            version: this.annotations.version ? this.annotations.version.value : undefined,
            types: this.extends,
            child_types: this.annotations.child_types ? this.annotations.child_types.value.map((v) => getString(v)) : []
        };
        if (this.metadata.name) manifest.name = this.metadata.name;
        if (this.metadata.description) manifest.description = this.metadata.description;
        return manifest;
    }

    static fromManifest(kind, manifest) {
        let _extends = manifest.types || [];
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
            child_types: manifest.child_types ? Ast.Value.Array(manifest.child_types.map((t) => Ast.Value.String(t))) : Ast.Value.Array([])
        };
        Object.entries(manifest.queries).forEach(([name, query]) => queries[name] = FunctionDef.fromManifest('query', name, query));
        Object.entries(manifest.actions).forEach(([name, action]) => actions[name] = FunctionDef.fromManifest('action', name, action));

        imports.push(new ImportStmt.Mixin(['loader'], manifest.module_type, []));
        let argmap = {};
        Object.entries(manifest.params).forEach(([param, type]) => {
            argmap[param] = type;
        });
        argmap = new Ast.Value.ArgMap(argmap);
        if (manifest.auth) {
            let params = [];
            Object.entries(manifest.auth).forEach(([param, value]) => {
                if (param === 'discoveryType') {
                    param = 'protocol';
                    value = new Ast.Value.Enum(value);
                }
                if (param !== 'type') {
                    if (typeof value === 'string')
                        value = Ast.Value.String(value);
                    params.push(new Ast.InputParam(param, value));
                }
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
                    imports.push(new ImportStmt.Mixin(['config'], 'org.thingpedia.config.discovery', params));
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

