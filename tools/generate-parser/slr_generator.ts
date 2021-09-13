// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

// Generate and SLR parser, given a grammar
// This is JavaScript version of almond-nnparser/grammar/slr.py

const DEBUG = false;

class ItemSetInfo {
    id : number;
    intransitions : Array<[number, string]>;
    outtransitions : Array<[number, string]>;

    constructor() {
        this.id = 0;
        this.intransitions = [];
        this.outtransitions = [];
    }
}

type EqualityComparable = {
    equals(other : unknown) : boolean;
};

function arrayEquals(a : any[], b : any[]) : boolean {
    if (a.length !== b.length)
        return false;

    for (let i = 0; i < a.length; i++) {
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

function strictArrayEquals<T>(a : T[], b : T[]) : boolean {
    if (a.length !== b.length)
        return false;

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }
    return true;
}

class ItemSet implements EqualityComparable {
    rules : Array<Tuple<[number, string[]]>>;
    info : ItemSetInfo;

    constructor(rules : Iterable<Tuple<[number, string[]]>>) {
        this.rules = Array.from(rules);
        this.info = new ItemSetInfo();
    }

    equals(other : ItemSet) : boolean {
        return arrayEquals(this.rules, other.rules);
    }
}

// a python-like tuple, that compares .equals() if all elements compare equals
class Tuple<ArgTypes extends unknown[]> implements EqualityComparable {
    stuff : ArgTypes;

    constructor(...args : ArgTypes) {
        this.stuff = args;
    }

    equals(other : Tuple<ArgTypes>) : boolean {
        return arrayEquals(this.stuff, other.stuff);
    }

    get<K extends number>(i : K) : ArgTypes[K] {
        return this.stuff[i];
    }
    slice(from : number, to : number) : any[] {
        return this.stuff.slice(from, to);
    }
}

// A map that respects equals
// Not asymptotically efficient
class EqualsMap<K extends EqualityComparable, V> {
    private _keys : K[];
    private _values : V[];
    private _size : number;

    constructor(iterable ?: Iterable<[K, V]>) {
        this._keys = [];
        this._values = [];
        this._size = 0;
        if (!iterable)
            return;
        for (const [key, value] of iterable)
            this.set(key, value);
    }

    *[Symbol.iterator]() : Iterator<[K, V]> {
        for (let i = 0; i < this._keys.length; i++)
            yield [this._keys[i], this._values[i]];
    }
    keys() : Iterable<K> {
        return this._keys;
    }
    values() : Iterable<V> {
        return this._values;
    }

    get size() : number {
        return this._size;
    }

    set(key : K, value : V) : this {
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
    get(key : K) : V|undefined {
        for (let i = 0; i < this._keys.length; i++) {
            if (this._keys[i].equals(key))
                return this._values[i];
        }
        return undefined;
    }
    delete(key : K) : this {
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
    has(element : K) : boolean {
        for (let i = 0; i < this._keys.length; i++) {
            if (this._keys[i].equals(element))
                return true;
        }
        return false;
    }
}

class EqualsSet<K extends EqualityComparable> {
    private _map : EqualsMap<K, undefined>;

    constructor(iterable ?: Iterable<K>) {
        this._map = new EqualsMap<K, undefined>();
        if (!iterable)
            return;
        for (const v of iterable)
            this.add(v);
    }

    *[Symbol.iterator]() : Iterator<K> {
        for (const [key, ] of this._map)
            yield key;
    }

    get size() : number {
        return this._map.size;
    }
    add(v : K) : this {
        this._map.set(v, undefined);
        return this;
    }
    has(v : K) : boolean {
        return this._map.has(v);
    }
    delete(v : K) : this {
        this._map.delete(v);
        return this;
    }
}

interface SetLike<T> {
    size : number;
    values() : Iterable<T>;
    [Symbol.iterator]() : Iterator<T>;
    has(x : T) : boolean;
}

function setEquals<T>(one : SetLike<T>, two : SetLike<T>) : boolean {
    if (one.size !== two.size)
        return false;

    for (const elem of one.values()) {
        if (!two.has(elem))
            return false;
    }

    return true;
}

const ITEM_SET_MARKER = '[ItemSetSep]';

export class Terminal implements EqualityComparable {
    isTerminal ! : boolean;
    isNonTerminal ! : boolean;
    symbol : string;
    isConstant : boolean;

    constructor(symbol : string, isConstant : boolean) {
        this.symbol = symbol;
        this.isConstant = isConstant;
    }

    equals(x : unknown) : boolean {
        return x instanceof Terminal && x.symbol === this.symbol;
    }

    toString() : string {
        return `T:${this.symbol}`;
    }

    toWSN() : string {
        if (this.isConstant)
            return '"' + this.symbol.replace(/"/g, '""') + '"';
        else
            return this.symbol;
    }
}
Terminal.prototype.isTerminal = true;
Terminal.prototype.isNonTerminal = false;

export class NonTerminal implements EqualityComparable {
    isTerminal ! : boolean;
    isNonTerminal ! : boolean;
    symbol : string;

    constructor(symbol : string) {
        this.symbol = symbol;
    }

    equals(x : unknown) : boolean {
        return x instanceof NonTerminal && x.symbol === this.symbol;
    }

    toString() : string {
        return `NT:${this.symbol}`;
    }

    toWSN() : string {
        return this.symbol;
    }
}
NonTerminal.prototype.isTerminal = false;
NonTerminal.prototype.isNonTerminal = true;

const ROOT_NT = new NonTerminal('$ROOT');

// special tokens start with a space
// so they sort earlier than all other tokens
const PAD_TOKEN = new Terminal(' 0PAD', false);
const EOF_TOKEN = new Terminal(' 1EOF', false);
const START_TOKEN = new Terminal(' 2START', false);

export type ProcessedRule = [Array<NonTerminal|Terminal>, string];
export type ProcessedGrammar = { [key : string] : ProcessedRule[] };

type ActionTable = Array<{ [key : string] : ['accept'|'shift'|'reduce', number] }>;
type GotoTable = Array<{ [key : string] : number }>;

/**
 * Construct a shift-reduce parser given an SLR grammar.
 */
export class SLRParserGenerator {
    private _startSymbol : string;
    rules ! : Array<[string, ...ProcessedRule]>;
    grammar ! : Map<string, number[]>;
    terminals ! : string[];
    nonTerminals ! : string[];
    gotoTable ! : GotoTable;
    actionTable ! : ActionTable;

    private _itemSets ! : ItemSet[];
    private _nStates ! : number;
    private _firstSets ! : Map<string, Set<string>>;
    private _followSets ! : Map<string, Set<string>>;
    private _stateTransitionMatrix ! : Array<Map<string, number>>;

    constructor(grammar : ProcessedGrammar, startSymbol : string, rootType : string, optionType : string) {
        // optimizations first
        this._startSymbol = startSymbol;
        grammar[ROOT_NT.symbol] = [[[new NonTerminal(startSymbol), EOF_TOKEN],
            `($ : $runtime.ParserInterface<${optionType}>, $0 : ${rootType}) : ${rootType} => $0`]];
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

    private _checkFirstSets() {
        for (const [lhs, firstSet] of this._firstSets) {
            if (firstSet.size === 0)
                console.log("WARNING: non-terminal " + lhs + " cannot start with any terminal");
        }
    }

    private _checkFollowSets() {
        for (const [lhs, followSet] of this._followSets) {
            if (lhs === '$ROOT')
                continue;
            if (followSet.size === 0)
                console.log("WARNING: non-terminal " + lhs + " cannot be followed by any terminal");
        }
    }

    private _extractTerminalsNonTerminals() {
        const terminals = new Set<string>();
        terminals.add(PAD_TOKEN.symbol);
        terminals.add(EOF_TOKEN.symbol);
        terminals.add(START_TOKEN.symbol);
        const nonTerminals = new Set<string>();
        for (const [lhs, rule,] of this.rules) {
            nonTerminals.add(lhs);
            for (const rhs of rule) {
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
        for (const [lhs, rhs,] of this.rules)
            console.log(lhs, '->', rhs.join(' '));
    }

    private _numberRules(grammar : ProcessedGrammar) {
        this.rules = [];
        this.grammar = new Map;
        for (const lhs in grammar) {
            const rules = grammar[lhs];
            if (!Array.isArray(rules))
                throw new TypeError('Invalid definition for non-terminal ' + lhs);
            if (rules.some((x) => !Array.isArray(x) || x.length !== 2))
                throw new TypeError('Invalid definition for non-terminal ' + lhs);

            this.grammar.set(lhs, []);
            for (const [rule, action] of rules) {
                const ruleId = this.rules.length;
                for (const rhs of rule) {
                    if (rhs.isNonTerminal && !(rhs.symbol in grammar))
                        throw new TypeError('Missing non-terminal ' + rhs);
                }

                this.rules.push([lhs, rule, action]);
                this.grammar.get(lhs)!.push(ruleId);
                if (DEBUG)
                    console.log(ruleId, lhs, '->', rule);
            }
        }
    }

    private *_itemSetFollowers(itemSet : ItemSet) {
        const set = new Set<string>();
        for (const rule of itemSet.rules) {
            const rhs = rule.get(1);
            for (let i = 0; i < rhs.length-1; i++) {
                if (rhs[i] === ITEM_SET_MARKER && rhs[i+1] !== EOF_TOKEN.toString())
                    set.add(rhs[i+1].toString());
            }
        }
        yield* set;
    }

    private *_advance(itemSet : ItemSet, token : string) {
        for (const rule of itemSet.rules) {
            const [rule_id, rhs] = rule.stuff;
            for (let i = 0; i < rhs.length-1; i++) {
                if (rhs[i] === ITEM_SET_MARKER && rhs[i+1] === token) {
                    yield new Tuple(rule_id, rhs.slice(0, i).concat([token, ITEM_SET_MARKER], rhs.slice(i+2)));
                    break;
                }
            }
        }
    }

    private *_makeItemSet(lhs : string) : Generator<Tuple<[number, string[]]>, void> {
        for (const ruleId of this.grammar.get(lhs)!) {
            const [, rhs, ] = this.rules[ruleId];
            yield new Tuple(ruleId, [ITEM_SET_MARKER].concat(rhs.map((h) => h.toString())));
        }
    }

    private _close(items : Iterable<Tuple<[number, string[]]>>) {
        const itemSet = new EqualsSet(items);
        const stack = Array.from(itemSet);
        while (stack.length > 0) {
            const item = stack.pop()!;
            const rhs = item.get(1);
            for (let i = 0; i < rhs.length-1; i++) {
                if (rhs[i] === ITEM_SET_MARKER && rhs[i+1].startsWith('NT:')) {
                    for (const newRule of this._makeItemSet(rhs[i+1].substring(3))) {
                        if (!itemSet.has(newRule)) {
                            itemSet.add(newRule);
                            stack.push(newRule);
                        }
                    }
                    break;
                }
            }
        }
        const itemSetArray = Array.from(itemSet);
        itemSetArray.sort();
        return itemSetArray;
    }

    private _generateAllItemSets() {
        const itemSets = new EqualsMap<ItemSet, ItemSetInfo>();
        let i = 0;
        const itemSet0 = new ItemSet(this._close(this._makeItemSet(ROOT_NT.symbol)));
        itemSets.set(itemSet0, itemSet0.info);
        i++;
        const queue = [];
        queue.push(itemSet0);
        while (queue.length > 0) {
            const itemSet = queue.shift()!;
            const myInfo = itemSets.get(itemSet)!;
            for (const nextToken of this._itemSetFollowers(itemSet)) {
                const newset : ItemSet = new ItemSet(this._close(this._advance(itemSet, nextToken)));
                let info;
                if (itemSets.has(newset)) {
                    info = itemSets.get(newset)!;
                    newset.info = info;
                } else {
                    info = newset.info;
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
        for (const [itemSet, info] of itemSets) {
            itemSet.info = info;
            if (DEBUG) {
                console.log("Item Set", itemSet.info.id, itemSet.info.intransitions);
                for (const rule of itemSet.rules) {
                    const [rule_id, rhs] = rule.stuff;
                    const [lhs,,] = this.rules[rule_id];
                    console.log(rule_id, lhs, '->', rhs);
                }
                console.log();
            }
        }

        const itemSetList = [];
        for (const [itemSet,] of itemSets)
            itemSetList[itemSet.info.id] = itemSet;
        this._itemSets = itemSetList;
        this._nStates = this._itemSets.length;
    }

    private _buildStateTransitionMatrix() {
        this._stateTransitionMatrix = [];
        for (let i = 0; i < this._nStates; i++)
            this._stateTransitionMatrix[i] = new Map;

        for (const itemSet of this._itemSets) {
            for (const [nextId, nextToken] of itemSet.info.outtransitions) {
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

    private _buildFirstSets() {
        const firstSets = new Map<string, Set<string>>();
        for (const nonterm of this.nonTerminals)
            firstSets.set(nonterm, new Set<string>());
        let progress = true;
        while (progress) {
            progress = false;
            for (const [lhs, rules] of this.grammar) {
                const union = new Set<string>();
                for (const rule_id of rules) {
                    const [, rule,] = this.rules[rule_id];
                    let firstSetRule;
                    // Note: our grammar doesn't include rules of the form A -> epsilon
                    // because it's meant for an SLR parser not an LL parser, so this is
                    // simpler than what Wikipedia describes in the LL parser article
                    if (rule[0].isTerminal)
                        firstSetRule = new Set([rule[0].symbol]);
                    else
                        firstSetRule = firstSets.get(rule[0].symbol) || new Set<string>();
                    for (const elem of firstSetRule)
                        union.add(elem);
                }
                if (!setEquals(union, firstSets.get(lhs)!)) {
                    firstSets.set(lhs, union);
                    progress = true;
                }
            }
        }

        this._firstSets = firstSets;
        if (DEBUG) {
            console.log();
            console.log("First sets");
            for (const [nonterm, firstSet] of firstSets)
                console.log(nonterm, "->", firstSet);
        }
    }

    private _buildFollowSets() {
        const followSets = new Map<string, Set<string>>();
        for (const nonterm of this.nonTerminals)
            followSets.set(nonterm, new Set<string>());

        let progress = true;
        function _addAll<T>(fromSet : Set<T>, intoSet : Set<T>) : boolean {
            if (!fromSet)
                return false;
            let progress = false;
            for (const v of fromSet) {
                if (!intoSet.has(v)) {
                    intoSet.add(v);
                    progress = true;
                }
            }
            return progress;
        }

        while (progress) {
            progress = false;
            for (const [lhs, rule,] of this.rules) {
                for (let i = 0; i < rule.length-1; i++) {
                    if (rule[i].isNonTerminal) {
                        if (rule[i+1].isNonTerminal) {
                            progress = _addAll(this._firstSets.get(rule[i+1].symbol)!, followSets.get(rule[i].symbol)!) || progress;
                        } else {
                            if (!followSets.get(rule[i].symbol)!.has(rule[i+1].symbol)) {
                                followSets.get(rule[i].symbol)!.add(rule[i+1].symbol);
                                progress = true;
                            }
                        }
                    }
                }
                if (rule[rule.length-1].isNonTerminal)
                    progress = _addAll(followSets.get(lhs)!, followSets.get(rule[rule.length-1].symbol)!) || progress;
            }
        }

        this._followSets = followSets;
        if (DEBUG) {
            console.log();
            console.log("Follow sets");
            for (const [nonterm, followSet] of followSets)
                console.log(nonterm, "->", followSet);
        }
    }

    private _recursivePrintItemSet(itemSetId : number, printed : Set<number>, recurse = 0) {
        if (printed.has(itemSetId))
            return;
        printed.add(itemSetId);

        const itemSet = this._itemSets[itemSetId];
        console.error("Item Set", itemSetId, itemSet.info.intransitions);
        for (const rule of itemSet.rules) {
            const [ruleId, rhs] = rule.stuff;
            const [lhs,,] = this.rules[ruleId];
            console.error(ruleId, lhs, '->', rhs);
        }
        console.error();

        if (recurse > 0) {
            for (const [from,] of itemSet.info.intransitions)
                this._recursivePrintItemSet(from, printed, recurse - 1);
        }
    }

    private _buildParseTables() {
        this.gotoTable = [];
        this.actionTable = [];
        for (let i = 0; i < this._nStates; i++) {
            this.gotoTable[i] = Object.create(null);
            this.actionTable[i] = Object.create(null);
        }

        for (const nonterm of this.nonTerminals) {
            for (let i = 0; i < this._nStates; i++) {
                if (this._stateTransitionMatrix[i].has('NT:' + nonterm))
                    this.gotoTable[i][nonterm] = this._stateTransitionMatrix[i].get('NT:' +nonterm)!;
            }
        }
        for (const term of this.terminals) {
            for (let i = 0; i < this._nStates; i++) {
                if (this._stateTransitionMatrix[i].has('T:' + term))
                    this.actionTable[i][term] = ['shift', this._stateTransitionMatrix[i].get('T:' + term)!];
            }
        }

        for (const itemSet of this._itemSets) {
            for (const item of itemSet.rules) {
                const rhs = item.get(1);
                for (let i = 0; i < rhs.length-1; i++) {
                    if (rhs[i] === ITEM_SET_MARKER && rhs[i+1] === EOF_TOKEN.toString())
                        this.actionTable[itemSet.info.id][EOF_TOKEN.symbol] = ['accept', 0];
                }
            }
        }

        for (const itemSet of this._itemSets) {
            for (const item of itemSet.rules) {
                const [ruleId, rhs] : [number, string[]] = item.stuff;
                if (rhs[rhs.length-1] !== ITEM_SET_MARKER)
                    continue;
                const [lhs,,] = this.rules[ruleId];
                for (const term of this.terminals) {
                    if (this._followSets.get(lhs)!.has(term)) {
                        const existing = this.actionTable[itemSet.info.id][term];
                        if (existing) {
                            if (strictArrayEquals(existing, ['reduce', ruleId]))
                                continue;

                            const printed = new Set<number>();
                            this._recursivePrintItemSet(itemSet.info.id, printed);
                            if (existing[0] === 'shift')
                                console.log(`WARNING: ignored shift-reduce conflict at state ${itemSet.info.id} terminal ${term} want ${["reduce", ruleId]} have ${existing}`);
                            else
                                throw new Error(`Conflict for state ${itemSet.info.id} terminal ${term} want ${["reduce", ruleId]} have ${existing}`);
                        } else {
                            this.actionTable[itemSet.info.id][term] = ['reduce', ruleId];
                        }
                    }
                }
            }
        }
    }
}
