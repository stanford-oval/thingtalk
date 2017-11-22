"use strict";

const Q = require('q');
const Type = require('../lib/type');

class MockMemoryClient {
    constructor() {
        this._tables = new Map;
    }

    getSchema(table, principal) {
        return Q(this._tables.get(principal + ':' + table) || null);
    }

    createTable(table, args, types) {
        console.log('CreateSchema for ' + table + ' ', args);
        this._tables.set('null:' + table, { args: args, types: types });
        return Q();
    }

    // only to populate the mock client
    _createRemoteTable(table, principal, args, types) {
        this._tables.set(principal + ':' + table, { args: args, types: types });
    }
}

const _mockMemoryClient = new MockMemoryClient();
_mockMemoryClient.createTable('Q1', ['steps', 'col1', 'col2', 'field', 'foo', 'str1', 'str2'], [Type.Number, Type.Number, Type.Number, Type.Number, Type.String, Type.String, Type.String]);
_mockMemoryClient.createTable('Q0', ['another_field', 'field1', 'field2'], [Type.Number, Type.Number, Type.Number]);
_mockMemoryClient.createTable('Q2', ['col2'], [Type.Number]);
_mockMemoryClient.createTable('Q3', ['col1'], [Type.Measure('C')]);
_mockMemoryClient.createTable('t', [], []);
_mockMemoryClient.createTable('auto+com.xkcd:get_comic:v_title:title,v_picture_url:picture_url', ['v_title', 'v_picture_url'], [Type.String, Type.Entity('tt:picture')]);

module.exports = _mockMemoryClient;
