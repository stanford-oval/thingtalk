// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

import assert from 'assert';

import { DateEdge, DatePiece, WeekDayDate, AbsoluteTime, WeekDay } from '../ast';

const TIME_UNITS = ['ms', 's', 'min', 'h', 'day', 'week', 'mon', 'year'];
const SET_ZERO : Array<(d : Date) => void> = [(d) => {},
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
const ADD_ONE : Array<(d : Date) => void> = [
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


function createEdgeDate(edge : ('start_of'|'end_of'), unit : string) : Date {
    const index = TIME_UNITS.indexOf(unit);

    const date = new Date;
    SET_ZERO[index](date);
    if (edge === 'end_of')
        ADD_ONE[index](date);
    return date;
}

function createDatePiece(year : number|null, month : number|null, day : number|null, time : AbsoluteTime|null) : Date {
    // All non-supplied values to the left of the largest supplied
    // value are set to the present. All non-supplied values to the
    // right of the largest supplied value are set to the minimum.
    const date = new Date;
    if (year !== null && year > 0) {
        date.setFullYear(year);
        date.setMonth(0, 1); // 1st of Jan
        date.setHours(0, 0, 0, 0);
    }
    if (month !== null && month > 0) {
        // set both the month and the date at the same time
        // otherwise when today's date is the 31st and the chosen
        // month has 30 days, the Date will be adjusted to the
        // first day of the subsequent month, which is wrong
        date.setMonth(month - 1, 1);
        date.setHours(0, 0, 0, 0);
    }
    if (day !== null && day > 0) {
        date.setDate(day);
        date.setHours(0, 0, 0, 0);
    }
    if (time !== null)
        date.setHours(time.hour, time.minute, time.second);
    return date;
}

function weekdayToNumber(weekday : WeekDay) : number {
    switch (weekday) {
        case "monday": return 1;
        case "tuesday": return 2;
        case "wednesday": return 3;
        case "thursday": return 4;
        case "friday": return 5;
        case "saturday": return 6;
        case "sunday": return 7;
    }
    throw new Error(`Invalid weekday: ${weekday}`);
}

function createWeekDayDate(weekday : WeekDay, time : AbsoluteTime|null) {
    const date = new Date;
    const weekdayNumber = weekdayToNumber(weekday);
    const diff = (weekdayNumber - date.getDay()) % 7;
    // get the date of next specified weekday, today excluded
    date.setDate(date.getDate() + (diff > 0 ? diff : diff + 7));
    if (time)
        date.setHours(time.hour, time.minute, time.second, 0);
    return date;
}

export function normalizeDate(value : Date|WeekDayDate|DateEdge|DatePiece|null) : Date {
    if (value === null)
        return new Date;
    else if (value instanceof Date)
        return value;
    else if (value instanceof WeekDayDate)
        return createWeekDayDate(value.weekday, value.time);
    else if (value instanceof DatePiece)
        return createDatePiece(value.year, value.month, value.day, value.time);
    else
        return createEdgeDate(value.edge, value.unit);
}

interface TokenizerDate {
    year : number|undefined;
    month : number|undefined;
    day : number|undefined;
    hour ?: number|undefined;
    minute ?: number|undefined;
    second ?: number|undefined;
}

export function parseDate(form : Date|TokenizerDate) : Date {
    if (form instanceof Date)
        return form;

    const now = new Date;
    now.setMilliseconds(0);

    let year = form.year;
    if (year === undefined || year < 0)
        year = now.getFullYear();
    let month = form.month;
    if (month === undefined || month < 0)
        month = now.getMonth() + 1;
    let day = form.day;
    if (day === undefined || day < 0)
        day = now.getDate();
    let hour = form.hour;
    if (hour === undefined || hour < 0)
        hour = 0;
    let minute = form.minute;
    if (minute === undefined || minute < 0)
        minute = 0;
    let second = form.second;
    if (second === undefined || second < 0)
        second = 0;
    const millisecond = (second - Math.floor(second))*1000;
    second = Math.floor(second);

    return new Date(year, month-1, day, hour, minute, second, millisecond);
}
