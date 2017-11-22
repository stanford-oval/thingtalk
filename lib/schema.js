// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const Type = require('./type');

class DummyMemoryClient {
    constructor() {
        this._tables = new Map;
    }

    getSchema(table) {
        return Q(this._tables.get(table) || null);
    }

    createTable(table, args, types) {
        this._tables.set(table, { args: args, types: types });
        return Q();
    }
}

module.exports = class SchemaRetriever {
    constructor(tpClient, mClient, silent) {
        this._schemaRequest = null;
        this._pendingSchemaRequests = [];
        this._metaRequest = null;
        this._pendingMetaRequests = [];
        this._cache = {};
        this._metaCache = {};
        this._appCache = {};

        this._thingpediaClient = tpClient;
        this._memoryClient = mClient || new DummyMemoryClient();
        this._silent = !!silent;
    }

    getAppCode(appId) {
        if (this._appCache[appId])
            return this._appCache[appId];

        return this._appCache[appId] = this._thingpediaClient.getAppCode(appId);
    }

    _ensureSchemaRequest() {
        if (this._schemaRequest !== null)
            return;

        this._schemaRequest = Q.delay(0).then(() => {
            var pending = this._pendingSchemaRequests;
            this._pendingSchemaRequests = [];
            this._schemaRequest = null;
            if (pending.length === 0)
                return {};
            if (!this._silent)
                console.log('Batched schema request for ' + pending);
            return this._thingpediaClient.getSchemas(pending, 2);
        }).then((resolved) => {
            for (var kind in resolved) {
                this._parseSchemaTypes(resolved[kind], resolved[kind].triggers);
                this._parseSchemaTypes(resolved[kind], resolved[kind].actions);
                this._parseSchemaTypes(resolved[kind], resolved[kind].queries);
                this._cache[kind] = resolved[kind];
            }
            return resolved;
        });
    }

    _parseSchemaTypes(schema, channels) {
        for (var name in channels) {
            channels[name].kind_type = schema.kind_type;
            channels[name].types = channels[name].types.map(Type.fromString);
        }
    }

    _parseMetaTypes(schema, channels) {
        for (var name in channels) {
            channels[name].kind_type = schema.kind_type;
            channels[name].schema = channels[name].schema.map(Type.fromString);
        }
    }

    _getFullSchema(kind) {
        if (typeof kind !== 'string')
            throw new TypeError();
        if (kind in this._cache)
            return Q(this._cache[kind]);

        if (this._pendingSchemaRequests.indexOf(kind) < 0)
            this._pendingSchemaRequests.push(kind);
        this._ensureSchemaRequest();
        return this._schemaRequest.then((everything) => {
            if (kind in everything)
                return everything[kind];
            else
                throw new Error('Invalid kind ' + kind);
        });
    }

    _ensureMetaRequest() {
        if (this._metaRequest !== null)
            return;

        this._metaRequest = Q.delay(0).then(() => {
            var pending = this._pendingMetaRequests;
            this._pendingMetaRequests = [];
            this._metaRequest = null;
            if (!this._silent)
                console.log('Batched schema-meta request for ' + pending);
            return this._thingpediaClient.getMetas(pending);
        }).then((resolved) => {
            for (var kind in resolved) {
                this._parseMetaTypes(resolved[kind], resolved[kind].triggers);
                this._parseMetaTypes(resolved[kind], resolved[kind].actions);
                this._parseMetaTypes(resolved[kind], resolved[kind].queries);
                this._metaCache[kind] = resolved[kind];
            }
            return resolved;
        });
    }

    _where(where) {
        switch (where) {
            case 'query': return 'queries';
            case 'action': return 'actions';
            case 'trigger': return 'triggers';
            default: return where;
        }
    }

    getFullMeta(kind) {
        if (typeof kind !== 'string')
            throw new TypeError();
        if (kind in this._metaCache)
            return Q(this._metaCache[kind]);

        if (this._pendingMetaRequests.indexOf(kind) < 0)
            this._pendingMetaRequests.push(kind);
        this._ensureMetaRequest();
        return this._metaRequest.then((everything) => {
            if (kind in everything)
                return everything[kind];
            else
                throw new Error('Invalid kind ' + kind);
        });
    }

    getSchema(kind, where, name) {
        where = this._where(where);
        return this._getFullSchema(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name].types;
        });
    }

    getSchemaAndNames(kind, where, name) {
        where = this._where(where);
        return this._getFullSchema(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name];
        });
    }

    getMeta(kind, where, name) {
        where = this._where(where);
        return this.getFullMeta(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name];
        });
    }

    getMetaByChannel(channel) {
        let kind = channel.device.kind;
        let where = channel.channelType;
        let name = channel.name;
        return this.getMeta(kind, where, name);
    }

    getSchemaByChannel(channel) {
        let kind = channel.device.kind;
        let where = channel.channelType;
        let name = channel.name;
        return this.getSchema(kind, where, name);
    }

    getMemorySchema(table, principal, getMeta = false) {
        return this._memoryClient.getSchema(table, principal);
    }

    createMemorySchema(table, args, types) {
        return this._memoryClient.createTable(table, args, types);
    }
};
