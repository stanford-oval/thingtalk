// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
"use strict";

// Generate and SLR parser, given a grammar
// This is JavaScript version of almond-nnparser/grammar/slr.py

const DEBUG = false;

class ItemSetInfo {
    constructor() {
        this.id = 0;
        this.intransitions = [];
        this.outtransitions = [];
    }
}

function arrayEquals(a, b) {
    if (a.length !== b.length)
        return false;

    for (var i = 0; i < a.length; i++) {
        if (a[i] === b[i])
            continue;
        if (Array.isArray(a[i])) {
            if (!arrayEquals(a[i], b[i]))
                return false;
        } else if (!a[i].equals || !a[i].equals(b[i])) {
            return false;
        }
    }

    return true;
}

class ItemSet {
    constructor(rules) {
        this.rules = Array.from(rules);
    }

    equals(other) {
        return arrayEquals(this.rules, other.rules);
    }
}

// a python-like tuple, that compares .equals() if all elements compare equals
class Tuple {
    constructor(...args) {
        this.stuff = args;
    }

    equals(other) {
        return arrayEquals(this.stuff, other.stuff);
    }

    get(i) {
        return this.stuff[i];
    }
    slice(from, to) {
        return this.stuff.slice(from, to);
    }
}

// A map that respects equals
// Not asymptotically efficient
class EqualsMap {
    constructor(iterable) {
        this._keys = [];
        this._values = [];
        this._size = 0;
        if (!iterable)
            return;
        for (let [key, value] of iterable)
            this.set(key, value);
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this._keys.length; i++)
            yield [this._keys[i], this._values[i]];
    }
    keys() {
        return this._keys;
    }
    values() {
        return this._values;
    }

    get size() {
        return this._size;
    }

    set(key, value) {
        for (let i = 0; i < this._keys.length; i++) {
            if (this._keys[i].equals(key)) {
                this._values[i] = value;
                return this;
            }
        }
        this._keys.push(key);
        this._values.push(value);
        this._size++;
        return this;
    }
    get(key) {
        for (let i = 0; i < this._keys.length; i++) {
            if (this._keys[i].equals(key))
                return this._values[i];
        }
        return undefined;
    }
    delete(key) {
        let idx = -1;
        for (let i = 0; i < this._keys.length; i++) {
            if (this._keys[i].equals(key)) {
                idx = i;
                break;
            }
        }
        if (idx < 0)
            return this;
        this._keys.splice(idx, 1);
        this._values.splice(idx, 1);
        this._size--;
        return this;
    }
    has(element) {
        for (let i = 0; i < this._keys.length; i++) {
            if (this._keys[i].equals(element))
                return true;
        }
        return false;
    }
}

class EqualsSet {
    constructor(iterable) {
        this._map = new EqualsMap();
        if (!iterable)
            return;
        for (let v of iterable)
            this.add(v);
    }

    *[Symbol.iterator]() {
        for (let [key, ] of this._map)
            yield key;
    }

    get size() {
        return this._map.size;
    }
    add(v) {
        this._map.set(v, undefined);
        return this;
    }
    has(v) {
        return this._map.has(v);
    }
    delete(v) {
        this._map.delete(v);
        return this;
    }
}

function setEquals(one, two) {
    if (one.size !== two.size)
        return false;

    for (let elem of one.values()) {
        if (!two.has(elem))
            return false;
    }

    return true;
}

const ITEM_SET_MARKER = '[ItemSetSep]';

class Terminal {
    constructor(symbol) {
        this.symbol = symbol;
    }

    equals(x) {
        return x instanceof Terminal && x.symbol === this.symbol;
    }

    toString() {
        return `T:${this.symbol}`;
    }
}
Terminal.prototype.isTerminal = true;

class NonTerminal {
    constructor(symbol) {
        this.symbol = symbol;
    }

    equals(x) {
        return x instanceof NonTerminal && x.symbol === this.symbol;
    }

    toString() {
        return `NT:${this.symbol}`;
    }
}
NonTerminal.prototype.isTerminal = false;
NonTerminal.prototype.isNonTerminal = true;

const ROOT_NT = new NonTerminal('$ROOT');

// special tokens start with a space
// so they sort earlier than all other tokens
const PAD_TOKEN = new Terminal(' 0PAD');
const EOF_TOKEN = new Terminal(' 1EOF');
const START_TOKEN = new Terminal(' 2START');

class SLRParserGenerator {
    // Construct a shift-reduce parser given an SLR grammar.

    constructor(grammar, startSymbol) {
        // optimizations first
        this._startSymbol = startSymbol;
        grammar[ROOT_NT.symbol] = [[[new NonTerminal(startSymbol), EOF_TOKEN], `async ($, $0) => $0`]];
        this._numberRules(grammar);
        this._extractTerminalsNonTerminals();
        this._buildFirstSets();
        this._buildFollowSets();
        this._generateAllItemSets();
        this._buildStateTransitionMatrix();
        this._buildParseTables();

        this._checkFirstSets();
        this._checkFollowSets();
    }

    get startSymbolId() {
        return this.terminals.length + this.nonTerminals.indexOf(this._startSymbol);
    }

    _checkFirstSets() {
        for (let [lhs, firstSet] of this._firstSets) {
            if (firstSet.size === 0)
                console.log("WARNING: non-terminal " + lhs + " cannot start with any terminal");
        }
    }

    _checkFollowSets() {
        for (let [lhs, followSet] of this._followSets) {
            if (lhs === '$ROOT')
                continue;
            if (followSet.size === 0)
                console.log("WARNING: non-terminal " + lhs + " cannot be followed by any terminal");
        }
    }

    _extractTerminalsNonTerminals() {
        let terminals = new Set();
        terminals.add(PAD_TOKEN.symbol);
        terminals.add(EOF_TOKEN.symbol);
        terminals.add(START_TOKEN.symbol);
        let nonTerminals = new Set();
        for (let [lhs, rule,] of this.rules) {
            nonTerminals.add(lhs);
            for (let rhs of rule) {
                if (rhs.isTerminal)
                    terminals.add(rhs.symbol);
                else
                    nonTerminals.add(rhs.symbol);
            }
        }

        this.terminals = Array.from(terminals);
        this.terminals.sort();
        this.nonTerminals = Array.from(nonTerminals);
        this.nonTerminals.sort();
        if (DEBUG) {
            console.log('Terminals:', this.terminals);
            console.log('Non-Terminals:', this.nonTerminals);
        }
    }

    printRules() {
        for (let [lhs, rhs,] of this.rules)
            console.log(lhs, '->', rhs.join(' '));
    }

    _numberRules(grammar) {
        this.rules = [];
        this.grammar = new Map;
        for (let lhs in grammar) {
            let rules = grammar[lhs];
            if (!Array.isArray(rules))
                throw new TypeError('Invalid definition for non-terminal ' + lhs);
            if (rules.some((x) => !Array.isArray(x) || x.length !== 2))
                throw new TypeError('Invalid definition for non-terminal ' + lhs);

            this.grammar.set(lhs, []);
            for (let [rule, action] of rules) {
                let ruleId = this.rules.length;
                for (let rhs of rule) {
                    if (rhs.isNonTerminal && !(rhs.symbol in grammar))
                        throw new TypeError('Missing non-terminal ' + rhs);
                }

                this.rules.push([lhs, rule, action]);
                this.grammar.get(lhs).push(ruleId);
                if (DEBUG)
                    console.log(ruleId, lhs, '->', rule);
            }
        }
    }

    *_itemSetFollowers(itemSet) {
        let set = new Set;
        for (let rule of itemSet.rules) {
            let rhs = rule.get(1);
            for (let i = 0; i < rhs.length-1; i++) {
                if (rhs[i] === ITEM_SET_MARKER && rhs[i+1] !== EOF_TOKEN.toString())
                    set.add(rhs[i+1].toString());
            }
        }
        yield* set;
    }

    *_advance(itemSet, token) {
        for (let rule of itemSet.rules) {
            let [rule_id, rhs] = rule.stuff;
            for (let i = 0; i < rhs.length-1; i++) {
                if (rhs[i] === ITEM_SET_MARKER && rhs[i+1] === token) {
                    yield new Tuple(rule_id, rhs.slice(0, i).concat([token, ITEM_SET_MARKER], rhs.slice(i+2)));
                    break;
                }
            }
        }
    }

    *_makeItemSet(lhs) {
        for (let ruleId of this.grammar.get(lhs)) {
            let [, rhs, ] = this.rules[ruleId];
            yield new Tuple(ruleId, [ITEM_SET_MARKER].concat(rhs.map((h) => h.toString())));
        }
    }

    _close(items) {
        let itemSet = new EqualsSet(items);
        let stack = Array.from(itemSet);
        while (stack.length > 0) {
            let item = stack.pop();
            let rhs = item.get(1);
            for (let i = 0; i < rhs.length-1; i++) {
                if (rhs[i] === ITEM_SET_MARKER && rhs[i+1].startsWith('NT:')) {
                    for (let newRule of this._makeItemSet(rhs[i+1].substring(3))) {
                        if (!itemSet.has(newRule)) {
                            itemSet.add(newRule);
                            stack.push(newRule);
                        }
                    }
                    break;
                }
            }
        }
        itemSet = Array.from(itemSet);
        itemSet.sort();
        return itemSet;
    }

    _generateAllItemSets() {
        const itemSets = new EqualsMap();
        let i = 0;
        let itemSet0 = new ItemSet(this._close(this._makeItemSet(ROOT_NT.symbol)));
        let itemSet0Info = new ItemSetInfo();
        itemSets.set(itemSet0, itemSet0Info);
        i++;
        const queue = [];
        queue.push(itemSet0);
        while (queue.length > 0) {
            let itemSet = queue.shift();
            let myInfo = itemSets.get(itemSet);
            for (let nextToken of this._itemSetFollowers(itemSet)) {
                let newset = new ItemSet(this._close(this._advance(itemSet, nextToken)));
                let info;
                if (itemSets.has(newset)) {
                    info = itemSets.get(newset);
                } else {
                    info = new ItemSetInfo();
                    info.id = i++;
                    itemSets.set(newset, info);
                    queue.push(newset);
                }
                info.intransitions.push([myInfo.id, nextToken]);
                myInfo.outtransitions.push([info.id, nextToken]);
            }
        }

        if (DEBUG)
            console.log();
        for (let [itemSet, info] of itemSets) {
            itemSet.info = info;
            if (DEBUG) {
                console.log("Item Set", itemSet.info.id, itemSet.info.intransitions);
                for (let rule of itemSet.rules) {
                    let [rule_id, rhs] = rule.stuff;
                    let [lhs,,] = this.rules[rule_id];
                    console.log(rule_id, lhs, '->', rhs);
                }
                console.log();
            }
        }

        let itemSetList = [];
        for (let [itemSet,] of itemSets)
            itemSetList[itemSet.info.id] = itemSet;
        this._itemSets = itemSetList;
        this._nStates = this._itemSets.length;
    }

    _buildStateTransitionMatrix() {
        this._stateTransitionMatrix = [];
        for (let i = 0; i < this._nStates; i++)
            this._stateTransitionMatrix[i] = new Map;

        for (let itemSet of this._itemSets) {
            for (let [nextId, nextToken] of itemSet.info.outtransitions) {
                if (this._stateTransitionMatrix[itemSet.info.id].has(nextToken))
                    throw new Error("Ambiguous transition from " + itemSet.info.id +  " through " + nextToken + " to " + this._stateTransitionMatrix[itemSet.info.id].get(nextToken) + " and " + nextId);
                this._stateTransitionMatrix[itemSet.info.id].set(nextToken, nextId);
            }
        }

        if (DEBUG) {
            console.log("State Transition Matrix");
            for (let i = 0; i < this._nStates; i++)
                console.log(i, "->", this._stateTransitionMatrix[i]);
        }
    }

    _buildFirstSets() {
        const firstSets = new Map;
        for (let nonterm of this.nonTerminals)
            firstSets.set(nonterm, new Set());
        let progress = true;
        while (progress) {
            progress = false;
            for (let [lhs, rules] of this.grammar) {
                let union = new Set();
                for (let rule_id of rules) {
                    let [, rule,] = this.rules[rule_id];
                    let firstSetRule;
                    // Note: our grammar doesn't include rules of the form A -> epsilon
                    // because it's meant for an SLR parser not an LL parser, so this is
                    // simpler than what Wikipedia describes in the LL parser article
                    if (rule[0].isTerminal)
                        firstSetRule = new Set([rule[0].symbol]);
                    else
                        firstSetRule = firstSets.get(rule[0].symbol) || new Set;
                    for (let elem of firstSetRule)
                        union.add(elem);
                }
                if (!setEquals(union, firstSets.get(lhs))) {
                    firstSets.set(lhs, union);
                    progress = true;
                }
            }
        }

        this._firstSets = firstSets;
        if (DEBUG) {
            console.log();
            console.log("First sets");
            for (let [nonterm, firstSet] of firstSets)
                console.log(nonterm, "->", firstSet);
        }
    }

    _buildFollowSets() {
        const followSets = new Map;
        for (let nonterm of this.nonTerminals)
            followSets.set(nonterm, new Set());

        let progress = true;
        function _addAll(fromSet, intoSet) {
            if (!fromSet)
                return false;
            let progress = false;
            for (let v of fromSet) {
                if (!intoSet.has(v)) {
                    intoSet.add(v);
                    progress = true;
                }
            }
            return progress;
        }

        while (progress) {
            progress = false;
            for (let [lhs, rule,] of this.rules) {
                for (let i = 0; i < rule.length-1; i++) {
                    if (rule[i].isNonTerminal) {
                        if (rule[i+1].isNonTerminal) {
                            progress = _addAll(this._firstSets.get(rule[i+1].symbol), followSets.get(rule[i].symbol)) || progress;
                        } else {
                            if (!followSets.get(rule[i].symbol).has(rule[i+1].symbol)) {
                                followSets.get(rule[i].symbol).add(rule[i+1].symbol);
                                progress = true;
                            }
                        }
                    }
                }
                if (rule[rule.length-1].isNonTerminal)
                    progress = _addAll(followSets.get(lhs), followSets.get(rule[rule.length-1].symbol)) || progress;
            }
        }

        this._followSets = followSets;
        if (DEBUG) {
            console.log();
            console.log("Follow sets");
            for (let [nonterm, followSet] of followSets)
                console.log(nonterm, "->", followSet);
        }
    }

    _recursivePrintItemSet(itemSetId, printed, recurse = 0) {
        if (printed.has(itemSetId))
            return;
        printed.add(itemSetId);

        const itemSet = this._itemSets[itemSetId];
        console.error("Item Set", itemSetId, itemSet.info.intransitions);
        for (let rule of itemSet.rules) {
            let [ruleId, rhs] = rule.stuff;
            let [lhs,,] = this.rules[ruleId];
            console.error(ruleId, lhs, '->', rhs);
        }
        console.error();

        if (recurse > 0) {
            for (let [from,] of itemSet.info.intransitions)
                this._recursivePrintItemSet(from, printed, recurse - 1);
        }
    }

    _buildParseTables() {
        this.gotoTable = [];
        this.actionTable = [];
        for (let i = 0; i < this._nStates; i++) {
            this.gotoTable[i] = Object.create(null);
            this.actionTable[i] = Object.create(null);
        }

        for (let nonterm of this.nonTerminals) {
            for (let i = 0; i < this._nStates; i++) {
                if (this._stateTransitionMatrix[i].has('NT:' + nonterm))
                    this.gotoTable[i][nonterm] = this._stateTransitionMatrix[i].get('NT:' +nonterm);
            }
        }
        for (let term of this.terminals) {
            for (let i = 0; i < this._nStates; i++) {
                if (this._stateTransitionMatrix[i].has('T:' + term))
                    this.actionTable[i][term] = ['shift', this._stateTransitionMatrix[i].get('T:' + term)];
            }
        }

        for (let itemSet of this._itemSets) {
            for (let item of itemSet.rules) {
                let rhs = item.get(1);
                for (let i = 0; i < rhs.length-1; i++) {
                    if (rhs[i] === ITEM_SET_MARKER && rhs[i+1] === EOF_TOKEN.toString())
                        this.actionTable[itemSet.info.id][EOF_TOKEN.symbol] = ['accept'];
                }
            }
        }

        for (let itemSet of this._itemSets) {
            for (let item of itemSet.rules) {
                let [ruleId, rhs] = item.stuff;
                if (rhs[rhs.length-1] !== ITEM_SET_MARKER)
                    continue;
                let [lhs,,] = this.rules[ruleId];
                for (let term of this.terminals) {
                    if (this._followSets.get(lhs).has(term)) {
                        if (term in this.actionTable[itemSet.info.id] && !arrayEquals(this.actionTable[itemSet.info.id][term], ['reduce', ruleId])) {

                            let printed = new Set;
                            this._recursivePrintItemSet(itemSet.info.id, printed);

                            throw new Error("Conflict for state " + itemSet.info.id + " terminal " + term + " want " + ["reduce", ruleId] + " have " + this.actionTable[itemSet.info.id][term]);
                        }
                        this.actionTable[itemSet.info.id][term] = ['reduce', ruleId];
                    }
                }
            }
        }
    }
}
SLRParserGenerator.Terminal = Terminal;
SLRParserGenerator.NonTerminal = NonTerminal;

module.exports = SLRParserGenerator;
