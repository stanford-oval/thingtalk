"use strict";

const Thingpedia = require('./thingpedia.json');
const Mixins = require('./mixins.json');
const { ClassDef } = require('../lib/class_def_ast');
const Q = require('q');
const fs = require('fs');
const path = require('path');

module.exports = {
    _schema: {},
    _meta: {},
    _mixins: {},

    getSchemas() {
        return Promise.resolve(this._schema);
    },

    getMetas() {
        return Promise.resolve(this._meta);
    },

    getMixins() {
        return Promise.resolve(this._mixins);
    },

    async getDeviceCode(kind) {
        const data = await Q.nfcall(fs.readFile, path.resolve(path.dirname(module.filename), kind + '.json'));
        const parsed = JSON.parse(data);
        // the modern API returns ThingTalk, not JSON, so convert here
        const classDef = ClassDef.fromManifest(kind, parsed);
        return classDef.prettyprint();
    }
};
for (let dev of Thingpedia.data) {
    module.exports._meta[dev.kind] = dev;
    module.exports._schema[dev.kind] = {
        queries: {},
        actions: {}
    };
    for (let what of ['queries', 'actions']) {
        for (let name in dev[what]) {
            let from = dev[what][name];
            module.exports._schema[dev.kind][what][name] = {
                types: from.schema,
                args: from.args,
                required: from.required,
                is_input: from.is_input,
                is_list: from.is_list,
                is_monitorable: from.is_monitorable
            };
        }
    }
}
for (let mixin of Mixins.data) {
    module.exports._mixins[mixin.kind] = mixin;
}
