// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

function combineOutputTypes(t1, t2) {
    return `${t1}+${t2}`;
}
module.exports.combineOutputTypes = combineOutputTypes;

function aggregateOutputType(agg, t) {
    return `${agg}(${t})`;
}
module.exports.aggregateOutputType = aggregateOutputType;
