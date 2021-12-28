// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
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

import * as Units from 'thingtalk-units';

import * as Ast from './ast';
import Compiler from './compiler';
export * from './compiler';
import * as Syntax from './syntax_api';
import { ExecEnvironment } from './runtime/exec_environment';
import * as Runtime from './runtime/exec_environment';
import Type from './type';
import SchemaRetriever from './schema';
export * from './schema';
import PermissionChecker from './permission_checker';
import * as Helper from './helper';
import * as Builtin from './runtime/builtins';
import { Location, Entity, Time } from './runtime/values';
import * as Operators from './operators';
import List from './utils/list';

/**
 * Version information
 *
 */
const version = '2.1.0';

export {
    version,

    // AST definitions
    Ast,
    Type,
    SchemaRetriever,

    // Syntax support
    Syntax,

    // Compiler and runtime
    Compiler,
    Runtime,
    ExecEnvironment,
    Builtin,

    // Value Types, exposed so that Thingpedia can reexpose them to device impls
    // (to create values of the appropriate types)
    // these are obsolete aliases for the same in the Builtin namespace
    Location,
    Entity,
    Time,

    // Policy support
    PermissionChecker,

    // Helper
    Helper,

    // Misc
    Units,
    Operators,
    List
};
