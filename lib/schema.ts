// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
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

import Type from './type';
import * as Grammar from './syntax_api';
import TypeChecker from './typecheck';
import { ClassDef } from './ast/class_def';
import {
    FunctionDef,
    ArgumentDef,
    ArgDirection
} from './ast/function_def';
import { Library } from './ast/program';
import { Dataset, Example } from './ast/statement';

import Cache from './utils/cache';

function delay(timeout : number) : Promise<void> {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, timeout);
    });
}

interface MemoryTable {
    args : string[];
    types : Type[];
}

interface TpMixinDeclaration {
    kind : string;
    types : string[];
    args : string[];
    required : boolean[];
    is_input : boolean[];
    facets : string[];
}
interface MixinDeclaration {
    kind : string;
    types : Type[];
    args : string[];
    required : boolean[];
    is_input : boolean[];
    facets : string[];
}

/**
 * A delegate object to access tables stored in long-term assistant memory.
 *
 * @deprecated Long-term memory support in Almond is still experimental and APIs will change
 */
export interface MemoryClient {
    /**
     * Retrieve the type information of a stored table
     *
     * @param {string} table - the name of the table to retrieve
     * @return {Object}
     */
    getSchema(table : string, principal : string|null) : Promise<MemoryTable|null>;
}

interface EntityTypeRecord {
    type : string;
    is_well_known : boolean|number;
    has_ner_support : boolean|number;

    // this can be both null and undefined because we don't want it to be
    // missing/undefined (undefined would be missing when through JSON),
    // but we have to account for legacy implementations of the API where
    // it is in fact missing
    subtype_of ?: string[]|null;
}

/**
 * The abstract interface to access Thingpedia.
 *
 * This is the minimal interface needed by the ThingTalk library. It is usally
 * implemented by the Thingpedia SDK.
 */
export interface AbstractThingpediaClient {
    get locale() : string;

    /**
     * Retrieve the full code of a Thingpedia class.
     *
     * @param {string} kind - the Thingpedia class identifier
     * @return {string} - the raw code of the class
     */
    getDeviceCode(kind : string) : Promise<string>;

    /**
     * Retrieve type and metadata information for one or more Thingpedia classes.
     *
     * @param {string[]} kinds - the Thingpedia class identifiers to retrieve
     * @param {boolean} getMeta - whether to retrieve metadata or not
     * @return {string} - the retrieved type information, as ThingTalk classes
     */
    getSchemas(kinds : string[], getMeta : boolean) : Promise<string>;

    getMixins() : Promise<{ [key : string] : TpMixinDeclaration }>;

    /**
     * Retrieve the {@link Ast.Dataset} associated with one or more Thingpedia classes.
     *
     * @param {string[]} kinds - the Thingpedia class identifiers to retrieve
     */
    getExamplesByKinds(kinds : string[]) : Promise<string>;

    /**
     * Retrieve the list of all entity types declared in Thingpedia.
     */
    getAllEntityTypes() : Promise<EntityTypeRecord[]>;
}

class DummyMemoryClient {
    _tables : Map<string, MemoryTable>

    constructor() {
        this._tables = new Map;
    }

    getSchema(table : string, principal : string|null) : Promise<MemoryTable|null> {
        return Promise.resolve(this._tables.get(table) || null);
    }

    createTable(table : string, args : string[], types : Type[]) : Promise<void> {
        this._tables.set(table, { args: args, types: types });
        return Promise.resolve();
    }
}

type MetadataLevel = 'basic' | 'everything';

type ClassMap = { [key : string] : ClassDef|Error };
type DatasetMap = { [key : string] : Dataset|Error };

/**
 * Delegate object to retrieve type information and metadata from Thingpedia.
 *
 * This class wraps an {@link AbstractThingpediaClient} and provides batching, in-memory
 * caching, and parsing.
 */
export default class SchemaRetriever {
    private _manifestCache : Map<string, Promise<ClassDef>>;
    private _currentRequest : {
        basic : Promise<ClassMap>|null;
        everything : Promise<ClassMap>|null;
        dataset : Promise<DatasetMap>|null;
    };
    private _pendingRequests : {
        basic : string[];
        everything : string[];
        dataset : string[];
    };
    private _classCache : {
        basic : Cache<string, ClassDef|null>;
        everything : Cache<string, ClassDef|null>;
        dataset : Cache<string, Dataset>;
    };
    private _entityTypeCache : Cache<string, EntityTypeRecord>;

    private _thingpediaClient : AbstractThingpediaClient;
    private _memoryClient : MemoryClient;
    private _silent : boolean;

    /**
     * Construct a new schema retriever.
     *
     * @param {AbstractThingpediaClient} tpClient - the Thingpedia client interface to wrap
     * @param {MemoryClient} [mClient] - the client interface to access stored tables
     * @param {boolean} [silent=false] - whether debugging information should be printed
     */
    constructor(tpClient : AbstractThingpediaClient,
                mClient ?: MemoryClient|null,
                silent = false) {
        this._manifestCache = new Map;

        // each of the following exists for schema (types only)
        // and metadata (types and NL annotations)
        // keyed by isMeta/useMeta
        this._currentRequest = {
            basic: null,
            everything: null,
            dataset: null,
        };
        this._pendingRequests = {
            basic: [],
            everything: [],
            dataset: [],
        };
        this._classCache = {
            // expire caches in 24 hours (same as on-disk thingpedia caches)
            basic: new Cache(24 * 3600 * 1000),
            everything: new Cache(24 * 3600 * 1000),
            dataset: new Cache(24 * 3600 * 1000)
        };
        this._entityTypeCache = new Cache(24 * 3600 * 1000);

        this._thingpediaClient = tpClient;
        this._memoryClient = mClient || new DummyMemoryClient();
        this._silent = !!silent;
    }

    /**
     * Remove all information related to the given Thingpedia class from the cache.
     *
     * @param {string} kind - the class identifier
     */
    removeFromCache(kind : string) : void {
        this._classCache.basic.delete(kind);
        this._classCache.everything.delete(kind);
        this._manifestCache.delete(kind);
    }
    /**
     * Remove all information from all caches.
     */
    clearCache() : void {
        this._classCache.basic.clear();
        this._classCache.everything.clear();
        this._manifestCache.clear();
    }

    /**
     * Override cached type information with the passed in class.
     *
     * This can be used to ensure the schema retriever is consistent with other
     * cached information (for example, on disk caching of device implementation).
     *
     * @param {Ast.ClassDef} classDef - class definition to inject
     */
    injectClass(classDef : ClassDef) : void {
        // never expire explicitly injected class
        this._classCache.basic.set(classDef.kind, classDef, -1);
        this._classCache.everything.set(classDef.kind, classDef, -1);
        this._manifestCache.set(classDef.kind, Promise.resolve(classDef));
    }

    private async _getManifestRequest(kind : string) {
        const code = await this._thingpediaClient.getDeviceCode(kind);
        const parsed = await Grammar.parse(code, Grammar.SyntaxType.Normal, { locale: this._thingpediaClient.locale, timezone: undefined }).typecheck(this);
        assert(parsed instanceof Library && parsed.classes.length > 0);
        return parsed.classes[0];
    }

    private _getManifest(kind : string) : Promise<ClassDef> {
        if (this._manifestCache.has(kind))
            return Promise.resolve(this._manifestCache.get(kind)!);

        const request = this._getManifestRequest(kind);
        this._manifestCache.set(kind, request);
        return request;
    }

    async getFormatMetadata(kind : string, query : string) : Promise<unknown[]> {
        const classDef = await this._getManifest(kind);
        if (classDef.queries[query])
            return (classDef.queries[query].metadata.formatted as unknown[]) || [];
        return [];
    }

    private async _makeRequest(isMeta : MetadataLevel) : Promise<ClassMap> {
        // delay the actual request so that further requests
        // in the same event loop iteration will be batched
        // toghether
        // batching is important because otherwise we can
        // make a lot of tiny HTTP requests at the same time
        // and kill the Thingpedia server just out of overhead
        await delay(0);

        const pending = this._pendingRequests[isMeta];
        this._pendingRequests[isMeta] = [];
        this._currentRequest[isMeta] = null;
        if (pending.length === 0)
            return {};
        if (!this._silent)
            console.log(`Batched ${isMeta ? 'schema-meta' : 'schema'} request for ${pending}`);
        const code = await this._thingpediaClient.getSchemas(pending, isMeta === 'everything');

        if (code.trim() === '') {
            // empty reply, this means none of the requested classes was found
            // add negative cache entry (with small 10 minute timeout) for the missing class
            for (const kind of pending) {
                // we add it for both with & without metadata (if the class doesn't exist it doesn't exist)
                this._classCache.basic.set(kind, null, 600 * 1000);
                this._classCache.everything.set(kind, null, 600 * 1000);
            }
            return {};
        }

        const parsed = Grammar.parse(code, Grammar.SyntaxType.Normal, { locale: this._thingpediaClient.locale, timezone: undefined }) as Library;
        const result : ClassMap = {};
        const missing = new Set<string>(pending);

        await Promise.all(parsed.classes.map(async (classDef) => {
            try {
                const typeChecker = new TypeChecker(this, isMeta === 'everything');
                await typeChecker.typeCheckClass(classDef, true);
                this._classCache[isMeta].set(classDef.kind, classDef);
                result[classDef.kind] = classDef;
                missing.delete(classDef.kind);
            } catch(e) {
                result[classDef.kind] = e;
            }
        }));
        // add negative cache entry (with small 10 minute timeout) for the missing class
        for (const kind of missing) {
            // we add it for both with & without metadata (if the class doesn't exist it doesn't exist)
            this._classCache.basic.set(kind, null, 600 * 1000);
            this._classCache.everything.set(kind, null, 600 * 1000);
        }

        return result;
    }

    private _ensureRequest(isMeta : MetadataLevel) : void {
        if (this._currentRequest[isMeta] !== null)
            return;
        this._currentRequest[isMeta] = this._makeRequest(isMeta);
    }

    private async _getClass(kind : string, useMeta : MetadataLevel) : Promise<ClassDef> {
        if (typeof kind !== 'string')
            throw new TypeError();
        const cached = this._classCache[useMeta].get(kind);
        if (cached !== undefined) {
            if (cached === null) // negative cache
                throw new TypeError('Invalid kind ' + kind);
            return cached;
        }

        if (this._pendingRequests[useMeta].indexOf(kind) < 0)
            this._pendingRequests[useMeta].push(kind);
        this._ensureRequest(useMeta);
        const everything = await this._currentRequest[useMeta]!;

        if (kind in everything) {
            const result = everything[kind];
            if (result instanceof Error)
                throw result;
            else
                return result;
        } else {
            throw new TypeError('Invalid kind ' + kind);
        }
    }

    /**
     * Return the full type information of the passed in class.
     *
     * @param {string} kind - the class identifier
     * @return {Ast.ClassDef} the corresponding class
     */
    getFullSchema(kind : string) : Promise<ClassDef> {
        return this._getClass(kind, 'everything');
    }
    /**
     * Return the full type information and metadata of the passed in class.
     *
     * @param {string} kind - the class identifier
     * @return {Ast.ClassDef} the corresponding class, including metadata
     */
    getFullMeta(kind : string) : Promise<ClassDef> {
        return this._getClass(kind, 'everything');
    }

    _where(where : 'query' | 'action' | 'both') : ('queries'|'actions'|'both') {
        switch (where) {
        case 'query': return 'queries';
        case 'action': return 'actions';
        case 'both': return 'both';
        default: throw new TypeError('unexpected function type ' + where);
        }
    }

    // FIXME: this function exists for compatibility with
    // some really old code in almond-cloud (IIRC)
    // investigate if it can be removed

    /**
     * Return the type signature of the given function.
     *
     * This method is deprecated because it returns the types without the
     * argument names, directions and annotations.
     *
     * @param {string} kind - the class identifier
     * @param {string} functionType - the type of function (either `query` or `action`)
     * @param {string} name - the function name
     * @return {Type[]} the list of types in the signature
     * @deprecated Use {@link SchemaRetriever.getSchemaAndNames} instead
     */
    async getSchema(kind : string,
                    functionType : 'query' | 'action' | 'both',
                    name : string) : Promise<Type[]> {
        return (await this.getSchemaAndNames(kind, functionType, name)).types;
    }

    private async _getFunction(kind : string,
                               functionType : 'query' | 'action' | 'both',
                               name : string,
                               useMeta : MetadataLevel) : Promise<FunctionDef> {
        const where = this._where(functionType);
        const classDef = await this._getClass(kind, useMeta);

        if (where === 'both') {
            if (!(name in classDef.queries) && !(name in classDef.actions))
                throw new TypeError(`Class ${kind} has no function ${name}`);
            return classDef.queries[name] || classDef.actions[name];
        } else {
            if (!(name in classDef[where]))
                throw new TypeError(`Class ${kind} has no ${functionType} ${name}`);
            return classDef[where][name];
        }
    }

    /**
     * Return the type information of the given function.
     *
     * This method returns the minimal amount of information necessary to typecheck
     * a program, but not enough to drive the dialog agent.
     * This method is preferred to {@link SchemaRetriever.getMeta} when metadata
     * is not needed, because it reduces the load on the server (which can skip the
     * localization step) and reduces the amount of transferred data.
     *
     * @param {string} kind - the class identifier
     * @param {string} functionType - the type of function (either `query` or `action`)
     * @param {string} name - the function name
     * @return {Ast.FunctionDef} the function definition
     */
    getSchemaAndNames(kind : string,
                      functionType : 'query' | 'action' | 'both',
                      name : string) : Promise<FunctionDef> {
        return this._getFunction(kind, functionType, name, 'basic');
    }

    /**
     * Return the type information and metadata of the given function.
     *
     * This method returns the full amount of information necessary to typecheck
     * and drive the dialog agent, but might not include implementation only information
     * (such as loader or configuration mixins).
     *
     * @param {string} kind - the class identifier
     * @param {string} functionType - the type of function (either `query` or `action`)
     * @param {string} name - the function name
     * @return {Ast.FunctionDef} the function definition
     */
    getMeta(kind : string,
            functionType : 'query' | 'action' | 'both',
            name : string) : Promise<FunctionDef> {
        return this._getFunction(kind, functionType, name, 'everything');
    }

    async getMemorySchema(table : string, getMeta = false) : Promise<FunctionDef> {
        const resolved = await this._memoryClient.getSchema(table, null);
        if (!resolved)
            throw new TypeError(`No such table ${table}`);
        const { args:argnames, types } = resolved;

        const args : ArgumentDef[] = [];
        for (let i = 0; i < types.length; i++)
            args.push(new ArgumentDef(null, ArgDirection.OUT, argnames[i], Type.fromString(types[i])));

        const functionDef = new FunctionDef(null, 'query',
            null,
            table,
            [],
            { is_list: true, is_monitorable: true },
            args,
            {});
        // complete initialization of the function
        functionDef.setClass(null);
        assert(functionDef.minimal_projection);
        return functionDef;
    }

    async getMixins(kind : string) : Promise<MixinDeclaration> {
        const mixins = await this._thingpediaClient.getMixins();
        if (!(kind in mixins))
            throw new TypeError("Mixin " + kind + " not found.");
        const resolved = mixins[kind];

        const parsed : MixinDeclaration = {
            kind: resolved.kind,
            types: resolved.types.map(Type.fromString),
            args: resolved.args,
            required: resolved.required,
            is_input: resolved.is_input,
            facets: resolved.facets
        };
        return parsed;
    }

    private async _makeDatasetRequest() : Promise<DatasetMap> {
        // delay the actual request so that further requests
        // in the same event loop iteration will be batched
        // toghether
        // batching is important because otherwise we can
        // make a lot of tiny HTTP requests at the same time
        // and kill the Thingpedia server just out of overhead
        await delay(0);

        const pending = this._pendingRequests.dataset;
        this._pendingRequests.dataset = [];
        this._currentRequest.dataset = null;
        if (pending.length === 0)
            return {};
        if (!this._silent)
            console.log(`Batched dataset request for ${pending}`);
        const code = await this._thingpediaClient.getExamplesByKinds(pending);

        const result : DatasetMap = {};
        if (code.trim() === '') {
            // empty reply, this means none of the requested classes was found,
            // or all the datasets are empty

            for (const kind of pending)
                this._classCache.dataset.set(kind, result[kind] = new Dataset(null, kind, []));
        } else {
            const parsed = Grammar.parse(code, Grammar.SyntaxType.Normal, { locale: this._thingpediaClient.locale, timezone: undefined }) as Library;

            const examples = new Map<string, Example[]>();

            // flatten all examples in all datasets, and then split again by device
            // this is to account for the HTTP API (which returns one dataset),
            // developer mode (which returns one per device) and file client,
            // which returns one or more depending on the content of the files
            // on disk
            for (const dataset of parsed.datasets) {
                for (const example of dataset.examples) {
                    // typecheck each example individually, and ignore those that do not
                    // typecheck
                    // this can occur if the dataset we retrieved from Thingpedia is newer
                    // than the cached manifest and includes new functions or a parameter change
                    try {
                        await example.typecheck(this, true);
                    } catch(e) {
                        console.log(`Failed to load dataset example ${example.id}: ${e.message}`);
                        continue;
                    }

                    const devices = new Set<string>();
                    for (const [, prim] of example.iteratePrimitives(false))
                        devices.add(prim.selector.kind);
                    for (const device of devices) {
                        const list = examples.get(device);
                        if (list)
                            list.push(example);
                        else
                            examples.set(device, [example]);
                    }
                }
            }

            for (const kind of pending) {
                const dataset = new Dataset(null, kind, examples.get(kind) || []);
                this._classCache.dataset.set(kind, result[kind] = dataset);
            }
        }

        return result;
    }

    private _ensureDatasetRequest() : void {
        if (this._currentRequest.dataset !== null)
            return;
        this._currentRequest.dataset = this._makeDatasetRequest();
    }

    async getExamplesByKind(kind : string) : Promise<Dataset> {
        if (typeof kind !== 'string')
            throw new TypeError();
        const cached = this._classCache.dataset.get(kind);
        if (cached !== undefined)
            return cached;

        if (this._pendingRequests.dataset.indexOf(kind) < 0)
            this._pendingRequests.dataset.push(kind);
        this._ensureDatasetRequest();
        const everything = await this._currentRequest.dataset!;

        const result = everything[kind];
        assert(result);
        if (result instanceof Error)
            throw result;
        else
            return result;
    }

    private async _getEntityTypeRecord(entityType : string) : Promise<EntityTypeRecord> {
        const cached = this._entityTypeCache.get(entityType);
        if (cached)
            return cached;

        // first try loading the class and looking for a declaration there
        // this is to support development of Thingpedia skills without editing
        // entities.json
        const [kind, name] = entityType.split(':');
        if (kind !== 'tt') {
            try {
                const classDef = await this._getClass(kind, 'everything');
                let found = null;
                for (const entity of classDef.entities) {
                    // load all the entities from this class, not just the one
                    // we're retrieving, otherwise we'll fallback to entities.json
                    // for all the entities, and be sad that entity records are
                    // wrong

                    const entityType = classDef.kind + ':' + entity.name;
                    const hasNer = entity.getImplementationAnnotation<boolean>('has_ner');
                    const subTypeOf = entity.extends.map((e) => e.includes(':') ? e : classDef.kind + ':' + e);
                    const newRecord : EntityTypeRecord = {
                        type: entityType,
                        is_well_known: false,
                        has_ner_support: hasNer === undefined ? true : hasNer,
                        subtype_of : subTypeOf
                    };
                    this._entityTypeCache.set(entityType, newRecord);

                    if (entity.name === name)
                        found = newRecord; // keep going to more entities
                }

                if (found)
                    return found;
            } catch(e) {
                // ignore if there is no class with that name
            }
        }

        // then look up in thingpedia
        const allEntities = await this._thingpediaClient.getAllEntityTypes();
        let found = null;
        for (const record of allEntities) {
            // to support development of thingpedia skills, we don't want
            // entities.json to override actual classes, so we can't put
            // things in the cache unless we're sure about them
            // so we only put in the cache all the tt: entities (which
            // don't belong to any class) and the one entity we're looking for
            // this is a bit wasteful in that it results in multiple queries
            // to Thingpedia
            // we should change this back once Thingpedia actually knows
            // about entity subtyping

            if (record.type === entityType || record.type.startsWith('tt:'))
                this._entityTypeCache.set(record.type, record);
            if (record.type === entityType)
                found = record;
        }
        if (found)
            return found;

        // finally, make up a record with default info
        const newRecord : EntityTypeRecord = {
            type: entityType,
            is_well_known: false,
            has_ner_support: false
        };
        this._entityTypeCache.set(entityType, newRecord);
        return newRecord;
    }

    async getEntityParents(entityType : string) : Promise<string[]> {
        const record = await this._getEntityTypeRecord(entityType);
        return record.subtype_of || [];
    }
}
