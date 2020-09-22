// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
import * as Grammar from './grammar_api';
import ExecEnvironment from './runtime/exec_environment';
import Type from './type';
import SchemaRetriever from './schema';
import * as Generate from './generate';
import * as Describe from './describe';
import Formatter from './runtime/formatter';
import PermissionChecker from './permission_checker';
import * as NNSyntax from './nn-syntax';
import * as Helper from './helper';
import * as I18n from './i18n';
import * as Builtin from './builtin';

/**
 * Version information
 *
 * @type {string}
 * @alias version
 */
const version = '1.11.0';

export {
    version,

    // AST definitions
    Ast,
    Type,

    // Syntax support
    Grammar,
    NNSyntax,

    // Compiler and runtime
    Compiler,
    ExecEnvironment,
    Formatter,
    SchemaRetriever,

    // Helper modules to manipulate ASTs
    Generate,
    Describe,

    // Policy support
    PermissionChecker,

    // Helper
    Helper,

    // Misc
    Units,
    I18n,


    Builtin
};
// Value Types, exposed so that Thingpedia can reexpose them to device impls
// (to create values of the appropriate types)
export const Location = Builtin.Location;
export const Entity = Builtin.Entity;
export const Time = Builtin.Time;
