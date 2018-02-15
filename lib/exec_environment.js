// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const builtin = require('./builtin_values');

const Formatter = require('./formatter');

module.exports = class ExecEnvironment {
    constructor(locale, timezone) {
        this.format = new Formatter(locale, timezone);
        this._scope = {};
    }

    invokeTrigger(fnid, params) {
        throw new Error('Must be overridden');
    }
    invokeQuery(fnid, params) {
        throw new Error('Must be overridden');
    }
    invokeAction(fnid, params) {
        throw new Error('Must be overridden');
    }
    clearGetCache() {
        throw new Error('Must be overridden');
    }
    sendEndOfFlow(principal, uuid) {
        throw new Error('Must be overridden');
    }
    output(outputType, output, channel) {
        throw new Error('Must be overridden');
    }

    formatEvent(channel, input, output, hint) {
        return this.format.formatForChannel(channel, channel.channelType, output, input, hint);
    }

    getEventType(channel, result) {
        if (channel === null)
            return null;

        return new builtin.Entity(channel.device.kind + ':' + channel.name, null);
    }
};
