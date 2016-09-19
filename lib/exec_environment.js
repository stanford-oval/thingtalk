// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Internal = require('./internal');

class FormatUtils {
    constructor(locale, timezone) {
        this._locale = locale;
        this._timezone = timezone;
    }

    measureToString(value, precision, unit) {
        var baseUnit = Internal.UnitsToBaseUnit[unit];
        if (!baseUnit)
            throw new Error('Invalid unit ' + unit);

        var coeff = Internal.UnitsTransformToBaseUnit[unit];
        if (typeof coeff === 'function')
            return Internal.UnitsInverseTransformFromBaseUnit[unit](value).toFixed(precision);
        else
            return ((1/coeff)*value).toFixed(precision);
    }

    dateToString(date, options) {
        if (!options) {
            options = {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            };
        }
        options.timeZone = this._timezone;
        return date.toLocaleDateString(this._locale, options);
    }

    timeToString(date, options) {
        if (!options) {
            options = {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            };
        }
        options.timeZone = this._timezone;
        return date.toLocaleTimeString(this._locale, options);
    }

    dateAndTimeToString(date, options) {
        if (!options) {
            options = {};
        }
        options.timeZone = this._timezone;
        return date.toLocaleString(this._locale, options);
    }

    locationToString(location) {
        return '[Latitude: ' + Number(o.y).toFixed(3) + ' deg, Longitude: ' + Number(o.x).toFixed(3) + ' deg]';
    }

    anyToString(o) {
        if (Array.isArray(o))
            return (o.map(this.anyToString, this).join(', '));
        else if (typeof o === 'object' && o !== null &&
             o.hasOwnProperty('x') && o.hasOwnProperty('y'))
            return this.locationToString(o);
        else if (typeof o === 'number')
            return (Math.floor(o) === o ? o.toFixed(0) : o.toFixed(3));
        else if (o instanceof Date)
            return this.dateAndTimeToString(o);
        else
            return String(o);
    }
}

module.exports = class ExecEnvironment {
    constructor(appstate, locale, timezone) {
        this._state = appstate;
        this._keywords = {};
        this._feed = null;

        this.format = new FormatUtils(locale, timezone);

        this.reset();
    }

    formatEvent(hint) {
        var currentChannel = this.currentChannel;
        if (currentChannel === null)
            return '';

        if (this.queryInput !== null)
            var formatted = currentChannel.formatEvent(this.queryValue, this.queryInput, hint, this.format);
        else
            var formatted = currentChannel.formatEvent(this.triggerValue, hint, this.format);

        if (typeof formatted === 'string')
            return formatted;
        if (formatted === null)
            return '';
        if (typeof formatted === 'object' &&
            formatted.type === 'text')
            return formatted.text;
        if (!Array.isArray(formatted))
            formatted = [formatted];

        // for compatibility with code that predates the hint
        if (hint.startsWith('string')) {
            formatted = formatted.map((x) => {
                if (typeof x === 'string')
                    return x;
                if (x === null)
                    return 'null';
                if (typeof x !== 'object')
                    return this.format.anyToString(x);
                if (x.type === 'text')
                    return x.text;
                if (x.type === 'picture')
                    return 'Picture: ' + x.url;
                if (x.type === 'rdl')
                    return 'Link: ' + x.displayTitle + ' <' + x.webCallback + '>';
                return this.format.anyToString(x);
            });
            if (hint === 'string-title')
                return formatted[0];
            else
                return formatted.join('\n');
        } else {
            return formatted;
        }
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
        clone.format = this.format;

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
