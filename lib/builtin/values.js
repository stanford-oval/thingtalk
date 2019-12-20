// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { stringEscape } = require('../escaping');
const I18n = require('../i18n');

/**
 * Runtime representation of an entity value.
 *
 * @alias Builtin.Entity
 */
class Entity {
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
module.exports.Entity = Entity;

/**
 * Runtime representation of a location value.
 *
 * @alias Builtin.Location
 */
class Location {
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
        return _("[Latitude: %.3f deg, Longitude: %.3f deg]")
            .format(Number(this.y), Number(this.x));
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
module.exports.Location = Location;

/**
 * Runtime representation of a time value.
 *
 * @alias Builtin.Time
 */
class Time {
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
module.exports.Time = Time;

class Currency {
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
module.exports.Currency = Currency;

class Aggregation {
    constructor(type, field, cols, count) {
        this.type = type;
        this.field = field;
        this.cols = cols;
        this.count = count;
    }
}
module.exports.Aggregation = Aggregation;
