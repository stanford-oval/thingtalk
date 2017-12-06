// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// Generate and SLR parser, given a grammar
// This is JavaScript version of almond-nnparser/grammar/slr.py

const path = require('path');
const fs = require('fs');

const EOF_TOKEN = '<<EOF>>';
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

class SLRParserGenerator {
    /*
    Construct a shift-reduce parser given an SLR grammar.

    The grammar must be binarized beforehand.
    */

    constructor(grammar, startSymbol) {
        // optimizations first
        this._startSymbol = startSymbol;
        grammar['$ROOT'] = [[[startSymbol, EOF_TOKEN], (x) => x]];
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
        let nonTerminals = new Set();
        for (let [lhs, rule,] of this.rules) {
            nonTerminals.add(lhs);
            for (let rhs of rule) {
                if (rhs[0] !== '$')
                    terminals.add(rhs);
                else
                    nonTerminals.add(rhs);
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
                    if (!(rhs in grammar) && rhs[0] === '$')
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
                if (rhs[i] === '*' && rhs[i+1] !== EOF_TOKEN)
                    set.add(rhs[i+1]);
            }
        }
        yield* set;
    }

    *_advance(itemSet, token) {
        for (let rule of itemSet.rules) {
            let [rule_id, rhs] = rule.stuff;
            for (let i = 0; i < rhs.length-1; i++) {
                if (rhs[i] === '*' && rhs[i+1] === token) {
                    yield new Tuple(rule_id, rhs.slice(0, i).concat([token, '*'], rhs.slice(i+2)));
                    break;
                }
            }
        }
    }

    *_makeItemSet(lhs) {
        for (let ruleId of this.grammar.get(lhs)) {
            let [, rhs, ] = this.rules[ruleId];
            yield new Tuple(ruleId, ['*'].concat(rhs));
        }
    }

    _close(items) {
        function _isNonterminal(symbol) {
            return symbol[0] === '$';
        }

        let itemSet = new EqualsSet(items);
        let stack = Array.from(itemSet);
        while (stack.length > 0) {
            let item = stack.pop();
            let rhs = item.get(1);
            for (let i = 0; i < rhs.length-1; i++) {
                if (rhs[i] === '*' && _isNonterminal(rhs[i+1])) {
                    for (let newRule of this._makeItemSet(rhs[i+1])) {
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
        let itemSet0 = new ItemSet(this._close(this._makeItemSet('$ROOT')));
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
        function _isTerminal(symbol) {
            return symbol[0] !== '$';
        }

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
                    if (_isTerminal(rule[0]))
                        firstSetRule = new Set([rule[0]]);
                    else
                        firstSetRule = firstSets.get(rule[0]) || new Set;
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
        function _isNonterminal(symbol) {
            return symbol[0] === '$';
        }

        while (progress) {
            progress = false;
            for (let [lhs, rule,] of this.rules) {
                for (let i = 0; i < rule.length-1; i++) {
                    if (_isNonterminal(rule[i])) {
                        if (_isNonterminal(rule[i+1])) {
                            progress = _addAll(this._firstSets.get(rule[i+1]), followSets.get(rule[i])) || progress;
                        } else {
                            if (!followSets.get(rule[i]).has(rule[i+1])) {
                                followSets.get(rule[i]).add(rule[i+1]);
                                progress = true;
                            }
                        }
                    }
                }
                if (_isNonterminal(rule[rule.length-1]))
                    progress = _addAll(followSets.get(lhs), followSets.get(rule[rule.length-1])) || progress;
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

    _buildParseTables() {
        this.gotoTable = [];
        this.actionTable = [];
        for (let i = 0; i < this._nStates; i++) {
            this.gotoTable[i] = {};
            this.actionTable[i] = {};
        }

        for (let nonterm of this.nonTerminals) {
            for (let i = 0; i < this._nStates; i++) {
                if (this._stateTransitionMatrix[i].has(nonterm))
                    this.gotoTable[i][nonterm] = this._stateTransitionMatrix[i].get(nonterm);
            }
        }
        for (let term of this.terminals) {
            for (let i = 0; i < this._nStates; i++) {
                if (this._stateTransitionMatrix[i].has(term))
                    this.actionTable[i][term] = ['shift', this._stateTransitionMatrix[i].get(term)];
            }
        }

        for (let itemSet of this._itemSets) {
            for (let item of itemSet.rules) {
                let rhs = item.get(1);
                for (let i = 0; i < rhs.length-1; i++) {
                    if (rhs[i] === '*' && rhs[i+1] === EOF_TOKEN)
                        this.actionTable[itemSet.info.id][EOF_TOKEN] = ['accept'];
                }
            }
        }

        for (let itemSet of this._itemSets) {
            for (let item of itemSet.rules) {
                let [ruleId, rhs] = item.stuff;
                if (rhs[rhs.length-1] !== '*')
                    continue;
                let [lhs,,] = this.rules[ruleId];
                for (let term of this.terminals) {
                    if (this._followSets.get(lhs).has(term)) {
                        if (term in this.actionTable[itemSet.info.id] && !arrayEquals(this.actionTable[itemSet.info.id][term], ['reduce', ruleId])) {
                            console.log("Item Set", itemSet.info.id, itemSet.info.intransitions);
                            for (let rule of itemSet.rules) {
                                let [ruleId, rhs] = rule.stuff;
                                let [lhs,,] = this.rules[ruleId];
                                console.log(ruleId, lhs, '->', rhs);
                            }
                            console.log();
                            throw new Error("Conflict for state " + itemSet.info.id + " terminal " + term + " want " + ["reduce", ruleId] + " have " + this.actionTable[itemSet.info.id][term]);
                        }
                        this.actionTable[itemSet.info.id][term] = ['reduce', ruleId];
                    }
                }
            }
        }
    }
}

function main() {
    const grammar = require(path.resolve(process.argv[2]));
    const startSymbol = process.argv[3];

    let generator = new SLRParserGenerator(grammar, startSymbol);

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
    for (let i = 0; i < generator.actionTable.length; i++) {
        ACTION_TABLE[i] = {};
        for (let term in generator.actionTable[i]) {
            let [action, param] = generator.actionTable[i][term];
            if (action === 'accept')
                ACTION_TABLE[i][TERMINAL_IDS[term]] = [0];
            else if (action === 'shift')
                ACTION_TABLE[i][TERMINAL_IDS[term]] = [1, param];
            else if (action === 'reduce')
                ACTION_TABLE[i][TERMINAL_IDS[term]] = [2, param];
        }
    }

    console.log(fs.readFileSync(path.resolve(process.argv[2])).toString());
    console.log(`const TERMINAL_IDS = ${JSON.stringify(TERMINAL_IDS)};`);
    console.log(`const RULE_NON_TERMINALS = ${JSON.stringify(RULE_NON_TERMINALS)};`);
    console.log(`const ARITY = ${JSON.stringify(generator.rules.map(([,rhs,]) => rhs.length))};`);
    console.log(`const GOTO = ${JSON.stringify(GOTO_TABLE)};`);
    console.log(`const PARSER_ACTION = ${JSON.stringify(ACTION_TABLE)};`);
    console.log(`const SEMANTIC_ACTION = [`);
    for (let [,,action] of generator.rules)
        console.log(`(${action.toString()}),`);
    console.log(`];`);
    console.log(`module.exports = require('./sr_parser')(TERMINAL_IDS, RULE_NON_TERMINALS, ARITY, GOTO, PARSER_ACTION, SEMANTIC_ACTION);`);
}
main();
