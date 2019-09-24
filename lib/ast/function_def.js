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
        this.is_input = direction ? direction !== ArgDirection.OUT : undefined;
        this.required = direction ? direction === ArgDirection.IN_REQ : undefined;
        this.name = name;
        this.type = type;
        this.metadata = metadata || {};
        this.annotations = annotations || {};
        this.unique = this.annotations.unique && this.annotations.unique.isBoolean && this.annotations.unique.value === true;
        if (this.direction && type.isCompound)
            this._updateFields(type);
    }

    _updateFields(type) {
        for (let field in type.fields) {
            const argumentDef = type.fields[field];
            argumentDef.direction = this.direction;
            argumentDef.is_input = this.is_input;
            argumentDef.required = this.required;

            if (argumentDef.type.isCompound)
                this._updateFields(argumentDef.type);
        }
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

    toString(prefix = '') {
        return `${this.direction} ${this.name}: ${prettyprintType(this.type, prefix)}${prettyprintAnnotations(this, ' ', false)}`;
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


        this.args = [];
        this._types = [];
        this._argmap = {};
        this._inReq = {};
        this._inOpt = {};
        this._out = {};
        this.argcanonicals = [];
        this.questions = [];

        // flatten compound parameters
        args = this._flattenCompoundArguments(args);
        this._loadArguments(args);

        this.is_list = is_list;
        this.is_monitorable = is_monitorable;
        this.require_filter = require_filter || false;
        this.default_projection = default_projection || [];
        this.no_filter = no_filter || false;

        this._extends = _extends || [];
        this._parent = parent;
    }

    _loadArguments(args) {
        this.args = this.args.concat(args.map((a) => a.name));
        this._types = this._types.concat(args.map((a) => a.type));
        this._index = makeIndex(this.args);

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

    _flattenCompoundArguments(args) {
        let flattened = args;
        const existed = args.map((a) => a.name);
        for (let arg of args)
            flattened = flattened.concat(this._flattenCompoundArgument(existed, arg));
        return flattened;
    }

    _flattenCompoundArgument(existed, arg) {
        let flattened = existed.includes(arg.name) ? [] : [arg];
        if (arg.type.isCompound) {
            for (let f in arg.type.fields) {
                const a = arg.type.fields[f].clone();
                a.name = arg.name + '.' + a.name;
                flattened = flattened.concat(this._flattenCompoundArgument(existed, a));
            }
        }
        return flattened;
    }

    hasArgument(arg) {
        if (arg in this._argmap)
            return true;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return true;
            }
        }
        return false;
    }
    getArgument(arg) {
        if (arg in this._argmap)
            return this._argmap[arg];
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.getArgument(arg);
            }
        }
        return undefined;
    }
    getArgType(arg) {
        if (arg in this._argmap)
            return this._argmap[arg].type;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.getArgType(arg);
            }
        }
        return undefined;
    }
    getArgCanonical(arg) {
        if (arg in this._argmap)
            return this._argmap[arg].canonical;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.getArgCanonical(arg);
            }
        }
        return undefined;
    }

    getArgMetadata(arg) {
        if (arg in this._argmap)
            return this._argmap[arg].metadata;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.getArgMetadata(arg);
            }
        }
        return undefined;
    }
    isArgInput(arg) {
        if (arg in this._argmap)
            return this._argmap[arg].is_input;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.isArgInput(arg);
            }
        }
        return undefined;
    }
    isArgRequired(arg) {
        if (arg in this._argmap)
            return this._argmap[arg].required;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.isArgRequired(arg);
            }
        }
        return undefined;
    }

    *iterateArguments() {
        for (let arg of this.args)
            yield this._argmap[arg];
        if (this.extends.length > 0) {
            if (!this.class)
                throw new Error(`Class information missing from the function definition.`);
            for (let fname of this.extends)
                yield *this.class.getFunction(this.functionType, fname).iterateArguments();
        }
    }

    // extract arguments from base functions
    _flattenSubFunctionArguments() {
        const args = [];
        for (let arg of this.iterateArguments())
            args.push(arg);
        return args;
    }

    _cloneInternal(args, flattened=false) {
        return new ExpressionSignature(this._functionType, flattened ? [] : this.extends, args,
            this.is_list, this.is_monitorable, this.require_filter, this.default_projection, this.no_filter);
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
        if (arg in this._argmap) {
            const args = this.args.filter((a) => a !== arg).map((a) => this._argmap[a]);
            return this._cloneInternal(args);
        } else if (this.hasArgument(arg)) {
            const args = this._flattenSubFunctionArguments();
            return this._cloneInternal(args, true);
        } else {
            return this;
        }
    }
    filterArguments(filter) {
        const args = this._flattenSubFunctionArguments().map((a) => a.name)
            .filter((a, i) => filter(this.getArgument(a), i)).map((a) => this.getArgument(a));

        return this._cloneInternal(args, true);
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

    // for compatibility
    get types() {
        if (this.extends.length === 0)
            return this._types;
        const types = [];
        for (let arg of this.iterateArguments())
            types.push(arg.type);
        return types;
    }
    get inReq() {
        if (this.extends.length === 0)
            return this._inReq;
        const args = {};
        for (let arg of this.iterateArguments()) {
            if (arg.required)
                args[arg] = arg.type;
        }
        return args;
    }
    get inOpt() {
        if (this.extends.length === 0)
            return this._inOpt;
        const args = {};
        for (let arg of this.iterateArguments()) {
            if (arg.is_input && !arg.required)
                args[arg] = arg.type;
        }
        return args;
    }
    get out() {
        if (this.extends.length === 0)
            return this._out;
        const args = {};
        for (let arg of this.iterateArguments()) {
            if (!arg.is_input)
                args[arg] = arg.type;
        }
        return args;
    }
    get index() {
        if (this.extends.length === 0)
            return this._index;
        throw new Error(`The index API for functions is deprecated and cannot be used with function inheritance`);
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
        // skip arguments flattened from compound param
        const args = this.args.filter((a) => !a.includes('.'));

        let padding = ' '.repeat(firstline.length+1);
        if (args.length === 0)
            return `${firstline}()${annotations};`;
        if (args.length === 1)
            return `${firstline}(${this._argmap[args[0]].toString(padding)})${annotations};`;

        let buffer = `${firstline}(${this._argmap[args[0]].toString(padding)},\n`;
        for (let i = 1; i < args.length-1; i++)
            buffer += `${padding}${this._argmap[args[i]].toString(padding)},\n`;
        buffer += `${padding}${this._argmap[args[args.length-1]].toString(padding)})${annotations};`;
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

    _cloneInternal(args, flattened=false) {
        let metadata = {}, annotations = {};
        Object.assign(metadata, this._metadata);
        Object.assign(annotations, this._annotations);

        return new FunctionDef(this._functionType, this._name, flattened ? [] : this.extends, args,
            this.is_list, this.is_monitorable, metadata, annotations, this._parent);
    }

    *iterateBaseFunctions() {
        yield this.name;
        if (this.extends.length > 0) {
            if (!this.class)
                throw new Error(`Class information missing from the function definition.`);
            for (let fname of this.extends)
                yield* this.class.getFunction(this.functionType, fname).iterateBaseFunctions();
        }
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
