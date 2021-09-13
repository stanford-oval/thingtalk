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

import { SourceRange } from './source_locations';
import { ThingTalkSyntaxError } from './errors';

const EOF_TOKEN = ' 1EOF';

const enum ParserAction {
    Accept = 0,
    Shift = 1,
    Reduce = 2
}

export type ActionTable = { [key : number] : { [key : number] : [ParserAction, number] } };
export type GotoTable = { [key : number] : { [key : number] : number } };
export type SymbolTable = { [key : string] : number };

export type ParserInterface<OptionType> = OptionType & {
    location : SourceRange|null;
    error(msg : string) : never;
}

type SemanticAction = ($ : ParserInterface<any>, ...args : any[]) => any;

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

interface Parser<RootType> {
    parse(sequence : Iterable<TokenWrapper<unknown>>) : RootType;
}

export interface ParserConstructor<RootType, OptionType> {
    new(options : OptionType) : Parser<RootType>;
}

export interface TokenWrapper<T> {
    token : string;
    value : T;
    location : SourceRange|null;
}

function mergeRanges(l1 : SourceRange|null, l2 : SourceRange|null) : SourceRange|null {
    if (l1 === null)
        return l2;
    if (l2 === null)
        return l1;

    return {
        start: {
            offset: Math.min(l1.start.offset, l2.start.offset),
            line: Math.min(l1.start.line, l2.start.line),
            column: Math.min(l1.start.column, l2.start.column),
            token: Math.min(l1.start.token!, l2.start.token!),
        },
        end: {
            offset: Math.max(l1.end.offset, l2.end.offset),
            line: Math.max(l1.end.line, l2.end.line),
            column: Math.max(l1.end.column, l2.end.column),
            token: Math.max(l1.end.token!, l2.end.token!),
        }
    };
}

function tokenToString(tok : TokenWrapper<any>|string) : string {
    if (typeof tok === 'string')
        return tok;
    else
        return tok.token;
}

export function createParser<RootType, OptionType = any>({ TERMINAL_IDS, RULE_NON_TERMINALS, ARITY, GOTO, PARSER_ACTION, SEMANTIC_ACTION } : ParserConfig) : ParserConstructor<RootType, OptionType> {
    return class ShiftReduceParser {
        private _options : OptionType;

        constructor(options : OptionType) {
            this._options = options;
        }

        private _helper(sequence : Iterable<TokenWrapper<any>>, applySemanticAction : boolean) : [number[], RootType] {
            const iterator = sequence[Symbol.iterator]();

            let state = 0;
            const stack : number[] = [0];
            const results : any[] = [null];
            const output : number[] = [];
            const locations : Array<SourceRange|null> = [null];
            let currentLocation : SourceRange|null = null;
            let tokenno = 0;

            let { done, value:nextToken } = iterator.next();
            if (!done) {
                currentLocation = nextToken.location;
                if (currentLocation) {
                    currentLocation.start.token = tokenno;
                    currentLocation.end.token = tokenno + 1;
                }
                tokenno++;
            }

            const $ : ParserInterface<OptionType> = {
                ...this._options,

                location: currentLocation,

                error(msg : string) {
                    throw new ThingTalkSyntaxError(msg, currentLocation);
                }
            };

            for (;;) {
                if (done)
                    nextToken = EOF_TOKEN;
                const nextTokenId = TERMINAL_IDS[tokenToString(nextToken)];

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
                    if (!done) {
                        currentLocation = nextToken.location;
                        if (currentLocation) {
                            currentLocation.start.token = tokenno;
                            currentLocation.end.token = tokenno + 1;
                        }
                        tokenno++;
                    }
                } else { // reduce
                    const ruleId = param;
                    output.push(ruleId);
                    const arity = ARITY[ruleId];
                    const args = results.slice(results.length-arity, results.length);
                    const locs = locations.slice(locations.length-arity, locations.length);
                    for (let i = 0; i < arity; i++) {
                        stack.pop();
                        results.pop();
                    }
                    state = stack[stack.length-1];
                    const lhs = RULE_NON_TERMINALS[ruleId];
                    const nextState = GOTO[state][lhs];
                    state = nextState;
                    stack.push(nextState);
                    if (applySemanticAction) {
                        const action = SEMANTIC_ACTION[ruleId];

                        let ruleLocation : SourceRange|null = null;
                        for (const loc of locs)
                            ruleLocation = mergeRanges(ruleLocation, loc);

                        $.location = ruleLocation;
                        results.push(action($, ...args));
                    } else {
                        results.push(null);
                    }
                }
            }
        }

        parse(sequence : Iterable<TokenWrapper<any>>) : RootType {
            const [, ast] = this._helper(sequence, true);
            return ast;
        }

        getReduceSequence(sequence : Iterable<TokenWrapper<any>>) : number[] {
            const [reduces, ] = this._helper(sequence, false);
            return reduces;
        }
    };
}
