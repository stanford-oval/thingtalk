// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const I18n = require('../i18n');

function isNull(value) {
    // all false-y values except false itself are "null"
    if (value === undefined || value === null || value === '' || Number.isNaN(value))
        return true;
    // empty arrays are "null"
    if (Array.isArray(value) && value.length === 0)
        return true;
    // invalid dates are "null"
    if (value instanceof Date && isNaN(value))
        return true;
    return false;
}

/**
 * The base class of all formatting objects.
 *
 * Formatting objects are created from spec objects provided in the `#_[formatted]`
 * function annotation.
 *
 * @alias FormatObjects~FormattedObject
 * @abstract
 */
class FormattedObject {
    /**
     * A string identifying the type of this formatted object.
     *
     * @name FormatObjects~FormattedObject#type
     * @member
     * @type {string}
     * @readonly
     */

    /**
     * Check if this formatted object is valid.
     *
     * A formatted object is valid if the required properties are substituted with
     * valid values (not null, undefined, empty or NaN). Invalid formatted objects
     * are not displayed to the user.
     *
     * @name FormatObjects~FormattedObject#isValid
     * @method
     * @abstract
     * @return {boolean} true if this formatted object is valid, false otherwise
     */

    /**
     * Convert this formatted object to a localized string.
     *
     * The resulting string is suitable for speech, or for displaying to user in
     * a text-only interface. It is also suitable as a fallback for all formatting
     * objects not recognized by the application.
     *
     * @name FormatObjects~FormattedObject#toLocaleString
     * @method
     * @abstract
     * @param {string} locale - the locale to localize any message into
     * @return {string} a string representation of this formatted object
     */

    /**
     * Replace all placeholders in this object, using the provided structured result.
     *
     * @param {Formatter} formatter - the formatter to use for replacement
     * @param {Object.<string,any>} argMap - the structured ThingTalk result with the values to substitute
     */
    replaceParameters(formatter, argMap) {
        for (let key in this) {
            if (key === 'type')
                continue;

            this[key] = formatter._replaceInString(this[key], argMap);
        }
    }
}

function localeCompat(locale) {
    if (typeof locale === 'function')
        return locale;
    return I18n.get(locale).gettext;
}

/**
 * A simple still picture.
 *
 * @alias FormatObjects~Picture
 * @extends FormatObjects~FormattedObject
 */
class Picture extends FormattedObject {
    /**
     * Construct a new picture object.
     *
     * @param {Object} spec
     * @param {string} spec.url - the URL of the picture to display
     */
    constructor(spec) {
        super();

        /**
         * A string identifying the type of this formatted object. Always the value `picture`.
         *
         * @readonly
         * @type {string}
         */
        this.type = 'picture';
        this.url = spec.url;
    }

    isValid() {
        return !isNull(this.url);
    }

    toLocaleString(locale) {
        const _ = localeCompat(locale);
        return _("Picture: %s").format(this.url);
    }
}

/**
 * A rich deep link (also known as a card).
 *
 * An RDL is expected to be displayed as a clickable card with optional
 * description and picture.
 *
 * @alias FormatObjects~RDL
 * @extends FormatObjects~FormattedObject
 */
class RDL extends FormattedObject {
    /**
     * Construct a new RDL
     *
     * If displayTitle is unspecified but displayText is, displayText is moved to displayTitle.
     * If callback is not specified, it is set to the same value as webCallback.
     *
     * @param {Object} spec
     * @param {string} spec.displayTitle - the title of the link
     * @param {string} [spec.displayText] - the description associated with the link
     * @param {string} spec.webCallback - the link target
     * @param {string} [spec.callback] - a different link target, to use on plaforms where deep-linking is allowed (e.g. Android)
     * @param {string} [spec.pictureUrl] - a picture associated with this link
     */
    constructor(spec) {
        super();

        /**
         * A string identifying the type of this formatted object. Always the value `rdl`.
         *
         * @readonly
         * @type {string}
         */
        this.type = 'rdl';
        this.callback = spec.callback;
        this.webCallback = spec.webCallback;
        this.displayTitle = spec.displayTitle;
        this.displayText = spec.displayText;
        this.pictureUrl = spec.pictureUrl;
    }

    replaceParameters(formatter, argMap) {
        super.replaceParameters(formatter, argMap);
        if (!this.webCallback && this.callback)
            this.webCallback = this.callback;
        if (!this.callback && this.webCallback)
            this.callback = this.webCallback;
        if (!this.displayTitle && this.displayText) {
            this.displayTitle = this.displayText;
            this.displayText = undefined;
        }
        if (!this.displayTitle)
            this.displayTitle = this.webCallback;
        if (!this.pictureUrl)
            this.pictureUrl = undefined;
    }

    isValid() {
        return !isNull(this.webCallback);
    }

    toLocaleString(locale) {
        const _ = localeCompat(locale);
        return _("Link: %s <%s>").format(this.displayTitle, this.webCallback);
    }
}

/**
 * A map, with a single pin at the specified location (indicated as latitude, longitude)
 *
 * Whether the map is interactive (can be panned, zoomed) is implementation-dependent.
 *
 * The name `MapFO` is chosen to avoid confusion by JavaScript's builtin
 * [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
 * data structure.
 *
 * @alias FormatObjects~MapFO
 * @extends FormatObjects~FormattedObject
 */
class MapFO extends FormattedObject {
    /**
     * Construct a new map format object.
     *
     * @param {Object} spec
     * @param {string|number} spec.lat - latitude; this can be a string with placeholders, or a number
     * @param {string|number} spec.lon - longitude; this can be a string with placeholders, or a number
     * @param {string} [spec.display] - a label for the pin (the name of the location being selected)
     */
    constructor(spec) {
        super();

        /**
         * A string identifying the type of this formatted object. Always the value `map`.
         *
         * @readonly
         * @type {string}
         */
        this.type = 'map';
        this.lat = spec.lat;
        this.lon = spec.lon;
        this.display = spec.display;
    }

    replaceParameters(formatter, argMap) {
        super.replaceParameters(formatter, argMap);
        this.lat = Number(this.lat);
        this.lon = Number(this.lon);
    }

    isValid() {
        return !isNull(this.lat) && !isNull(this.lon);
    }

    toLocaleString(locale) {
        const _ = localeCompat(locale);
        if (this.display)
            return _("Location: %s").format(this.display);
        else
            return _("Location: [Latitude: %.3f deg, Longitude: %.3f deg]").format(Number(this.lat), Number(this.lon));
    }
}

/**
 * A short notification sound from a predefined library.
 *
 * @alias FormatObjects~SoundEffect
 * @extends FormatObjects~FormattedObject
*/
class SoundEffect extends FormattedObject {
    /**
     * Construct a new sound effect object.
     *
     * @param {Object} spec
     * @param {string} spec.name - the name of the sound, from the {@link http://0pointer.de/public/sound-theme-spec.html|Freedesktop Sound Theme Spec}
     *                             (with a couple Almond-specific extensions)
     */
    constructor(spec) {
        super();

        /**
         * A string identifying the type of this formatted object. Always the value `sound`.
         *
         * @readonly
         * @type {string}
         */
        this.type = 'sound';
        this.name = spec.name;
    }

    isValid() {
        return !isNull(this.name);
    }

    toLocaleString(locale) {
        const _ = localeCompat(locale);
        return _("Sound effect: %s").format(this.name);
    }
}

/**
 * Audio/video display with controls
 *
 * @alias FormatObjects~Media
 * @extends FormatObjects~FormattedObject
*/
class Media extends FormattedObject {
    /**
     * Construct a new media object.
     *
     * Whether the URL is audio or video will be identified
     * based on Content-Type, URL patterns and potentially
     * file extension.
     *
     * @param {Object} spec
     * @param {string} spec.url - the URL of the music/video to display
     */
    constructor(spec) {
        super();

        /**
         * A string identifying the type of this formatted object. Always the value `media`.
         *
         * @readonly
         * @type {string}
         */
        this.type = 'media';
        this.url = spec.url;
    }

    isValid() {
        return !isNull(this.url);
    }

    toLocaleString(locale) {
        const _ = localeCompat(locale);
        return _("Media: %s").format(this.url);
    }
}

const FORMAT_TYPES = {
    'picture': Picture,
    'rdl': RDL,
    'map': MapFO,
    'sound': SoundEffect,
    'media': Media,
};
module.exports = { FORMAT_TYPES, isNull };
