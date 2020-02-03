// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Genie
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const AstNode = require('./base');
const { Input, Statement } = require('./program');
const Optimizer = require('../optimize');
const Typechecking = require('../typecheck');

module.exports.DialogueHistoryResult = class DialogueHistoryResult extends AstNode {
    constructor(location, value) {
        super(location);

        assert(typeof value === 'object');
        this.value = value;
    }

    clone() {
        const newValue = {};
        Object.assign(newValue, this.value);
        return new DialogueHistoryResult(this.location, newValue);
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryResult(this)) {
            for (let key in this.value)
                this.value[key].visit(visitor);
        }
        visitor.exit(this);
    }
};

/**
 * A single item in the dialogue state. Consists of a program and optionally
 * the results from that program.
 *
 * @alias Ast.DialogueHistoryItem
 */
class DialogueHistoryItem extends AstNode {
    constructor(location, stmt, results) {
        super(location);
        assert(stmt instanceof Statement);
        assert(results === null || Array.isArray(results));

        this.stmt = stmt;
        this.results = results;
    }

    optimize() {
        const newStmt = Optimizer.optimizeRule(this.stmt);
        if (newStmt === null)
            return null;
        this.stmt = newStmt;
        return this;
    }

    clone() {
        return new DialogueHistoryItem(this.location, this.stmt.clone(), this.results ? this.results.map((r) => r.clone()) : null);
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryItem(this)) {
            this.stmt.visit(visitor);
            if (this.results !== null) {
                for (let result of this.results)
                    result.visit(visitor);
            }
        }
        visitor.exit(this);
    }

    *iterateSlots() {
        yield* this.stmt.iterateSlots();
        // no slots in a HistoryResult
    }
    *iterateSlots2() {
        yield* this.stmt.iterateSlots2();
        // TODO iterate new-style slots in a HistoryResult
    }
}
module.exports.DialogueHistoryItem = DialogueHistoryItem;

/**
 * The representation of a dialogue state.
 *
 * Syntax:
 * ```
 * <input> = <dlg-type> <dlg-act> <history-item>* { <tt-program> } { <tt-program>? }
 * <history-item> = { <tt-program> } | [ <result-item>* ]
 * <result-item> = { <result-key> , <result-key>* }
 * <result-key> = <pname> = <pvalue>
 * ```
 *
 * - `<dlg-type>` is the type of dialogue (type of policy) to use; for now, only
 * "transaction" is supported
 * - `<dlg-act>` is the abstract dialog act that was last performed, either by the
 * agent or by the user
 * - `<tt-program>` is a ThingTalk program
 *
 * At any time, the agent tracks the current program (that it will execute immediately,
 * if ready) and the optionally the program it will execute next (after the current one).
 *
 * @alias Ast.DialogueState
 */
class DialogueState extends Input {
    constructor(location, policy, dialogueAct, history, delegate = null) {
        super(location);
        assert(typeof policy === 'string');
        assert(typeof dialogueAct === 'string');

        this.dialogueAct = dialogueAct;
        this.history = history;
        this.policy = policy;
        this.delegate = delegate;
    }

    optimize() {
        this.history = this.history.map((prog) => prog.optimize()).filter((prog) => prog !== null);
        return this;
    }

    clone() {
        return new DialogueState(this.location, this.policy, this.dialogueAct,
            this.history.map((item) => item.clone()), this.delegate);
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
