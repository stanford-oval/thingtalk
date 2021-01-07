// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as Grammar from '../lib/syntax_api';
import Mixins from './mixins.json';
import * as fs from 'fs';
import * as util from 'util';

function uniform(array, rng = Math.random) {
    return array[Math.floor(rng() * array.length)];
}

function exampleToCode(example) {
    const clone = example.clone();
    clone.id = -1;
    clone.utterances = [];
    clone.preprocessed = [];
    clone.metadata = {};
    return clone.prettyprint();
}

export default class FileThingpediaClient {
    constructor(args) {
        this._locale = args.locale;
        this._devices = null;
        this._entities = null;

        this._thingpediafilename = args.thingpedia;
        this._entityfilename = args.entities;
        this._datasetfilename = args.dataset;
        this._loaded = null;

        this._mixins = {};
        for (let mixin of Mixins.data)
            this._mixins[mixin.kind] = mixin;
    }

    get developerKey() {
        return null;
    }
    get locale() {
        return this._locale;
    }

    async getModuleLocation() {
        throw new Error(`Cannot download module using FileThingpediaClient`);
    }
    async getDeviceList() {
        throw new Error(`Cannot access device list using FileThingpediaClient`);
    }
    async getDeviceFactories() {
        throw new Error(`Cannot access device factories using FileThingpediaClient`);
    }
    async getDeviceSetup() {
        throw new Error(`Cannot access device setup using FileThingpediaClient`);
    }
    async getKindByDiscovery(id) {
        throw new Error(`Cannot perform device discovery using FileThingpediaClient`);
    }
    async getExamplesByKey() {
        throw new Error(`Cannot search examples using FileThingpediaClient`);
    }
    async clickExample() {
        throw new Error(`Cannot click examples using FileThingpediaClient`);
    }
    async lookupEntity() {
        throw new Error(`Cannot lookup entity using FileThingpediaClient`);
    }

    async _load() {
        this._devices = (await util.promisify(fs.readFile)(this._thingpediafilename)).toString();

        if (this._entityfilename)
            this._entities = JSON.parse(await util.promisify(fs.readFile)(this._entityfilename)).data;
        else
            this._entities = null;
    }

    _ensureLoaded() {
        if (this._loaded)
            return this._loaded;
        else
            return this._loaded = this._load();
    }

    // The Thingpedia APIs were changed to return ThingTalk class
    // definitions rather than JSON
    // We convert our JSON datafiles into ThingTalk code here

    async getSchemas(kinds, useMeta) {
        await this._ensureLoaded();

        // ignore kinds, just return the full file, SchemaRetriever will take care of the rest
        return this._devices;
    }
    async getDeviceCode(kind) {
        await this._ensureLoaded();
        const parsed = Grammar.parse(this._devices);
        return parsed.classes.find((c) => c.name === kind).prettyprint();
    }

    getMixins() {
        // no mixins through this ThingpediaClient
        return Promise.resolve(this._mixins);
    }

    getAllExamples() {
        return util.promisify(fs.readFile)(this._datasetfilename, { encoding: 'utf8' });
    }

    async getExamplesByKinds() {
        return util.promisify(fs.readFile)(this._datasetfilename, { encoding: 'utf8' });
    }

    async getAllDeviceNames() {
        await this._ensureLoaded();

        const parsed = Grammar.parse(this._devices);
        let names = [];
        for (let classDef of parsed.classes) {
            names.push({
                kind: classDef.kind,
                kind_canonical: classDef.metadata.canonical
            });
        }
        return names;
    }

    async getAllEntityTypes() {
        await this._ensureLoaded();
        return this._entities;
    }

    async genCheatsheet(random = true, options = {}) {
        await this._ensureLoaded();
        const parsed = Grammar.parse(this._devices);

        const devices = [];
        const devices_rev = {};
        for (let classDef of parsed.classes) {
            devices_rev[classDef.kind] = devices.length;
            devices.push({
                primary_kind: classDef.kind,
                name: classDef.metadata.canonical
            });
        }
        devices.sort((a, b) => {
            return a.name.localeCompare(b.name);
        });

        let parsedExamples = (await Grammar.parse(await this.getAllExamples())).datasets[0].examples;
        const examples = parsedExamples.map((e) => {
            let kind;
            for (let [, invocation] of e.iteratePrimitives())
                kind = invocation.selector.kind;
            if (kind in devices_rev) {
                let utterance = random ? uniform(e.utterances, options.rng) : e.utterances[0];
                return {
                    kind: kind,
                    utterance: utterance,
                    target_code: exampleToCode(e)
                };
            } else {
                return null;
            }
        }).filter((e) => !!e);
        return [devices, examples];
    }
}
