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

import * as Ast from '../ast';

import {
    LocationLike,
    Location,
    Entity,
    Time,
    Currency,
    RecurrentTimeRule
} from './values';

// Implementations of the ThingTalk operators

function arrayEquals(a : unknown[], b : unknown[]) : boolean {
    if (a.length !== b.length)
        return false;

    for (let i = 0; i < a.length; i++) {
        if (!equality(a[i], b[i]))
            return false;
    }

    return true;
}

function objectEquals<T1, T2>(a : T1, b : T2) : boolean {
    const a_props = Object.getOwnPropertyNames(a) as Array<keyof T1>;
    const b_props = Object.getOwnPropertyNames(b) as Array<keyof T2>;

    if (a_props.length !== b_props.length)
        return false;

    for (let i = 0; i < a_props.length; i ++) {
        if (!equality(a[a_props[i]], b[a_props[i] as unknown as keyof T2]))
            return false;
    }

    return true;
}

export function distance(a : LocationLike, b : LocationLike) : number {
    const R = 6371000; // meters
    const lat1 = a.y;
    const lat2 = b.y;
    const lon1 = a.x;
    const lon2 = a.x;
    function toRadians(deg : number) { return deg * Math.PI / 180.0; }

    // formula courtesy of http://www.movable-type.co.uk/scripts/latlong.html
    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2-lat1);
    const Δλ = toRadians(lon2-lon1);

    const x = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));

    return R * c;
}

function locationEquals(a : LocationLike, b : LocationLike) : boolean {
    if (a === b)
        return true;
    if (a.x === b.x && a.y === b.y)
        return true;
    //console.log('Comparing locations', [a,b]);
    const d = distance(a, b);
    //console.log('Distance (m): ' + d.toFixed(2));
    return d <= 10000;
}

function hasValueOf(x : unknown) : x is number|Date|Time {
    return typeof x === 'number' || x instanceof Date || x instanceof Time;
}

function editDistance(one : (string|unknown[]), two : (string|unknown[])) : number {
    if (typeof one === 'string' && typeof two === 'string') {
        if (one === two)
            return 0;
        if (one.indexOf(two) >= 0)
            return one.length - two.length;
        if (two.indexOf(one) >= 0)
            return two.length - one.length;
    }

    const R = one.length + 1;
    const C = two.length + 1;
    const matrix = new Array<number>(R * C);

    function set(i : number, j : number, v : number) : void {
        assert(i * C + j < R * C);
        matrix[i * C + j] = v;
    }

    function get(i : number, j : number) : number {
        assert(i * C + j < R * C);
        return matrix[i * C + j];
    }

    for (let j = 0; j < C; j++)
        set(0, j, j);
    for (let i = 1; i < R; i++)
        set(i, 0, i);
    for (let i = 1; i <= one.length; i++) {
        for (let j = 1; j <= two.length; j++) {
            if (one[i - 1] === two[j - 1])
                set(i, j, get(i - 1, j - 1));
            else
                set(i, j, 1 + Math.min(Math.min(get(i - 1, j), get(i, j - 1)), get(i - 1, j - 1)));
        }
    }

    return get(one.length, two.length);
}

export function equality(a : unknown, b : unknown) : boolean {
    if (a === b)
        return true;
    if (a === null || b === null) // they can't be both null because a !== b
        return false;
    if (a === undefined || b === undefined)
        return false;
    if (Number.isNaN(a) && Number.isNaN(b))
        return true;
    if (a instanceof Date && typeof b === 'string')
        return +a === +new Date(b);
    if (typeof a === 'string' && b instanceof Date)
        return +new Date(a) === +b;
    if (hasValueOf(a) && hasValueOf(b))
        return +a === +b;
    if (a instanceof Currency && b instanceof Currency)
        return a.value === b.value && a.code.toLowerCase() === b.code.toLowerCase();
    if (a instanceof Currency && typeof b === 'number')
        return +a === +b;
    if (b instanceof Currency && typeof a === 'number')
        return +a === +b;
    if (Location.isLocation(a) && Location.isLocation(b))
        return locationEquals(a, b);
    if (Entity.isEntity(a) && Entity.isEntity(b))
        return String(a) === String(b);
    if (a instanceof Ast.Example && b instanceof Ast.Example)
        return a.id === b.id;
    if (Array.isArray(a) && Array.isArray(b))
        return arrayEquals(a, b);
    if (typeof a === 'object' && typeof b === 'object') {
        assert(a !== null);
        assert(b !== null);
        return objectEquals(a, b);
    }

    return false;
}

export function approx(a : unknown, b : unknown) : boolean {
    // TODO: implement a real approximation operator 
    if (a === b)
        return true;
    return false;
}

export function like(a_ : unknown, b : string) : boolean {
    if (a_ instanceof Entity && a_.display)
        return like(a_.display, b);

    if (typeof a_ === 'string' && typeof b === 'string') {
        let a = a_.toLowerCase();
        a = a.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        a = a.replace(/[\p{Mark}\p{Punctuation}\p{Separator}\p{Other}_]/ug, ' ');
        a = a.replace(/\p{White_Space}+/ug, ' ');
        a = a.trim();
        b = b.toLowerCase();
        b = b.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        b = b.replace(/[\p{Mark}\p{Punctuation}\p{Separator}\p{Other}_]/ug, ' ');
        b = b.replace(/\p{White_Space}+/ug, ' ');
        b = b.trim();
        if (a.indexOf(b) >= 0)
            return true;
        for (const token_b of b.split(' ')) {
            let tokenFound = false;
            for (const token_a of a.split(' ')) {
                if (token_a === token_b || (editDistance(token_a, token_b) <= 1 && token_b.length > 1)) {
                    tokenFound = true;
                    break;
                }
            }
            if (!tokenFound)
                return false;
        }
        return true;
    }
    return false;
}

export function startsWith(a : unknown, b : unknown) : boolean {
    if (typeof a === 'string' && typeof b === 'string')
        return a.toLowerCase().startsWith(b.toLowerCase());
    return false;
}

export function endsWith(a : unknown, b : unknown) : boolean {
    if (typeof a === 'string' && typeof b === 'string')
        return a.toLowerCase().endsWith(b.toLowerCase());
    return false;
}

export function recurrentTimeSpecContains(spec : RecurrentTimeRule[],
                                          timeOrDate : Date|Time) : boolean {
    assert(Array.isArray(spec));

    let contained = false;
    for (const rule of spec) {
        if (rule.contains(timeOrDate)) {
            if (rule.subtract)
                contained = false;
            else
                contained = true;
        }
    }
    return contained;
}

export function contains(a : unknown[]|null|undefined, b : unknown) : boolean {
    if (a === null || a === undefined)
        return false;
    return a.some((x) => equality(x, b));
}

// b is a substring of any element of a
export function containsLike(a : unknown[]|null|undefined, b : string) {
    if (a === null || a === undefined)
        return false;
    return a.some((x) => like(x, b));
}

// any element of b is a substring of a
export function inArrayLike(a : string, b : string[]|null|undefined) {
    if (b === null || b === undefined)
        return false;
    return b.some((x) => like(a, x));
}

export function getTime(d : Date) : Time {
    return new Time(d.getHours(), d.getMinutes(), d.getSeconds());
}

export function getCurrency(d : number) : Currency {
    return new Currency(d, 'usd'); //Assumes that default location is USA
}

// aggregations
export function sum(a : number, b : number) : number {
    return a + b;
}
export function max(a : number, b : number) : number {
    return Math.max(a, b);
}
export function min(a : number, b : number) : number {
    return Math.min(a, b);
}
export function argmax(value : number, previous : number) : boolean {
    return value > previous;
}
export function argmin(value : number, previous : number) : boolean {
    return value < previous;
}

// FIXME: replace with a faster implementation based on binary trees
// if we care
export class EqualitySet {
    store : unknown[];

    constructor() {
        this.store = [];
    }

    has(value : unknown) : boolean {
        for (const candidate of this.store) {
            if (equality(candidate, value))
                return true;
        }
        return false;
    }

    add(value : unknown) : void {
        for (const candidate of this.store) {
            if (equality(candidate, value))
                return;
        }
        this.store.push(value);
    }

    get size() : number {
        return this.store.length;
    }
}

type ArgMinMaxOp = (value : number, previous : number) => number;

export class ArgMinMaxState<T> {
    private _op : ArgMinMaxOp;
    private _total : number;
    private _filled : number;
    private _tuples : T[];
    private _outputTypes : string[];
    private _values : number[];
    private _base : number;

    constructor(op : ArgMinMaxOp,
                base : number,
                limit : number) {
        this._op = op;

        this._total = Math.max(base + limit - 1, 1);
        this._filled = 0;
        this._tuples = new Array(this._total);
        this._outputTypes = new Array(this._total);
        this._values = new Array(this._total);

        this._base = Math.max(base-1, 0);
    }

    *[Symbol.iterator]() : Generator<[string, unknown], void> {
        for (let i = this._base; i < this._filled; i++)
            yield [this._outputTypes[i], this._tuples[i]];
    }

    update(tuple : T, outputType : string, value : number) : void {
        for (let i = 0; i < this._filled; i++) {
            const candidate = this._values[i];
            if (this._op(value, candidate)) {
                // shift everything by one

                let last;
                if (this._filled < this._total) {
                    last = this._filled;
                    this._filled++;
                } else {
                    last = this._filled-1;
                }
                for (let j = last; j > i; j--) {
                    this._tuples[j] = this._tuples[j-1];
                    this._outputTypes[j] = this._outputTypes[j-1];
                    this._values[j] = this._values[j-1];
                }

                this._tuples[i] = tuple;
                this._outputTypes[i] = outputType;
                this._values[i] = value;
                return;
            }
        }

        if (this._filled < this._total) {
            this._tuples[this._filled] = tuple;
            this._outputTypes[this._filled] = outputType;
            this._values[this._filled] = value;
            this._filled ++;
        }
    }
}

export function count(x : unknown[]) : number {
    return x.length;
}

export function aggregateMax(array : number[]) : number {
    let value = -Infinity;
    for (const element of array)
        value = Math.max(element, value);
    return value;
}
export function aggregateMin(array : number[]) : number {
    let value = Infinity;
    for (const element of array)
        value = Math.min(element, value);
    return value;
}
export function aggregateSum(array : number[]) : number {
    let value = 0;
    for (const element of array)
        value += element;
    return value;
}
export function aggregateAvg(array : number[]) : number {
    let sum = 0;
    let count = 0;
    for (const element of array) {
        sum += element;
        count += 1;
    }
    return sum/count;
}
export function setTime(d : Date, t : Time) : Date {
    if (d === null)
        d = new Date();
    if (t === null) 
        return d;
    d.setHours(t.hour);
    d.setMinutes(t.minute);
    d.setSeconds(t.second);
    return d;
}
export function dateAdd(date : Date, offset : number) : Date {
    return new Date(date.getTime() + offset);
}
export function dateSub(date : Date, offset : number) : Date {
    return new Date(date.getTime() - offset);
}
export function timeAdd(time : Time, offset : number) : Time {
    return Time.fromSeconds(Number(time) + Math.round(offset/1000));
}
export function timeSub(time : Time, offset : number) : Time {
    return Time.fromSeconds(Number(time) - Math.round(offset/1000));
}
