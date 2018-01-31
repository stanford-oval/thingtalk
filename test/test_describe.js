// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('./polyfill');

const Q = require('q');
Q.longStackSupport = true;
const Describe = require('../lib/describe');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');
const { optimizeProgram } = require('../lib/optimize');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');

var TEST_CASES = [
    // manually written test cases
    ['now => @twitter.sink(status=$undefined);',
     'tweet ____'],
    ['@twitter.source(), v0 := text => @twitter.sink(status=v0);',
    'tweet text when anyone you follow tweets'],
    [`@thermostat(principal="foo"^^tt:contact_name).temperature(), value > 70F
     => notify;`,
    'notify when  the temperature on @foo\'s thermostat changes and value is greater than 70 F'],
    ['@builtin.at(time=makeTime(8,30)) => @builtin.say(message=$undefined);',
    'send me a message ____ every day at 08:30'],

    // sampled from dataset
    [`@sportradar.soccer_us_tourney(tournament_search_term="i'm happy"),
    tournament_full_name =~ "i'm happy" && away_alias =~ "i'm happy"
    && home_name =~ "merry christmas" && game_status = enum(scheduled)
    && home_points = 14 => @almond_dates.post(interest="love you",
    message="merry christmas", poster="you would never believe what happened",
    phone="+16501234567"^^tt:phone_number);`,
    `post on almond dates to look for people interested in "love you" with message equal to "merry christmas" and poster equal to "you would never believe what happened" and phone equal to +16501234567 when an American soccer game updates with tournament search term equal to "i'm happy" and tournament full name contains "i'm happy" and away alias contains "i'm happy" and home name contains "merry christmas" and game status is equal to scheduled and home points is equal to 14`],

    [`@sportradar.soccer_us_team(watched_team_alias="tor"^^sportradar:us_soccer_team),
    watched_is_home = false && away_name = "love you" && home_name =~ "i'm happy" &&
    game_status = enum(closed) && scheduled_time = makeDate(2016, 5, 4) &&
    home_points > 11 && result = enum(unclosed)
    => @slack.updateChannelPurpose(channel="funny"^^tt:hashtag, purpose="research project");`,
    `update the purpose of slack channel #funny to "research project" when an American soccer game updates with watched team alias equal to tor and watched is home is equal to no and away name is equal to "love you" and home name contains "i'm happy" and game status is equal to closed and scheduled time is equal to 5/4/2016, 12:00:00 AM and home points is greater than 11 and result is equal to unclosed`],

    [`now => @uber.price_estimate(start=$context.location.home, end=$context.location.work),
    uber_type = "love you" && high_estimate > 20 && currency_code = "love you"
    && distance > 1000m => @almond_dates.post(interest="love you", message="merry christmas",
    poster="merry christmas", phone="+16501234567"^^tt:phone_number);`,
    `get estimated prices for Uber from at home to at work if uber type is equal to "love you" and high estimate is greater than 20 and currency code is equal to "love you" and distance is greater than 1000 m then post on almond dates to look for people interested in "love you" with message equal to "merry christmas" and poster equal to "merry christmas" and phone equal to +16501234567`],
    [`@sportradar.soccer_eu_tourney(tournament_search_term=$undefined) =>
     @thermostat.set_target_temperature(value=$undefined);`,
    'set your thermostat to ____ when an European soccer game updates'],
    [`@instagram.new_picture(), location = $context.location.work => @lg_webos_tv.play_url(url=$undefined);`,
    'play ____ on your LG WebOS TV when you upload a new picture on Instagram and location is equal to at work'],
    [`@washington_post.new_article(section=enum(national)) =>
      @slack.updateChannelTopic(channel=$undefined, topic="you would never believe what happened");`,
    'update the topic of slack channel ____ to "you would never believe what happened" when a new article is published in the national section of The Washington Post'],
];

const schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);
const gettext = {
    dgettext: (domain, msgid) => msgid
};

function test(i) {
    console.log('Test Case #' + (i+1));
    var [code, expected] = TEST_CASES[i];

    return Grammar.parseAndTypecheck(code, schemaRetriever, true).then((prog) => {
        let reconstructed = Describe.describeProgram(gettext, prog);
        if (expected !== reconstructed) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + expected);
            console.error('Generated: ' + reconstructed);
        }
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
    });
}

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return Q(test(i)).then(() => loop(i+1));
}

function main() {
    loop(0).done();
}
main();
