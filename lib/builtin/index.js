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
const StreamTableOps = require('./stream_table_ops');
const PrimitiveOps = require('./primitive_ops');
const OutputTypeOps = require('./output_type_ops');
const SortIndexOps = require('./sort_index_ops');

// This module exports Values and *Ops
// it corresponds to the __builtin variable in compiled TT code

Object.assign(module.exports, Values, PrimitiveOps, StreamTableOps, OutputTypeOps, SortIndexOps);
