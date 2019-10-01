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
 * @alias module:Ast.Input.Bookkeeping
 * @extends module:Ast.Input
 */
class Bookkeeping extends Input {
    /**
     * Construct a new bookkeeping input.
     *
     * @param {module:Ast.BookkeepingIntent} intent - the current intent
     */
    constructor(intent) {
        super();

        /**
         * The intent associated with this input.
         *
         * @type {module:Ast.BookkeepingIntent}
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
 * @alias module:Ast.BookkeepingSpecialTypes
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
 * @alias module:Ast.BookkeepingIntent
 */
const BookkeepingIntent = adt.data({
    /**
     * A special bookkeeping command.
     *
     * Special commands have no parameters, and are expected to trigger
     * unusual behavior from the dialog agent.
     *
     * @name module:Ast.BookkeepingIntent.Special
     * @extends module:Ast.BookkeepingIntent
     * @class
     * @param {string} type - the command type (one of {@link module:Ast.BookkeepingSpecialTypes})
     */
    Special: /** @lends module:Ast.BookkeepingIntent.Special.prototype */ {
        /**
         * The special command type (one of {@link module:Ast.BookkeepingSpecialTypes}).
         * @type {string}
         */
        type: adt.only(String)
    },

    /**
     * A multiple-choice bookkeeping command.
     *
     * This indicates the user chose one option out of the just-presented list.
     *
     * @name module:Ast.BookkeepingIntent.Choice
     * @extends module:Ast.BookkeepingIntent
     * @class
     * @param {number} value - the choice index
     */
    Choice: /** @lends module:Ast.BookkeepingIntent.Choice.prototype */ {
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
     * @name module:Ast.BookkeepingIntent.CommandList
     * @extends module:Ast.BookkeepingIntent
     * @class
     * @param {module:Ast.Value} device - the device to ask for (an `Entity` or `Undefined` value)
     * @param {string} category - the Thingpedia (sub)category to ask for
     */
    CommandList: /** @lends module:Ast.BookkeepingIntent.CommandList.prototype */ {
        /**
         * The device to list commands for
         * @type {module:Ast.Value}
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
     * @name module:Ast.BookkeepingIntent.Answer
     * @extends module:Ast.BookkeepingIntent
     * @class
     * @param {module:Ast.Value} value - the answer value
     */
    Answer: /** @lends module:Ast.BookkeepingIntent.Answer.prototype */ {
        /**
         * The answer value.
         * @type {module:Ast.Value}
         */
        value: adt.only(Value)
    },

    /**
     * A standalone predicate to add to the current command.
     *
     * @name module:Ast.BookkeepingIntent.Predicate
     * @extends module:Ast.BookkeepingIntent
     * @class
     * @param {module:Ast.BooleanExpression} predicate - the predicate to add
     * @deprecated Predicates cannot be typechecked in isolation, and should be replaced with
     *             contextual commands instead.
     */
    Predicate: /** @lends module:Ast.BookkeepingIntent.Predicate.prototype */ {
        /**
         * The predicate to add
         * @type {module:Ast.BooleanExpression}
         */
        predicate: adt.only(BooleanExpression)
    },
});

module.exports = {
    BookkeepingSpecialTypes,
    BookkeepingIntent
};
