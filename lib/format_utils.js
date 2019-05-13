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

const Units = require('./units');

module.exports = class FormatUtils {
    constructor(locale, timezone, gettext) {
        this._locale = locale;
        this._timezone = timezone;
        if (gettext)
            this._ = gettext.dgettext.bind(gettext, 'thingtalk');
        else
            this._ = (x) => x;
    }

    measureToString(value, precision, unit) {
        var baseUnit = Units.UnitsToBaseUnit[unit];
        if (!baseUnit)
            throw new Error('Invalid unit ' + unit);

        var coeff = Units.UnitsTransformToBaseUnit[unit];
        if (typeof coeff === 'function')
            return Units.UnitsInverseTransformFromBaseUnit[unit](value).toFixed(precision);
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
        return this._("[Latitude: %.3f deg, Longitude: %.3f deg]").format(Number(o.y), Number(o.x));
    }
};
