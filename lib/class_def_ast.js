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

const Type = require('./type');

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

class ArgumentDef {
    constructor(direction, name, type, metadata, annotations) {
        this.direction = direction;
        this.is_input = direction !== ArgDirection.OUT;
        this.required = direction === ArgDirection.IN_REQ;
        this.name = name;
        this.type = type;
        this.metadata = metadata || {};
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
        return `${this.direction} ${this.name}: ${this.type}`;
    }
}
module.exports.ArgumentDef = ArgumentDef;

// the signature (functional type) of a TT expression,
// either a table, stream or action
class ExpressionSignature {
    constructor(functionType, args, is_list, is_monitorable) {
        assert(functionType === 'stream' || functionType === 'query' || functionType === 'action');
        assert(Array.isArray(args));
        assert(typeof is_list === 'boolean');
        assert(typeof is_monitorable === 'boolean');

        // ignored, for compat only
        this.kind_type = 'other';

        let argnames, types, index, inReq, inOpt, out;
        let argcanonicals, questions, argmap = {};
        argnames = args.map((a) => a.name);
        types = args.map((a) => a.type);
        index = makeIndex(argnames);

        inReq = {}; inOpt = {}; out = {};
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
            questions.push(arg.metadata.question || '');
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

            metadata = metadata || {};
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
        const firstline = `${prefix}${this.is_monitorable ? 'monitorable ' : ''}${this.is_list ? 'list ' : ''}${this.functionType} ${this.name}`;

        if (this.args.length === 0)
            return `${firstline}();`;
        if (this.args.length === 1)
            return `${firstline}(${this._argmap[this.args[0]]});`;

        let buffer = `${firstline}(${this._argmap[this.args[0]]},\n`;
        let padding = ' '.repeat(firstline.length+1);
        for (let i = 1; i < this.args.length-1; i++)
            buffer += `${padding}${this._argmap[this.args[i]]},\n`;
        buffer += `${padding}${this._argmap[this.args[this.args.length-1]]});`;
        return buffer;
    }

    // for compatibility
    get canonical() {
        return this._metadata.canonical || '';
    }
    get confirmation() {
        return this._metadata.confirmation || '';
    }
    get confirmation_remote() {
        return this._metadata.confirmation_remote || '';
    }

    _cloneInternal(args) {
        let metadata = {}, annotations = {};
        Object.assign(metadata, this._metadata);
        Object.assign(annotations, this._annotations);

        return new FunctionDef(this._functionType, this._name, args,
            this.is_list, this.is_monitorable, metadata, annotations);
    }
}
module.exports.FunctionDef = FunctionDef;

class ClassDef {
    constructor(kind, _extends, queries, actions, imports, metadata, annotations) {
        this.name = kind;
        this.kind = kind;

        this.extends = _extends;
        this.queries = queries;
        this.actions = actions;
        this.imports = imports || [];
        this.metadata = metadata || {};
        this.annotations = annotations || {};
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

    toString(prefix = '') {
        return `${prefix}class @${this.kind} ${this.extends ? 'extends @' + this.extends + ' ' : ''}{
${this.imports.map((i) => prefix + i.toString() + '\n').join('')}${Object.keys(this.queries).map((q) => this.queries[q].toString(prefix + '  ') + '\n').join('')}${Object.keys(this.actions).map((q) => this.actions[q].toString(prefix + '  ') + '\n').join('')}${prefix}}`;
    }
}
module.exports.ClassDef = ClassDef;