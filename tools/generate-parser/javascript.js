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

const path = require('path');

module.exports = function writeout(preamble, generator, output, runtimePath, outputPath) {
    if (!runtimePath)
        runtimePath = require.resolve('../../lib/nn-syntax/sr_parser_runtime');
    const runtimedir = path.relative(path.dirname(outputPath),
                                     path.dirname(runtimePath));
    const relativeruntimepath = './' + path.join(runtimedir, 'sr_parser_runtime');

    const TERMINAL_IDS = {};
    for (let i = 0; i < generator.terminals.length; i++)
        TERMINAL_IDS[generator.terminals[i]] = i;

    const NON_TERMINAL_IDS = {};
    for (let i = 0; i < generator.nonTerminals.length; i++)
        NON_TERMINAL_IDS[generator.nonTerminals[i]] = i;

    const RULE_NON_TERMINALS = [];
    for (let i = 0; i < generator.rules.length; i++) {
        let [lhs,,] = generator.rules[i];
        RULE_NON_TERMINALS[i] = NON_TERMINAL_IDS[lhs];
    }

    const GOTO_TABLE = [];
    for (let i = 0; i < generator.gotoTable.length; i++) {
        GOTO_TABLE[i] = {};
        for (let nonterm in generator.gotoTable[i]) {
            let nextState = generator.gotoTable[i][nonterm];
            GOTO_TABLE[i][NON_TERMINAL_IDS[nonterm]] = nextState;
        }
    }

    const ACTION_TABLE = [];
    let foundAccept = false;
    for (let i = 0; i < generator.actionTable.length; i++) {
        ACTION_TABLE[i] = {};
        for (let term in generator.actionTable[i]) {
            let [action, param] = generator.actionTable[i][term];
            if (action === 'accept')
                foundAccept = true;

            if (action === 'accept')
                ACTION_TABLE[i][TERMINAL_IDS[term]] = [0];
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
    output.write(`const TERMINAL_IDS = ${JSON.stringify(TERMINAL_IDS)};\n`);
    output.write(`const RULE_NON_TERMINALS = ${JSON.stringify(RULE_NON_TERMINALS)};\n`);
    output.write(`const ARITY = ${JSON.stringify(generator.rules.map(([,rhs,]) => rhs.length))};\n`);
    output.write(`const GOTO = ${JSON.stringify(GOTO_TABLE)};\n`);
    output.write(`const PARSER_ACTION = ${JSON.stringify(ACTION_TABLE)};\n`);
    output.write(`const SEMANTIC_ACTION = [\n`);
    for (let [,,action] of generator.rules)
        output.write(`(${action}),\n`);
    output.write(`];\n`);
    output.write(`module.exports = require('${relativeruntimepath}')(TERMINAL_IDS, RULE_NON_TERMINALS, ARITY, GOTO, PARSER_ACTION, SEMANTIC_ACTION);\n`);
    output.end();

    return new Promise((resolve, reject) => {
        output.on('finish', resolve);
        output.on('error', reject);
    });
};
