// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
"use strict";

const assert = require('assert');

const Type = require('./type');
const Grammar = require('./grammar_api');
const { typeCheckClass } = require('./typecheck');
const Ast = require('./ast/function_def');

const Cache = require('./cache');

function delay(timeout) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, timeout);
    });
}

/**
 * A delegate object to access tables stored in long-term assistant memory.
 *
 * @name MemoryClient
 * @interface
 * @deprecated Long-term memory support in Almond is still experimental and APIs will change
 */
/**
 * Retrieve the type information of a stored table
 *
 * @name MemoryClient#getSchema
 * @method
 * @param {string} table - the name of the table to retrieve
 * @return {Object}
 */

/**
 * The abstract interface to access Thingpedia.
 *
 * This is the minimal interface needed by the ThingTalk library. It is usally
 * implemented by the Thingpedia SDK.
 *
 * @name AbstractThingpediaClient
 * @interface
 */
/**
 * Retrieve the full code of a Thingpedia class.
 *
 * @name AbstractThingpediaClient#getDeviceCode
 * @method
 * @param {string} kind - the Thingpedia class identifier
 * @return {string} - the raw code of the class
 * @async
 * @abstract
 */
/**
 * Retrieve type and metadata information for one or more Thingpedia classes.
 *
 * @name AbstractThingpediaClient#getSchema
 * @method
 * @param {string[]} kinds - the Thingpedia class identifiers to retrieve
 * @param {boolean} getMeta - whether to retrieve metadata or not
 * @return {string} - the retrieved type information, as ThingTalk classes
 * @async
 * @abstract
 */

class DummyMemoryClient {
    constructor() {
        this._tables = new Map;
    }

    getSchema(table) {
        return Promise.resolve(this._tables.get(table) || null);
    }

    createTable(table, args, types) {
        this._tables.set(table, { args: args, types: types });
        return Promise.resolve();
    }
}

/**
 * Delegate object to retrieve type information and metadata from Thingpedia.
 *
 * This class wraps an {@link AbstractThingpediaClient} and provides batching, in-memory
 * caching, and parsing.
 */
class SchemaRetriever {
    /**
     * Construct a new schema retriever.
     *
     * @param {AbstractThingpediaClient} tpClient - the Thingpedia client interface to wrap
     * @param {MemoryClient} [mClient] - the client interface to access stored tables
     * @param {boolean} [silent=false] - whether debugging information should be printed
     */
    constructor(tpClient, mClient, silent) {
        this._manifestCache = new Map;

        // each of the following exists for schema (types only)
        // and metadata (types and NL annotations)
        // keyed by isMeta/useMeta
        this._currentRequest = {
            false: null,
            true: null
        };
        this._pendingRequests = {
            false: [],
            true: []
        };
        this._classCache = {
            // expire class caches in 24 hours (same as on-disk thingpedia caches)
            false: new Cache(24 * 3600 * 1000),
            true: new Cache(24 * 3600 * 1000)
        };

        this._thingpediaClient = tpClient;
        this._memoryClient = mClient || new DummyMemoryClient();
        this._silent = !!silent;
    }

    /**
     * Remove all information related to the given Thingpedia class from the cache.
     *
     * @param {string} kind - the class identifier
     */
    removeFromCache(kind) {
        this._classCache[false].delete(kind);
        this._classCache[true].delete(kind);
        this._manifestCache.delete(kind);
    }
    /**
     * Remove all information from all caches.
     */
    clearCache() {
        this._classCache[false].clear();
        this._classCache[true].clear();
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
    injectClass(classDef) {
        // never expire explicitly injected class
        this._classCache[false].set(classDef.kind, classDef, -1);
        this._classCache[true].set(classDef.kind, classDef, -1);
        this._manifestCache.set(classDef.kind, classDef);
    }

    async _getManifestRequest(kind) {
        const code = await this._thingpediaClient.getDeviceCode(kind);
        const parsed = await Grammar.parseAndTypecheck(code, this);
        assert(parsed.isMeta && parsed.classes.length > 0);
        return parsed.classes[0];
    }

    _getManifest(kind) {
        if (this._manifestCache.has(kind))
            return Promise.resolve(this._manifestCache.get(kind));

        let request = this._getManifestRequest(kind);
        this._manifestCache.set(kind, request);
        return request;
    }

    async getFormatMetadata(kind, query) {
        const classDef = await this._getManifest(kind);
        if (classDef.queries[query])
            return classDef.queries[query].metadata.formatted || [];
        return [];
    }

    async _makeRequest(isMeta) {
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
        const code = await this._thingpediaClient.getSchemas(pending, isMeta);

        const parsed = Grammar.parse(code);
        const result = {};
        if (!parsed)
            return result;

        const missing = new Set(pending);

        await Promise.all(parsed.classes.map(async (classDef) => {
            try {
                await typeCheckClass(classDef, this, {}, isMeta, true);
                this._classCache[isMeta].set(classDef.kind, classDef);
                result[classDef.kind] = classDef;
                missing.delete(classDef.kind);
            } catch(e) {
                result[classDef.kind] = e;
            }
        }));
        // add negative cache entry (with small 10 minute timeout) for the missing class
        for (let kind of missing) {
            // we add it for both with & without metadata (if the class doesn't exist it doesn't exist)
            this._classCache[true].set(kind, null, 600 * 1000);
            this._classCache[false].set(kind, null, 600 * 1000);
        }

        return result;
    }
    _ensureRequest(isMeta) {
        if (this._currentRequest[isMeta] !== null)
            return;
        this._currentRequest[isMeta] = this._makeRequest(isMeta);
    }

    async _getClass(kind, useMeta) {
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
        const everything = await this._currentRequest[useMeta];

        if (kind in everything) {
            if (everything[kind] instanceof Error)
                throw everything[kind];
            else
                return everything[kind];
        } else {
            throw new TypeError('Invalid kind ' + kind);
        }
    }

    /**
     * Return the full type information of the passed in class.
     *
     * @param {string} kind - the class identifier
     * @return {Ast.ClassDef} the corresponding class
     * @async
     */
    getFullSchema(kind) {
        return this._getClass(kind, false);
    }
    /**
     * Return the full type information and metadata of the passed in class.
     *
     * @param {string} kind - the class identifier
     * @return {Ast.ClassDef} the corresponding class, including metadata
     * @async
     */
    getFullMeta(kind) {
        return this._getClass(kind, true);
    }

    _where(where) {
        switch (where) {
            case 'query': return 'queries';
            case 'action': return 'actions';
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
     * @deprecated Use {@link SchemaRetriever#getSchemaAndNames} instead
     * @async
     */
    async getSchema(kind, functionType, name) {
        return (await this.getSchemaAndNames(kind, functionType, name)).types;
    }

    async _getFunction(kind, functionType, name, useMeta) {
        const where = this._where(functionType);
        const classDef = await this._getClass(kind, useMeta);
        if (!(name in classDef[where]))
            throw new TypeError(`Class ${kind} has no ${functionType} ${name}`);
        const fndef = classDef[where][name];
        return fndef;
    }

    /**
     * Return the type information of the given function.
     *
     * This method returns the minimal amount of information necessary to typecheck
     * a program, but not enough to drive the dialog agent.
     * This method is preferred to {@link SchemaRetriever#getMeta} when metadata
     * is not needed, because it reduces the load on the server (which can skip the
     * localization step) and reduces the amount of transferred data.
     *
     * @param {string} kind - the class identifier
     * @param {string} functionType - the type of function (either `query` or `action`)
     * @param {string} name - the function name
     * @return {Ast.FunctionDef} the function definition
     * @async
     */
    getSchemaAndNames(kind, functionType, name) {
        return this._getFunction(kind, functionType, name, false);
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
     * @async
     */
    getMeta(kind, functionType, name) {
        return this._getFunction(kind, functionType, name, true);
    }

    async getMemorySchema(table, getMeta = false) {
        const resolved = await this._memoryClient.getSchema(table, null);
        if (!resolved)
            throw new TypeError(`No such table ${table}`);
        const {args:argnames, types} = resolved;

        const args = [];
        for (let i = 0; i < types.length; i++)
            args.push(new Ast.ArgumentDef(null, Ast.ArgDirection.OUT, argnames[i], Type.fromString(types[i]), {}, {}));

        const functionDef = new Ast.FunctionDef(null, 'query',
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

    async getMixins(kind) {
        const mixins = await this._thingpediaClient.getMixins();
        if (!(kind in mixins))
            throw new TypeError("Mixin " + kind + " not found.");
        const resolved = mixins[kind];
        resolved.types = resolved.types.map(Type.fromString);
        return resolved;
    }
}
module.exports = SchemaRetriever; 
