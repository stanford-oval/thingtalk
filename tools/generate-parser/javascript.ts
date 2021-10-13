// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as stream from 'stream';
import * as path from 'path';
import * as slr from './slr_generator';

const enum ParserAction {
    Accept = 0,
    Shift = 1,
    Reduce = 2
}
type ActionTable = Array<{ [key : number] : [ParserAction, number] }>;
type GotoTable = Array<{ [key : number] : number }>;

export default function writeout(preamble : string,
                                 generator : slr.SLRParserGenerator,
                                 output : stream.Writable,
                                 outputPath : string,
                                 rootType : string,
                                 optionType : string) {
    const runtimePath = require.resolve('../../lib/utils/sr_parser_runtime');
    const runtimedir = path.relative(path.dirname(outputPath),
        path.dirname(runtimePath));
    const relativeruntimepath = './' + path.join(runtimedir, 'sr_parser_runtime');

    const TERMINAL_IDS : { [key : string] : number } = {};
    for (let i = 0; i < generator.terminals.length; i++)
        TERMINAL_IDS[generator.terminals[i]] = i;

    const NON_TERMINAL_IDS : { [key : string] : number } = {};
    for (let i = 0; i < generator.nonTerminals.length; i++)
        NON_TERMINAL_IDS[generator.nonTerminals[i]] = i;

    const RULE_NON_TERMINALS : number[] = [];
    for (let i = 0; i < generator.rules.length; i++) {
        const [lhs,,] = generator.rules[i];
        RULE_NON_TERMINALS[i] = NON_TERMINAL_IDS[lhs];
    }

    const GOTO_TABLE : GotoTable = [];
    for (let i = 0; i < generator.gotoTable.length; i++) {
        GOTO_TABLE[i] = {};
        for (const nonterm in generator.gotoTable[i]) {
            const nextState = generator.gotoTable[i][nonterm];
            GOTO_TABLE[i][NON_TERMINAL_IDS[nonterm]] = nextState;
        }
    }

    const ACTION_TABLE : ActionTable = [];
    let foundAccept = false;
    for (let i = 0; i < generator.actionTable.length; i++) {
        ACTION_TABLE[i] = {};
        for (const term in generator.actionTable[i]) {
            const [action, param] = generator.actionTable[i][term];
            if (action === 'accept')
                foundAccept = true;

            if (action === 'accept')
                ACTION_TABLE[i][TERMINAL_IDS[term]] = [0, 0];
            else if (action === 'shift')
                ACTION_TABLE[i][TERMINAL_IDS[term]] = [1, param];
            else if (action === 'reduce')
                ACTION_TABLE[i][TERMINAL_IDS[term]] = [2, param];
        }
    }
    if (!foundAccept)
        throw new Error('Parser generator bug: no accept state generated');

    output.write(preamble);
    output.write('\n');
    output.write(`const TERMINAL_IDS : $runtime.SymbolTable = ${JSON.stringify(TERMINAL_IDS)};\n`);
    output.write(`const RULE_NON_TERMINALS : number[] = ${JSON.stringify(RULE_NON_TERMINALS)};\n`);
    output.write(`const ARITY : number[] = ${JSON.stringify(generator.rules.map(([,rhs,]) => rhs.length))};\n`);
    output.write(`const GOTO : $runtime.GotoTable = ${JSON.stringify(GOTO_TABLE)};\n`);
    output.write(`const PARSER_ACTION : $runtime.ActionTable = ${JSON.stringify(ACTION_TABLE)};\n`);
    output.write(`const SEMANTIC_ACTION = [\n`);
    for (const [,,action] of generator.rules)
        output.write(`(${action}),\n`);
    output.write(`];\n`);
    output.write(`import * as $runtime from '${relativeruntimepath}';\n`);
    output.write(`export default $runtime.createParser<${rootType}, ${optionType}>({ TERMINAL_IDS, RULE_NON_TERMINALS, ARITY, GOTO, PARSER_ACTION, SEMANTIC_ACTION });\n`);
    output.end();

    return new Promise((resolve, reject) => {
        output.on('finish', resolve);
        output.on('error', reject);
    });
}
