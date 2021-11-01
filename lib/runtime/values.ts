// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
import { Temporal, toTemporalInstant, } from '@js-temporal/polyfill';

import { stringEscape } from '../utils/escaping';

/**
 * Runtime representation of an entity value.
 *
 */
export class Entity {
    /**
     * The entity identifier value.
     */
    value : string;
    /**
     * The entity display name.
     */
    display : string|null;

    /**
     * Match this entity against a query string.
     *
     * This optional property can be set to override the behavior of the `=~` operator
     * for this entity.
     *
     * Note that the evaluation order of ThingTalk is unspecified, so this method must
     * have no side effects.
     *
     * @param against the query to check against
     * @returns true if the query matches, false otherwise
     */
    softmatch?(against : string) : boolean;

    /**
     * Construct a new entity value.
     *
     * @param value - the entity identifier value
     * @param display - optional human-readable display name for the entity
     */
    constructor(id : string, display ?: string|null, options : { softmatch ?: (against : string) => boolean } = {}) {
        this.value = id;
        this.display = display||null;

        // set the property only if provided
        // this allows subclasses to implement the method normally
        if (options.softmatch)
            this.softmatch = options.softmatch;
    }

    toString() : string {
        return this.value;
    }

    /**
     * Compile the entity value to JS code.
     *
     * @return {string} JS code that evaluates to this entity value
     */
    toJSSource() : string {
        return `new __builtin.Entity(${stringEscape(this.value)}, ${stringEscape(this.display)})`;
    }

    /**
     * Check if this JS value looks like an entity.
     *
     * @param {any} obj - the JS value to check
     * @return {boolean} `true` if the value is a string or an instance of this class
     */
    static isEntity(obj : unknown) : obj is (Entity|string) {
        return obj instanceof Entity || typeof obj === 'string';
    }
}

/**
 * Runtime representation of a string-like object.
 *
 * Objects of this class can be used to override the behavior of
 * string operators at runtime.
 */
export class StringLike {
    /**
     * The underlying string value.
     */
    private value : string;

    /**
     * Match this string against a query string.
     *
     * This optional property can be set to override the behavior of the `=~` operator.
     *
     * Note that the evaluation order of ThingTalk is unspecified, so this method must
     * have no side effects.
     *
     * @param against the query to check against
     * @returns true if the query matches, false otherwise
     */
    softmatch?(against : string) : boolean;

    /**
     * Construct a new string-like object.
     *
     * @param value - the string value
     */
    constructor(id : string, options : { softmatch ?: (against : string) => boolean } = {}) {
        this.value = id;

        // set the property only if provided
        // this allows subclasses to implement the method normally
        if (options.softmatch)
            this.softmatch = options.softmatch;
    }

    toString() {
        return this.value;
    }

    valueOf() {
        return this.value;
    }

    /**
     * Compile this to JS code.
     *
     * @return {string} JS code that evaluates to this value
     * @package
     */
    toJSSource() : string {
        return stringEscape(this.value);
    }
}

export interface LocationLike {
    x : number;
    y : number;
    display ?: string|null;
}

/**
 * Runtime representation of a location value.
 *
 */
export class Location implements LocationLike {
    /**
     * Longitude value.
     * @deprecated Use {@link lon}
     */
    x : number;
    /**
     * Latitude value.
     * @deprecated Use {@link lat}
     */
    y : number;
    /**
     * Display name for this location.
     */
    display : string|null;

    /**
     * Construct a new location value.
     *
     * @param {number} lat - latitude in degrees (between -90 and 90)
     * @param {number} lon - longitude in degrees (between -180 and 180)
     * @param {string|null} [display] - human-readable display name for this location
     */
    constructor(lat : number, lon : number, display ?: string|null) {
        if (typeof lat !== 'number' || typeof lon !== 'number')
            throw new Error(`Invalid location (${lat}, ${lon})`);

        this.x = lon;
        this.y = lat;
        this.display = display||null;
    }

    /**
     * Latitude value.
     */
    get lat() : number {
        return this.y;
    }
    /**
     * Longitude value.
     */
    get lon() : number {
        return this.x;
    }

    toString() : string {
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
    toJSSource() : string {
        return `new __builtin.Location(${this.y}, ${this.x}, ${stringEscape(this.display)})`;
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
    static isLocation(obj : unknown) : obj is LocationLike {
        return (obj instanceof Location || (typeof obj === 'object' && obj !== null &&
            Object.prototype.hasOwnProperty.call(obj, 'x') && Object.prototype.hasOwnProperty.call(obj, 'y')));
    }
}

/**
 * Runtime representation of a time value.
 *
 */
export class Time {
    /**
     * Hour value.
     */
    hour : number;
    /**
     * Minute value.
     */
    minute : number;
    /**
     * Second value.
     */
    second : number;

    /**
     * Construct a new time value.
     *
     * @param {number} hour - hour value (between 0 and 11)
     * @param {number} minute - minute value (between 0 and 59)
     * @param {number} [second] - second value (between 0 and 59)
     */
    constructor(hour : number, minute : number, second = 0) {
        if (!(hour >= 0) || !(minute >= 0) || !(second >= 0))
            throw new Error(`Invalid time ${hour}:${minute}:${second}`);
        this.hour = hour;
        this.minute = minute;
        this.second = second;
    }

    static fromSeconds(seconds : number) : Time {
        const hour = Math.floor(seconds / 3600);
        seconds -= hour * 3600;
        const minute = Math.floor(seconds / 60);
        seconds -= minute * 60;
        return new Time(hour, minute, seconds);
    }

    static fromTemporal(time : Temporal.PlainTime) {
        return new Time(time.hour, time.minute, time.second);
    }

    // for comparisons
    /**
     * Convert this time value to the number of seconds since midnight.
     *
     * This can be used to compare time values using `<` and `>`
     * @return {number} the number of seconds since midnight
     */
    valueOf() : number {
        return this.hour * 3600 + this.minute * 60 + this.second;
    }

    toString() : string {
        if (this.second === 0)
            return `${this.hour}:${this.minute < 10 ? '0' : ''}${this.minute}`;
        else
            return `${this.hour}:${this.minute < 10 ? '0' : ''}${this.minute}:${this.second < 10 ? '0' : ''}${this.second}`;
    }

    toJSON() : string {
        return this.toString();
    }

    /**
     * Compile the time value to JS code.
     *
     * @return {string} JS code that evaluates to this time value
     * @package
     */
    toJSSource() : string {
        return `new __builtin.Time(${this.hour}, ${this.minute}, ${this.second})`;
    }
}

/**
 * Runtime representation of a currency value.
 *
 */
export class Currency {
    value : number;
    code : string;

    constructor(value : number, code : string) {
        this.value = value;
        this.code = code;
    }

    valueOf() : number {
        return this.value;
    }

    toString() : string {
        return `${this.value} ${this.code.toUpperCase()}`;
    }

    toLocaleString(locale : string, options : Intl.NumberFormatOptions = {}) : string {
        options.style = 'currency';
        options.currency = this.code.toUpperCase();
        return this.value.toLocaleString(locale, options);
    }

    toJSSource() : string {
        return `new __builtin.Currency(${this.value}, "${this.code}")`;
    }
}

export interface RecurrentTimeRuleLike {
    beginTime : Time;
    endTime : Time;
    interval : number;
    frequency : number;
    dayOfWeek : number|null;
    beginDate : Date|null;
    endDate : Date|null;
    subtract : boolean;
}

/**
 * Runtime representation of a recurrent time rule (a single item in a recurrent time specification).
 *
 */
export class RecurrentTimeRule implements RecurrentTimeRuleLike {
    beginTime : Time;
    endTime : Time;
    interval : number;
    frequency : number;
    /**
     * Day of the week where this time rule applies, if any.
     *
     * This is a number between 0 and 6, where 0 is Monday and
     * 6 is Sunday.
     *
     * If null, this rule applies any day of the week.
     */
    dayOfWeek : number|null;
    beginDate : Date|null;
    endDate : Date|null;
    subtract : boolean;

    constructor({
        beginTime,
        endTime,
        interval = 86400000,
        frequency = 1,
        dayOfWeek = null,
        beginDate = null,
        endDate = null,
        subtract = false
    } : RecurrentTimeRuleLike) {
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

    toString() : string {
        return `RecurrentTimeRule(${this.beginTime} -- ${this.endTime}; ${this.frequency} every ${this.interval} ms; from ${this.beginDate} to ${this.endDate})`;
    }

    toJSSource() : string {
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

    contains(dateOrTime : Date|Temporal.ZonedDateTime|Temporal.PlainTime|Time, timezone : string) : boolean {
        let time;
        let instant;
        let dayOfWeek;

        if (dateOrTime instanceof Date) {
            instant = toTemporalInstant.call(dateOrTime);
            const datetz = instant.toZonedDateTimeISO(timezone);
            // this is not correct wrt timezone but if all we have is a date that's all we can do
            time = new Time(datetz.hour, datetz.minute, datetz.second);
            dayOfWeek = datetz.dayOfWeek;
        } else if (dateOrTime instanceof Temporal.ZonedDateTime) {
            time = Time.fromTemporal(dateOrTime.toPlainTime());
            dayOfWeek = dateOrTime.dayOfWeek;
            instant = dateOrTime.toInstant();
        } else if (dateOrTime instanceof Temporal.PlainTime) {
            time = Time.fromTemporal(dateOrTime);
            dayOfWeek = undefined;
            instant = undefined;
        } else {
            time = dateOrTime;
            dayOfWeek = undefined;
            instant = undefined;
        }

        if (!(this.beginTime <= time && this.endTime >= time))
            return false;

        if (instant) {
            if (this.beginDate && this.beginDate.getTime() > instant.epochMilliseconds)
                return false;
            if (this.endDate && this.endDate.getTime() < instant.epochMilliseconds)
                return false;
        }

        if (dayOfWeek) {
            if (this.dayOfWeek !== null && this.dayOfWeek !== dayOfWeek)
                return false;
        }

        // TODO frequency and interval
        return true;
    }
}

export class Aggregation {
    constructor(public type : string,
                public field : string,
                public cols : string,
                public count : number) {
    }
}
