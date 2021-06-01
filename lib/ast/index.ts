// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

/**
 * The AST namespace includes the definition of AST nodes.
 *
 * @namespace Ast
 */

// import syntax API first to resolve a cyclic import:
// "base" imports "syntax_api" for serialize, and "syntax_api"
// indirectly imports us here
import '../syntax_api';

export { default as Node } from './base';
export * from './base';
export * from './function_def';
export * from './class_def';
export * from './values';
export * from './invocation';
export * from './boolean_expression';
export * from './expression';
export * from './permissions';
export * from './legacy';
export * from './statement';
export * from './program';
export * from './control_commands';
export * from './dialogues';
export { default as NodeVisitor } from './visitor';
export * from './slots';
