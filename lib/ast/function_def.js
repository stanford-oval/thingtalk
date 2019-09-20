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

const assert = require('assert');

//const Ast = require('./ast');
const Type = require('../type');
const { prettyprintType, prettyprintAnnotations } = require('../prettyprint');
const { Value } = require('./values');
const toJS = require('./toJS');

// Class and function definitions

function makeIndex(args) {
    var index = {};
    var i = 0;
    for (var a of args)
        index[a] = i++;
    return index;
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
        v = Value.String(value);
    else if (typeof value === 'boolean')
        v = Value.Boolean(value);
    else if (typeof value === 'number')
        v = Value.Number(value);
    else if (Array.isArray(value))
        v = Value.Array(value.map((elem) => legacyAnnotationToValue(elem)));
    return v;
}

class ArgumentDef {
    constructor(direction, name, type, metadata, annotations) {
        this.direction = direction;
        this.is_input = direction !== ArgDirection.OUT;
        this.required = direction === ArgDirection.IN_REQ;
        this.name = name;
        this.type = type;
        this.metadata = metadata || {};
        this.annotations = annotations || {};
        this.unique = this.annotations.unique && this.annotations.unique.isBoolean && this.annotations.unique.value === true;
    }

    get canonical() {
        let canonical = this.metadata.canonical;
        if (typeof canonical === 'string')
            return canonical;
        if (typeof canonical === 'object' && 'npp' in canonical)
            return canonical['npp'][0];
        return this.name;
    }

    getAnnotation(key) {
        if (Object.prototype.hasOwnProperty.call(this.annotations, key))
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
        return `${this.direction} ${this.name}: ${this.type}${prettyprintAnnotations(this, ' ', false)}`;
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
    constructor(functionType, _extends, args, is_list, is_monitorable, require_filter, default_projection, no_filter, parent = null) {
        // ignored, for compat only
        this.kind_type = 'other';
        this._functionType = functionType;

        assert(functionType === 'stream' || functionType === 'query' || functionType === 'action');
        assert(Array.isArray(args));
        if (functionType === 'query') {
            assert(typeof is_list === 'boolean');
            assert(typeof is_monitorable === 'boolean');
        }

        this._args = [];
        this._types = [];
        this._argmap = {};
        this._inReq = {};
        this._inOpt = {};
        this._out = {};
        this.argcanonicals = [];
        this.questions = [];

        this._loadArguments(args);

        this.is_list = is_list;
        this.is_monitorable = is_monitorable;
        this.require_filter = require_filter || false;
        this.default_projection = default_projection || [];
        this.no_filter = no_filter || false;

        this._extends = _extends || [];
        this._parent = parent;
        this._argFlattened = false;
    }

    _loadArguments(args) {
        this._args = this._args.concat(args.map((a) => a.name));
        this._types = this._types.concat(args.map((a) => a.type));
        this._index = makeIndex(this._args);

        for (let arg of args) {
            if (arg.is_input && arg.required)
                this._inReq[arg.name] = arg.type;
            else if (arg.is_input)
                this._inOpt[arg.name] = arg.type;
            else
                this._out[arg.name] = arg.type;
        }

        for (let arg of args) {
            this.argcanonicals.push(arg.canonical);
            this.questions.push(arg.metadata.question || arg.metadata.prompt || '');
            this._argmap[arg.name] = arg;
        }

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
    getArgCanonical(arg) {
        return this._argmap[arg].canonical;
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

    *iterateArguments() {
        for (let arg of this._args)
            yield this._argmap[arg];
        if (this.extends.length > 0 && !this._argFlattened) {
            if (!this.class)
                throw new Error(`Class information missing from the function definition.`);
            for (let fname of this.extends)
                yield *this.class.getFunction(this.functionType, fname).iterateArguments();
        }
        this._argFlattened = true;
    }

    // extract arguments from base functions
    flattenArguments() {
        const args = [];
        for (let arg of this.iterateArguments())
            args.push(arg);
        this._loadArguments(args);
    }

    _cloneInternal(args) {
        return new ExpressionSignature(this._functionType, this.extends, args,
            this.is_list, this.is_monitorable, this.require_filter, this.default_projection, this.no_filter);
    }

    clone() {
        return this._cloneInternal(this._args.map((a) => this._argmap[a]));
    }
    addArguments(toAdd) {
        const args = this._args.map((a) => this._argmap[a]);
        args.push(...toAdd);
        return this._cloneInternal(args);
    }
    removeArgument(arg) {
        const args = this._args.filter((a) => a !== arg).map((a) => this._argmap[a]);
        return this._cloneInternal(args);
    }
    filterArguments(filter) {
        const args = this._args.filter((a, i) => filter(this._argmap[a], i)).map((a) => this._argmap[a]);
        return this._cloneInternal(args);
    }

    // 'stream', 'query' or 'action'
    get functionType() {
        return this._functionType;
    }

    // a list of names of the base function
    get extends() {
        return this._extends;
    }

    // the associated classdef, or null if this functiondef came out of thin air
    get class() {
        return this._parent;
    }

    get argnames() {
        return this._args;
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
    constructor(functionType, name, _extends, args, is_list, is_monitorable, metadata, annotations, parent = null) {
        metadata = metadata || {};
        annotations = annotations || {};
        let require_filter, default_projection;
        if ('require_filter' in annotations)
            require_filter = annotations.require_filter.value;
        else
            require_filter = false;
        if ('default_projection' in annotations && annotations.default_projection.isArray) {
            default_projection = annotations.default_projection.value.map((param) => {
                return param.value;
            });
        } else {
            default_projection = [];
        }

        super(functionType, _extends, args, is_list, is_monitorable, require_filter, default_projection, false, parent);

        this._name = name;
        this._metadata = metadata;
        this._annotations = annotations;

        // args contains only arguments defined in this function, exclude the ones defined in base functions
        // in contrast, all the argument-related fields inside ExpressionSignature will contains all arguments
        // including the ones in base functions, in order to serve as the schema for all streams/tables/actions
        this.args = args.map((a) => a.name);
    }

    getAnnotation(key) {
        if (Object.prototype.hasOwnProperty.call(this.annotations, key))
            return this.annotations[key].toJS();
        else
            return undefined;
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
        let annotations = prettyprintAnnotations(this);
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

        return new FunctionDef(this._functionType, this._name, this.extends, args,
            this.is_list, this.is_monitorable, metadata, annotations, this._parent);
    }

    clone() {
        return this._cloneInternal(this.args.map((a) => this._argmap[a]));
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
            annotations['poll_interval'] = new Value.Measure(manifest.poll_interval, 'ms');
        for (let key in manifest) {
            if (['args', 'is_list', 'is_monitorable', 'poll_interval',
                 'canonical', 'confirmation', 'confirmation_remote', 'formatted'].indexOf(key) >= 0)
                continue;
            const v = legacyAnnotationToValue(manifest[key]);
            if (v)
                annotations[key] = v;
        }

        if (manifest.url)
            annotations.url = new Value.String(manifest.url);
        return new FunctionDef(functionType, name, [], args, is_list, is_monitorable, metadata, annotations);
    }
}
module.exports.FunctionDef = FunctionDef;
