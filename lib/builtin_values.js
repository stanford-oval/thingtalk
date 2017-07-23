// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

class Entity {
    constructor(id, display) {
        this.value = id;
        this.display = display||null;
    }

    toString() {
        return this.value;
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
}
module.exports.Location = Location;
