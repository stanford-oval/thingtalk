// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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

import Node, { SourceRange } from './base';
import NodeVisitor from './visitor';
import { Input } from './program';
import { Value } from './values';
import TypeChecker from '../typecheck';
import SchemaRetriever from '../schema';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';

/**
 * A ThingTalk input that drives the dialog.
 *
 * Control commands are special commands like yes, no or cancel
 * whose purpose is to drive a dialog agent, but have no direct executable
 * semantic.
 *
 * Their definition is included in ThingTalk to aid using ThingTalk as a
 * virtual assistant representation language without extensions.
 *
 */
export class ControlCommand extends Input {
    /**
     * The intent associated with this input.
     *
     */
    intent : ControlIntent;

    /**
     * Construct a new control input.
     *
     * @param location - the position of this node
     *        in the source code
     * @param intent - the current intent
     */
    constructor(location : SourceRange|null, intent : ControlIntent) {
        super(location);
        this.intent = intent;
    }

    toSource() : TokenStream {
        return List.concat(this.intent.toSource(), ';');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitControlCommand(this))
            this.intent.visit(visitor);
        visitor.exit(this);
    }

    clone() : ControlCommand {
        return new ControlCommand(this.location, this.intent.clone());
    }

    async typecheck(schemas : SchemaRetriever, getMeta = false) : Promise<this> {
        const typeChecker = new TypeChecker(schemas, getMeta);
        await typeChecker.typeCheckControl(this.intent);
        return this;
    }
}
Input.ControlCommand = ControlCommand;
ControlCommand.prototype.isControlCommand = true;

/**
 * All types of special control commands.
 */
export const ControlCommandType = [
    'yes',
    'no',
    'failed', // failed to parse (did not understand)
    'ood', // out of domain command (not ThingTalk)
    'train',
    'debug',
    'nevermind', // cancel the current task
    'stop', // cancel the current task, quietly
    'help', // ask for contextual help, or start a new task
    'wakeup', // do nothing and wake up the screen
];

/**
 * Base class of all the control intents.
 *
 * The meaning of all control commands is mapped to a subclass of
 * this class.
 *
 */
export abstract class ControlIntent extends Node {
    static Special : any;
    isSpecial ! : boolean;
    static Choice : any;
    isChoice ! : boolean;
    static Answer : any;
    isAnswer ! : boolean;

    abstract clone() : ControlIntent;
}
ControlIntent.prototype.isSpecial = false;
ControlIntent.prototype.isChoice = false;
ControlIntent.prototype.isAnswer = false;

/**
 * A special control command.
 *
 * Special commands have no parameters, and are expected to trigger
 * unusual behavior from the dialog agent.
 */
export class SpecialControlIntent extends ControlIntent {
    /**
     * The special command type (one of {@link ControlCommandType}).
     */
    type : string;

    /**
     * Construct a new special command.
     *
     * @param location - the position of this node
     *        in the source code
     * @param type - the command type (one of {@link ControlCommandType})
     */
    constructor(location : SourceRange|null, type : string) {
        super(location);

        assert(typeof type === 'string');
        this.type = type;
    }

    toSource() : TokenStream {
        return List.singleton('$' + this.type);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitSpecialControlIntent(this);
        visitor.exit(this);
    }

    clone() : SpecialControlIntent {
        return new SpecialControlIntent(this.location, this.type);
    }
}
SpecialControlIntent.prototype.isSpecial = true;
ControlIntent.Special = SpecialControlIntent;

/**
 * A multiple-choice control command.
 *
 * This indicates the user chose one option out of the just-presented list.
 *
 */
export class ChoiceControlIntent extends ControlIntent {
    /**
     * The choice index.
     */
    value : number;

    /**
     * Construct a new choice command.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {number} value - the choice index
     */
    constructor(location : SourceRange|null, value : number) {
        super(location);

        assert(typeof value === 'number');
        this.value = value;
    }

    toSource() : TokenStream {
        return List.concat('$choice', '(', String(this.value), ')');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitChoiceControlIntent(this);
        visitor.exit(this);
    }

    clone() : ChoiceControlIntent {
        return new ChoiceControlIntent(this.location, this.value);
    }
}
ChoiceControlIntent.prototype.isChoice = true;
ControlIntent.Choice = ChoiceControlIntent;

/**
 * A direct answer to a slot-filling question.
 *
 */
export class AnswerControlIntent extends ControlIntent {
    /**
     * The answer value.
     */
    value : Value;

    /**
     * Construct a new answer command.
     *
     * @param location - the position of this node in the source code
     * @param value - the answer value
     */
    constructor(location : SourceRange|null, value : Value) {
        super(location);

        assert(value instanceof Value);
        this.value = value;
    }

    toSource() : TokenStream {
        return List.concat('$answer', '(', this.value.toSource(), ')');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAnswerControlIntent(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    clone() : AnswerControlIntent {
        return new AnswerControlIntent(this.location, this.value);
    }
}
AnswerControlIntent.prototype.isAnswer = true;
ControlIntent.Answer = AnswerControlIntent;
