// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import { SourceRange, NLAnnotationMap, AnnotationMap, AnnotationSpec } from './base';
import { prettyprintClassDef } from '../prettyprint';
import { cleanKind } from '../utils';
import { DeviceSelector } from './expression';
import { Statement, MixinImportStmt, EntityDef } from './program';
import { FunctionType, FunctionDef } from './function_def';
import { OldSlot, AbstractSlot } from './slots';
import NodeVisitor from './visitor';

// Class definitions

type FunctionMap = { [key : string] : FunctionDef };

interface ClassMemberSpec {
    imports ?: MixinImportStmt[];
    entities ?: EntityDef[];
    queries ?: FunctionMap;
    actions ?: FunctionMap;
}

interface ClassConstructOptions {
    is_abstract ?: boolean;
}

/**
 * The definition of a ThingTalk class.
 *
 * @alias Ast.ClassDef
 */
export class ClassDef extends Statement {
    name : string;
    kind : string;
    extends : string[];
    imports : MixinImportStmt[];
    entities : EntityDef[];
    queries : FunctionMap;
    actions : FunctionMap;
    nl_annotations : NLAnnotationMap;
    impl_annotations : AnnotationMap;

    /**
     * If the class is an abstract class.
     */
    readonly is_abstract : boolean;

    /**
     * Construct a new class definition.
     *
     * @param location - the position of this node in the source code
     * @param kind - the class identifier in Thingpedia
     * @param _extends - parent classes (if any)
     * @param members - the class members including queries, actions, entities, imports
     * @param [members.imports=[]] - import statements in this class
     * @param [members.entities=[]] - entity declarations in this class
     * @param [members.queries={}] - query functions in this class
     * @param [members.actions={}] - action functions in this class
     * @param annotations - annotations of the class
     * @param [annotations.nl={}] - natural language annotations of the class (translatable annotations)
     * @param [annotations.impl={}] - implementation annotations of the class
     * @param options - additional options for the class
     * @param [options.is_abstract=false] - `true` if this is an abstract class which has no implementation
     */
    constructor(location : SourceRange|null,
                kind : string,
                _extends : string[]|null,
                members : ClassMemberSpec,
                annotations : AnnotationSpec,
                options ?: ClassConstructOptions) {
        super(location);
        this.name = kind;
        this.kind = kind;

        // load parent classes
        assert(_extends === null || Array.isArray(_extends));
        if (_extends === null)
            _extends = [];
        this.extends = _extends;

        // load class members
        this.imports = members.imports || [];
        this.entities = members.entities || [];
        this.queries = members.queries || {};
        this.actions = members.actions || {};
        this._adjustParentPointers();

        // load annotations
        assert(typeof annotations.nl === 'undefined' ||
               typeof annotations.nl === 'object');
        assert(typeof annotations.impl === 'undefined' ||
               typeof annotations.impl === 'object');
        this.nl_annotations = annotations.nl || {};
        this.impl_annotations = annotations.impl || {};

        // load additional options
        this.is_abstract = !!(options && options.is_abstract);
    }

    *iterateSlots() : Generator<OldSlot, void> {
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitClassDef(this)) {
            for (const import_ of this.imports)
                import_.visit(visitor);
            for (const entity of this.entities)
                entity.visit(visitor);
            for (const query in this.queries)
                this.queries[query].visit(visitor);
            for (const action in this.actions)
                this.actions[action].visit(visitor);
        }
        visitor.exit(this);
    }

    private _adjustParentPointers() {
        for (const name in this.queries)
            this.queries[name].setClass(this);
        for (const name in this.actions)
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
    getFunction(type : FunctionType, name : string) : FunctionDef|undefined {
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
    getImplementationAnnotation<T>(name : string) : T|undefined {
        if (Object.prototype.hasOwnProperty.call(this.impl_annotations, name))
            return this.impl_annotations[name].toJS() as T;
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
    getNaturalLanguageAnnotation<T>(name : string) : T|undefined {
        if (Object.prototype.hasOwnProperty.call(this.nl_annotations, name))
            return this.nl_annotations[name] as T;
        else
            return undefined;
    }

    /**
     * Convert this class to prettyprinted ThingTalk code.
     *
     * @param {string} [prefix] - prefix each output line with this string (for indentation)
     * @return {string} the prettyprinted code
     */
    prettyprint(prefix = '') : string {
        return prettyprintClassDef(this, prefix);
    }

    /**
     * Clone the class definition.
     *
     * @return {Ast.ClassDef} the cloned class definition
     */
    clone() : ClassDef {
        // clone members
        const imports = this.imports.map((i) => i.clone());
        const entities = this.entities.map((e) => e.clone());
        const queries : FunctionMap = {};
        const actions : FunctionMap = {};
        for (const name in this.queries)
            queries[name] = this.queries[name].clone();
        for (const name in this.actions)
            actions[name] = this.actions[name].clone();
        const members = { imports, entities, queries, actions };

        // clone annotations
        const nl : NLAnnotationMap = {};
        Object.assign(nl, this.nl_annotations);
        const impl : AnnotationMap = {};
        Object.assign(impl, this.impl_annotations);
        const annotations = { nl, impl };

        // clone other options
        const options = {
            is_abstract: this.is_abstract
        };

        return new ClassDef(this.location, this.kind, this.extends, members, annotations, options);
    }

    /**
     * The `loader` mixin for this class, if one is present
     *
     * @type {Ast.ImportStmt|undefined}
     * @readonly
     */
    get loader() : MixinImportStmt|undefined {
        return this.imports.find((i) => i.facets.includes('loader'));
    }

    /**
     * The `config` mixin for this class, if one is present
     *
     * @type {Ast.ImportStmt|undefined}
     * @readonly
     */
    get config() : MixinImportStmt|undefined {
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
    get canonical() : string {
        return this.nl_annotations.canonical || cleanKind(this.kind);
    }

    /**
     * The natural language annotations of the class
     *
     * @deprecated metadata is deprecated. Use nl_annotations instead.
     */
    get metadata() : NLAnnotationMap {
        return this.nl_annotations;
    }

    /**
     * The implementation annotations of the class
     *
     * @deprecated annotations is deprecated. Use impl_annotations instead.
     */
    get annotations() : AnnotationMap {
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
    getAnnotation<T>(name : string) : T|undefined {
        return this.getImplementationAnnotation<T>(name);
    }
}
Statement.ClassDef = ClassDef;
ClassDef.prototype.isClassDef = true;
