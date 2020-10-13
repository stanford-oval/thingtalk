// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import assert from 'assert';

import AstNode, { SourceRange } from './base';
import { Input, Statement, Rule, Command } from './program';
import * as Optimizer from '../optimize';
import * as Typechecking from '../typecheck';
import { prettyprintStatement, prettyprintHistoryItem } from '../prettyprint';
import { DeviceSelector, Invocation } from './expression';
import { Value, NumberValue } from './values';
import { ExpressionSignature, FunctionDef } from './function_def';
import NodeVisitor from './visitor';
import {
    OldSlot,
    AbstractSlot,
    ResultSlot,
    recursiveYieldArraySlots
} from './slots';
import type SchemaRetriever from '../schema';

type ResultMap = { [key : string] : Value };
type RawResultMap = { [key : string] : unknown };

export class DialogueHistoryResultItem extends AstNode {
    value : ResultMap;
    raw : RawResultMap|null;

    constructor(location : SourceRange|null,
                value : ResultMap,
                raw : RawResultMap|null = null) {
        super(location);

        assert(typeof value === 'object');
        this.value = value;

        assert(raw === null || typeof raw === 'object');
        this.raw = raw;
    }

    clone() : DialogueHistoryResultItem {
        const newValue : ResultMap = {};
        Object.assign(newValue, this.value);
        return new DialogueHistoryResultItem(this.location, newValue, this.raw);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryResultItem(this)) {
            for (const key in this.value)
                this.value[key].visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots2(schema : ExpressionSignature|null) : Generator<DeviceSelector|AbstractSlot, void> {
        for (const key in this.value) {
            const arg = (schema ? schema.getArgument(key) : null) || null;
            yield* recursiveYieldArraySlots(new ResultSlot(null, {}, arg, this.value, key));
        }
    }

    equals(other : DialogueHistoryResultItem) : boolean {
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
}

function setEquals<T>(set1 : Set<T>, set2 : Set<T>) : boolean {
    if (set1.size !== set2.size)
        return false;
    for (const el of set1) {
        if (!set2.has(el))
            return false;
    }
    return true;
}

/**
 * A wrapper for results that contains the current page of results to present, the
 * total number of results and whether there are more results that have not been
 * fetched.
 *
 * @alias Ast.DialogueHistoryResultList
 */
export class DialogueHistoryResultList extends AstNode {
    results : DialogueHistoryResultItem[];
    count : Value;
    more : boolean;
    error : Value|null;

    constructor(location : SourceRange|null,
                results : DialogueHistoryResultItem[],
                count : Value,
                more = false,
                error : Value|null = null) {
        super(location);
        assert(Array.isArray(results));
        assert(count instanceof Value);
        // either count is not a number (it's a __const_ token) or it's at least as many as the results we see
        assert(!(count instanceof NumberValue) || count.value >= results.length);
        // at least one results is always presented, unless there are truly no results
        assert(results.length > 0 || (count instanceof NumberValue && count.value === 0));
        assert(typeof more === 'boolean');

        this.results = results;
        this.count = count;
        this.more = more;
        this.error = error;
    }

    clone() : DialogueHistoryResultList {
        return new DialogueHistoryResultList(this.location, this.results.map((r) => r.clone()), this.count.clone(), this.more, this.error);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryResultList(this)) {
            for (const result of this.results)
                result.visit(visitor);
            if (this.error)
                this.error.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots2(schema : ExpressionSignature|null) : Generator<DeviceSelector|AbstractSlot, void> {
        for (const result of this.results)
            yield* result.iterateSlots2(schema);
    }

    equals(other : DialogueHistoryResultList) : boolean {
        if (this === other)
            return true;
        if (this.more === other.more || !this.count.equals(other.count))
            return false;
        if (this.error !== other.error) {
            if (!this.error || !other.error)
                return false;
            if (!this.error.equals(other.error))
                return false;
        }

        if (this.results.length !== other.results.length)
            return false;
        for (let i = 0; i < this.results.length; i++) {
            if (!this.results[i].equals(other.results[i]))
                return false;
        }
        return true;
    }
}

export type ConfirmationState = 'proposed' | 'accepted' | 'confirmed';
type ExecutableStatement = Rule | Command;

/**
 * A single item in the dialogue state. Consists of a program and optionally
 * the results from that program.
 *
 * @alias Ast.DialogueHistoryItem
 */
export class DialogueHistoryItem extends AstNode {
    stmt : ExecutableStatement;
    results : DialogueHistoryResultList|null;
    confirm : ConfirmationState;

    constructor(location : SourceRange|null,
                stmt : ExecutableStatement,
                results : DialogueHistoryResultList|null,
                confirm : ConfirmationState|boolean) {
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

    private _getFunctions() {
        const functions = new Set;
        const visitor = new class extends NodeVisitor {
            visitInvocation(invocation : Invocation) {
                functions.add(`call:${invocation.selector.kind}:${invocation.channel}`);
                return false;
            }
        };
        this.stmt.visit(visitor);
        return functions;
    }

    prettyprint(prefix = '') : string {
        return prettyprintHistoryItem(this, prefix);
    }

    compatible(other : DialogueHistoryItem) : boolean {
        return setEquals(this._getFunctions(), other._getFunctions());
    }

    isExecutable() : boolean {
        let hasUndefined = false;
        const visitor = new class extends NodeVisitor {
            visitInvocation(invocation : Invocation) {
                const schema = invocation.schema;
                assert(schema instanceof FunctionDef);
                const requireEither = schema.getAnnotation<string[][]>('require_either');
                if (requireEither) {
                    const params = new Set<string>();
                    for (const in_param of invocation.in_params)
                        params.add(in_param.name);

                    for (const requirement of requireEither) {
                        let satisfied = false;
                        for (const option of requirement) {
                            if (params.has(option)) {
                                satisfied = true;
                                break;
                            }
                        }
                        if (!satisfied)
                            hasUndefined = true;
                    }
                }

                return true;
            }

            visitValue(value : Value) {
                if (value.isUndefined)
                    hasUndefined = true;
                return true;
            }
        };
        this.stmt.visit(visitor);
        return !hasUndefined;
    }

    equals(other : DialogueHistoryItem) : boolean {
        if (this === other)
            return true;
        if (this.confirm !== other.confirm)
            return false;

        // HACK prettyprint to compare for equality is quite expensive, we should open-code
        // equality properly
        if (prettyprintStatement(this.stmt) !== prettyprintStatement(other.stmt))
            return false;

        if (this.results === other.results)
            return true;
        if (this.results === null || other.results === null)
            return false;
        return this.results.equals(other.results);
    }

    optimize() : this|null {
        const newStmt = Optimizer.optimizeRule(this.stmt);
        if (newStmt === null)
            return null;
        this.stmt = newStmt;
        return this;
    }

    clone() : DialogueHistoryItem {
        return new DialogueHistoryItem(this.location, this.stmt.clone(), this.results ? this.results.clone() : null, this.confirm);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryItem(this)) {
            this.stmt.visit(visitor);
            if (this.results !== null)
                this.results.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        yield* this.stmt.iterateSlots();
        // no slots in a HistoryResult
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.stmt.iterateSlots2();
        if (this.results === null)
            return;

        const stmtSchema = this.stmt instanceof Command &&
            this.stmt.actions.every((a) => a.isNotify) &&
            this.stmt.table ? this.stmt.table.schema : null;
        yield* this.results.iterateSlots2(stmtSchema);
    }
}

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
export class DialogueState extends Input {
    policy : string;
    dialogueAct : string;
    dialogueActParam : string[]|null;
    history : DialogueHistoryItem[];

    private _current : DialogueHistoryItem|null;

    constructor(location : SourceRange|null,
                policy : string,
                dialogueAct : string,
                dialogueActParam : string[]|string|null,
                history : DialogueHistoryItem[]) {
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
    get current() : DialogueHistoryItem|null {
        return this._current;
    }

    private updateCurrent() {
        for (const item of this.history) {
            if (item.results !== null)
                this._current = item;
        }
    }

    optimize() : this {
        this.history = this.history.map((prog) => prog.optimize())
            .filter((prog) => prog !== null) as DialogueHistoryItem[];
        return this;
    }

    clone() : DialogueState {
        return new DialogueState(this.location, this.policy, this.dialogueAct, this.dialogueActParam,
            this.history.map((item) => item.clone()));
    }

    async typecheck(schemas : SchemaRetriever, getMeta = false) : Promise<this> {
        await Typechecking.typeCheckDialogue(this, schemas, getMeta);
        return this;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDialogueState(this)) {
            for (const item of this.history)
                item.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        for (const item of this.history)
            yield* item.iterateSlots();
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        for (const item of this.history)
            yield* item.iterateSlots2();
    }
}
DialogueState.prototype.isDialogueState = true;
Input.DialogueState = DialogueState;
