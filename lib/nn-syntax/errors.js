// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

class UnsynthesizableError extends Error {
    constructor(what) {
        super(what + ' cannot be synthesized');
    }
}

module.exports = { UnsynthesizableError };
