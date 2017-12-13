"use strict";

const Q = require('q');
const fs = require('fs');
const deq = require('deep-equal');

const AppCompiler = require('../lib/compiler');
const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');
const { prettyprint } = require('../lib/prettyprint');
const SEMPRESyntax = require('../lib/sempre_syntax');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');
const db = require('./db');

var TEST_CASES = [
    [{"setup":{"person":"bob", "rule": {"query":{"name":{"id":"tt:com.twitter.search"}, "args":[{"name":{"id":"tt:param.query"},"operator":"is","value":{"value":"lol"},"type":"String"}],"predicate":[]}, "action": {"name":{"id":"tt:$builtin.return"}, "args":[],"predicate":[]}}}},
    `executor = "bob"^^tt:contact_name : now => @com.twitter.search(query="lol") => return;`],


    [{"setup":{"person":"bob", "action":{"name":{"id":"tt:com.twitter.sink"}, "args":[{"name":{"id":"tt:param.status"},"operator":"is","value":{"value":"lol"},"type":"String"}],"predicate":[]}}},
    `executor = "bob"^^tt:contact_name : now => @com.twitter.sink(status="lol");`],

    /*
    [{"trigger":{"name":{"id":"tt:org.thingpedia.builtin.thingengine.builtin.timer"},"args":[{"name":{"id":"tt:param.interval"},"operator":"is","type":"Measure","value":{"value":1,"unit":"h"}}],"predicate":[]},"action":{"name":{"id":"tt:com.twitter.sink"},"args":[{"name":{"id":"tt:param.status"},"operator":"is","type":"String","value":{"value":"lol"}}],"predicate":[]}},
    '@org.thingpedia.builtin.thingengine.builtin.timer(interval=1h)  => @com.twitter.sink(status="lol") ;'],*/

    // manually written test cases
    [{"query":{
      "name":{"id":"tt:com.twitter.search"},
      "args":[
        {"name":{"id":"tt:param.query"},"operator":"is","type":"String","value":{"value":"lol"}}
      ],
      "predicate":[[
        {"name":{"id":"tt:param.hashtags"},"operator":"has","type":"Hashtag","value":{"value":"cat"}}
      ]]
    }},
    `now => (@com.twitter.search(query="lol")), contains(hashtags, "cat"^^tt:hashtag) => notify;`],

    [{"query":{
     "name":{"id":"tt:com.twitter.search"},
     "args":[
       {"name":{"id":"tt:param.query"},"type":"String","operator":"is","value":{"value":"lol"}}
     ],
     "predicate":[[
        {"name":{"id":"tt:param.hashtags"},"type":"Hashtag","operator":"has","value":{"value":"cat"}},
        {"name":{"id":"tt:param.text"},"type":"String","operator":"contains","value":{"value":"foo"}}]]
    }},
    `now => (@com.twitter.search(query="lol")), (contains(hashtags, "cat"^^tt:hashtag) || text =~ "foo") => notify;`],

    [{ action: { name: { id: 'tt:twitter.sink' }, args: [] } }, 'now => @twitter.sink(status=$undefined);'],

    /*[{ rule: {
        trigger: { name: { id: 'tt:twitter.source' }, args: [] },
        action: { name: { id: 'tt:twitter.sink' }, args: [
            { name: { id: 'tt:param.status'}, operator: 'is',
              type: 'VarRef', value: { id: 'tt:param.text' } }
        ]}
    } },
    '@twitter.source() , v_text := text, v_hashtags := hashtags, v_urls := urls, v_from := from, v_in_reply_to := in_reply_to => @twitter.sink(status=v_text) ;'],*/

    [{ query: { name: { id: 'tt:instagram.get_pictures' }, args: [] } },
    'now => @instagram.get_pictures() => notify;'],

    [{ query: { name: { id: 'tt:instagram.get_pictures' },
                args: [{ name: { id: 'tt:param.count'}, operator: 'is',
                    type: 'Number', value: { value: 3 } }] } },
    'now => @instagram.get_pictures(count=3) => notify;'],

    /*[{
        rule: {
            trigger: { name: { id: 'tt:twitter.source' }, args: [] },
            action: {
                name: { id: 'tt:remote.send' },
                dynamic_type: {
                    args: ['__principal', '__token', 'text', 'hashtags', 'urls', 'from', 'in_reply_to'],
                    types: ['Entity(tt:contact)', 'Entity(tt:flow_token)', 'String', 'Array(Entity(tt:hashtag))', 'Array(Entity(tt:url))', 'Entity(tt:username)', 'Entity(tt:username)'],
                    required: [true, true, true, true, true, true, true],
                    is_input: [true, true, true, true, true, true, true]
                },
                args: []
            }
        },
    }, `AlmondGenerated() {
    class @__dyn_0 extends @remote {
        action send (in req __principal : Entity(tt:contact), in req __token : Entity(tt:flow_token), in req text : String, in req hashtags : Array(Entity(tt:hashtag)), in req urls : Array(Entity(tt:url)), in req from : Entity(tt:username), in req in_reply_to : Entity(tt:username));
    }
    @twitter.source() , v_text := text, v_hashtags := hashtags, v_urls := urls, v_from := from, v_in_reply_to := in_reply_to => @__dyn_0.send(__principal=$undefined, __token=$undefined, text=$undefined, hashtags=$undefined, urls=$undefined, from=$undefined, in_reply_to=$undefined) ;
}`],

    // sampled from dataset
    [{"rule":{"trigger":{"name":{"id":"tt:sportradar.soccer_us_tourney"},"args":[{"name":{"id":"tt:param.tournament_search_term"},"operator":"is","type":"String","value":{"value":"i'm happy"}}],"predicate":[[{"name":{"id":"tt:param.tournament_full_name"},"operator":"contains","type":"String","value":{"value":"i'm happy"}}],[{"name":{"id":"tt:param.away_alias"},"operator":"contains","type":"String","value":{"value":"i'm happy"}}],[{"name":{"id":"tt:param.home_name"},"operator":"contains","type":"String","value":{"value":"merry christmas"}}],[{"name":{"id":"tt:param.game_status"},"operator":"=","type":"Enum","value":{"value":"scheduled"}}],[{"name":{"id":"tt:param.home_points"},"operator":"=","type":"Number","value":{"value":14}}]]},"action":{"name":{"id":"tt:almond_dates.post"},"args":[{"name":{"id":"tt:param.interest"},"operator":"is","type":"String","value":{"value":"love you"}},{"name":{"id":"tt:param.message"},"operator":"is","type":"String","value":{"value":"merry christmas"}},{"name":{"id":"tt:param.phone"},"operator":"is","type":"PhoneNumber","value":{"value":"+16501234567"}},{"name":{"id":"tt:param.poster"},"operator":"is","type":"String","value":{"value":"you would never believe what happened"}}],"predicate":[]}}},
    `@sportradar.soccer_us_tourney(tournament_search_term="i'm happy"), (tournament_full_name =~ "i'm happy" && away_alias =~ "i'm happy" && home_name =~ "merry christmas" && game_status = enum(scheduled) && home_points = 14) , v_tournament_full_name := tournament_full_name, v_tournament_league_name := tournament_league_name, v_away_alias := away_alias, v_home_alias := home_alias, v_away_name := away_name, v_home_name := home_name, v_game_status := game_status, v_scheduled_time := scheduled_time, v_away_points := away_points, v_home_points := home_points => @almond_dates.post(interest="love you", message="merry christmas", phone="+16501234567"^^tt:phone_number, poster="you would never believe what happened") ;`],

    [{"rule":{"trigger":{"name":{"id":"tt:sportradar.soccer_us_team"},"args":[{"name":{"id":"tt:param.watched_team_alias"},"operator":"is","type":"Entity(sportradar:us_soccer_team)","value":{"value":"tor"}}],"predicate":[[{"name":{"id":"tt:param.watched_is_home"},"operator":"=","type":"Bool","value":{"value":false}}],[{"name":{"id":"tt:param.away_name"},"operator":"=","type":"String","value":{"value":"love you"}}],[{"name":{"id":"tt:param.home_name"},"operator":"contains","type":"String","value":{"value":"i'm happy"}}],[{"name":{"id":"tt:param.game_status"},"operator":"=","type":"Enum","value":{"value":"closed"}}],[{"name":{"id":"tt:param.scheduled_time"},"operator":"=","type":"Date","value":{"year":2016,"month":5,"day":4,"hour":0,"minute":0,"second":0}}],[{"name":{"id":"tt:param.home_points"},"operator":">","type":"Number","value":{"value":11}}],[{"name":{"id":"tt:param.result"},"operator":"=","type":"Enum","value":{"value":"unclosed"}}]]},"action":{"name":{"id":"tt:slack.updateChannelPurpose"},"args":[{"name":{"id":"tt:param.channel"},"operator":"is","type":"Hashtag","value":{"value":"funny"}},{"name":{"id":"tt:param.purpose"},"operator":"is","type":"String","value":{"value":"research project"}}],"predicate":[]}}},
    `@sportradar.soccer_us_team(watched_team_alias="tor"^^sportradar:us_soccer_team), (watched_is_home = false && away_name = "love you" && home_name =~ "i'm happy" && game_status = enum(closed) && scheduled_time = makeDate(1462345200000) && home_points > 11 && result = enum(unclosed)) , v_other_team_alias := other_team_alias, v_watched_is_home := watched_is_home, v_away_name := away_name, v_home_name := home_name, v_game_status := game_status, v_scheduled_time := scheduled_time, v_away_points := away_points, v_home_points := home_points, v_result := result => @slack.updateChannelPurpose(channel="funny"^^tt:hashtag, purpose="research project") ;`],*/

    [{"rule":{"query":{"name":{"id":"tt:uber.price_estimate"},"args":[{"name":{"id":"tt:param.end"},"operator":"is","type":"Location","value":{"relativeTag":"rel_work","latitude":-1,"longitude":-1}},{"name":{"id":"tt:param.start"},"operator":"is","type":"Location","value":{"relativeTag":"rel_home","latitude":-1,"longitude":-1}}],"predicate":[[{"name":{"id":"tt:param.uber_type"},"operator":"=","type":"String","value":{"value":"love you"}}],[{"name":{"id":"tt:param.high_estimate"},"operator":">","type":"Number","value":{"value":20}}],[{"name":{"id":"tt:param.currency_code"},"operator":"=","type":"String","value":{"value":"love you"}}],[{"name":{"id":"tt:param.distance"},"operator":">","type":"Measure","value":{"value":1000,"unit":"m"}}]]},"action":{"name":{"id":"tt:almond_dates.post"},"args":[{"name":{"id":"tt:param.interest"},"operator":"is","type":"String","value":{"value":"love you"}},{"name":{"id":"tt:param.message"},"operator":"is","type":"String","value":{"value":"merry christmas"}},{"name":{"id":"tt:param.phone"},"operator":"is","type":"PhoneNumber","value":{"value":"+16501234567"}},{"name":{"id":"tt:param.poster"},"operator":"is","type":"String","value":{"value":"merry christmas"}}],"predicate":[]}}},
    `now => (@uber.price_estimate(end=$context.location.work, start=$context.location.home)), (uber_type == "love you" && high_estimate > 20 && currency_code == "love you" && distance > 1000m) => @almond_dates.post(interest="love you", message="merry christmas", phone="+16501234567"^^tt:phone_number, poster="merry christmas");`],

    /*[{"rule":{"trigger":{"name":{"id":"tt:sportradar.soccer_eu_tourney"},"args":[]},"action":{"name":{"id":"tt:thermostat.set_target_temperature"},"args":[]}}},
    '@sportradar.soccer_eu_tourney(tournament_search_term=$undefined) , v_tournament_full_name := tournament_full_name, v_tournament_league_name := tournament_league_name, v_away_alias := away_alias, v_home_alias := home_alias, v_away_name := away_name, v_home_name := home_name, v_game_status := game_status, v_scheduled_time := scheduled_time, v_away_points := away_points, v_home_points := home_points => @thermostat.set_target_temperature(value=$undefined) ;'],
    [{"rule":{"trigger":{"name":{"id":"tt:instagram.new_picture"},"args":[],"predicate":[[{"name":{"id":"tt:param.location"},"operator":"=","type":"Location","value":{"relativeTag":"rel_work","latitude":-1,"longitude":-1}}]]},"action":{"name":{"id":"tt:lg_webos_tv.play_url"},"args":[],"predicate":[]}}},
    '@instagram.new_picture(), location = $context.location.work , v_media_id := media_id, v_picture_url := picture_url, v_caption := caption, v_link := link, v_filter := filter, v_hashtags := hashtags, v_location := location => @lg_webos_tv.play_url(url=$undefined) ;'],
    [{"rule":{"trigger":{"name":{"id":"tt:washington_post.new_article"},"args":[{"type":"Enum","operator":"is","value":{"value":"national"},"name":{"id":"tt:param.section"}}]},"action":{"name":{"id":"tt:slack.updateChannelTopic"},"args":[{"type":"String","operator":"is","value":{"value":"you would never believe what happened"},"name":{"id":"tt:param.topic"}}]}}},
    '@washington_post.new_article(section=enum(national)) , v_title := title, v_link := link, v_description := description => @slack.updateChannelTopic(topic="you would never believe what happened", channel=$undefined) ;'],
    [{"rule":{"query":{"args":[],"name":{"id":"tt:nasa.apod"}},"action":{"args":[{"name":{"id":"tt:param.picture_url"},"type":"VarRef","value":{"id":"tt:param.picture_url"},"operator":"is"}],"name":{"id":"tt:tumblr-blog.post_picture"}},"trigger":{"args":[{"name":{"id":"tt:param.time"},"type":"Time","value":{"month":-1,"hour":1,"year":-1,"day":-1,"minute":0,"second":0},"operator":"is"}],"name":{"id":"tt:builtin.at"}}}},
    '@builtin.at(time=makeTime(1,0))  => @nasa.apod() , v_title := title, v_description := description, v_picture_url := picture_url => @tumblr-blog.post_picture(picture_url=v_picture_url, caption=$undefined) ;'],
    [{"rule":{"trigger":{"name":{"id":"tt:weatherapi.monitor"},"args":[{"name":{"id":"tt:param.location"},"operator":"is","type":"Location","value":{"relativeTag":"absolute","latitude":34.054935,"longitude":-118.2444759}}],"predicate":[[{"name":{"id":"tt:param.status"},"operator":"=","type":"Enum","value":{"value":"raining"}}]]},"query":{"name":{"id":"tt:weatherapi.current"},"args":[{"name":{"id":"tt:param.location"},"operator":"is","type":"Location","value":{"relativeTag":"absolute","latitude":33.8246269,"longitude":-116.5403029}}],"predicate":[]}}},
    `@weatherapi.monitor(location=makeLocation(34.054935, -118.2444759)), status = enum(raining) , v_temperature := temperature, v_wind_speed := wind_speed, v_humidity := humidity, v_cloudiness := cloudiness, v_fog := fog, v_weather := weather, v_status := status, v_icon := icon => @weatherapi.current(location=makeLocation(33.8246269, -116.5403029)) , v_temperature := temperature, v_wind_speed := wind_speed, v_humidity := humidity, v_cloudiness := cloudiness, v_fog := fog, v_weather := weather, v_status := status, v_icon := icon => notify;`],*/
    [{"rule":{"query":{"name":{"id":"tt:imgflip.generate"},"args":[{"type":"String","operator":"is","value":{"value":"work"},"name":{"id":"tt:param.template"}},{"type":"String","operator":"is","value":{"value":"love you"},"name":{"id":"tt:param.text_top"}}]},"action":{"name":{"id":"tt:gmail.send_picture"},"args":[{"type":"EmailAddress","operator":"is","value":{"value":"bob@stanford.edu"},"name":{"id":"tt:param.to"}},{"type":"String","operator":"is","value":{"value":"work"},"name":{"id":"tt:param.message"}},{"type":"VarRef","operator":"is","value":{"id":"tt:param.picture_url"},"name":{"id":"tt:param.picture_url"}}]}}},
    'now => @imgflip.generate(template="work", text_top="love you", text_bottom=$undefined) => @gmail.send_picture(to="bob@stanford.edu"^^tt:email_address, message="work", picture_url=picture_url, subject=$undefined);'],
    /*[{"trigger":{"name":{"id":"tt:sleep-tracker.getsleep"},"args":[],"predicate":[[{"name":{"id":"tt:param.place"},"operator":"=","type":"Location","value":{"relativeTag":"rel_work","latitude":-1,"longitude":-1}}],[{"name":{"id":"tt:param.rem"},"operator":"<","type":"Measure","value":{"value":1,"unit":"h"}}],[{"name":{"id":"tt:param.deep"},"operator":"<","type":"Measure","value":{"value":1,"unit":"h"}}]]}},
    '@sleep-tracker.getsleep(), (place = $context.location.work && rem < 1h && deep < 1h) , v_time := time, v_place := place, v_awakeTime := awakeTime, v_asleepTime := asleepTime, v_duration := duration, v_rem := rem, v_light := light, v_deep := deep => notify;'],

    [{"rule":{"trigger":{"name":{"id":"tt:twitter.source"},"args":[],"predicate":[[{"name":{"id":"tt:param.hashtags"},"operator":"has","type":"String","value":{"value":"funny"}}]]},"action":{"name":{"id":"tt:twitter.sink"},"args":[{"name":{"id":"tt:param.status"},"operator":"is","type":"String","value":{"value":"lol"}}],"predicate":[]}}},
    '@twitter.source(), contains(hashtags, "funny") , v_text := text, v_hashtags := hashtags, v_urls := urls, v_from := from, v_in_reply_to := in_reply_to => @twitter.sink(status="lol") ;']*/
];

//var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate);
var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);

function test(i) {
    console.log('Test Case #' + (i+1));
    const [json, expectedTT] = TEST_CASES[i];

    return SEMPRESyntax.parseToplevel(schemaRetriever, json, true).then((ast) => {
        var compiler = new AppCompiler();
        compiler.setSchemaRetriever(schemaRetriever);
        return compiler.verifyProgram(ast).then(() => ast);
    }).then((ast) => {
        console.log('Test Case #' + (i+1) + ': compiled successfully from AST');
        var tt = prettyprint(ast, true).trim();
        if (tt !== expectedTT && expectedTT !== null) {
            console.error('Test Case #' + (i+1) + ': code does not match what expected');
            console.error('Expected: ' + expectedTT);
            console.error('Generated: ' + tt);
        }
        var compiler = new AppCompiler();
        compiler.setSchemaRetriever(schemaRetriever);
        return compiler.verifyProgram(AppGrammar.parse(tt)).then(() => ast);
    }).then((ast) => {
        console.log('Test Case #' + (i+1) + ': compiled successfully from reconstructed code');
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
    });
}

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return test(i).then(() => loop(i+1));
}

function main() {
    if (process.argv[2] === '--full-db') {
        db.withClient((dbClient) => {
            return db.selectAll(dbClient, "select target_json from example_utterances where type = 'generated-highvariance' and language = 'en' limit 1000", []);
        }).then((rows) => {
            TEST_CASES = rows.map((r) => [JSON.parse(r.target_json), null]);
            return loop(0);
        }).then(() => process.exit()).done();
    } else {
        loop(0).done();
    }
}
main();
