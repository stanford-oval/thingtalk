// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const _languages = new Map;

const _defaultGettext = {
    gettext(x) { return x; },
    dgettext(d, x) { return x; },
    ngettext(x1, xn, n) { return n === 1 ? x1 : xn; },
    dngettext(d, x1, xn, n) { return n === 1 ? x1 : xn; },
};

/**
 * The node-gettext library.
 * @external Gettext
 * @see {@link https://www.npmjs.com/package/node-gettext}
 */

module.exports =
/**
 * Internationalization support.
 *
 * @alias I18n
 * @namespace
 */
{
    /**
     * Initialize internationalization support.
     *
     * This function should be called before any other API in the ThingTalk library.
     * It might be called multiple times to initialize multiple locales (e.g. in
     * a multi-user application).
     *
     * The passed-in gettext instance must have the `thingtalk` domain loaded with
     * the .mo files in this package.
     *
     * @param {string} locale - the locale to initialize, as a BCP 47 tag
     * @param {external:Gettext} gettext - the initialized gettext instance for this locale
     */
    init(locale, gettext) {
        // make a wrapper that is not object-oriented, and is bound to our domain
        const wrappedGettext = {
            dgettext: gettext.dgettext.bind(gettext),
            dngettext: gettext.dngettext.bind(gettext),
            gettext: gettext.dgettext.bind(gettext, 'thingtalk'),
            ngettext: gettext.dngettext.bind(gettext, 'thingtalk'),
        };
        _languages.set(locale.toLowerCase(), wrappedGettext);
    },

    /**
     * Retrieve translations for a given locale.
     *
     * If the locale is unsupported, this method will return a valid Gettext-like object
     * that returns no translation.
     *
     * @param {string} locale - the locale to retrieve
     * @return {external:Gettext} the gettext instance in the given locale, with loaded translations
     */
    get(locale) {
        if (!locale)
            return _defaultGettext;
        locale = locale.toLowerCase();
        const chunks = locale.split('-');
        for (let i = chunks.length; i >= 1; i--) {
            const candidate = chunks.slice(0, i).join('-');
            if (_languages.has(candidate))
                return _languages.get(candidate);
        }
        return _defaultGettext;
    }
};
