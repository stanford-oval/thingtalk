// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Type = require('./type');
const Grammar = require('./grammar_api');
const { typeCheckClass } = require('./typecheck');
const { ClassDef } = require('./ast/class_def');
const Ast = require('./ast/function_def');

function delay(timeout) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, timeout);
    });
}

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

module.exports = class SchemaRetriever {
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
            false: new Map,
            true: new Map
        };

        this._thingpediaClient = tpClient;
        this._memoryClient = mClient || new DummyMemoryClient();
        this._silent = !!silent;
    }

    removeFromCache(kind) {
        this._classCache[false].delete(kind);
        this._classCache[true].delete(kind);
        this._manifestCache.delete(kind);
    }
    clearCache() {
        this._classCache[false].clear();
        this._classCache[true].clear();
        this._manifestCache.clear();
    }

    injectManifest(kind, manifest) {
        const classDef = ClassDef.fromManifest(kind, manifest);
        this.injectClass(classDef);
    }
    injectClass(classDef) {
        this._classCache[false].set(classDef.kind, classDef);
        this._classCache[true].set(classDef.kind, classDef);
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
        else
            throw new TypeError(`Class ${kind} has no query ${query}`);
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

        await Promise.all(parsed.classes.map(async (classDef) => {
            try {
                await typeCheckClass(classDef, this, true);
                this._classCache[isMeta].set(classDef.kind, classDef);
                result[classDef.kind] = classDef;
            } catch(e) {
                result[classDef.kind] = e;
            }
        }));
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
        if (this._classCache[useMeta].has(kind))
            return this._classCache[useMeta].get(kind);

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

    getFullSchema(kind) {
        return this._getClass(kind, false);
    }
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
    async getSchema(kind, where, name) {
        return (await this.getSchemaAndNames(kind, where, name)).types;
    }

    async _getFunction(kind, functionType, name, useMeta) {
        const where = this._where(functionType);
        const classDef = await this._getClass(kind, useMeta);
        if (!(name in classDef[where]))
            throw new TypeError(`Class ${kind} has no ${functionType} ${name}`);
        return classDef[where][name];
    }

    getSchemaAndNames(kind, functionType, name) {
        return this._getFunction(kind, functionType, name, false);
    }
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
            args.push(new Ast.ArgumentDef(Ast.ArgDirection.OUT, argnames[i], Type.fromString(types[i]), {}, {}));

        return new Ast.FunctionDef('query', table, args,
                                   true /* is list */,
                                   true /* is monitorable */,
                                   {} /* metadata */,
                                   {} /* annotations */);
    }


    async getMixins(kind) {
        const mixins = await this._thingpediaClient.getMixins();
        if (!(kind in mixins))
            throw new TypeError("Mixin " + kind + " not found.");
        const resolved = mixins[kind];
        resolved.types = resolved.types.map(Type.fromString);
        return resolved;
    }
};
