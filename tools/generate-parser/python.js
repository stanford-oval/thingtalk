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

const INVALID_CODE = 0;
const ACCEPT_CODE = 1;
const SHIFT_CODE = 2;
const REDUCE_CODE = 3;

function escape(str) {
    return `'${String(str).replace(/(['\\])/g, '\\$1')}'`; //'
}
function printRule(rhs) {
    return rhs.map((s) => escape(s.isNonTerminal ? '$' + s.symbol : s.symbol)).join(', ');
}

module.exports = function writeout(preamble, generator, output, runtimePath, outputPath) {
    if (!runtimePath)
        runtimePath = 'genie.grammar.np_parser';
    function writeln(line) {
        output.write(line + '\n');
    }

    writeln(`import numpy as np`);
    writeln(`from ${runtimePath} import ShiftReduceParser`);
    writeln('');

    const TERMINAL_IDS = {};
    const DICTIONARY = {};
    for (let i = 0; i < generator.terminals.length; i++) {
        TERMINAL_IDS[generator.terminals[i]] = i;
        DICTIONARY[generator.terminals[i]] = i;
    }

    const NON_TERMINAL_IDS = {};
    for (let i = 0; i < generator.nonTerminals.length; i++) {
        NON_TERMINAL_IDS[generator.nonTerminals[i]] = i;
        DICTIONARY['$' + generator.nonTerminals[i]] = i + generator.terminals.length;
    }

    writeln(`TERMINALS = [${generator.terminals.map(escape).join(', ')}]`);
    writeln(`DICTIONARY = ${JSON.stringify(DICTIONARY, undefined, 2)}`);

    writeln(`RULES = [`);
    for (let i = 0; i < generator.rules.length; i++) {
        const [lhs, rhs, ] = generator.rules[i];
        writeln(`  (${escape(lhs)}, (${printRule(rhs)})),`);
    }
    writeln(`]`);

    writeln(`RULE_TABLE = np.array([`);
    for (let i = 0; i < generator.rules.length; i++) {
        const [lhs, rhs,] = generator.rules[i];
        writeln(`  [${NON_TERMINAL_IDS[lhs]}, ${rhs.length}],`);
    }
    writeln(`], dtype=np.int32)`);

    const nStates = generator.gotoTable.length;
    const nTerminals = generator.terminals.length;
    const nNonTerminals = generator.nonTerminals.length;
    writeln(`GOTO_TABLE = np.full(fill_value=${INVALID_CODE}, shape=(${nStates}, ${nNonTerminals}), dtype=np.int32)`);
    for (let i = 0; i < generator.gotoTable.length; i++) {
        for (let nonterm in generator.gotoTable[i]) {
            let nextState = generator.gotoTable[i][nonterm];
            writeln(`GOTO_TABLE[${i}, ${NON_TERMINAL_IDS[nonterm]}] = ${nextState}`);
        }
    }

    writeln(`ACTION_TABLE = np.full(fill_value=${INVALID_CODE}, shape=(${nStates}, ${nTerminals + nNonTerminals}, 2), dtype=np.int32)`);
    let foundAccept = false;
    for (let i = 0; i < generator.actionTable.length; i++) {
        for (let term in generator.actionTable[i]) {
            let [action, param] = generator.actionTable[i][term];
            if (action === 'accept')
                foundAccept = true;

            if (action === 'accept')
                writeln(`ACTION_TABLE[${i}, ${TERMINAL_IDS[term]}] = [${ACCEPT_CODE}, ${INVALID_CODE}]`);
            else if (action === 'shift')
                writeln(`ACTION_TABLE[${i}, ${TERMINAL_IDS[term]}] = [${SHIFT_CODE}, ${param}]`);
            else if (action === 'reduce')
                writeln(`ACTION_TABLE[${i}, ${TERMINAL_IDS[term]}] = [${REDUCE_CODE}, ${param}]`);
        }
    }
    if (!foundAccept)
        throw new Error('Parser generator bug: no accept state generated');

    writeln(`class Parser(ShiftReduceParser):`);
    writeln(`  def __init__(self):`);
    writeln(`    super().__init__(RULES, RULE_TABLE, ACTION_TABLE, GOTO_TABLE, TERMINALS, DICTIONARY, ${generator.startSymbolId})`);
};
