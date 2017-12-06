// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// A ShiftReduce parser
// This is the runtime component of tools/generate_parser.js
// (and expects tables generated in the form of tools/generate_parser.js)

const EOF_TOKEN = '<<EOF>>';

function findExpected(actions, terminalIds) {
    let ret = [];
    for (let tokenId in actions) {
        for (let term in terminalIds) {
            if (terminalIds[term] === Number(tokenId)) {
                ret.push(term);
                break;
            }
        }
    }
    return ret;
}

module.exports = function(TERMINAL_IDS, RULE_NON_TERMINALS, ARITY, GOTO, PARSER_ACTION, SEMANTIC_ACTION) {
    return class ShiftReduceParser {
        constructor() {
        }

        get numRules() {
            return RULE_NON_TERMINALS.length;
        }

        parse(sequence) {
            const iterator = sequence[Symbol.iterator]();

            let state = 0;
            let stack = [0];
            let results = [null];
            let { done, value:nextToken } = iterator.next();

            for(;;) {
                if (done)
                    nextToken = EOF_TOKEN;
                let nextTokenId = TERMINAL_IDS[nextToken];
                if (!(nextTokenId in PARSER_ACTION[state]))
                    throw new SyntaxError("Parse error: unexpected token " + nextToken + " in state " + state + ", expected " + findExpected(PARSER_ACTION[state], TERMINAL_IDS));
                let [action, param] = PARSER_ACTION[state][nextTokenId];

                if (action === 0) // accept
                    return results[1];

                if (action === 1) { // shift
                    state = param;
                    stack.push(state);
                    results.push(nextToken);
                    ({ done, value:nextToken } = iterator.next());
                } else { // reduce
                    let ruleId = param;
                    let arity = ARITY[ruleId];
                    let args = results.slice(results.length-arity, results.length);
                    stack.length -= arity;
                    results.length -= arity;
                    state = stack[stack.length-1];
                    let lhs = RULE_NON_TERMINALS[ruleId];
                    let nextState = GOTO[state][lhs];
                    state = nextState;
                    stack.push(nextState);
                    let action = SEMANTIC_ACTION[ruleId];
                    results.push(action(...args));
                }
            }
        }
    };
};
