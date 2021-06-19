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
    [Type.Location, {x:1, y:2}],
    [Type.Location, {x:1, y:2, display:'somewhere'}],
    [Type.Date, new Date(1)],
    [Type.Time, new Builtin.Time(1, 2)],
    [Type.Time, new Builtin.Time(1, 2, 3)],
    [new Type.Entity('tt:foo'), new Builtin.Entity('foo')],
    [new Type.Entity('tt:foo'), new Builtin.Entity('foo', 'Foo')],
    [new Type.Entity('tt:foo'), 'foo'],
    [new Type.Array(Type.Number), [22, 21]],
    [Type.ArgMap, {a: Type.Boolean}],
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
    [new Ast.Value.Date(new Date('2020-01-29'), new Ast.Value.Time(new Ast.AbsoluteTime(12, 30, 0))), true],
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

export default function main() {
    testValues();
    testIsConstant();
    testClone();
}
if (!module.parent)
    main();
