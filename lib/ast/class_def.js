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

import assert from 'assert';

import Type from '../type';
import { prettyprintClassDef } from '../prettyprint';
import { clean, cleanKind } from '../utils';
import { Value } from './values';
import { InputParam } from './expression';
import { Statement } from './program';
import { FunctionDef } from './function_def';
import { getString, extractImports, typeToHTML } from './manifest_utils';

// Class definitions

/**
 * The definition of a ThingTalk class.
 *
 * @extends {Ast.Statement}
 * @alias Ast.ClassDef
 */
export class ClassDef extends Statement {
    /**
     * Construct a new class definition.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} kind - the class identifier in Thingpedia
     * @param {Ast.ClassDef[]|null} _extends - parent classes (if any)
     * @param {Object.<string, any>} members - the class members including queries, actions, entities, imports
     * @param {Ast.ImportStmt[]} [members.imports=[]] - import statements in this class
     * @param {Ast.EntityDef[]} [members.entities=[]] - entity declarations in this class
     * @param {Object.<string, Ast.FunctionDef>} [members.queries={}] - query functions in this class
     * @param {Object.<string, Ast.FunctionDef>} [members.actions={}] - action functions in this class
     * @param {Object<string, Object>} annotations - annotations of the class
     * @param {Object.<string, any>} [annotations.nl={}] - natural language annotations of the class (translatable annotations)
     * @param {Object.<string, Ast.Value>} [annotations.impl={}] - implementation annotations of the class
     * @param {Object<string, any>} options - additional options for the class
     * @param {boolean} [options.is_abstract=false] - `true` if this is an abstract class which has no implementation
     */
    constructor(location, kind, _extends, members, annotations, options) {
        super(location);
        this.name = kind;
        this.kind = kind;

        // load parent classes
        assert(_extends === null || Array.isArray(_extends));
        this.extends = _extends;

        // load class members
        this.imports = members.imports || [];
        this.entities = members.entities || [];
        this.queries = members.queries || {};
        this.actions = members.actions || {};
        this._adjustParentPointers();

        // load annotations
        for (let annotationType of ['nl', 'impl']) {
            if (annotationType in annotations)
                assert(typeof annotations[annotationType] === 'object');
        }
        this.nl_annotations = annotations.nl || {};
        this.impl_annotations = annotations.impl || {};

        // load additional options
        this._options = options;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitClassDef(this)) {
            for (let import_ of this.imports)
                import_.visit(visitor);
            for (let entity of this.entities)
                entity.visit(visitor);
            for (let query in this.queries)
                this.queries[query].visit(visitor);
            for (let action in this.actions)
                this.actions[action].visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() {}

    _adjustParentPointers() {
        for (let name in this.queries)
            this.queries[name].setClass(this);
        for (let name in this.actions)
            this.actions[name].setClass(this);
    }

    /**
     * Get a function defined in this class with the given type and name.
     *
     * @param {string} type - the function type, either `query` or `action`
     * @param {string} name - the function name
     * @return {module.Ast.FunctionDef|undefined} the function definition, or `undefined`
     *         if the function does not exist
     */
    getFunction(type, name) {
        if (type === 'query')
            return this.queries[name];
        if (type === 'action')
            return this.actions[name];
        return undefined;
    }

    /**
     * Read and normalize an implementation annotation from this class.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation normalized value, or `undefined` if the
     *         annotation is not present
     */
    getImplementationAnnotation(name) {
        if (Object.prototype.hasOwnProperty.call(this.impl_annotations, name))
            return this.impl_annotations[name].toJS();
        else
            return undefined;
    }

    /**
     * Read a natural-language annotation from this class.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation value, or `undefined` if the
     *         annotation is not present
     */
    getNaturalLanguageAnnotation(name) {
        if (Object.prototype.hasOwnProperty.call(this.nl_annotations, name))
            return this.nl_annotations[name];
        else
            return undefined;
    }

    /**
     * Convert this class to prettyprinted ThingTalk code.
     *
     * @param {string} [prefix] - prefix each output line with this string (for indentation)
     * @return {string} the prettyprinted code
     */
    prettyprint(prefix = '') {
        return prettyprintClassDef(this, prefix);
    }

    /**
     * Clone the class definition.
     *
     * @return {Ast.ClassDef} the cloned class definition
     */
    clone() {
        // clone members
        const imports = this.imports.map((i) => i.clone());
        const entities = this.entities.map((e) => e.clone());
        const queries = {};
        const actions = {};
        for (let name in this.queries)
            queries[name] = this.queries[name].clone();
        for (let name in this.actions)
            actions[name] = this.actions[name].clone();
        const members = { imports, entities, queries, actions };

        // clone annotations
        const nl = {};
        Object.assign(nl, this.nl_annotations);
        const impl = {};
        Object.assign(impl, this.impl_annotations);
        const annotations = { nl, impl };

        // clone other options
        const options = {
            is_abstract: this._options.is_abstract || false
        };

        return new ClassDef(this.location, this.kind, this.extends, members, annotations, options);
    }

    /**
     * The `loader` mixin for this class, if one is present
     *
     * @type {Ast.ImportStmt|undefined}
     * @readonly
     */
    get loader() {
        return this.imports.find((i) => i.facets.includes('loader'));
    }

    /**
     * The `config` mixin for this class, if one is present
     *
     * @type {Ast.ImportStmt|undefined}
     * @readonly
     */
    get config() {
        return this.imports.find((i) => i.facets.includes('config'));
    }

    /**
     * The canonical form of this class.
     *
     * This is is the preferred property to use as a user visible name for devices of
     * this class. It will never be null or undefined: if the `#_[canonical]` annotation
     * is missing, a default will be computed from the class name.
     * @type {string}
     * @readonly
     */
    get canonical() {
        return this.nl_annotations.canonical || cleanKind(this.kind);
    }

    /**
     * If the class is an abstract class.
     *
     * @type {string}
     * @readonly
     */
    get is_abstract() {
        return this._options && this._options.is_abstract ? this._options.is_abstract : false;
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
        if (this.impl_annotations.system && this.impl_annotations.system.toJS())
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

    /**
     * The natural language annotations of the class
     *
     * @type {Object.<string, Ast.Value>}
     * @readonly
     * @deprecated metadata is deprecated. Use nl_annotations instead.
     */
    get metadata() {
        return this.nl_annotations;
    }

    /**
     * The implementation annotations of the class
     *
     * @type {Object.<string, any>}
     * @readonly
     * @deprecated annotations is deprecated. Use impl_annotations instead.
     */
    get annotations() {
        return this.impl_annotations;
    }

    /**
     * Read and normalize an annotation from this class.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation normalized value, or `undefined` if the
     *         annotation is not present
     * @deprecated getAnnotation is deprecated and should not be used. Use {@link Ast.ClassDef#getImplementationAnnotation} instead.
     */
    getAnnotation(name) {
        if (Object.prototype.hasOwnProperty.call(this.annotations, name))
            return this.annotations[name].toJS();
        else
            return undefined;
    }

    /**
     * Convert the class to a manifest.
     *
     * @return {Object} the manifest
     * @deprecated Manifests are deprecated and should not be used. Use .tt files instead.
     */
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

    /**
     * Convert a manifest to a class.
     *
     * @param {string} kind - the class identifier
     * @param {Object} manifest - the manifest to convert
     * @return {Ast.ClassDef} the converted class definition
     * @deprecated Manifests are deprecated and should not be used. Use .tt files instead.
     */
    static fromManifest(kind, manifest) {
        let _extends = (manifest.types || []).filter((t) => !t.startsWith('bluetooth-') && !t.startsWith('upnp-'));
        let imports = extractImports(manifest);
        let queries = {};
        let actions = {};
        let metadata = {};
        if (manifest.name)
            metadata.name = manifest.name;
        if (manifest.description)
            metadata.description = manifest.description;
        let annotations = {};
        if (manifest.child_types && manifest.child_types.length)
            annotations.child_types = new Value.Array(manifest.child_types.map((t) => new Value.String(t)));
        if (manifest.version !== undefined)
            annotations.version = new Value.Number(manifest.version);
        if (manifest.category === 'system')
            annotations.system = new Value.Boolean(true);
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
            config.in_params.push(new InputParam(null, 'uuids', Value.fromJS(Type.Array(Type.String), uuids)));
            if (bluetoothclass)
                config.in_params.push(new InputParam(null, 'device_class', Value.fromJS(Type.Enum(null), bluetoothclass)));
            break;
        case 'org.thingpedia.config.discovery.upnp':
            config.in_params.push(new InputParam(null, 'search_target', Value.fromJS(Type.Array(Type.String), upnpSearchTarget)));
            break;
        }

        return new ClassDef(null, kind, _extends, { queries, actions, imports }, { nl: metadata, impl: annotations }, {});
    }
}
Statement.ClassDef = ClassDef;
ClassDef.prototype.isClassDef = true;


