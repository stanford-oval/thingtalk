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

import assert from 'assert';
import interpolate from 'string-interp';

import { stringEscape } from '../escaping';
import * as I18n from '../i18n';

/**
 * Runtime representation of an entity value.
 *
 * @alias Builtin.Entity
 */
export class Entity {
    /**
     * Construct a new entity value.
     *
     * @param {string} value - the entity identifier value
     * @param {string} [display] - optional human-readable display name for the entity
     */
    constructor(id, display) {
        /**
         * The entity identifier value.
         * @type {string}
         */
        this.value = id;
        /**
         * The entity display name.
         * @type {string|null}
         */
        this.display = display||null;
    }

    toString() {
        return this.value;
    }

    /**
     * Compile the entity value to JS code.
     *
     * @return {string} JS code that evaluates to this entity value
     * @package
     */
    toJSSource() {
        return `new __builtin.Entity(${stringEscape(this.value)}, ${stringEscape(this.display)})`;
    }

    /**
     * Check if this JS value looks like an entity.
     *
     * @param {any} obj - the JS value to check
     * @return {boolean} `true` if the value is a string or an instance of this class
     * @package
     */
    static isEntity(obj) {
        return obj instanceof Entity || typeof obj === 'string';
    }
}

/**
 * Runtime representation of a location value.
 *
 * @alias Builtin.Location
 */
export class Location {
    /**
     * Construct a new location value.
     *
     * @param {number} lat - latitude in degrees (between -90 and 90)
     * @param {number} lon - longitude in degrees (between -180 and 180)
     * @param {string} [display] - human-readable display name for this location
     */
    constructor(lat, lon, display) {
        if (typeof lat !== 'number' || typeof lon !== 'number')
            throw new Error(`Invalid location (${lat}, ${lon})`);

        /**
         * Longitude value.
         * @type {number}
         * @deprecated Use {Builtin.Location#lon}
         */
        this.x = lon;

        /**
         * Latitude value.
         * @type {number}
         * @deprecated Use {Builtin.Location#lat}
         */
        this.y = lat;

        /**
         * Display name for this location.
         * @type {string}
         */
        this.display = display||null;
    }

    /**
     * Latitude value.
     * @type {number}
     * @readonly
     */
    get lat() {
        return this.y;
    }
    /**
     * Longitude value.
     * @type {number}
     * @readonly
     */
    get lon() {
        return this.x;
    }

    toString() {
        if (this.display !== null)
            return this.display;
        else
            return '[Latitude: ' + Number(this.y).toFixed(5) + ' deg, Longitude: ' + Number(this.x).toFixed(5) + ' deg]';
    }

    /**
     * Compile the location value to JS code.
     *
     * @return {string} JS code that evaluates to this location value
     * @package
     */
    toJSSource() {
        return `new __builtin.Location(${this.y}, ${this.x}, ${stringEscape(this.display)})`;
    }

    toLocaleString(locale) {
        if (this.display)
            return this.display;

        const _ = I18n.get(locale).gettext;
        return interpolate(_("[Latitude: ${loc.lat:.3} deg, Longitude: ${loc.lon:.3} deg]"), {
            loc: this
        }, { locale });
    }

    /**
     * Check if this JS value looks like an location.
     *
     * For compatibility reasons, the runtime representation of a location is not required
     * to be an instance of the {@link Builtin.Location} class, and can be any object
     * with `x` and `y` own properties.
     *
     * @param {any} obj - the JS value to check
     * @return {boolean} `true` if the value looks like a location
     * @package
     */
    static isLocation(obj) {
        return (obj instanceof Location || (typeof obj === 'object' && obj !== null &&
            Object.prototype.hasOwnProperty.call(obj, 'x') && Object.prototype.hasOwnProperty.call(obj, 'y')));
    }
}

/**
 * Runtime representation of a time value.
 *
 * @alias Builtin.Time
 */
export class Time {
    /**
     * Construct a new time value.
     *
     * @param {number} hour - hour value (between 0 and 11)
     * @param {number} minute - minute value (between 0 and 59)
     * @param {number} [second] - second value (between 0 and 59)
     */
    constructor(hour, minute, second = 0) {
        if (!(hour >= 0) || !(minute >= 0) || !(second >= 0))
            throw new Error(`Invalid time ${hour}:${minute}:${second}`);
        /**
         * Hour value.
         * @type {number}
         * @readonly
         */
        this.hour = hour;
        /**
         * Minute value.
         * @type {number}
         * @readonly
         */
        this.minute = minute;
        /**
         * Second value.
         * @type {number}
         * @readonly
         */
        this.second = second;
    }

    static fromSeconds(seconds) {
        const hour = Math.floor(seconds / 3600);
        seconds -= hour * 3600;
        const minute = Math.floor(seconds / 60);
        seconds -= minute * 60;
        return new Time(hour, minute, seconds);
    }

    // for comparisons
    /**
     * Convert this time value to the number of seconds since midnight.
     *
     * This can be used to compare time values using `<` and `>`
     * @return {number} the number of seconds since midnight
     */
    valueOf() {
        return this.hour * 3600 + this.minute * 60 + this.second;
    }

    toString() {
        if (this.second === 0)
            return `${this.hour}:${this.minute < 10 ? '0' : ''}${this.minute}`;
        else
            return `${this.hour}:${this.minute < 10 ? '0' : ''}${this.minute}:${this.second < 10 ? '0' : ''}${this.second}`;
    }

    toJSON() {
        return this.toString();
    }

    /**
     * Compile the time value to JS code.
     *
     * @return {string} JS code that evaluates to this time value
     * @package
     */
    toJSSource() {
        return `new __builtin.Time(${this.hour}, ${this.minute}, ${this.second})`;
    }
}

/**
 * Runtime representation of a currency value.
 *
 * @alias Builtin.Currency
 */
export class Currency {
    constructor(value, code) {
        this.value = value;
        this.code = code;
    }       

    valueOf() {
        return this.value;
    }

    toString() {
        return `${this.value} ${this.code.toUpperCase()}`;
    }

    toLocaleString(locale, options = {}) {
        options.style = 'currency';
        options.currency = this.code.toUpperCase();
        return this.value.toLocaleString(locale, options);
    }

    toJSSource() {
        return `new __builtin.Currency(${this.value}, "${this.code}")`;
    }
}

/**
 * Runtime representation of a recurrent time rule (a single item in a recurrent time specification).
 *
 * @alias Builtin.RecurrentTimeRule
 */
export class RecurrentTimeRule {
    constructor({ beginTime, endTime, interval = 86400000, frequency = 1, dayOfWeek = null, beginDate = null, endDate = null, subtract = false }) {
        assert(beginTime instanceof Time);
        assert(endTime instanceof Time);
        assert(typeof interval === 'number');
        assert(typeof frequency === 'number');
        assert(dayOfWeek === null || (typeof dayOfWeek === 'number' && dayOfWeek >= 0 && dayOfWeek <= 6));
        assert(beginDate === null || beginDate instanceof Date);
        assert(endDate === null || endDate instanceof Date);
        assert(typeof subtract === 'boolean');
        this.beginTime = beginTime;
        this.endTime = endTime;
        this.interval = interval;
        this.frequency = frequency;
        this.dayOfWeek = dayOfWeek;
        this.beginDate = beginDate;
        this.endDate = endDate;
        this.subtract = subtract;
    }

    toString() {
        return `RecurrentTimeRule(${this.beginTime} -- ${this.endTime}; ${this.frequency} every ${this.interval} ms; from ${this.beginDate} to ${this.endDate})`;
    }

    toJSSource() {
        return `new __builtin.RecurrentTimeRule({ `
        + `beginTime: ${this.beginTime.toJSSource()}, `
        + `endTime: ${this.endTime.toJSSource()}, `
        + `interval: ${this.interval}, `
        + `frequency: ${this.frequency}, `
        + `dayOfWeek: ${this.dayOfWeek}, `
        + 'beginDate: ' + (this.beginDate ? `new Date(${this.beginDate.getTime()})` : 'null') + ', '
        + 'endDate: ' + (this.endDate ? `new Date(${this.endDate.getTime()})` : 'null') + ', '
        + `subtract: ${this.subtract}, `
        + '})';
    }

    contains(dateOrTime) {
        if (dateOrTime instanceof Date) {
            const time = +(new Time(dateOrTime.getHours(), dateOrTime.getMinutes(), dateOrTime.getSeconds()));
            if (!(this.beginTime <= time && this.endTime >= time))
                return false;

            if (this.beginDate && this.beginDate > dateOrTime)
                return false;
            if (this.endDate && this.endDate < dateOrTime)
                return false;

            if (this.dayOfWeek !== null && this.dayOfWeek !== dateOrTime.getDay())
                return false;

            // TODO frequency and interval

            return true;
        } else {
            return this.beginTime <= dateOrTime && this.endTime >= dateOrTime;
        }
    }
}

export class Aggregation {
    constructor(type, field, cols, count) {
        this.type = type;
        this.field = field;
        this.cols = cols;
        this.count = count;
    }
}
