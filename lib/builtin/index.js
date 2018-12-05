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

const Values = require('./values');
const Ops = require('./ops');

// This module exports Values and Ops
// it corresponds to the __builtin variable in compiled TT code

Object.assign(module.exports, Values, Ops);
