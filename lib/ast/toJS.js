// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { Value } = require('./values');

module.exports = function (metadata) {
    if (Array.isArray(metadata))
        return new Value.Array(metadata).toJS();
    return new Value.Object(metadata).toJS();
};
