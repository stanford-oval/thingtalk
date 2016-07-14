// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

module.exports = class ExecEnvironment {
    constructor(appstate) {
        this._state = appstate;
        this._keywords = {};
        this._feed = null;
        this.reset();
    }

    addKeyword(name, keyword) {
        this._keywords[name] = keyword;
    }

    reset() {
        this.currentChannel = null;
        this.triggerValue = null;
        this.queryValue = null;
        this.queryInput = null;
        this.changedMember = null;
        this.fixedMemberBinding = null;
        this.changedKeyword = null;
        // self is always member 0 in the list
        if (this._feed !== null)
            this._scope = { self: this.readFeedMember(0) };
        else
            this._scope = {};
        this._memberBindings = { self: 0 };
    }

    clone() {
        var clone = new ExecEnvironment(this._state);

        for (var kw in this._keywords)
            clone._keywords[kw] = this._keywords[kw];
        clone._feed = this._feed;
        clone.currentChannel = this.currentChannel;
        clone.triggerValue = this.triggerValue;
        clone.queryValue = this.queryValue;
        clone.queryInput = this.queryInput;
        clone.changedMember = this.changedMember;
        clone.fixedMemberBinding = this.fixedMemberBinding;
        clone.changedKeyword = this.changedKeyword;

        for (var name in this._scope)
            clone._scope[name] = this._scope[name];
        for (var name in this._memberBindings)
            clone._memberBindings[name] = this._memberBindings[name];

        return clone;
    }

    getFeedMembers() {
        return this._feed.getMembers();
    }

    setMemberBinding(name, member) {
        if (typeof member !== 'number' ||
            member < 0 || member >= this._feed.getMembers().length)
            throw new TypeError('Invalid member binding value ' + member + ' for ' + name);
        this._memberBindings[name] = member;
    }

    getMemberBinding(name) {
        if (this._memberBindings[name] === undefined)
            throw new TypeError('Invalid member binding ' + name);
        return this._memberBindings[name];
    }

    setFeed(feed) {
        this._feed = feed;
    }

    readFeed() {
        return this._feed;
    }

    readFeedMember(user) {
        return this._feed.getMembers()[user];
    }

    setVar(name, value) {
        this._scope[name] = value;
    }

    readKeyword(name) {
        return this._keywords[name].value;
    }

    readVar(name) {
        if (this._scope[name] !== undefined)
            return this._scope[name];
        if (this._state[name] !== undefined)
            return this._state[name];
        throw new TypeError("Unknown variable " + name);
    }

    readObjectProp(object, name) {
        var v = object[name];
        if (v === undefined)
            throw new TypeError('Object ' + object + ' has no property ' + name);
        return v;
    }
}
