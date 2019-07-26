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
    dngettext(d, x1, xn, n) { return n === 1 ? x1 : xn; }
};

module.exports = {
    init(locale, gettext) {
        _languages.set(locale.toLowerCase(), gettext);
    },

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
