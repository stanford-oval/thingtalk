// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const TIME_UNITS = ['ms', 's', 'min', 'h', 'day', 'week', 'mon', 'year'];
const SET_ZERO = [(d) => {},
    (d) => {
        d.setMilliseconds(0); // start of current second
    },
    (d) => {
        d.setSeconds(0, 0); // start of current minute
    },
    (d) => {
        d.setMinutes(0, 0, 0); // start of current hour
    },
    (d) => {
        d.setHours(0, 0, 0, 0); // start of current day
    },
    (d) => {
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate()-d.getDay()); // start of current week (week starts Sunday)
    },
    (d) => {
        d.setHours(0, 0, 0, 0);
        d.setDate(1); // start of current month
    },
    (d) => {
        d.setHours(0, 0, 0, 0);
        d.setMonth(0, 1); // start of current year
    }
];
const ADD_ONE = [
    (d) => {
        d.setMilliseconds(d.getMilliseconds()+1);
    },
    (d) => {
        d.setSeconds(d.getSeconds()+1);
    },
    (d) => {
        d.setMinutes(d.getMinutes()+1);
    },
    (d) => {
        d.setHours(d.getHours()+1);
    },
    (d) => {
        d.setDate(d.getDate()+1);
    },
    (d) => {
        d.setDate(d.getDate()+7);
    },
    (d) => {
        d.setMonth(d.getMonth()+1);
    },
    (d) => {
        d.setFullYear(d.getFullYear()+1);
    }
];
assert(SET_ZERO.length === TIME_UNITS.length);
assert(ADD_ONE.length === TIME_UNITS.length);


function createEdgeDate(edge, unit) {
    const index = TIME_UNITS.indexOf(unit);

    const date = new Date;
    SET_ZERO[index](date);
    if (edge === 'end_of')
        ADD_ONE[index](date);
    return date;
}

module.exports = {
    normalizeDate(value, operator, offset) {
        if (operator === '-')
            offset = -offset;
        let base;
        if (value === null)
            base = new Date;
        else if (value instanceof Date)
            base = value;
        else
            base = createEdgeDate(value.edge, value.unit);
        base.setMilliseconds(base.getMilliseconds() + offset);
        return base;
    },

    parseDate(form) {
        if (form instanceof Date)
            return form;

        let now = new Date;
        now.setMilliseconds(0);

        let year = form.year;
        if (year < 0 || year === undefined)
            year = now.getFullYear();
        let month = form.month;
        if (month < 0 || month === undefined)
            month = now.getMonth() + 1;
        let day = form.day;
        if (day < 0 || day === undefined)
            day = now.getDate();
        let hour = form.hour;
        if (hour < 0 || hour === undefined)
            hour = 0;
        let minute = form.minute;
        if (minute < 0 || minute === undefined)
            minute = 0;
        let second = form.second;
        if (second < 0 || second === undefined)
            second = 0;
        let millisecond = (second - Math.floor(second))*1000;
        second = Math.floor(second);

        return new Date(year, month-1, day, hour, minute, second, millisecond);
    },
};
