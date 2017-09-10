// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const Internal = require('./internal');
const builtin = require('./builtin_values');

const Formatter = require('./formatter');

module.exports = class ExecEnvironment {
    constructor(locale, timezone) {
        this.format = new Formatter(locale, timezone);
        this.reset();
    }

    formatEvent(hint) {
        var currentChannel = this.currentChannel;
        if (currentChannel === null)
            return '';

        if (this.queryInput !== null)
            return this.format.formatForChannel(this.currentChannel, 'query', this.queryValue, this.queryInput, hint);
        else
            return this.format.formatForChannel(this.currentChannel, 'trigger', this.triggerValue, this.triggerInput, hint);
    }

    getCurrentEvent() {
        if (this.queryInput !== null)
            return this.queryValue;
        else
            return this.triggerValue;
    }

    getMeta() {
        let where;
        if (this.queryInput !== null)
            where = 'queries';
        else
            where = 'triggers';
        return this.currentChannel.device.constructor.metadata[where][this.currentChannel.name];
    }

    getChannelName() {
        return this.currentChannel.name;
    }

    getDeviceId() {
        return this.currentChannel.device.uniqueId;
    }

    getEventType() {
        if (this.currentChannel === null)
            return null;

        if (this.currentChannel.device.kind === 'org.thingpedia.builtin.thingengine.remote') {
            // apply masquerading for @remote
            // the second element in the trigger value is __kindChannel and is what we need here
            return new builtin.Entity(this.triggerValue[2] || null, null);
        } else {
            return new builtin.Entity(this.currentChannel.device.kind + ':' + this.currentChannel.name, null);
        }
    }

    reset() {
        this.currentChannel = null;
        this.triggerValue = null;
        this.triggerInput = null;
        this.queryValue = null;
        this.queryInput = null;
        this.changedKeyword = null;
        this._scope = {};
    }

    _doClone() {
        return new ExecEnvironment(this._state);
    }

    clone() {
        var clone = this._doClone();
        clone.format = this.format;

        clone.currentChannel = this.currentChannel;
        clone.triggerValue = this.triggerValue;
        clone.triggerInput = this.triggerInput;
        clone.queryValue = this.queryValue;
        clone.queryInput = this.queryInput;
        clone.changedKeyword = this.changedKeyword;
        Object.assign(clone._scope, this._scope);

        return clone;
    }
};
