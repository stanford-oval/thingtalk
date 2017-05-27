const Q = require('q');
const fs = require('fs');
const deq = require('deep-equal');

const AppCompiler = require('../lib/compiler');
const AppGrammar = require('../lib/grammar');
const SchemaRetriever = require('../lib/schema');
const prettyprint = require('../lib/prettyprint');
const SEMPRESyntax = require('../lib/sempre_syntax');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');
const db = require('./db');

var TEST_CASES = [
    // manually written test cases
    [{ action: { name: { id: 'tt:twitter.sink' }, args: [] } }, 'now => @twitter.sink(status=$undefined) ;'],
    [{ rule: {
        trigger: { name: { id: 'tt:twitter.source' }, args: [] },
        action: { name: { id: 'tt:twitter.sink' }, args: [
            { name: { id: 'tt:param.status'}, operator: 'is',
              type: 'VarRef', value: { id: 'tt:param.text' } }
        ]}
    } },
    '@twitter.source() , v_text := text, v_hashtags := hashtags, v_urls := urls, v_from := from, v_in_reply_to := in_reply_to => @twitter.sink(status=v_text) ;'],

    // sampled from dataset
    [{"rule":{"trigger":{"name":{"id":"tt:sportradar.soccer_us_tourney"},"args":[{"type":"String","operator":"is","value":{"value":"i'm happy"},"name":{"id":"tt:param.tournament_search_term"}},{"type":"String","operator":"contains","value":{"value":"i'm happy"},"name":{"id":"tt:param.tournament_full_name"}},{"type":"String","operator":"contains","value":{"value":"i'm happy"},"name":{"id":"tt:param.away_alias"}},{"type":"String","operator":"contains","value":{"value":"merry christmas"},"name":{"id":"tt:param.home_name"}},{"type":"Enum","operator":"is","value":{"value":"scheduled"},"name":{"id":"tt:param.game_status"}},{"type":"Number","operator":"is","value":{"value":14},"name":{"id":"tt:param.home_points"}}]},"action":{"name":{"id":"tt:almond_dates.post"},"args":[{"type":"String","operator":"is","value":{"value":"love you"},"name":{"id":"tt:param.interest"}},{"type":"String","operator":"is","value":{"value":"merry christmas"},"name":{"id":"tt:param.message"}},{"type":"String","operator":"is","value":{"value":"you would never believe what happened"},"name":{"id":"tt:param.poster"}},{"type":"PhoneNumber","operator":"is","value":{"value":"+16501234567"},"name":{"id":"tt:param.phone"}}]}}},
    '@sportradar.soccer_us_tourney(tournament_search_term="i\'m happy", game_status=enum(scheduled), home_points=14), tournament_full_name =~ "i\'m happy", away_alias =~ "i\'m happy", home_name =~ "merry christmas" , v_tournament_full_name := tournament_full_name, v_tournament_league_name := tournament_league_name, v_away_alias := away_alias, v_home_alias := home_alias, v_away_name := away_name, v_home_name := home_name, v_game_status := game_status, v_scheduled_time := scheduled_time, v_away_points := away_points, v_home_points := home_points => @almond_dates.post(interest="love you", message="merry christmas", poster="you would never believe what happened", phone="+16501234567"^^tt:phone_number) ;'],

    [{"rule":{"trigger":{"name":{"id":"tt:sportradar.soccer_us_team"},"args":[{"type":"Entity(sportradar:us_soccer_team)","operator":"is","value":{"value":"tor"},"name":{"id":"tt:param.watched_team_alias"}},{"type":"Bool","operator":"is","value":{"value":false},"name":{"id":"tt:param.watched_is_home"}},{"type":"String","operator":"is","value":{"value":"love you"},"name":{"id":"tt:param.away_name"}},{"type":"String","operator":"contains","value":{"value":"i'm happy"},"name":{"id":"tt:param.home_name"}},{"type":"Enum","operator":"is","value":{"value":"closed"},"name":{"id":"tt:param.game_status"}},{"type":"Date","operator":"is","value":{"year":2016,"month":5,"day":4,"hour":0,"minute":0,"second":0},"name":{"id":"tt:param.scheduled_time"}},{"type":"Number","operator":">","value":{"value":11},"name":{"id":"tt:param.home_points"}},{"type":"Enum","operator":"is","value":{"value":"unclosed"},"name":{"id":"tt:param.result"}}]},"action":{"name":{"id":"tt:slack.updateChannelPurpose"},"args":[{"type":"Hashtag","operator":"is","value":{"value":"funny"},"name":{"id":"tt:param.channel"}},{"type":"String","operator":"is","value":{"value":"research project"},"name":{"id":"tt:param.purpose"}}]}}},
    '@sportradar.soccer_us_team(watched_team_alias="tor"^^sportradar:us_soccer_team, watched_is_home=false, away_name="love you", game_status=enum(closed), scheduled_time=makeDate(1462345200000), result=enum(unclosed)), home_name =~ "i\'m happy", home_points > 11 , v_other_team_alias := other_team_alias, v_watched_is_home := watched_is_home, v_away_name := away_name, v_home_name := home_name, v_game_status := game_status, v_scheduled_time := scheduled_time, v_away_points := away_points, v_home_points := home_points, v_result := result => @slack.updateChannelPurpose(channel="funny"^^tt:hashtag, purpose="research project") ;'],

    [{"rule":{"query":{"name":{"id":"tt:uber.price_estimate"},"args":[{"type":"Location","operator":"is","value":{"relativeTag":"rel_home","latitude":-1,"longitude":-1},"name":{"id":"tt:param.start"}},{"type":"Location","operator":"is","value":{"relativeTag":"rel_work","latitude":-1,"longitude":-1},"name":{"id":"tt:param.end"}},{"type":"String","operator":"is","value":{"value":"love you"},"name":{"id":"tt:param.uber_type"}},{"type":"Number","operator":">","value":{"value":20},"name":{"id":"tt:param.high_estimate"}},{"type":"String","operator":"is","value":{"value":"love you"},"name":{"id":"tt:param.currency_code"}},{"type":"Measure","operator":">","value":{"value":1000,"unit":"m"},"name":{"id":"tt:param.distance"}}]},"action":{"name":{"id":"tt:almond_dates.post"},"args":[{"type":"String","operator":"is","value":{"value":"love you"},"name":{"id":"tt:param.interest"}},{"type":"String","operator":"is","value":{"value":"merry christmas"},"name":{"id":"tt:param.message"}},{"type":"String","operator":"is","value":{"value":"merry christmas"},"name":{"id":"tt:param.poster"}},{"type":"PhoneNumber","operator":"is","value":{"value":"+16501234567"},"name":{"id":"tt:param.phone"}}]}}},
    'now => @uber.price_estimate(start=$context.location.home, end=$context.location.work, uber_type="love you", currency_code="love you"), high_estimate > 20, distance > 1000m , v_uber_type := uber_type, v_low_estimate := low_estimate, v_high_estimate := high_estimate, v_currency_code := currency_code, v_surge := surge, v_duration := duration, v_distance := distance => @almond_dates.post(interest="love you", message="merry christmas", poster="merry christmas", phone="+16501234567"^^tt:phone_number) ;'],
    [{"rule":{"trigger":{"name":{"id":"tt:sportradar.soccer_eu_tourney"},"args":[]},"action":{"name":{"id":"tt:thermostat.set_target_temperature"},"args":[]}}},
    '@sportradar.soccer_eu_tourney(tournament_search_term=$undefined) , v_tournament_full_name := tournament_full_name, v_tournament_league_name := tournament_league_name, v_away_alias := away_alias, v_home_alias := home_alias, v_away_name := away_name, v_home_name := home_name, v_game_status := game_status, v_scheduled_time := scheduled_time, v_away_points := away_points, v_home_points := home_points => @thermostat.set_target_temperature(value=$undefined) ;'],
    [{"rule":{"trigger":{"name":{"id":"tt:instagram.new_picture"},"args":[{"type":"Location","operator":"is","value":{"relativeTag":"rel_work","latitude":-1,"longitude":-1},"name":{"id":"tt:param.location"}}]},"action":{"name":{"id":"tt:lg_webos_tv.play_url"},"args":[]}}},
    '@instagram.new_picture(location=$context.location.work) , v_media_id := media_id, v_picture_url := picture_url, v_caption := caption, v_link := link, v_filter := filter, v_hashtags := hashtags, v_location := location => @lg_webos_tv.play_url(url=$undefined) ;'],
    [{"rule":{"trigger":{"name":{"id":"tt:washington_post.new_article"},"args":[{"type":"Enum","operator":"is","value":{"value":"national"},"name":{"id":"tt:param.section"}}]},"action":{"name":{"id":"tt:slack.updateChannelTopic"},"args":[{"type":"String","operator":"is","value":{"value":"you would never believe what happened"},"name":{"id":"tt:param.topic"}}]}}},
    '@washington_post.new_article(section=enum(national)) , v_title := title, v_link := link, v_description := description => @slack.updateChannelTopic(topic="you would never believe what happened", channel=$undefined) ;'],
    [{"rule":{"query":{"args":[],"name":{"id":"tt:nasa.apod"}},"action":{"args":[{"name":{"id":"tt:param.picture_url"},"type":"VarRef","value":{"id":"tt:param.picture_url"},"operator":"is"}],"name":{"id":"tt:tumblr-blog.post_picture"}},"trigger":{"args":[{"name":{"id":"tt:param.time"},"type":"Time","value":{"month":-1,"hour":1,"year":-1,"day":-1,"minute":0,"second":0},"operator":"is"}],"name":{"id":"tt:builtin.at"}}}},
    '@builtin.at(time=makeTime(1,0))  => @nasa.apod() , v_title := title, v_description := description, v_picture_url := picture_url => @tumblr-blog.post_picture(picture_url=v_picture_url, caption=$undefined) ;'],
    [{"rule":{"trigger":{"name":{"id":"tt:weatherapi.monitor"},"args":[{"type":"Location","operator":"is","value":{"relativeTag":"absolute","latitude":34.054935,"longitude":-118.2444759},"name":{"id":"tt:param.location"}},{"type":"Enum","operator":"is","value":{"value":"raining"},"name":{"id":"tt:param.status"}}]},"query":{"name":{"id":"tt:weatherapi.current"},"args":[{"type":"Location","operator":"is","value":{"relativeTag":"absolute","latitude":33.8246269,"longitude":-116.5403029},"name":{"id":"tt:param.location"}}]}}},
    '@weatherapi.monitor(location=makeLocation(-118.2444759, 34.054935), status=enum(raining)) , v_temperature := temperature, v_wind_speed := wind_speed, v_humidity := humidity, v_cloudiness := cloudiness, v_fog := fog, v_weather := weather, v_status := status => @weatherapi.current(location=makeLocation(-116.5403029, 33.8246269)) , v_temperature := temperature, v_wind_speed := wind_speed, v_humidity := humidity, v_cloudiness := cloudiness, v_fog := fog, v_weather := weather => notify;'],
    [{"rule":{"query":{"name":{"id":"tt:imgflip.generate"},"args":[{"type":"String","operator":"is","value":{"value":"work"},"name":{"id":"tt:param.template"}},{"type":"String","operator":"is","value":{"value":"love you"},"name":{"id":"tt:param.text_top"}}]},"action":{"name":{"id":"tt:gmail.send_picture"},"args":[{"type":"EmailAddress","operator":"is","value":{"value":"bob@stanford.edu"},"name":{"id":"tt:param.to"}},{"type":"String","operator":"is","value":{"value":"work"},"name":{"id":"tt:param.message"}},{"type":"VarRef","operator":"is","value":{"id":"tt:param.$event"},"name":{"id":"tt:param.subject"}},{"type":"VarRef","operator":"is","value":{"id":"tt:param.picture_url"},"name":{"id":"tt:param.picture_url"}}]}}},
    'now => @imgflip.generate(template="work", text_top="love you", text_bottom=$undefined) , v_name := name, v_picture_url := picture_url => @gmail.send_picture(to="bob@stanford.edu"^^tt:email_address, message="work", subject=$event, picture_url=v_picture_url) ;'],
    [{"trigger":{"name":{"id":"tt:sleep-tracker.getsleep"},"args":[{"type":"Location","operator":"is","value":{"relativeTag":"rel_work","latitude":-1,"longitude":-1},"name":{"id":"tt:param.place"}},{"type":"Measure","operator":"<","value":{"value":1,"unit":"h"},"name":{"id":"tt:param.rem"}},{"type":"Measure","operator":"<","value":{"value":1,"unit":"h"},"name":{"id":"tt:param.deep"}}]}},
    '@sleep-tracker.getsleep(place=$context.location.work), rem < 1h, deep < 1h , v_time := time, v_place := place, v_awakeTime := awakeTime, v_asleepTime := asleepTime, v_duration := duration, v_rem := rem, v_light := light, v_deep := deep => notify;'],

    [{"rule":{"trigger":{"name":{"id":"tt:twitter.source"},"args":[{"type":"String","operator":"has","value":{"value":"funny"},"name":{"id":"tt:param.hashtags"}}]},"action":{"name":{"id":"tt:twitter.sink"},"args":[{"type":"String","operator":"is","value":{"value":"lol"},"name":{"id":"tt:param.status"}}]}}},
    '@twitter.source(), contains(hashtags, "funny") , v_text := text, v_hashtags := hashtags, v_urls := urls, v_from := from, v_in_reply_to := in_reply_to => @twitter.sink(status="lol") ;']
];

//var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate);
var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);

function normalizePrimitive(json) {
    json.args.sort((a, b) => {
        let aname = a.name.id;
        let bname = b.name.id;
        if (aname  < bname)
            return -1;
        if (aname > bname)
            return 1;
        return 0;
    });
}

function normalize(json) {
    if (json.rule)
        return normalize(json.rule);
    if (json.trigger)
        normalize(json.trigger);
    if (json.query)
        normalize(json.query);
    if (json.action)
        normalize(json.action);
}

function test(i) {
    console.log('Test Case #' + (i+1));
    var [json, expectedTT] = TEST_CASES[i];

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
        var sempreSyntax = SEMPRESyntax.toSEMPRE(ast, false); // do not include slots
        // do one round of stringify/parse to weed out undefined's
        sempreSyntax = JSON.parse(JSON.stringify(sempreSyntax));

        if (!deq(normalize(sempreSyntax), normalize(json))) {
            console.error('Test Case #' + (i+1) + ': json does not match what expected');
            console.error('Expected: ' + JSON.stringify(json));
            console.error('Generated: ' + JSON.stringify(sempreSyntax));
        }
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
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
