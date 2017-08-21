// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const vm = require('vm');
const assert = require('assert');

const Internal = require('./internal');

function compileCode(code) {
    return vm.runInNewContext(code);
}

module.exports = class Formatter {
    constructor(locale, timezone) {
        this._locale = locale;
        this._timezone = timezone;
    }

    _replaceInString(str, argMap) {
        if (typeof str !== 'string')
            return undefined;
        return str.replace(/\$(?:([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::(%|[a-zA-Z-]+))?})/g, (match, param1, param2, opt) => {
            let param = param1 || param2;
            if (param.startsWith('{'))
                param = param.substring(0, param.length-1);
            let value = argMap[param];
            if (!value)
                return value;
            if (value.display)
                return value.display;
            if (value instanceof Date) {
                if (opt === 'iso-date')
                    return value.toISOString();
                if (opt === 'time')
                    return this.timeToString(value);
                else if (opt === 'date')
                    return this.dateToString(value);
                else
                    return this.dateAndTimeToString(value);
            }
            if (typeof value === 'number') {
                if (opt === '%') {
                    value = value*100;
                    opt = '';
                }
                if (opt)
                    return this.measureToString(value, 1, opt);
                else
                    return (Math.floor(value) === value ? value.toFixed(0) : value.toFixed(2));
            }
            if (value.x && value.y)
                return this.locationToString(value);
            else
                return value;
        });
    }

    format(formatted, argMap, hint) {
        return this._postprocess(formatted.map((f, i) => {
            if (typeof f === 'function')
                return f(argMap, hint, this);
            if (typeof f === 'string')
                return this._replaceInString(f, argMap) || '';
            if (typeof f !== 'object' || f === null)
                return String(f);
            if (f.type === 'text')
                return this._replaceInString(f.text, argMap) || '';
            if (f.type === 'picture') {
                return {
                    type: 'picture',
                    url: this._replaceInString(f.url, argMap)
                };
            }
            if (f.type === 'rdl') {
                return {
                    type: 'rdl',
                    callback: this._replaceInString(f.callback, argMap),
                    webCallback: this._replaceInString(f.webCallback, argMap),
                    displayTitle: this._replaceInString(f.displayTitle, argMap),
                    displayText: this._replaceInString(f.displayText, argMap)
                };
            }
            if (f.type === 'code') {
                var compiled = compileCode(f.code);
                formatted[i] = compiled;
                return compiled(argMap, hint, this);
            }
            throw new Error('Unrecognized formatter type ' + f.type);
        }), hint);
    }

    formatForChannel(currentChannel, channelType, value, input, hint) {
        if (!currentChannel)
            return '';

        let where;
        switch (channelType) {
        case 'trigger':
            where = 'triggers';
            break;
        case 'query':
            where = 'queries';
            break;
        default:
            throw new TypeError();
        }

        let block = currentChannel.device.constructor.metadata[where][currentChannel.name];
        assert(block);
        let argnames = block.args.map((a) => a.name);
        let format = block.formatted;
        if (!format)
            return this._legacyFormat(currentChannel, channelType, value, input, hint);

        if (!Array.isArray(format))
            format = block.formatted = [format];
        let argMap = {};
        argnames.forEach((argname, i) => {
            argMap[argname] = value[i];
        });

        return this.format(format, argMap, hint);
    }

    _legacyFormat(currentChannel, channelType, value, input, hint) {
        var formatted;
        if (channelType === 'query')
            formatted = currentChannel.formatEvent(value, input, hint, this);
        else
            formatted = currentChannel.formatEvent(value, hint, this);

        return Q(formatted).then((formatted) => this._postprocess(formatted, hint));
    }

    _postprocess(formatted, hint) {
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
                    return this.anyToString(x);
                if (x.type === 'text')
                    return x.text;
                if (x.type === 'picture')
                    return 'Picture: ' + x.url;
                if (x.type === 'rdl')
                    return 'Link: ' + x.displayTitle + ' <' + x.webCallback + '>';
                return this.anyToString(x);
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
};
