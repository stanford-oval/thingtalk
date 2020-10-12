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

// A ShiftReduce parser
// This is the runtime component of tools/generate_parser.js
// (and expects tables generated in the form of tools/generate_parser.js)

const EOF_TOKEN = ' 1EOF';

const enum ParserAction {
    Accept = 0,
    Shift = 1,
    Reduce = 2
}

export type ActionTable = { [key : number] : { [key : number] : [ParserAction, number] } };
export type GotoTable = { [key : number] : { [key : number] : number } };
export type SymbolTable = { [key : string] : number };

export interface ParserInterface {
    error(msg : string) : never;
}

type SemanticAction = ($ : ParserInterface, ...args : any[]) => any;

interface ParserConfig {
    TERMINAL_IDS : SymbolTable;
    RULE_NON_TERMINALS : number[];
    ARITY : number[];
    GOTO : GotoTable;
    PARSER_ACTION : ActionTable;
    SEMANTIC_ACTION : SemanticAction[];
}

function findExpected(actions : { [key : number] : [ParserAction, number] }, terminalIds : SymbolTable) : string[] {
    const ret = [];
    for (const tokenId in actions) {
        for (const term in terminalIds) {
            if (terminalIds[term] === Number(tokenId)) {
                ret.push(term);
                break;
            }
        }
    }
    return ret;
}

class ThingTalkSyntaxError extends Error {
    constructor(message : string, public location : number|null = null) {
        super(message);
    }
}

interface Parser<RootType> {
    parse(sequence : Iterable<string|TokenWrapper<unknown>>) : RootType;
}

export interface ParserConstructor<RootType> {
    new() : Parser<RootType>;
}

export interface TokenWrapper<T> {
    token : string;
    value : T;
    location ?: number;
}

export function createParser<RootType>({ TERMINAL_IDS, RULE_NON_TERMINALS, ARITY, GOTO, PARSER_ACTION, SEMANTIC_ACTION } : ParserConfig) : ParserConstructor<RootType> {
    return class ShiftReduceParser {
        private _helper(sequence : Iterable<string|TokenWrapper<any>>, applySemanticAction : boolean) : [number[], RootType] {
            const iterator = sequence[Symbol.iterator]();

            let state = 0;
            const stack : number[] = [0];
            const results : any[] = [null];
            const output : number[] = [];
            let currentLocation : number|null = null;
            let { done, value:nextToken } = iterator.next();
            if (!done)
                currentLocation = nextToken.location || null;

            const $ = {
                error(msg : string) {
                    throw new ThingTalkSyntaxError(msg, currentLocation);
                }
            };

            for (;;) {
                if (done)
                    nextToken = EOF_TOKEN;
                const nextTokenId = TERMINAL_IDS[String(nextToken)];

                if (!(nextTokenId in PARSER_ACTION[state]))
                    throw new ThingTalkSyntaxError(`Parse error: unexpected token ${nextToken} in state ${state}, expected ${findExpected(PARSER_ACTION[state], TERMINAL_IDS)}`, currentLocation);
                const [action, param] = PARSER_ACTION[state][nextTokenId];

                if (action === ParserAction.Accept) // accept
                    return [output, results[1]];

                if (action === ParserAction.Shift) { // shift
                    state = param;
                    stack.push(state);
                    results.push(nextToken);
                    ({ done, value:nextToken } = iterator.next());
                    if (!done)
                        currentLocation = nextToken.location || null;
                } else { // reduce
                    const ruleId = param;
                    output.push(ruleId);
                    const arity = ARITY[ruleId];
                    const args = results.slice(results.length-arity, results.length);
                    stack.length -= arity;
                    results.length -= arity;
                    state = stack[stack.length-1];
                    const lhs = RULE_NON_TERMINALS[ruleId];
                    const nextState = GOTO[state][lhs];
                    state = nextState;
                    stack.push(nextState);
                    if (applySemanticAction) {
                        const action = SEMANTIC_ACTION[ruleId];
                        results.push(action($, ...args));
                    } else {
                        results.push(null);
                    }
                }
            }
        }

        parse(sequence : Iterable<string|TokenWrapper<any>>) : RootType {
            const [, ast] = this._helper(sequence, true);
            return ast;
        }

        getReduceSequence(sequence : Iterable<string|TokenWrapper<any>>) : number[] {
            const [reduces, ] = this._helper(sequence, false);
            return reduces;
        }
    };
}
