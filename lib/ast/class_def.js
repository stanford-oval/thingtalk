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
const { prettyprintClassDef } = require('../prettyprint');
const { clean } = require('../utils');
const { Value } = require('./values');
const { Statement, InputParam } = require('./program');
const { FunctionDef } = require('./function_def');
const { getString, extractImports, typeToHTML } = require('./manifest_utils');
const toJS = require('./toJS');

// Class definitions

class ClassDef extends Statement {
    constructor(kind, _extends, queries, actions, imports, metadata, annotations, is_abstract, macros) {
        super();
        this.name = kind;
        this.kind = kind;

        assert(_extends === null || Array.isArray(_extends));
        this.extends = _extends;
        this.macros = macros || {};
        this.queries = queries;
        this.actions = actions;
        this._adjustParentPointers();
        this.imports = imports || [];
        this.metadata = metadata ? toJS(metadata) : {};
        this.annotations = annotations || {};
        this.is_abstract = is_abstract || false;
    }

    *iterateSlots() {}
    *iteratePrimitives() {}

    _adjustParentPointers() {
        for (let name in this.queries)
            this.queries[name]._parent = this;
        for (let name in this.actions)
            this.actions[name]._parent = this;
    }

    getMacro(name) {
        return this.macros[name];
    }

    getFunction(type, name) {
        if (type === 'query')
            return this.queries[name];
        if (type === 'action')
            return this.actions[name];
        return undefined;
    }

    getAnnotation(key) {
        if (Object.prototype.hasOwnProperty.call(this.annotations, key))
            return this.annotations[key].toJS();
        else
            return undefined;
    }

    prettyprint(prefix = '') {
        return prettyprintClassDef(this, prefix);
    }

    clone() {
        const macros = {};
        const queries = {};
        const actions = {};
        for (let name in this.macros)
            macros[name] = this.macros[name].clone();
        for (let name in this.queries)
            queries[name] = this.queries[name].clone();
        for (let name in this.actions)
            actions[name] = this.actions[name].clone();
        const metadata = {};
        Object.assign(metadata, this.metadata);
        const annotations = {};
        Object.assign(annotations, this.annotations);
        const imports = this.imports.map((i) => i.clone());

        const classDef = new ClassDef(this.kind, this.extends, queries, actions, imports, metadata, annotations,
            this.is_abstract, macros);
        // adjust parent pointers to point to the clone, not the original class
        classDef._adjustParentPointers();

        return classDef;
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
        case 'org.thingpedia.config.basic_auth':
            if (config.in_params.length === 1) {
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
        let imports = extractImports(manifest);
        let queries = {};
        let actions = {};
        let metadata = {};
        if (manifest.name)
            metadata.name = Value.String(manifest.name);
        if (manifest.description)
            metadata.description = Value.String(manifest.description);
        let annotations = {
            version: manifest.version !== undefined ? Value.Number(manifest.version) : undefined,
            child_types: manifest.child_types ? Value.Array(manifest.child_types.map((t) => Value.String(t))) : Value.Array([]),

            system: manifest.category === 'system' ? Value.Boolean(true) : undefined
        };
        Object.entries(manifest.queries).forEach(([name, query]) => queries[name] = FunctionDef.fromManifest('query', name, query));
        Object.entries(manifest.actions).forEach(([name, action]) => actions[name] = FunctionDef.fromManifest('action', name, action));

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
            config.in_params.push(new InputParam('uuids', Value.fromJS(Type.Array(Type.String), uuids)));
            if (bluetoothclass)
                config.in_params.push(new InputParam('device_class', Value.fromJS(Type.Enum(null), bluetoothclass)));
            break;
        case 'org.thingpedia.config.discovery.upnp':
            config.in_params.push(new InputParam('search_target', Value.fromJS(Type.Array(Type.String), upnpSearchTarget)));
            break;
        }

        return new ClassDef(kind, _extends, queries, actions, imports, metadata, annotations);
    }
}
module.exports.ClassDef = ClassDef;
Statement.ClassDef = ClassDef;
ClassDef.prototype.isClassDef = true;


