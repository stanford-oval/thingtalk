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

/**
 * Formatting utilities.
 *
 * This class provides an abstraction over {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl|the Intl API}
 * that ensures the correct locale and timezone information are used.
 *
 * @package
 */
class FormatUtils {
    /**
     * Construct a new format utils object.
     *
     * @param {string} locale - the user's locale, as a BCP47 tag
     * @param {string} timezone - the user's timezone, as a string in the IANA timezone database (e.g. America/Los_Angeles, Europe/Rome)
     * @param {Gettext} [gettext] - gettext instance; this is optional if {@link I18n.init} has been called
     */
    constructor(locale, timezone, gettext) {
        this._locale = locale;
        this._timezone = timezone;
        if (gettext)
            this._ = gettext.dgettext.bind(gettext, 'thingtalk');
        else
            this._ = (x) => x;
    }

    /**
     * Convert a measurement to a user-visible string.
     *
     * @param {number} value - the value, in the ThingTalk base unit (e.g. Celius for temperature, meters for distance)
     * @param {number} [precision] - the number of digits after the decimal separator, defaults to 0
     * @param {string} unit - the unit to display as, as a ThingTalk unit code
     * @return {string} the formatted measurement
     */
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

    /**
     * Convert a date to a user-visible string (without the time part).
     *
     * This is a small wrapper over {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleString|Date.toLocaleString}
     * that applies the correct timezone.
     *
     * @param {Date} date - the date to display
     * @param {Object} [options] - additional options to pass to `toLocaleString`
     * @return {string} the formatted date
     */
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

    /**
     * Convert a date object to a user-visible string, displaying _only_ the time part.
     *
     * This is a small wrapper over {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleString|Date.toLocaleString}
     * that applies the correct timezone.
     *
     * @param {Date} date - the time to display
     * @param {Object} [options] - additional options to pass to `toLocaleString`
     * @return {string} the formatted time
     */
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

    /**
     * Convert a date object to a user-visible string, displaying both the date and the time part.
     *
     * This is a small wrapper over {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleString|Date.toLocaleString}
     * that applies the correct timezone.
     *
     * @param {Date} date - the date to display
     * @param {Object} [options] - additional options to pass to `toLocaleString`
     * @return {string} the formatted date
     */
    dateAndTimeToString(date, options = {}) {
        options.timeZone = this._timezone;
        return date.toLocaleString(this._locale, options);
    }

    /**
     * Convert a location to a string.
     *
     * @param {Builtin.Location} loc - the location to display
     * @return {string} the formatted location
     */
    locationToString(loc) {
        if (loc.display)
            return loc.display;
        return this._("[Latitude: %.3f deg, Longitude: %.3f deg]").format(Number(loc.y), Number(loc.x));
    }
}
module.exports = FormatUtils;
