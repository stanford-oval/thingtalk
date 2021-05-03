// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

export * from './values';
export * from './stream_table_ops';
export * from './primitive_ops';
export * from './output_type_ops';
export * from './sort_index_ops';

// This module exports Values and *Ops
// it corresponds to the __builtin variable in compiled TT code

/**
 * The ThingTalk builtin runtime library.
 *
 * This namespace contains the builtin types and operations available
 * to compiled ThingTalk.
 *
 * Content of this namespace is available as `__builtin` in compiled
 * ThingTalk code. Value classes are also re-exported by the Thingpedia SDK
 * and available in Thingpedia device implementations.
 *
 * Most of this namespace, with the exception of value types, should not
 * be used outside of the ThingTalk library.
 *
 * @namespace Builtin
 */
