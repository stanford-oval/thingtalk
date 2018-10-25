// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 Google LLC
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const { clean } = require('../lib/utils');

function testClean() {
    assert.strictEqual(clean('argument'), 'argument');
    assert.strictEqual(clean('other_argument'), 'other argument');
    assert.strictEqual(clean('otherArgument'), 'other argument');
    assert.strictEqual(clean('WEIRDThing'), 'weirdthing');
    assert.strictEqual(clean('WEIRD_thing'), 'weird thing');
    assert.strictEqual(clean('otherWEIRD_Thing'), 'other weird thing');
    assert.strictEqual(clean('OtherArgument'), 'other argument');
}
module.exports = testClean;
if (!module.parent)
    testClean();
