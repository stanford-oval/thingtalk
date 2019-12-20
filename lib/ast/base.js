// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

/**
 * Base class of ast nodes.
 *
 *
 * @class
 * @alias Ast.Base
 * @abstract
 */
module.exports = class Base {
    /* istanbul ignore next */
    clone() {
        throw new Error('Must be overridden');
    }

    /* istanbul ignore next */
    optimize() {
        return this;
    }
};
