// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { stringEscape } = require('./escaping');

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
}
module.exports.Entity = Entity;

class Location {
    constructor(lat, lon, display) {
        this.x = lon;
        this.y = lat;
        this.display = display;
    }

    toString() {
        return '[Latitude: ' + Number(this.y).toFixed(5) + ' deg, Longitude: ' + Number(this.x).toFixed(5) + ' deg]';
    }

    toJSSource() {
        return `new __builtin.Location(${this.y}, ${this.x}, ${stringEscape(this.display)})`;
    }
}
module.exports.Location = Location;

class Time {
    constructor(hour, minute, second = 0) {
        this.hour = hour;
        this.minute = minute;
        this.second = 0;
    }

    // for comparisons
    valueOf() {
        return this.hour * 3600 + this.minute * 60 + this.second;
    }

    toString() {
        if (this.second === 0)
            return this.hour + ':' + (this.minute < 10 ? '0' : '') + this.minute;
        else
            return this.hour + ':' + (this.minute < 10 ? '0' : '') + this.minute + (this.second < 10 ? '0' : '') + this.second;
    }

    toJSON() {
        return this.toString();
    }

    toJSSource() {
        return `new __builtin.Time(${this.hour}, ${this.minute}, ${this.second})`;
    }
}
module.exports.Time = Time;
