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

const TokenizerService = require('../test/tokenizer_service');
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
function addParameter(pname, value) {
    return function(inv) {
        let [sempreType, sempreValue] = SEMPRESyntax.valueToSEMPRE(value);

        inv.args.push({
            name: { id: 'tt:param.' + pname },
            operator: 'is',
            type: sempreType,
            value: sempreValue
        });
    };
}
function renameParameter(oldName, newName) {
    return function(inv, json) {
        inv.args.forEach((arg) => {
            if (arg.name.id === 'tt:param.' + oldName)
                arg.name.id = 'tt:param.' + newName;
        });
        if (inv.predicate) {
            for (let andclause of inv.predicate) {
                for (let orclause of andclause) {
                    if (orclause.name.id === 'tt:param.' + oldName)
                        orclause.name.id = 'tt:param.' + newName;
                }
            }
        }

        for (let inv2 of forEachInvocation(json)) {
            inv2.args.forEach((arg) => {
                if (arg.type === 'VarRef' &&
                    arg.value.id === 'tt:param.' + oldName)
                    arg.value.id = 'tt:param.' + newName;
            });
        }
    };
}

function all(...transformations) {
    return function(inv, json) {
        for (let t of transformations)
            t(inv, json);
    };
}

// What to apply, and where
const TRANSFORMATIONS = {
    // new_drive_file -> monitor [file_name] of @list_drive_files()
    // this is kind of gross tbh...
    'com.google.drive.new_drive_file': all(
        rename('com.google.drive.list_drive_files'),
        addProjection(['file_id']),
        addParameter('order_by', Ast.Value.Enum('created_time_decreasing'))
    ),

    'com.bodytrace.scale.source': all(
        rename('com.bodytrace.scale.get'),
        renameParameter('weight', 'value')
    ),

    'com.dropbox.list_folder': renameParameter('last_modified', 'modified_time'),
    'com.dropbox.get_space_usage': all(
        renameParameter('used', 'used_space'),
        renameParameter('total', 'total_space')
    ),

    'com.live.onedrive.file_modified': rename('com.live.onedrive.list_files'),
    'com.live.onedrive.file_created': all(
        rename('com.live.onedrive.list_files'),
        addProjection(['file_id']),
        addParameter('order_by', Ast.Value.Enum('created_time_decreasing'))
    ),

    'com.github.new_issue': rename('com.github.get_issue'),
    'com.github.new_commit': rename('com.github.get_commit'),
    'com.github.new_milestone': rename('com.github.get_milestone'),
    'com.github.new_issue_comment': rename('com.github.get_issue_comment'),

    'com.xkcd.new_whatif': rename('com.xkcd.what_if'),
    'com.xkcd.new_comic': rename('com.xkcd.get_comic'),

    'com.giphy.get_tag': rename('com.giphy.get'),

    'com.phdcomics.new_post': rename('com.phdcomics.get_post'),

    'com.twitter.sink': rename('com.twitter.post'),
    'com.twitter.source': rename('com.twitter.home_timeline'),
    'com.twitter.my_tweet': rename('com.twitter.my_tweets'),
    'com.twitter.direct_message': rename('com.twitter.direct_messages'),

    'com.instagram.new_picture': rename('com.instagram.get_pictures'),

    'com.linkedin.get_profile': all(
        renameParameter('picture_url', 'profile_picture')
    ),

    'com.gmail.receive_email': all(
        rename('com.gmail.inbox'),
        addProjection(['email_id']),
        renameParameter('from_address', 'sender_address'),
        renameParameter('from_name', 'sender_name')
    ),
    'com.gmail.receive_important_email': all(
        rename('com.gmail.inbox'),
        addProjection(['email_id']),
        addParameter('is_important', Ast.Value.Boolean(true)),
        renameParameter('from_address', 'sender_address'),
        renameParameter('from_name', 'sender_name')
    ),
    'com.gmail.receive_primary_email': all(
        rename('com.gmail.inbox'),
        addProjection(['email_id']),
        addParameter('is_primary', Ast.Value.Boolean(true)),
        renameParameter('from_address', 'sender_address'),
        renameParameter('from_name', 'sender_name')
    ),
    'com.gmail.get_latest': all(
        rename('com.gmail.inbox'),
        renameParameter('from', 'sender_address'),
        (inv) => {
            // move "label ==" to "labels contains"
            if (!inv.predicate)
                return;
            for (let andclause of inv.predicate) {
                for (let orclause of andclause) {
                    if (orclause.name.id === 'tt:param.label') {
                        orclause.name.id = 'tt:param.labels';
                        orclause.operator = 'has';
                    }
                }
            }
        }
    ),

};

// what has been ported
const AVAILABLE = new Set(['com.bing',
'com.bodytrace.scale',
'com.dropbox',
'com.facebook',
'com.giphy',
'com.github',
'com.gmail',
'com.google',
'com.google.drive',
'com.lg.tv.webos2',
'com.instagram',
'com.linkedin',
'com.live.onedrive',
'com.nest',
'com.nytimes',
'com.phdcomics',
'com.tesla',
'com.thecatapi',
'com.twitter',
'com.xkcd',
'org.thingpedia.builtin.bluetooth.generic',
'org.thingpedia.builtin.matrix',
'org.thingpedia.builtin.thingengine',
'org.thingpedia.builtin.thingengine.remote',
'org.thingpedia.demo.coffee']);

const language = process.argv[2] || 'en';
const _schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(undefined, language), undefined, true);
const _tokenizerService = new TokenizerService(language);

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
            if (inv.person)
                throw new Error('Principals are not implemented');
            let [kind, channel] = handleSelector(inv.name);
            if (!AVAILABLE.has(kind))
                throw new Error(kind + ' has not been ported');
            let transform = TRANSFORMATIONS[kind + '.' + channel];
            if (transform)
                transform(inv, json);
        }

        return Promise.all([
            SEMPRESyntax.parseToplevel(_schemaRetriever, json),
            _tokenizerService.tokenize(ex.utterance)
        ]);
    }).then(([program, { tokens, entities }]) => {
        // toNN messes with the entities object as it assigns them in the program
        let entitiesClone = {};
        Object.assign(entitiesClone, entities);
        let nnprogram = NNSyntax.toNN(program, entitiesClone);
        // try to convert this back into the program, for shits and giggles
        NNSyntax.fromNN(nnprogram, entities);

        console.log(ex.id + '\t' + tokens.join(' ') + '\t' + nnprogram.join(' '));
    }).catch((e) => {
        if (e.message === 'Not a ThingTalk program' || e.message === 'Principals are not implemented')
            return;
        if (e.message.endsWith(' has not been ported'))
            return;
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
    const types = process.argv[3].split(',');

    db.withClient((dbClient) =>
        db.selectAll(dbClient, `select * from example_utterances where type in (?) and language = ?`, [types, language])
    ).then((rows) => batchLoop(rows, 100, processOneRow))
    .then(() => process.exit()).done();
}
main();
