"use strict";

const Thingpedia = require('./thingpedia.json');
const Q = require('q');
const fs = require('fs');
const path = require('path');

module.exports = {
    _schema: {},
    _meta: {},

    getSchemas() {
        return this._schema;
    },

    getMetas() {
        return this._meta;
    },

    getDeviceCode(kind) {
        return Q.nfcall(fs.readFile, path.resolve(path.dirname(module.filename), kind + '.json')).then((data) => JSON.parse(data));
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