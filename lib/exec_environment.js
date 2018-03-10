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
    constructor(locale, timezone) {
        this.format = new Formatter(locale, timezone);
        this._scope = {};
    }

    get program_id() {
        throw new Error('Must be overridden');
    }
    invokeMonitor(fnid, params) {
        throw new Error('Must be overridden');
    }
    invokeTimer(base, interval) {
        throw new Error('Must be overridden');
    }
    invokeAtTimer(time) {
        throw new Error('Must be overridden');
    }
    invokeQuery(fnid, params) {
        throw new Error('Must be overridden');
    }
    invokeAction(fnid, params) {
        throw new Error('Must be overridden');
    }
    invokeMemoryQuery(table, version, aggregation) {
        throw new Error('Must be overridden');
    }
    clearGetCache() {
        throw new Error('Must be overridden');
    }
    sendEndOfFlow(principal, flow) {
        throw new Error('Must be overridden');
    }
    output(outputType, output, channel) {
        throw new Error('Must be overridden');
    }
    save(tablename, versions, params) {
        throw new Error('Must be overridden');
    }
    getTableVersion(tablename) {
        throw new Error('Must be overridden');
    }
    readState(stateId) {
        throw new Error('Must be overridden');
    }
    writeState(stateId, value) {
        throw new Error('Must be overridden');
    }

    formatEvent(outputType, output, hint) {
        // FIXME load the formatting metadata here
        return this.format.format(outputType, output, hint);
    }
};
