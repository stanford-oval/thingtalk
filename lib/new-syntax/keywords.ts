// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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

export const KEYWORDS = new Set<string>([
    // keywords shared with JavaScript
    'class',
    'enum',
    'extends',
    'import',
    'in',
    'let',
    'new',
    'null',
    'of',
    'true',
    'false',
    'return',

    // ThingTalk-specific keywords
    'abstract',
    'all',
    'any',
    'as',
    'dataset',
    'filter',
    'function',
    'mixin',
    'monitor',
    'notify',
    'now',
    'out',
    'opt',
    'req',
    'sort',
    'on',

    // keywords and reserved words from JavaScript are reserved for future extensions
    'await',
    'break',
    'case',
    'catch',
    'const',
    'continue',
    'debugger',
    'delete',
    'do',
    'export',
    'finally',
    'for',
    'if',
    'implements',
    'instanceof',
    'interface',
    'package',
    'private',
    'protected',
    'public',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',

    // NOTE: "default" is NOT a keyword, it is a valid identifier (used by
    // many annotations)

    // reserved words from ThingTalk
    // (these are the keywords in old ThingTalk, which are reserved in new
    // ThingTalk so we can convert back to the old syntax)
    'aggregate',
    'bookkeeping',
    'compute',
    'edge',
    'join',
    'oninput',

    // all ThingTalk type names are keywords
    'Any',
    'ArgMap',
    'Array',
    'Boolean',
    'Compound',
    'Currency',
    'Date',
    'Entity',
    'Enum',
    'Location',
    'Measure',
    'Number',
    'Object',
    'RecurrentTimeSpecification',
    'String',
    'Time',
]);

export const FORBIDDEN_KEYWORDS = new Set<string>([
    // dangerous JS identifiers are prohibited, and don't even hit the parser
    '__count__',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
    '__noSuchMethod__',
    '__parent__',
    '__proto__',
    'eval',
]);

// contextual keywords are identifiers that have special meaning to the parser
// but can be otherwise be used as variable names (parameter names, Thingpedia
// function names, ThingTalk function names) in most situations
export const CONTEXTUAL_KEYWORDS = new Set<string>([
    // keywords inside class and dataset
    'action',
    'entity',
    'from',
    'language',
    'list',
    'monitorable',
    'program',
    'query',
    'stream',

    // dialogue state annotation (except 'count')
    'error',
    'confirm',
    'more',
    'results',

    // keys to define a RecurrentTimeRule
    'beginDate',
    'beginTime',
    'dayOfWeek',
    'endDate',
    'endTime',
    'frequency',
    'interval',
    'subtract',

    // sort descriptors
    'asc',
    'desc',

    // comparison, aggregation, and scalar operators
    'starts_with',
    'ends_with',
    'prefix_of',
    'suffix_of',
    'contains',
    'in_array',
    'min',
    'max',
    'sum',
    'avg',
    'count',
    'distance',
    'set_time',

]);

export const DOLLAR_KEYWORDS = new Set<string>([
    // syntax control keywords
    '$dialogue',
    '$policy',

    // undefined
    '$?',
    '$undefined',

    // control commands
    '$answer',
    '$choice',
    '$yes',
    '$no',
    '$failed',
    '$train',
    '$debug',
    '$nevermind',
    '$stop',
    '$help',
    '$wakeup',

    // special values
    '$end_of',
    '$location',
    '$now',
    '$program_id',
    '$result',
    '$type',
    '$self',
    '$source',
    '$start_of',
    '$time',
    '$context',
]);
