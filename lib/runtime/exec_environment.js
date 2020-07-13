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

const assert = require('assert');

const Formatter = require('./formatter');
const I18n = require('../i18n');

module.exports = class ExecEnvironment {
    constructor(locale, timezone, schemaRetriever, gettext = I18n.get(locale)) {
        this.format = new Formatter(locale, timezone, schemaRetriever, gettext);
        this._scope = {};

        this._procedureFrameCounter = 0;
        this._procedureFrame = 0;
        this._procedureStack = [];
    }

    /* istanbul ignore next */
    get program_id() {
        throw new Error('Must be overridden');
    }

    /**
     * Returns a unique id of the current stack frame.
     *
     * The ID is incremented for every procedure call.
     */
    get procedureFrame() {
        return this._procedureFrame;
    }

    enterProcedure(procid, procname) {
        // save the calling frame ID on the stack
        this._procedureStack.push(this._procedureFrame);

        // make a fresh ID for the new call
        this._procedureFrameCounter++;
        this._procedureFrame = this._procedureFrameCounter;
    }
    exitProcedure(procid, procname) {
        // check that enter & exit are correctly paired
        assert(this._procedureStack.length > 0);

        // restore the frame ID of the caller from the stack
        this._procedureFrame = this._procedureStack.pop();
    }

    /* istanbul ignore next */
    invokeMonitor(kind, attrs, fname, params, hints) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    invokeTimer(base, interval, frequency) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    invokeAtTimer(timeArray, expiration_date) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    invokeQuery(kind, attrs, fname, params, hints) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    invokeDBQuery(kind, attrs, fname, params) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    invokeAction(kind, attrs, fname, params) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    clearGetCache() {
        throw new Error('Must be overridden');
    }

    /* istanbul ignore next */
    sendEndOfFlow(principal, flow) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    output(outputType, output) {
        throw new Error('Must be overridden');
    }

    /* istanbul ignore next */
    readState(stateId) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    writeState(stateId, value) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    reportError(message, err) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    loadContext(info, into) {
        throw new Error('Must be overridden');
    }

    formatEvent(outputType, output, hint) {
        return this.format.formatForType(outputType, output, hint);
    }
};
