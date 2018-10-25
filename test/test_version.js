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

const ThingTalk = require('..');
const packageJson = require('../package.json');

function main() {
    assert.deepStrictEqual(ThingTalk.version, packageJson.version);
}
module.exports = main;
if (!module.parent)
    main();
