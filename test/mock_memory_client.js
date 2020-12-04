// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
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

import Type from '../lib/type';

class MockMemoryClient {
    constructor() {
        this._tables = new Map;
    }

    async getSchema(table, principal) {
        //console.log('GetSchema for ' + table + ' owned by ' + principal);
        return this._tables.get(principal + ':' + table) || null;
    }

    async createTable(table, args, types) {
        console.log('CreateSchema for ' + table + ' ', args);
        this._tables.set('null:' + table, { args: args, types: types });
    }

    // only to populate the mock client
    _createRemoteTable(table, principal, args, types) {
        this._tables.set(principal + ':' + table, { args: args, types: types });
    }
}

const _mockMemoryClient = new MockMemoryClient();
_mockMemoryClient.createTable('Q1', ['_timestamp', 'steps', 'col1', 'col2', 'field', 'foo', 'str1', 'str2'], [Type.Date, Type.Number, Type.Number, Type.Number, Type.Number, Type.String, Type.String, Type.String]);
_mockMemoryClient.createTable('Q0', ['another_field', 'field1', 'field2'], [Type.Number, Type.Number, Type.Number]);
_mockMemoryClient.createTable('Q2', ['col2'], [Type.Number]);
_mockMemoryClient.createTable('Q3', ['col1'], [new Type.Measure('C')]);
_mockMemoryClient.createTable('t', [], []);
_mockMemoryClient.createTable('Q4', ['score'], [Type.Number]);
_mockMemoryClient.createTable('auto+com.xkcd:get_comic:v_title:title,v_picture_url:picture_url', ['v_title', 'v_picture_url'], [Type.String, new Type.Entity('tt:picture')]);

_mockMemoryClient._createRemoteTable('Q4', '1234', ['col1', 'col2'], [Type.String, Type.Number]);

export default _mockMemoryClient;
