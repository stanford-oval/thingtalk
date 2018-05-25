// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
Q.longStackSupport = true;

const SchemaRetriever = require('../lib/schema');
const SEMPRESyntax = require('../lib/sempre_syntax');
const NNSyntax = require('../lib/nn_syntax');
const Ast = require('../lib/ast');
const TokenizerService = require('../lib/tokenizer_service');

const _mockSchemaDelegate = require('../test/mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);
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

        inv.args.push({
            name: { id: 'tt:param.' + pname },
            operator: 'is',
            type: 'Ast',
            value: value
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
    return function(inv, json, ex) {
        for (let t of transformations)
            t(inv, json, ex);
    };
}

function replaceNumberWithCurrency(params) {
    function isToChange(arg) {
        for (let toChange of params) {
            if (arg.name.id === 'tt:param.' + toChange)
                return true;
        }
        return false;
    }

    return function(inv) {
        for (let arg of inv.args) {
            if (isToChange(arg)) {
                arg.type = 'Currency';
                arg.value = { value: arg.value.value, unit: 'usd' };
            }
        }
        if (inv.predicate) {
            for (let andclause of inv.predicate) {
                for (let orclause of andclause) {
                    if (isToChange(orclause)) {
                        orclause.type = 'Currency';
                        orclause.value = { value: orclause.value.value, unit: 'usd' };
                    }
                }
            }
        }
        if (inv.edge_predicate) {
            for (let andclause of inv.edge_predicate) {
                for (let orclause of andclause) {
                    if (isToChange(orclause)) {
                        orclause.type = 'Currency';
                        orclause.value = { value: orclause.value.value, unit: 'usd' };
                    }
                }
            }
        }
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

    'org.thingpedia.icalendar.event_begin': all(
        rename('org.thingpedia.icalendar.list_events'),
        (inv) => {
            inv.edge_predicate = [[{
                name: { id: 'tt:param.status' },
                operator: '==',
                type: 'Enum',
                value: { value: 'started' }
            }]];
        }
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
    'com.twitter.source': all(
        rename('com.twitter.home_timeline'),
        renameParameter('from', 'author')
    ),
    'com.twitter.my_tweet': all(
        rename('com.twitter.my_tweets'),
        renameParameter('from', 'author')
    ),
    'com.twitter.direct_message': all(
        rename('com.twitter.direct_messages'),
        renameParameter('from', 'sender')
    ),
    'com.twitter.search': all(
        renameParameter('from', 'author'),
        (inv) => {
            for (let arg of inv.args) {
                if (arg.name.id === 'tt:param.query') {
                    arg.name.id = 'tt:param.text';
                    arg.operator = 'contains';
                }
            }
        }
    ),
    'com.twitter.search_by_hashtag': all(
        rename('com.twitter.search'),
        renameParameter('from', 'author'),
        (inv) => {
            for (let arg of inv.args) {
                if (arg.name.id === 'tt:param.query_hashtag') {
                    arg.name.id = 'tt:param.hashtags';
                    arg.operator = 'has';
                }
            }
        }
    ),

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

    'security-camera.new_event': rename('security-camera.current_event'),
    'security-camera.get_snapshot': rename('security-camera.current_event'),
    'security-camera.get_url': rename('security-camera.current_event'),

    'thermostat.temperature': rename('thermostat.get_temperature'),
    'thermostat.humidity': rename('thermostat.get_humidity'),

    'com.reddit.frontpage.newpost': rename('com.reddit.frontpage.get'),

    'com.slack.receive': all(
        rename('com.slack.channel_history'),
        renameParameter('timestamp', 'date'),
        renameParameter('from', 'sender')
    ),

    'com.washingtonpost.new_article': rename('com.washingtonpost.get_article'),
    'com.washingtonpost.new_blog_post': rename('com.washingtonpost.get_blog_post'),

    'com.wsj.opinions': all(
        rename('com.wsj.get'),
        addParameter('section', Ast.Value.Enum('opinions'))
    ),
    'com.wsj.get_opinions': all(
        rename('com.wsj.get'),
        addParameter('section', Ast.Value.Enum('opinions'))
    ),
    'com.wsj.us_business': all(
        rename('com.wsj.get'),
        addParameter('section', Ast.Value.Enum('us_business'))
    ),
    'com.wsj.technology': all(
        rename('com.wsj.get'),
        addParameter('section', Ast.Value.Enum('technology'))
    ),
    'com.wsj.markets': all(
        rename('com.wsj.get'),
        addParameter('section', Ast.Value.Enum('markets'))
    ),
    'com.wsj.world_news': all(
        rename('com.wsj.get'),
        addParameter('section', Ast.Value.Enum('world_news'))
    ),
    'com.wsj.lifestyle': all(
        rename('com.wsj.get'),
        addParameter('section', Ast.Value.Enum('lifestyle'))
    ),

    'com.yandex.translate.detect_language': renameParameter('detected_language', 'value'),

    'com.yahoo.finance.stock_quote': all(
        rename('com.yahoo.finance.get_stock_quote'),
        replaceNumberWithCurrency(['ask_price', 'bid_price'])
    ),
    'com.yahoo.finance.get_stock_quote': replaceNumberWithCurrency(['ask_price', 'bid_price']),
    'com.yahoo.finance.stock_div': all(
        rename('com.yahoo.finance.get_stock_div'),
        renameParameter('div', 'value'),
        renameParameter('ex_div_date', 'ex_dividend_date'),
        replaceNumberWithCurrency(['value'])
    ),

    'gov.nasa.asteroid': all(
        renameParameter('dangerous', 'is_dangerous'),
        renameParameter('closest_distance_to_earth', 'distance')
    ),

    'org.thingpedia.rss.new_post': rename('org.thingpedia.rss.get_post'),

    'org.thingpedia.weather.sunrise': all(
        renameParameter('sunset', 'sunset_time'),
        renameParameter('sunrise', 'sunrise_time')
    ),
    'org.thingpedia.weather.monitor': rename('org.thingpedia.weather.current'),

    'org.thingpedia.builtin.thingengine.phone.receive_sms': all(
        rename('org.thingpedia.builtin.thingengine.phone.sms'),
        renameParameter('from', 'sender'),
        renameParameter('body', 'message')
    ),
    'org.thingpedia.builtin.thingengine.phone.send_sms': renameParameter('body', 'message'),
    'org.thingpedia.builtin.thingengine.phone.gps': rename('org.thingpedia.builtin.thingengine.phone.get_gps'),

    'com.youtube.source': rename('com.youtube.list_videos'),

    'org.thingpedia.builtin.omlet.newmessage': rename('org.thingpedia.builtin.omlet.messages'),
    'org.thingpedia.builtin.omlet.incomingmessage': all(
        rename('org.thingpedia.builtin.omlet.messages'),
        addParameter('from_me', Ast.Value.Boolean(false))
    ),

    'org.thingpedia.builtin.thingengine.builtin.get_random': rename('org.thingpedia.builtin.thingengine.builtin.get_random_between'),

    'us.sportradar.nba_team': all(
        rename('us.sportradar.nba'),
        renameParameter('watched_team_alias', 'team'),
        renameParameter('other_team_alias', 'opponent'),
        renameParameter('watched_is_home', 'is_home'),
        renameParameter('away_points', 'opponent_score'),
        renameParameter('home_points', 'team_score')
    ),
        'us.sportradar.soccer_eu_team': all(
        rename('us.sportradar.soccer_eu'),
        renameParameter('watched_team_alias', 'team'),
        renameParameter('other_team_alias', 'opponent'),
        renameParameter('watched_is_home', 'is_home'),
        renameParameter('away_points', 'opponent_score'),
        renameParameter('home_points', 'team_score')
    ),
        'us.sportradar.soccer_us_team': all(
        rename('us.sportradar.soccer_us'),
        renameParameter('watched_team_alias', 'team'),
        renameParameter('other_team_alias', 'opponent'),
        renameParameter('watched_is_home', 'is_home'),
        renameParameter('away_points', 'opponent_score'),
        renameParameter('home_points', 'team_score')
    ),
        'us.sportradar.soccer_eu_tourney': all(
        renameParameter('tournament_search_term', 'tournament'),
        renameParameter('away_name', 'away_team'),
        renameParameter('home_name', 'home_team'),
        renameParameter('away_points', 'away_score'),
        renameParameter('home_points', 'home_score')
    ),
        'us.sportradar.soccer_us_tourney': all(
        renameParameter('tournament_search_term', 'tournament'),
        renameParameter('away_name', 'away_team'),
        renameParameter('home_name', 'home_team'),
        renameParameter('away_points', 'away_score'),
        renameParameter('home_points', 'home_score')
    ),
        'us.sportradar.mlb_team':all(
        rename('us.sportradar.mlb'),
        renameParameter('watched_team_abbr', 'team'),
        renameParameter('other_team_abbr', 'opponent'),
        renameParameter('watched_is_home', 'is_home'),
        renameParameter('away_runs', 'opponent_runs'),
        renameParameter('home_runs', 'team_runs')
    ),
        'us.sportradar.ncaambb_team': all(
        rename('us.sportradar.ncaambb'),
        renameParameter('watched_team_alias', 'team'),
        renameParameter('other_team_alias', 'opponent'),
        renameParameter('watched_is_home', 'is_home'),
        renameParameter('away_points', 'opponent_score'),
        renameParameter('home_points', 'team_score')
    ),
    'us.sportradar.ncaafb_team': all(
        rename('us.sportradar.ncaafb'),
        renameParameter('watched_team_abbr', 'team'),
        renameParameter('other_team_abbr', 'opponent'),
        renameParameter('watched_is_home', 'is_home'),
        renameParameter('away_points', 'opponent_score'),
        renameParameter('home_points', 'team_score')
    ),

    'com.uber.price_estimate': replaceNumberWithCurrency(['low_estimate', 'high_estimate']),

    'org.thingpedia.builtin.thingengine.phone.notify': rename('org.thingpedia.builtin.thingengine.builtin.say')
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
'com.imgflip',
'com.instagram',
'com.linkedin',
'com.live.onedrive',
'com.nest',
'com.nytimes',
'com.parklonamerica.heatpad',
'com.phdcomics',
'com.reddit.frontpage',
'com.slack',
'com.tesla',
'com.thecatapi',
'com.tumblr',
'com.twitter',
'com.uber',
'com.washingtonpost',
'com.wsj',
'com.xkcd',
'com.yahoo.finance',
'com.yandex.translate',
'com.youtube',
'gov.nasa',
'edu.stanford.rakeshr1.fitbit',
'org.thingpedia.icalendar',
'org.thingpedia.bluetooth.speaker.a2dp',
'org.thingpedia.builtin.bluetooth.generic',
'org.thingpedia.builtin.matrix',
'org.thingpedia.builtin.omlet',
'org.thingpedia.builtin.thingengine',
'org.thingpedia.builtin.thingengine.builtin',
'org.thingpedia.builtin.thingengine.remote',
'org.thingpedia.builtin.thingengine.phone',
'org.thingpedia.demo.coffee',
'org.thingpedia.rss',
'org.thingpedia.weather',
'uk.co.thedogapi',
//'us.sportradar',
'car',
'light-bulb',
'security-camera',
'thermostat',
'tumblr-blog']);

const language = process.argv[2] || 'en';
const _tokenizerService = new TokenizerService(language);

function *forEachInvocation(json) {
    if (json.setup) {
        yield* forEachInvocation(json.setup);
        return;
    }
    if (json.access) {
        yield* forEachInvocation(json.access);
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

function processOneRow(dbClient, ex) {
    return Promise.resolve().then(() => {
        let json = JSON.parse(ex.target_json);
        for (let inv of forEachInvocation(json)) {
            let [kind, channel] = handleSelector(inv.name);
            if (!AVAILABLE.has(kind))
                throw new Error(kind + ' has not been ported');
            let transform = TRANSFORMATIONS[kind + '.' + channel];
            if (transform)
                transform(inv, json, ex);
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
        for (let name in entitiesClone) {
            if (name === '$used') continue;
            throw new Error('Unused entity ' + name);
        }

        // try to convert this back into the program, for shits and giggles
        NNSyntax.fromNN(nnprogram, entities);


        //console.log(ex.id + '\t' + tokens.join(' ') + '\t' + nnprogram.join(' '));
        return dbClient.query('update example_utterances set target_code = ?, preprocessed = ? where id = ?',
            [nnprogram.join(' '), tokens.join(' '), ex.id]);
    }).catch((e) => {
        if (e.message === 'Not a ThingTalk program')
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

    db.withTransaction((dbClient) => {
        return db.selectAll(dbClient, `select * from example_utterances where type in (?) and language = ? and target_code = ''`, [types, language])
            .then((rows) => batchLoop(rows, 100, (row) => processOneRow(dbClient, row)));
    })
    .then(() => process.exit()).done();
}
main();