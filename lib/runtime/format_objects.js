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

class FormattedObject {
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

    const gettext = I18n.get(locale);
    return gettext.dgettext.bind(gettext, 'thingtalk');
}

/**
  A simple still picture.

  Properties:
  - url: the URL of the picture to display
*/
class Picture extends FormattedObject {
    constructor(spec) {
        super();

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
  A rich deep link.

  Properties:
  - displayTitle: the title of the link
  - displayText (optional): the description associated with the link
  - webCallback: the link target
  - callback (optional): a different link target, to use on plaforms where deep-linking is allowed (e.g. Android)

  If displayTitle is unspecified but displayText is, displayText is moved to displayTitle.
  If callback is not specified, it is set to the same value as webCallback.
*/
class RDL extends FormattedObject {
    constructor(spec) {
        super();

        this.type = 'rdl';
        this.callback = spec.callback;
        this.webCallback = spec.webCallback;
        this.displayTitle = spec.displayTitle;
        this.displayText = spec.displayText;
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
  A map, with a single pin at the specified location (indicated as latitude, longitude)

  Properties:
  - lat: latitude
  - lon: longitude
  - display (optional): a label for the pin (the name of the location being selected)
*/
class MapFO extends FormattedObject {
    constructor(spec) {
        super();

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
  A short notification sound from a predefined library.

  Properties:
  - name: the name of the sound, from the Freedesktop Sound Theme Spec: http://0pointer.de/public/sound-theme-spec.html
          (with a couple Almond-specific extensions)
*/
class SoundEffect extends FormattedObject {
    constructor(spec) {
        super();

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
  Audio/video display with controls

  Properties:
  - url: the URL of the music/video to display

  Whether the URL is audio or video will be identified
  based on Content-Type, URL patterns and potentially
  file extension.
*/
class Media extends FormattedObject {
    constructor(spec) {
        super();

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
