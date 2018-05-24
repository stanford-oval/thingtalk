// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Ast = require('../lib/ast');
const Type = require('../lib/type');
const Builtin = require('../lib/builtin');

const VALUE_TESTS = [
    [Type.Boolean, true],
    [Type.Boolean, false],
    [Type.String, 'foo'],
    [Type.Measure('C'), 21],
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
    [Type.Entity('tt:foo'), new Builtin.Entity('foo')],
    [Type.Entity('tt:foo'), new Builtin.Entity('foo', 'Foo')],
    [Type.Entity('tt:foo'), 'foo'],
];

function testValues() {
    for (let [type, jsvalue] of VALUE_TESTS) {
        let v = Ast.Value.fromJS(type, jsvalue);
        let newjs = v.toJS();

        assert(Builtin.equality(jsvalue, newjs), jsvalue);

        let newv = Ast.Value.fromJS(type, newjs);
        assert(v.equals(newv));
    }
}

testValues();