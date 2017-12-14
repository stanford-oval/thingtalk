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

const ThingpediaClientHttp = require('../test/http_client');
const db = require('../test/db');

// Extract as much as possible from the dataset, and convert it
// to new ThingTalk

// the new names of triggers
const RENAMES = {
    'com.google.drive.new_drive_file': 'com.google.drive.list_drive_files',
    'com.xkcd.new_what_if': 'com.xkcd.what_if',
    'com.xkcd.new_comic': 'com.xkcd.get_comic',
};

// what has been ported
const AVAILABLE = new Set(['com.bing', 'com.linkedin', 'com.google.drive']);

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
            let rename = RENAMES[kind + '.' + channel];
            if (rename)
                inv.name = { id: 'tt:' + rename };
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
