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

    dateAndTimeToString(date, options = {}) {
        options.timeZone = this._timezone;
        return date.toLocaleString(this._locale, options);
    }

    locationToString(o) {
        if (o.display)
            return o.display;
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

        this.format = new FormatUtils(locale, timezone);

        this.reset();
    }

    formatEvent(hint) {
        var currentChannel = this.currentChannel;
        if (currentChannel === null)
            return '';

        var formatted;
        if (this.queryInput !== null)
            formatted = currentChannel.formatEvent(this.queryValue, this.queryInput, hint, this.format);
        else
            formatted = currentChannel.formatEvent(this.triggerValue, hint, this.format);

        return Q(formatted).then((formatted) => {
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
                else if (hint === 'string-body')
                    return formatted.slice(1).join('\n');
                else
                    return formatted.join('\n');
            } else {
                return formatted;
            }
        });
    }

    reset() {
        this.currentChannel = null;
        this.triggerValue = null;
        this.queryValue = null;
        this.queryInput = null;
        this.changedKeyword = null;
        this._scope = new Map;
        for (var name in this._state)
            this._scope.set(name, this._state[name]);
    }

    _doClone() {
        return new ExecEnvironment(this._state);
    }

    clone() {
        var clone = this._doClone();
        clone.format = this.format;

        for (var kw in this._keywords)
            clone._keywords[kw] = this._keywords[kw];
        clone.currentChannel = this.currentChannel;
        clone.triggerValue = this.triggerValue;
        clone.queryValue = this.queryValue;
        clone.queryInput = this.queryInput;
        clone.changedKeyword = this.changedKeyword;

        for (var name of this._scope.keys())
            clone._scope.set(name, this._scope.get(name));

        return clone;
    }

    setVar(name, value) {
        this._scope.set(name, value);
    }

    readVar(name) {
        if (this._scope.get(name) !== undefined)
            return this._scope.get(name);
        else
            throw new TypeError("Unknown variable " + name);
    }
};
