// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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

const assert = require('assert');

const AstNode = require('./base');
const { Input, Statement } = require('./program');
const Optimizer = require('../optimize');
const Typechecking = require('../typecheck');
const { prettyprintStatement, prettyprintHistoryItem } = require('../prettyprint');
const { Value } = require('./values');
const NodeVisitor = require('./visitor');
const { ResultSlot, recursiveYieldArraySlots } = require('./slots');

module.exports.DialogueHistoryResultItem = class DialogueHistoryResultItem extends AstNode {
    constructor(location, value, raw = null) {
        super(location);

        assert(typeof value === 'object');
        this.value = value;

        assert(raw === null || typeof raw === 'object');
        this.raw = raw;
    }

    clone() {
        const newValue = {};
        Object.assign(newValue, this.value);
        return new DialogueHistoryResultItem(this.location, newValue, this.raw);
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryResultItem(this)) {
            for (let key in this.value)
                this.value[key].visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots2(schema) {
        for (let key in this.value) {
            let arg = schema ? schema.getArgument(key) : null;
            yield* recursiveYieldArraySlots(new ResultSlot(null, {}, arg, this.value, key));
        }
    }

    equals(other) {
        const keys = Object.keys(this.value).sort();
        const otherkeys = Object.keys(other.value).sort();
        if (keys.length !== otherkeys.length)
            return false;
        for (let i = 0; i < keys.length; i++) {
            if (keys[i] !== otherkeys[i])
                return false;
            if (!this.value[keys[i]].equals(other.value[otherkeys[i]]))
                return false;
        }
        return true;
    }
};

function setEquals(set1, set2) {
    if (set1.size !== set2.size)
        return false;
    for (let el of set1) {
        if (!set2.has(el))
            return false;
    }
    return true;
}

/**
 * A wrapper for results that contains the current page of results to present, the
 * total number of results and whether there are more results that have not been
 * fetched.
 */
class DialogueHistoryResultList extends AstNode {
    constructor(location, results, count, more = false, error = null) {
        super(location);
        assert(Array.isArray(results));
        assert(count instanceof Value);
        // either count is not a number (it's a __const_ token) or it's at least as many as the results we see
        assert(!count.isNumber || count.value >= results.length);
        // at least one results is always presented, unless there are truly no results
        assert(results.length > 0 || (count.isNumber && count.value === 0));
        assert(typeof more === 'boolean');

        this.results = results;
        this.count = count;
        this.more = more;
        this.error = error;
    }

    clone() {
        return new DialogueHistoryResultList(this.location, this.results.map((r) => r.clone()), this.count.clone(), this.more, this.error);
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryResultList(this)) {
            for (let result of this.results)
                result.visit(visitor);
            if (this.error)
                this.error.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots2(schema) {
        for (let result of this.results)
            yield* result.iterateSlots2(schema);
    }

    equals(other) {
        if (this === other)
            return true;
        if (this.more === other.more || !this.count.equals(other.count))
            return false;

        if (this.results.length !== other.results.length)
            return false;
        for (let i = 0; i < this.results.length; i++) {
            if (!this.results[i].equals(other.results[i]))
                return false;
        }
        return true;
    }
}
module.exports.DialogueHistoryResultList = DialogueHistoryResultList;

/**
 * A single item in the dialogue state. Consists of a program and optionally
 * the results from that program.
 *
 * @alias Ast.DialogueHistoryItem
 */
class DialogueHistoryItem extends AstNode {
    constructor(location, stmt, results, confirm) {
        super(location);
        assert(stmt instanceof Statement);
        assert(results === null || results instanceof DialogueHistoryResultList);
        if (typeof confirm === 'boolean')
            confirm = confirm ? 'confirmed' : 'accepted';
        assert(['proposed', 'accepted', 'confirmed'].includes(confirm));

        this.stmt = stmt;
        this.results = results;
        this.confirm = confirm;
    }

    _getFunctions() {
        const functions = new Set;
        const visitor = new class extends NodeVisitor {
            visitInvocation(invocation) {
                assert(invocation.selector.isDevice);
                functions.add('call:' + invocation.selector.kind + ':' + invocation.channel);
                return false;
            }
        };
        this.stmt.visit(visitor);
        return functions;
    }

    prettyprint(prefix = '') {
        return prettyprintHistoryItem(this, prefix);
    }

    compatible(other) {
        return setEquals(this._getFunctions(), other._getFunctions());
    }

    equals(other) {
        if (this === other)
            return true;
        if (this.confirm !== other.confirm)
            return false;

        // HACK prettyprint to compare for equality is quite expensive, we should open-code
        // equality properly
        if (prettyprintStatement(this.stmt) !== prettyprintStatement(other.stmt))
            return false;

        if ((this.results !== null) !== (other.results !== null))
            return false;
        if (this.results === null)
            return false;

        if (this.results.length !== other.results.length)
            return false;
        for (let i = 0; i < this.results.length; i++) {
            if (!this.results[i].equals(other.results[i]))
                return false;
        }
        return true;
    }

    optimize() {
        const newStmt = Optimizer.optimizeRule(this.stmt);
        if (newStmt === null)
            return null;
        this.stmt = newStmt;
        return this;
    }

    clone() {
        return new DialogueHistoryItem(this.location, this.stmt.clone(), this.results ? this.results.clone() : null, this.confirm);
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryItem(this)) {
            this.stmt.visit(visitor);
            if (this.results !== null)
                this.results.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() {
        yield* this.stmt.iterateSlots();
        // no slots in a HistoryResult
    }
    *iterateSlots2() {
        yield* this.stmt.iterateSlots2();
        if (this.results === null)
            return;

        let stmtSchema = this.stmt.isCommand && this.stmt.actions.every((a) => a.isNotify) ? this.stmt.table.schema : null;
        yield* this.results.iterateSlots2(stmtSchema);
    }
}
module.exports.DialogueHistoryItem = DialogueHistoryItem;

/**
 * The representation of a dialogue state.
 *
 * It is composed of:
 *
 * - A policy name (which is used as a namespace for the dialogueAct)
 * - The current abstract dialogue act
 * - An parameter name that modifies the current dialogue act (optional, used for questions from the agent)
 * - The history of all programs up to that point, and all programs that are scheduled to execute
 *
 * @alias Ast.DialogueState
 */
class DialogueState extends Input {
    constructor(location, policy, dialogueAct, dialogueActParam, history) {
        super(location);
        assert(typeof policy === 'string');
        assert(typeof dialogueAct === 'string');
        assert(dialogueActParam === null || typeof dialogueActParam === 'string' || Array.isArray(dialogueActParam));

        this.dialogueAct = dialogueAct;
        this.dialogueActParam = typeof dialogueActParam === 'string' ? [dialogueActParam] : dialogueActParam;
        this.history = history;
        this.policy = policy;

        this._current = null;
        this.updateCurrent();
    }

    /**
     * The most recently executed history item.
     * @type {Ast.DialogueHistoryItem}
     * @readonly
     */
    get current() {
        return this._current;
    }

    updateCurrent() {
        for (let item of this.history) {
            if (item.results !== null)
                this._current = item;
        }
    }

    optimize() {
        this.history = this.history.map((prog) => prog.optimize()).filter((prog) => prog !== null);
        return this;
    }

    clone() {
        return new DialogueState(this.location, this.policy, this.dialogueAct, this.dialogueActParam,
            this.history.map((item) => item.clone()));
    }

    typecheck(schemas, getMeta = false) {
        return Typechecking.typeCheckDialogue(this, schemas, getMeta).then(() => this);
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitDialogueState(this)) {
            for (let item of this.history)
                item.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() {
        for (let item of this.history)
            yield* item.iterateSlots();
    }
    *iterateSlots2() {
        for (let item of this.history)
            yield* item.iterateSlots2();
    }
}
module.exports.DialogueState = DialogueState;
DialogueState.prototype.isDialogueState = true;
Input.DialogueState = DialogueState;
