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

class Entity {
    constructor(id, display) {
        this.value = id;
        this.display = display||null;
    }

    toString() {
        return this.value;
    }

    toJSSource() {
        return `new __builtin.Entity(${stringEscape(this.value)}, ${stringEscape(this.display)})`;
    }

    static isEntity(obj) {
        return obj instanceof Entity || typeof obj === 'string';
    }
}
module.exports.Entity = Entity;

class Location {
    constructor(lat, lon, display) {
        if (typeof lat !== 'number' || typeof lon !== 'number')
            throw new Error(`Invalid location (${lat}, ${lon})`);
        this.x = lon;
        this.y = lat;
        this.display = display||null;
    }

    get lat() {
        return this.y;
    }
    get lon() {
        return this.x;
    }

    toString() {
        if (this.display !== null)
            return this.display;
        else
            return '[Latitude: ' + Number(this.y).toFixed(5) + ' deg, Longitude: ' + Number(this.x).toFixed(5) + ' deg]';
    }

    toJSSource() {
        return `new __builtin.Location(${this.y}, ${this.x}, ${stringEscape(this.display)})`;
    }

    static isLocation(obj) {
        return (obj instanceof Location || (typeof obj === 'object' && obj !== null &&
            Object.prototype.hasOwnProperty.call(obj, 'x') && Object.prototype.hasOwnProperty.call(obj, 'y')));
    }
}
module.exports.Location = Location;

class Time {
    constructor(hour, minute, second = 0) {
        if (!(hour >= 0) || !(minute >= 0) || !(second >= 0))
            throw new Error(`Invalid time ${hour}:${minute}:${second}`);
        this.hour = hour;
        this.minute = minute;
        this.second = second;
    }

    // for comparisons
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
