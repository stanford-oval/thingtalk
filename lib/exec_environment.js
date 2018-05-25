// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Formatter = require('./formatter');

module.exports = class ExecEnvironment {
    constructor(locale, timezone, schemaRetriever) {
        this.format = new Formatter(locale, timezone, schemaRetriever);
        this._scope = {};
    }

    /* istanbul ignore next */
    get program_id() {
        throw new Error('Must be overridden');
    }

    /* istanbul ignore next */
    invokeMonitor(fnid, params) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    invokeTimer(base, interval) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    invokeAtTimer(time) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    invokeQuery(fnid, params) {
        throw new Error('Must be overridden');
    }
    /* istanbul ignore next */
    invokeAction(fnid, params) {
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

    formatEvent(outputType, output, hint) {
        return this.format.formatForType(outputType, output, hint);
    }
};
