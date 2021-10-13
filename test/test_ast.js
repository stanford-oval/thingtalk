// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import * as Ast from '../lib/ast';
import Type from '../lib/type';
import * as Builtin from '../lib/runtime/builtins';
import * as Syntax from '../lib/syntax_api';
import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
import _mockMemoryClient from './mock_memory_client';
let schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

const VALUE_TESTS = [
    [Type.Boolean, true],
    [Type.Boolean, false],
    [Type.String, 'foo'],
    [new Type.Measure('C'), 21],
    [Type.Number, 42],
    [Type.Currency, new Builtin.Currency(10, 'usd')],
    [Type.Currency, new Builtin.Currency(10, 'eur')],
    [Type.Currency, 10],
    [Type.Location, new Builtin.Location(1, 2)],
    [Type.Location, new Builtin.Location(1, 2, 'somewhere')],
    [Type.Location, { x:1, y:2 }],
    [Type.Location, { x:1, y:2, display:'somewhere' }],
    [Type.Date, new Date(1)],
    [Type.Time, new Builtin.Time(1, 2)],
    [Type.Time, new Builtin.Time(1, 2, 3)],
    [new Type.Entity('tt:foo'), new Builtin.Entity('foo')],
    [new Type.Entity('tt:foo'), new Builtin.Entity('foo', 'Foo')],
    [new Type.Entity('tt:foo'), 'foo'],
    [new Type.Array(Type.Number), [22, 21]],
    [Type.ArgMap, { a: Type.Boolean }],
    [Type.RecurrentTimeSpecification, [new Builtin.RecurrentTimeRule({ beginTime: new Builtin.Time(1, 2), endTime: new Builtin.Time(3, 4) })]],
    [Type.RecurrentTimeSpecification, [new Builtin.RecurrentTimeRule({ beginTime: new Builtin.Time(1, 2), endTime: new Builtin.Time(3, 4),
        beginDate: new Date(2020, 8, 26), endDate: new Date(2020, 8, 27) })]],
];

function testValues() {
    assert(Ast.Value.Date.now() instanceof Ast.Value);

    for (let [type, jsvalue] of VALUE_TESTS) {
        let v = Ast.Value.fromJS(type, jsvalue);
        let newjs = v.toJS();

        assert(Builtin.equality(jsvalue, newjs), jsvalue);

        let newv = Ast.Value.fromJS(type, newjs);
        assert.deepEqual(v, newv);
    }
}

const IS_CONSTANT_TESTS = [
    [new Ast.Value.Number(0), true],
    [new Ast.Value.Boolean(true), true],
    [new Ast.Value.String('foo'), true],
    [new Ast.Value.Event(null), false],
    [new Ast.Value.Event('program_id'), false],
    [new Ast.Value.Date(new Date('2020-01-29')), true],
    [new Ast.Value.Date(new Ast.DateEdge('start_of', 'week')), true],
    [new Ast.Value.Date(new Ast.DatePiece(null, null, 11, null)), true],
    [new Ast.Value.Date(null), true],
    [new Ast.Value.VarRef('foo'), false],
    [new Ast.Value.VarRef('__const_QUOTED_STRING_0'), true],
    [new Ast.Value.Computation('+', [new Ast.Value.Number(2), new Ast.Value.Number(2)]), false],
    [new Ast.Value.Undefined(true), false],
    [new Ast.Value.Undefined(false), false]
];

function testIsConstant() {
    for (let [v, expected] of IS_CONSTANT_TESTS)
        assert.strictEqual(v.isConstant(), expected, v);
}

function testClone() {
    let fn = new Ast.FunctionDef(null, 'action', null, 'foo',
        [], // extends
        { is_list: false, is_monitorable: false },
        [], // args,
        {}
    );

    let clone = fn.clone();
    assert(clone.args !== fn.args);
    assert(clone.args.length === fn.args.length);
    assert(clone.types !== fn.types);
    assert(clone.types.length === fn.types.length);
    assert(clone.inReq !== fn.inReq);
    assert(clone.inOpt !== fn.inOpt);
    assert(clone.out !== fn.out);
}

async function testDialogueState() {
    const s1 = Syntax.parse(`$dialogue @org.thingpedia.dialogue.transaction.execute;
    @com.bing.web_search(query="almond")
    #[results=[]];
    @com.bing.image_search(query="almond")
    #[results=[
        { picture_url="http://example.com"^^tt:picture }
    ]];
    @com.twitter.post_picture(picture_url=$?);
    @com.facebook.post_picture(picture_url=$?);
    `);
    await s1.typecheck(schemaRetriever);

    assert.strictEqual(s1.current.stmt.prettyprint(), `@com.bing.image_search(query="almond");`);
    assert.strictEqual(s1.currentFunction.qualifiedName, `com.bing.image_search`);
    assert.strictEqual(s1.currentQuery.qualifiedName, `com.bing.image_search`);
    assert.strictEqual(s1.currentResults.results.length, 1);

    assert.strictEqual(s1.next.stmt.prettyprint(), `@com.twitter.post_picture();`);
    assert.strictEqual(s1.nextFunction.qualifiedName, `com.twitter.post_picture`);

    const s2 = Syntax.parse(`$dialogue @org.thingpedia.dialogue.transaction.execute;
    @com.bing.web_search(query="almond")
    #[results=[]];
    @com.bing.image_search(query="almond")
    #[results=[
        { picture_url="http://example.com"^^tt:picture }
    ]];
    `);
    await s2.typecheck(schemaRetriever);

    assert.strictEqual(s2.current.stmt.prettyprint(), `@com.bing.image_search(query="almond");`);
    assert.strictEqual(s2.currentFunction.qualifiedName, `com.bing.image_search`);
    assert.strictEqual(s2.currentQuery.qualifiedName, `com.bing.image_search`);
    assert.strictEqual(s2.currentResults.results.length, 1);

    assert.strictEqual(s2.next, null);
    assert.strictEqual(s2.nextFunction, null);

    const s3 = Syntax.parse(`$dialogue @org.thingpedia.dialogue.transaction.execute;
    @com.bing.web_search(query="almond");
    `);
    await s3.typecheck(schemaRetriever);

    assert.strictEqual(s3.current, null);
    assert.strictEqual(s3.currentFunction, null);
    assert.strictEqual(s3.currentQuery, null);
    assert.strictEqual(s3.currentResults, null);

    assert.strictEqual(s3.next.prettyprint(), `@com.bing.web_search(query="almond");`);
    assert.strictEqual(s3.nextFunction.qualifiedName, 'com.bing.web_search');
}

export default async function main() {
    testValues();
    testIsConstant();
    testClone();
    await testDialogueState();
}
if (!module.parent)
    main();
