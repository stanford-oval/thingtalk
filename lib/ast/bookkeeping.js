// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const adt = require('adt');

const { Input, BooleanExpression } = require('./program');
const { Value } = require('./values');

/**
 * A ThingTalk input that drives the dialog.
 *
 * Bookkeeping inputs are special commands like yes, no or cancel
 * whose purpose is to drive a dialog agent, but have no direct executable
 * semantic.
 *
 * Their definition is included in ThingTalk to aid using ThingTalk as a
 * virtual assistant representation language without extensions.
 *
 * @alias Ast.Input.Bookkeeping
 * @extends Ast.Input
 */
class Bookkeeping extends Input {
    /**
     * Construct a new bookkeeping input.
     *
     * @param {Ast.BookkeepingIntent} intent - the current intent
     */
    constructor(intent) {
        super();

        /**
         * The intent associated with this input.
         *
         * @type {Ast.BookkeepingIntent}
         * @readonly
         */
        this.intent = intent;
    }

    clone() {
        return new Bookkeeping(this.intent.clone());
    }

    *iteratePrimitives() {}
    *iterateSlots() {}
    *iterateSlots2() {}
}
Input.Bookkeeping = Bookkeeping;
Bookkeeping.prototype.isBookkeeping = true;

/**
 * All types of special bookkeeping commands.
 *
 * @alias Ast.BookkeepingSpecialTypes
 * @type {string[]}
 */
const BookkeepingSpecialTypes = [
    'yes',
    'no',
    'failed',
    'train',
    'back', // go back / go to the previous page
    'more', // show more results / go to the next page
    'empty', // default trigger/action, in make dialog
    'debug',
    'maybe', // "yes with filters", for permission grant
    'nevermind', // cancel the current task
    'stop', // cancel the current task, quietly
    'help', // ask for contextual help, or start a new task
    'makerule', // reset and start a new task
    'wakeup', // do nothing and wake up the screen
];

/**
 * Base class of all the bookkeeping intents.
 *
 * The meaning of all bookkeeping commands is mapped to a subclass of
 * this class.
 *
 * @class
 * @alias Ast.BookkeepingIntent
 */
const BookkeepingIntent = adt.data({
    /**
     * A special bookkeeping command.
     *
     * Special commands have no parameters, and are expected to trigger
     * unusual behavior from the dialog agent.
     *
     * @name Ast.BookkeepingIntent.Special
     * @extends Ast.BookkeepingIntent
     * @class
     * @param {string} type - the command type (one of {@link Ast.BookkeepingSpecialTypes})
     */
    Special: /** @lends Ast.BookkeepingIntent.Special.prototype */ {
        /**
         * The special command type (one of {@link Ast.BookkeepingSpecialTypes}).
         * @type {string}
         */
        type: adt.only(String)
    },

    /**
     * A multiple-choice bookkeeping command.
     *
     * This indicates the user chose one option out of the just-presented list.
     *
     * @name Ast.BookkeepingIntent.Choice
     * @extends Ast.BookkeepingIntent
     * @class
     * @param {number} value - the choice index
     */
    Choice: /** @lends Ast.BookkeepingIntent.Choice.prototype */ {
        /**
         * The choice index.
         * @type {number}
         */
        value: adt.only(Number)
    },

    /**
     * A command that triggers a command list.
     *
     * Used to request help for a specific device or category of devices.
     *
     * @name Ast.BookkeepingIntent.CommandList
     * @extends Ast.BookkeepingIntent
     * @class
     * @param {Ast.Value} device - the device to ask for (an `Entity` or `Undefined` value)
     * @param {string} category - the Thingpedia (sub)category to ask for
     */
    CommandList: /** @lends Ast.BookkeepingIntent.CommandList.prototype */ {
        /**
         * The device to list commands for
         * @type {Ast.Value}
         */
        device: adt.only(Value),

        /**
         * The (sub)category to ask for
         * @type {string}
         */
        category: adt.only(String)
    },

    // on the chopping block after the contextual work is done...

    /**
     * A simple answer to a slot-filling question.
     *
     * @name Ast.BookkeepingIntent.Answer
     * @extends Ast.BookkeepingIntent
     * @class
     * @param {Ast.Value} value - the answer value
     */
    Answer: /** @lends Ast.BookkeepingIntent.Answer.prototype */ {
        /**
         * The answer value.
         * @type {Ast.Value}
         */
        value: adt.only(Value)
    },

    /**
     * A standalone predicate to add to the current command.
     *
     * @name Ast.BookkeepingIntent.Predicate
     * @extends Ast.BookkeepingIntent
     * @class
     * @param {Ast.BooleanExpression} predicate - the predicate to add
     * @deprecated Predicates cannot be typechecked in isolation, and should be replaced with
     *             contextual commands instead.
     */
    Predicate: /** @lends Ast.BookkeepingIntent.Predicate.prototype */ {
        /**
         * The predicate to add
         * @type {Ast.BooleanExpression}
         */
        predicate: adt.only(BooleanExpression)
    },
});

module.exports = {
    BookkeepingSpecialTypes,
    BookkeepingIntent
};
