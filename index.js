// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Ast = require('./lib/ast');
const Ir = require('./lib/ir');
const Compiler = require('./lib/compiler');
const Grammar = require('./lib/grammar_api');
const ExecEnvironment = require('./lib/exec_environment');
const Type = require('./lib/type');
const SchemaRetriever = require('./lib/schema');
const Generate = require('./lib/generate');
const Describe = require('./lib/describe');

let { genRandomRules, genRandomPermissionRule } = require('./lib/gen_random_rule');
Generate.genRandomRules = genRandomRules;
Generate.genRandomPermissionRule = genRandomPermissionRule;
Generate.genRandomValue = require('./lib/gen_random_value');
const SEMPRESyntax = require('./lib/sempre_syntax');

module.exports = {
    Ast: Ast,
    Ir: Ir,
    Compiler: Compiler,
    Grammar: Grammar,
    ExecEnvironment: ExecEnvironment,
    Type: Type,
    SchemaRetriever: SchemaRetriever,
    Generate: Generate,
    Describe: Describe,
    SEMPRESyntax: SEMPRESyntax
};
