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

import Node, {
    SourceRange,
    NLAnnotationMap,
    AnnotationMap,
    AnnotationSpec,
    implAnnotationsToSource,
    nlAnnotationsToSource,
} from './base';
import { cleanKind } from '../utils';
import { DeviceSelector, InputParam } from './invocation';
import { Statement } from './statement';
import { FunctionDef } from './function_def';
import { OldSlot, AbstractSlot } from './slots';
import NodeVisitor from './visitor';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';

// Class definitions

export type ClassMember = FunctionDef | MixinImportStmt | EntityDef;

/**
 * The definition of a ThingTalk class.
 *
 */
export class ClassDef extends Statement {
    name : string;
    kind : string;
    extends : string[];
    imports : MixinImportStmt[];
    entities : EntityDef[];
    queries : Record<string, FunctionDef>;
    actions : Record<string, FunctionDef>;
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
     * @param members.imports - import statements in this class
     * @param members.entities - entity declarations in this class
     * @param members.queries - query functions in this class
     * @param members.actions - action functions in this class
     * @param annotations - annotations of the class
     * @param annotations.nl - natural language annotations of the class (translatable annotations)
     * @param annotations.impl - implementation annotations of the class
     * @param options - additional options for the class
     * @param options.is_abstract - `true` if this is an abstract class which has no implementation
     */
    constructor(location : SourceRange|null,
                kind : string,
                _extends : string[]|null,
                members : {
                    imports ?: MixinImportStmt[];
                    entities ?: EntityDef[];
                    queries ?: Record<string, FunctionDef>;
                    actions ?: Record<string, FunctionDef>;
                },
                annotations : AnnotationSpec,
                options ?: {
                    is_abstract ?: boolean;
                }) {
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

    toSource() : TokenStream {
        let list : TokenStream = List.concat('class', '@' + this.kind);
        if (this.extends.length > 0)
            list = List.concat(list, 'extends', List.join(this.extends.map((e) => List.singleton('@' + e)), ','));

        let first = true;
        list = List.concat(list,
            nlAnnotationsToSource(this.nl_annotations),
            implAnnotationsToSource(this.impl_annotations),
            ' ', '{', '\n', '\t+');
        for (const import_ of this.imports) {
            if (first)
                first = false;
            else
                list = List.concat(list, '\n');
            list = List.concat(list, import_.toSource(), '\n');
        }
        for (const entity of this.entities) {
            if (first)
                first = false;
            else
                list = List.concat(list, '\n');
            list = List.concat(list, entity.toSource(), '\n');
        }
        for (const q in this.queries) {
            if (first)
                first = false;
            else
                list = List.concat(list, '\n');
            list = List.concat(list, this.queries[q].toSource(), '\n');
        }
        for (const a in this.actions) {
            if (first)
                first = false;
            else
                list = List.concat(list, '\n');
            list = List.concat(list, this.actions[a].toSource(), '\n');
        }

        list = List.concat(list, '\t-', '}');

        if (this.is_abstract)
            list = List.concat('abstract', list);

        return list;
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
    getFunction(type : 'query'|'action', name : string) : FunctionDef|undefined {
        if (type === 'query')
            return this.queries[name];
        else
            return this.actions[name];
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
     * Clone the class definition.
     *
     * @return {Ast.ClassDef} the cloned class definition
     */
    clone() : ClassDef {
        // clone members
        const imports = this.imports.map((i) => i.clone());
        const entities = this.entities.map((e) => e.clone());
        const queries : Record<string, FunctionDef> = {};
        const actions : Record<string, FunctionDef> = {};
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
     */
    get loader() : MixinImportStmt|undefined {
        return this.imports.find((i) => i.facets.includes('loader'));
    }

    /**
     * The `config` mixin for this class, if one is present
     *
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
     * @deprecated getAnnotation is deprecated and should not be used. Use {@link Ast.ClassDef.getImplementationAnnotation} instead.
     */
    getAnnotation<T>(name : string) : T|undefined {
        return this.getImplementationAnnotation<T>(name);
    }
}



/**
 * A `import` statement that imports a mixin inside a ThingTalk class.
 *
 * Mixins add implementation functionality to ThingTalk classes, such as specifying
 * how the class is loaded (which language, which format, which version of the SDK)
 * and how devices are configured.
 */
export class MixinImportStmt extends Node {
    facets : string[];
    module : string;
    in_params : InputParam[];

    /**
     * Construct a new mixin import statement.
     *
     * @param location - the position of this node in the source code
     * @param facets - which facets to import from the mixin (`config`, `auth`, `loader`, ...)
     * @param module - the mixin identifier to import
     * @param in_params - input parameters to pass to the mixin
     */
    constructor(location : SourceRange|null,
                facets : string[],
                module : string,
                in_params : InputParam[]) {
        super(location);

        assert(Array.isArray(facets));
        this.facets = facets;

        assert(typeof module === 'string');
        this.module = module;

        assert(Array.isArray(in_params));
        this.in_params = in_params;
    }

    toSource() : TokenStream {
        return List.concat('import', List.join(this.facets.map((f) => List.singleton(f)), ','), ' ',
            'from', ' ', '@' + this.module,
            '(', List.join(this.in_params.map((ip) => ip.toSource()), ','), ')', ';');
    }

    clone() : MixinImportStmt {
        return new MixinImportStmt(
            this.location,
            this.facets.slice(0),
            this.module,
            this.in_params.map((p) => p.clone())
        );
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitMixinImportStmt(this)) {
            for (const in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }
}

/**
 * An `entity` statement inside a ThingTalk class.
 *
 */
export class EntityDef extends Node {
    isEntityDef = true;
    /**
     * The entity name.
     */
    name : string;
    extends : string[];
    /**
     * The entity metadata (translatable annotations).
     */
    nl_annotations : NLAnnotationMap;
    /**
     * The entity annotations.
     */
    impl_annotations : AnnotationMap;

    /**
     * Construct a new entity declaration.
     *
     * @param location - the position of this node in the source code
     * @param name - the entity name (the part after the ':')
     * @param extends - the parent entity type, if any (this can be a fully qualified name with ':', or just the part after ':')
     * @param annotations - annotations of the entity type
     * @param [annotations.nl={}] - natural-language annotations (translatable annotations)
     * @param [annotations.impl={}] - implementation annotations
     */
    constructor(location : SourceRange|null,
                name : string,
                _extends : string[]|string|null,
                annotations : AnnotationSpec) {
        super(location);
        this.name = name;

        _extends = typeof _extends === 'string' ? [_extends] : _extends;
        this.extends = _extends || [];

        this.nl_annotations = annotations.nl || {};
        this.impl_annotations = annotations.impl || {};
    }

    toSource() : TokenStream {
        if (this.extends.length > 0) {
            const _extends = this.extends.map((e) => e.includes(':') ? `^^${e}` : e);
            return List.concat('entity', ' ', this.name,
                'extends', List.join(_extends.map((e) => List.singleton(e)), ','), '\t+',
                nlAnnotationsToSource(this.nl_annotations),
                implAnnotationsToSource(this.impl_annotations),
                '\t-', ';');
        } else {
            return List.concat('entity', ' ', this.name, '\t+',
                nlAnnotationsToSource(this.nl_annotations),
                implAnnotationsToSource(this.impl_annotations),
                '\t-', ';');
        }
    }

    /**
     * Clone this entity and return a new object with the same properties.
     *
     * @return the new instance
     */
    clone() : EntityDef {
        const nl : NLAnnotationMap = {};
        Object.assign(nl, this.nl_annotations);
        const impl : AnnotationMap = {};
        Object.assign(impl, this.impl_annotations);

        return new EntityDef(this.location, this.name, this.extends, { nl, impl });
    }

    /**
     * Read and normalize an implementation annotation from this entity definition.
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
     * Read a natural-language annotation from this entity definition.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation value, or `undefined` if the
     *         annotation is not present
     */
    getNaturalLanguageAnnotation(name : string) : any|undefined {
        if (Object.prototype.hasOwnProperty.call(this.nl_annotations, name))
            return this.nl_annotations[name];
        else
            return undefined;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitEntityDef(this);
        visitor.exit(this);
    }
}
