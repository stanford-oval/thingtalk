// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { isUnaryStreamToStreamOp,
        isUnaryTableToTableOp,
        isUnaryStreamToTableOp,
        isUnaryTableToStreamOp } = require('./utils');

// Initialize the AST API
const { notifyAction } = require('./ast_api');

module.exports = {
    notifyAction,

    // recursive utilities
    isUnaryTableToTableOp,
    isUnaryStreamToTableOp,
    isUnaryStreamToStreamOp,
    isUnaryTableToStreamOp,
};
