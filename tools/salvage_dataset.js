// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const SchemaRetriever = require('../lib/schema');
const SEMPRESyntax = require('../lib/sempre_syntax');
const NNSyntax = require('../lib/nn_syntax');
const Ast = require('../lib/ast');

const ThingpediaClientHttp = require('../test/http_client');
const db = require('../test/db');

// Extract as much as possible from the dataset, and convert it
// to new ThingTalk

// the new names of triggers
function rename(newName) {
    return function(inv) {
        inv.name.id = 'tt:' + newName;
    };
}
function addProjection(fields) {
    return function(inv) {
        inv.projection = fields;
    };
}
function addParameter(inv, pname, value) {
    let [sempreType, sempreValue] = SEMPRESyntax.valueToSEMPRE(value);

    inv.args.push({
        name: { id: 'tt:param.' + pname },
        operator: 'is',
        type: sempreType,
        value: sempreValue
    });
}

function all(...transformations) {
    return function(inv) {
        for (let t of transformations)
            t(inv);
    };
}

// What to apply, and where
const TRANSFORMATIONS = {
    // new_drive_file -> monitor [file_name] of @list_drive_files()
    // this is kind of gross tbh...
    'com.google.drive.new_drive_file': all(
        rename('com.google.drive.list_drive_files'),
        addProjection(['file_id', 'file_name', 'created_time']),
        addParameter('order_by', Ast.Value.Enum('created_time_decreasing'))
    ),

    'com.xkcd.new_what_if': rename('com.xkcd.what_if'),
    'com.xkcd.new_comic': rename('com.xkcd.get_comic'),

    'com.giphy.get_tag': rename('com.giphy.get'),

    'com.phdcomics.new_post': rename('com.phdcomics.get_post')
};

// what has been ported
const AVAILABLE = new Set(['com.bing',
'com.facebook',
'com.google',
'com.google.drive',
'com.linkedin',
'com.nest',
'com.nytimes',
'com.tesla',
'com.xkcd',
'org.thingpedia.builtin.bluetooth.generic',
'org.thingpedia.builtin.matrix',
'org.thingpedia.builtin.thingengine',
'org.thingpedia.builtin.thingengine.remote',
'org.thingpedia.demo.coffee']);

const _schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp());

function *forEachInvocation(json) {
    if (json.setup) {
        yield* forEachInvocation(json.setup);
        return;
    }
    if (json.rule) {
        yield* forEachInvocation(json.rule);
        return;
    }
    if (json.trigger)
        yield json.trigger;
    if (json.query)
        yield json.query;
    if (json.action)
        yield json.action;
}

function handleName(name) {
    if (typeof name === 'string')
        return name;

    if (typeof name !== 'object' || name === null)
        throw new TypeError('Invalid name');

    if (typeof name.id === 'string')
        return name.id;

    if (typeof name.value === 'string')
        return name.value;

    throw new TypeError('Invalid name');
}

function handleSelector(sel) {
    sel = handleName(sel);

    let match = /^(?:tt:)?(\$?[a-z0-9A-Z_.-]+)\.([a-z0-9A-Z_]+)$/.exec(sel);
    if (match === null)
        throw new TypeError('Invalid selector ' + sel);

    return [match[1], match[2]];
}

function processOneRow(ex) {
    return Promise.resolve().then(() => {
        let json = JSON.parse(ex.target_json);
        for (let inv of forEachInvocation(json)) {
            let [kind, channel] = handleSelector(inv.name);
            if (!AVAILABLE.has(kind))
                throw new Error(kind + ' has not been ported');
            let transform = TRANSFORMATIONS[kind + '.' + channel];
            if (transform)
                transform(inv);
        }

        return SEMPRESyntax.parseToplevel(_schemaRetriever, json);
    }).then((program) => {
        // TODO: tokenize the sentence here
        console.log(ex.id + '\t' + ex.utterance + '\t' + NNSyntax.toNN(program, {}).join(' '));
    }).catch((e) => {
        console.error('Failed to handle example ' + ex.id + ': ' + e.message);
        if (e instanceof TypeError)
            console.error(e.stack);
    });
}

function batchLoop(array, batchSize, f) {
    let numBatches = Math.ceil(array.length / batchSize);
    return (function loop(i) {
        if (i >= numBatches)
            return Promise.resolve();

        return Promise.all(array.slice(i*batchSize, i*batchSize+batchSize).map((x, j) => f(x, i*batchSize+j))).then(() => loop(i+1));
    })(0);
}

function main() {
    const what = process.argv[2];
    const language = process.argv[3] || 'en';

    db.withClient((dbClient) =>
        db.selectAll(dbClient, `select * from example_utterances where (type = 'online' or type like 'turking%' or type like 'test%')
and language = ? and target_json like ? and target_code = ''`, [language, '%' + what + '%'])
    ).then((rows) => batchLoop(rows, 100, processOneRow))
    .then(() => process.exit()).done();
}
main();
