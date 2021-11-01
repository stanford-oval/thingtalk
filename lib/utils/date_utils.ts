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

import { Temporal } from '@js-temporal/polyfill';
import assert from 'assert';

import { DateEdge, DatePiece, WeekDayDate, AbsoluteTime, WeekDay } from '../ast';

const TIME_UNITS = ['ms', 's', 'min', 'h', 'day', 'week', 'mon', 'year'];
const SET_ZERO : Array<(d : Temporal.ZonedDateTime) => Temporal.ZonedDateTime> = [
    (d) => d.with({ microsecond: 0, nanosecond: 0 }), // start of current second
    (d) => d.with({ millisecond: 0, microsecond: 0, nanosecond: 0 }), // start of current second
    (d) => d.with({ second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }), // start of current minute
    (d) => d.withPlainTime({ hour: d.hour, minute: 0 }), // start of current hour
    (d) => d.withPlainTime({ hour: 0, minute: 0 }), // start of current day
    (d) => {
        // start of current week
        d = d.withPlainTime({ hour: 0, minute: 0 });
        // subtract the 1-based day of week
        return d.subtract({ days: d.dayOfWeek-1 });
    },
    (d) => {
        // start of current month
        d = d.withPlainTime({ hour: 0, minute: 0 });
        return d.with({ day: 1 });
    },
    (d) => {
        // start of current year
        d = d.withPlainTime({ hour: 0, minute: 0 });
        return d.with({ month: 1, day: 1 });
    }
];
const ADD_ONE : Array<(d : Temporal.ZonedDateTime) => Temporal.ZonedDateTime> = [
    (d) => d.add({ milliseconds: 1 }),
    (d) => d.add({ seconds: 1 }),
    (d) => d.add({ minutes: 1 }),
    (d) => d.add({ hours: 1 }),
    (d) => d.add({ days: 1 }),
    (d) => d.add({ weeks: 1 }),
    (d) => d.add({ months: 1 }),
    (d) => d.add({ years: 1 })
];
assert(SET_ZERO.length === TIME_UNITS.length);
assert(ADD_ONE.length === TIME_UNITS.length);


function createEdgeDate(edge : ('start_of'|'end_of'), unit : string, timezone : string) : Date {
    const index = TIME_UNITS.indexOf(unit);

    let date = Temporal.Now.zonedDateTimeISO(timezone);
    date = SET_ZERO[index](date);
    if (edge === 'end_of')
        date = ADD_ONE[index](date);
    return new Date(date.epochMilliseconds);
}

function createDatePiece(year : number|null, month : number|null, day : number|null, time : AbsoluteTime|null, timezone : string) : Date {
    // All non-supplied values to the left of the largest supplied
    // value are set to the present. All non-supplied values to the
    // right of the largest supplied value are set to the minimum.
    let date = Temporal.Now.zonedDateTimeISO(timezone);
    if (year !== null && year > 0) {
        date = date.withPlainDate({
            // 1st of Jan
            year,
            month: 1,
            day: 1,
        }).withPlainTime({
            hour: 0,
            minute: 0,
            second: 0
        });
    }
    if (month !== null && month > 0) {
        // set both the month and the date at the same time
        // otherwise when today's date is the 31st and the chosen
        // month has 30 days, the Date will be adjusted to the
        // first day of the subsequent month, which is wrong
        date = date.withPlainDate({
            year: date.year,
            month,
            day: 1
        }).withPlainTime({
            hour: 0,
            minute: 0,
            second: 0
        });
    }
    if (day !== null && day > 0) {
        date = date.withPlainDate({
            year: date.year,
            month: date.month,
            day: day
        }).withPlainTime({
            hour: 0,
            minute: 0,
            second: 0
        });
    }
    if (time !== null)
        date = date.withPlainTime(time);
    return new Date(date.epochMilliseconds);
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

function createWeekDayDate(weekday : WeekDay, time : AbsoluteTime|null, timezone : string) {
    const now = Temporal.Now.zonedDateTimeISO(timezone);
    const weekdayNumber = weekdayToNumber(weekday);
    const diff = (weekdayNumber - now.dayOfWeek + 7) % 7;
    // get the date of next specified weekday, today excluded

    let tgt = now;
    if (time)
        tgt = tgt.withPlainTime(time);
    else
        tgt = tgt.withPlainTime({ hour: 0, minute: 0, second: 0 });

    tgt = tgt.add({ days: (diff > 0 ? diff : diff + 7) });
    return new Date(tgt.epochMilliseconds);
}

export function normalizeDate(value : Date|WeekDayDate|DateEdge|DatePiece|null, timezone : string) : Date {
    if (value === null)
        return new Date;
    else if (value instanceof Date)
        return value;
    else if (value instanceof WeekDayDate)
        return createWeekDayDate(value.weekday, value.time, timezone);
    else if (value instanceof DatePiece)
        return createDatePiece(value.year, value.month, value.day, value.time, timezone);
    else
        return createEdgeDate(value.edge, value.unit, timezone);
}

interface TokenizerDate {
    year : number|undefined;
    month : number|undefined;
    day : number|undefined;
    hour ?: number|undefined;
    minute ?: number|undefined;
    second ?: number|undefined;
}

export function parseDate(form : Date|TokenizerDate|Temporal.ZonedDateTime|Temporal.Instant, timezone : string = Temporal.Now.timeZone().id) : Date {
    if (form instanceof Date)
        return form;
    if (form instanceof Temporal.ZonedDateTime)
        return new Date(form.epochMilliseconds);
    if (form instanceof Temporal.Instant)
        return new Date(form.epochMilliseconds);

    let now = Temporal.Now.zonedDateTime('iso8601', timezone);
    now = now.with({ millisecond: 0 });

    let year = form.year;
    if (year === undefined || year < 0)
        year = now.year;
    let month = form.month;
    if (month === undefined || month < 0)
        month = now.month;
    let day = form.day;
    if (day === undefined || day < 0)
        day = now.day;
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

    const tzdate = Temporal.ZonedDateTime.from({
        year, month, day, hour, minute, second, millisecond,
        timeZone: timezone
    });
    return new Date(tzdate.epochMilliseconds);
}
