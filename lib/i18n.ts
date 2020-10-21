// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

export interface Gettext {
    locale : string;

    gettext : (x : string) => string;
    dgettext : (d : string, x : string) => string;
    ngettext : (x1 : string, xn : string, n : number) => string;
    dngettext : (d : string, x1 : string, xn : string, n : number) => string;
}

const _languages = new Map<string, Gettext>();

const _defaultGettext : Gettext = {
    locale: 'en-US',

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

/**
 * Internationalization support.
 *
 * @alias I18n
 * @namespace
 */

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
export function init(locale : string, gettext : Gettext) {
    // make a wrapper that is not object-oriented, and is bound to our domain
    const wrappedGettext : Gettext = {
        locale: gettext.locale,
        dgettext: gettext.dgettext.bind(gettext),
        dngettext: gettext.dngettext.bind(gettext),
        gettext: gettext.dgettext.bind(gettext, 'thingtalk'),
        ngettext: gettext.dngettext.bind(gettext, 'thingtalk'),
    };
    _languages.set(locale.toLowerCase(), wrappedGettext);
}

/**
 * Retrieve translations for a given locale.
 *
 * If the locale is unsupported, this method will return a valid Gettext-like object
 * that returns no translation.
 *
 * @param {string} locale - the locale to retrieve
 * @return {external:Gettext} the gettext instance in the given locale, with loaded translations
 */
export function get(locale : string) : Gettext {
    if (!locale)
        return _defaultGettext;
    locale = locale.toLowerCase();
    const chunks = locale.split('-');
    for (let i = chunks.length; i >= 1; i--) {
        const candidate = chunks.slice(0, i).join('-');
        if (_languages.has(candidate))
            return _languages.get(candidate) as Gettext;
    }
    return _defaultGettext;
}
