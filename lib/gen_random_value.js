// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Ast = require('./ast');

const STRING_ARGUMENTS = ["i'm happy", "you would never believe what happened", "merry christmas", "love you"];
//const STRING_ARGUMENTS = ["0123456789", "12345", "9876543210", "0123456788", "23456789", "ABCDEFGHIJ"];
const NUMBER_ARGUMENTS = [42, 7, 14, 11, 55];
const MEASURE_ARGUMENTS = {
    C: [{ value: 73, unit: 'F' }, { value: 75, unit: 'F' }, { value: 80, unit: 'F' }],
    m: [{ value: 1000, unit: 'm' }, { value: 42, unit: 'cm' }, { value: 5, unit: 'm' }],
    kg: [{ value: 82, unit: 'kg' }, { value: 155, unit: 'lb' }, { value: 75, unit: 'kg' }],
    kcal: [{ value: 500, unit: 'kcal' }],
    mps: [{ value: 5, unit: 'kmph' }, { value: 25, unit: 'mph' }],
    ms: [{ value: 2, unit: 'h'}, { value: 30, unit: 'min' }, { value: 3, unit: 'day' }],
    byte: [{ value: 5, unit: 'KB' }, { value: 20, unit: 'MB' }, { value: 2, unit: 'GB' }]
};
const BOOLEAN_ARGUMENTS = [true, false];
const LOCATION_ARGUMENTS = [Ast.Location.Relative('current_location'),
                            Ast.Location.Relative('home'),
                            Ast.Location.Relative('work'),
                            Ast.Location.Absolute(37.442156, -122.1634471, 'Palo Alto, California'),
                            Ast.Location.Absolute(34.0543942, -118.2439408, 'Los Angeles, California')];
const DATE_ARGUMENTS = ['2017-02-14T00:00:00-08:00', '2016-05-04T00:00:00-07:00',
    '2017-08-02T00:00:00-07:00'];
const TIME_ARGUMENTS = [{ hour: 7, minute: 30 }, { hour: 15, minute: 0 }, { hour: 20, minute: 30 }];

const ENTITIES = {
    'tt:email_address': [[null, 'bob@gmail.com'], [null, 'alice@gmail.com'], [null, 'charlie@hotmail.com']],
    'tt:phone_number': [[null, '+16501234567'], [null, '+15551234567'], [null, '+123456789']],
    'tt:hashtag': [[null, 'funny'], [null, 'cat'], [null, 'lol'], [null, 'covfefe']],
    'tt:username': [[null, 'alice'], [null, 'bob'], [null, 'charlie']],
    'tt:contact_name': [[null, 'alice'], [null, 'bob'], [null, 'charlie']],
    'tt:url': [[null, 'http://www.abc.def'], [null, 'http://www.google.com'], [null, 'http://www.example.com']],
    'tt:picture': [[null, 'http://www.abc.def/foo.jpeg']],

    'tt:stock_id': [["Google", 'goog'], ["Apple", 'aapl'], ['Microsoft', 'msft'], ['Walmart', 'wmt']],
    'tt:iso_lang_code': [["Italian", 'it'], ["English", 'en'], ["Chinese", 'zh'], ['Spanish', 'es']],
    'tt:device': [["Twitter", 'com.twitter'], ["Facebook", 'com.facebook'], ["my GMail", 'com.gmail']],
    'sportradar:eu_soccer_team': [["Juventus", "juv"], ["Barcelona", "bar"], ["Bayern Munich", "fcb"], ["Chelsea", 'che']],
    'sportradar:mlb_team': [["SF Giants", 'sf'], ["Chicago Cubs", 'chc']],
    'sportradar:nba_team': [["Golden State Warriors", 'gsw'], ["LA Lakers", 'lal']],
    'sportradar:ncaafb_team': [["Stanford Cardinals", 'sta'], ["California Bears", 'cal']],
    'sportradar:ncaambb_team': [["Stanford Cardinals", 'stan'], ["California Bears", 'cal']],
    'sportradar:nfl_team': [["Seattle Seahawks", 'sea'], ["SF 49ers", 'sf']],
    'sportradar:us_soccer_team': [["San Jose Earthquakes", 'sje'], ["Toronto FC", 'tor']],
    'instagram:media_id': [],
    'omlet:feed_id': [],
    'imgflip:meme_id': [],
};

function chooseEntity(entityType, applyHeuristics) {
    if (applyHeuristics && entityType === 'tt:picture')
        return [];

    var choices = ENTITIES[entityType];
    if (!choices) {
        console.error('Unrecognized entity type ' + entityType);
        return [];
    } else {
        return choices.map(([display, value]) => Ast.Value.Entity(value, entityType, display));
    }
}

// params with special value
const PARAMS_SPECIAL_STRING = {
    'repo_name': 'android_repository',
    'file_name': 'log.txt',
    'old_name': 'log.txt',
    'new_name': 'backup.txt',
    'folder_name': 'archive',
    'purpose': 'research project',
    'filter': 'lo-fi',
    'query': 'super bowl',
    'summary': 'celebration',
    'category': 'sports',
    'from_name': 'bob',
    'blog_name': 'government secret',
    'camera_used': 'mastcam',
    'description': 'christmas',
    'source_language': 'english',
    'target_language': 'chinese',
    'detected_language': 'english',
    'organizer': 'stanford',
    'user': 'bob',
    'positions': 'ceo',
    'specialties': 'java',
    'industry': 'music',
    'template': 'wtf',
    'text_top': 'ummm... i have a question...',
    'text_bottom': 'wtf?',
    'phase': 'moon'
};

function genValueList(argName, type, applyHeuristics = true) {
    if (type.isArray)
        return genValueList(argName, type.elem);
    if (type.isString) {
        if (applyHeuristics) {
            if (argName in PARAMS_SPECIAL_STRING)
                return [Ast.Value.String(PARAMS_SPECIAL_STRING[argName])];
            if (argName.endsWith('title'))
                return [Ast.Value.String('news')];
            if (argName.startsWith('label')) // label, labels
                return [Ast.Value.String('work')];
        }
        return STRING_ARGUMENTS.map((s) => Ast.Value.String(s));
    }
    if (type.isNumber) {
        if (applyHeuristics) {
            if (argName === 'surge')
                return [Ast.Value.Number(1.5)];
            if (argName === 'heartrate')
                return [Ast.Value.Number(80)];
            if (argName.startsWith('high'))
                return [Ast.Value.Number(20)];
            if (argName.startsWith('low'))
                return [Ast.Value.Number(10)];
        }
        return NUMBER_ARGUMENTS.map((n) => Ast.Value.Number(n));
    }
    if (type.isMeasure) {
        if (applyHeuristics) {
            if (argName === 'high')
                return [Ast.Value.Measure(75, 'F')];
            if (argName === 'low')
                return [Ast.Value.Measure(70, 'F')];
        }
        return MEASURE_ARGUMENTS[type.unit].map((m) => Ast.Value.Measure(m.value, m.unit));
    }
    if (type.isDate)
        return DATE_ARGUMENTS.map((d) => Ast.Value.Date(new Date(d), null));
    if (type.isBoolean)
        return BOOLEAN_ARGUMENTS.map((b) => Ast.Value.Boolean(b));
    if (type.isLocation) {
        if (applyHeuristics) {
            if (argName === 'start')
                return [Ast.Value.Location(Ast.Location.Relative('home'))];
            if (argName === 'end')
                return [Ast.Value.Location(Ast.Location.Relative('work'))];
        }
        return LOCATION_ARGUMENTS.map((l) => Ast.Value.Location(l));
    }
    if (type.isEnum)
        return type.entries.map((e) => Ast.Value.Enum(e));
    if (type.isEntity)
        return chooseEntity(type.type, applyHeuristics);
    if (type.isTime)
        return TIME_ARGUMENTS.map((t) => new Ast.Value.Time(t.hour, t.minute, 0));
    if (type.isAny)
        return [];

    console.log('Invalid type ' + type);
    return [];
}

module.exports = genValueList;
