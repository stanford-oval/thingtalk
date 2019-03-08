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

class CompiledRule {
    constructor(hasTrigger, functions, states, code) {
        this.hasTrigger = hasTrigger;
        this.states = states;
        this.code = code;
    }
}

module.exports = {
    CompiledRule
};
