"use strict";

const Q = require('q');
Q.longStackSupport = true;
const CVC4Solver = require('smtlib').LocalCVC4Solver;

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    [`now => @com.facebook.post(status="this is really funny lol");`,
      true, { transform: false }],
    [`now => @com.facebook.post(status="this is sad");`,
      false, { transform: false }],
    [`now => @com.facebook.post(status=$undefined);`,
      true, { transform: false }],

    [`now => @com.facebook.post(status="this is really funny lol");`,
     `now => @com.facebook.post(status="this is really funny lol");`],

    [`now => @com.facebook.post(status="this is totally not funny");`, null],

    [`now => @com.twitter.search(), text =~ "funny lol" => @com.facebook.post(status=text);`,
     `now => (@com.twitter.search()), text =~ "funny lol" => @com.facebook.post(status=text);`],

    [`now => @com.twitter.search() => @com.facebook.post(status=text);`,
     `now => (@com.twitter.search()), ((text =~ "funny" && text =~ "lol") || text =~ "https://www.wsj.com" || text =~ "https://www.washingtonpost.com") => @com.facebook.post(status=text);`],

    [`now => @com.bing.web_search(query="cats") => @com.facebook.post(status=description);`,
     `now => (@com.bing.web_search(query="cats")), ((description =~ "funny" && description =~ "lol") || description =~ "https://www.wsj.com" || description =~ "https://www.washingtonpost.com" || description =~ "cat") => @com.facebook.post(status=description);`],

    [`monitor @security-camera.current_event(), has_person == true => notify;`,
    `monitor ((@security-camera.current_event()), (@org.thingpedia.builtin.thingengine.phone.get_gps() { location == makeLocation(1, 2) } && has_person == true)) => notify;`],

    // the program should be rejected because there is no rule that allows phone.get_gps()
    [`monitor @security-camera.current_event(), (has_person == true && @org.thingpedia.builtin.thingengine.phone.get_gps() { location == makeLocation(1, 2) })  => notify;`,
     null],

    [`now => @org.thingpedia.builtin.thingengine.phone.get_gps() => notify;`, null],

    [`now => @thermostat.get_temperature() => notify;`,
     `now => (@thermostat.get_temperature()), @com.xkcd.get_comic(number=10) { title =~ "lol" } => notify;`],

    [`attimer(time=makeTime(10,30)) join @thermostat.get_temperature() => notify;`,
     `(attimer(time=makeTime(10, 30)) => @thermostat.get_temperature()), @com.xkcd.get_comic(number=10) { title =~ "lol" } => notify;`],

    [`now => @com.lg.tv.webos2.set_power(power=enum(on));`, null],

    [`{\n` +
     `  class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {\n` +
     `    action send (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in req media_id : Entity(instagram:media_id), in req picture_url : Entity(tt:picture), in req caption : String, in req link : Entity(tt:url), in req filter : Entity(com.instagram:filter), in req hashtags : Array(Entity(tt:hashtag)), in req location : Location);\n` +
     `}\n` +
     `  now => @com.instagram.get_pictures() => @__dyn_0.send(__principal="matrix-account:@rayx6:matrix.org"^^tt:contact, __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, media_id=media_id, picture_url=picture_url, caption=caption, link=link, filter=filter, hashtags=hashtags, location=location);\n` +
     `}`,
     `{\n` +
     `  class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {\n` +
     `    action send(in req __principal: Entity(tt:contact),\n` +
     `                in req __program_id: Entity(tt:program_id),\n` +
     `                in req __flow: Number,\n` +
     `                in req __kindChannel: Entity(tt:function),\n` +
     `                in req media_id: Entity(instagram:media_id),\n` +
     `                in req picture_url: Entity(tt:picture),\n` +
     `                in req caption: String,\n` +
     `                in req link: Entity(tt:url),\n` +
     `                in req filter: Entity(com.instagram:filter),\n` +
     `                in req hashtags: Array(Entity(tt:hashtag)),\n` +
     `                in req location: Location);\n` +
     `  }\n` +
     `  now => (@com.instagram.get_pictures()), caption =~ "trip" => @__dyn_0.send(__principal="matrix-account:@rayx6:matrix.org"^^tt:contact, __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, media_id=media_id, picture_url=picture_url, caption=caption, link=link, filter=filter, hashtags=hashtags, location=location);\n` +
     `}`],

    /*[`monitor @thermostat.get_temperature(), @com.xkcd.get_comic(number=10) { title =~ "lol" }  => notify;`,
    `@thermostat.temperature(), @xkcd.get_comic(number=10) { title =~ "lol" }  => notify;`],

    [`monitor @thermostat.get_temperature(), @xkcd.get_comic(number=11) { title =~ "lol" }  => notify;`,
    `AlmondGenerated() {
    @thermostat.temperature(), (@xkcd.get_comic(number=11) { title =~ "lol" } && @xkcd.get_comic(number=10) { title =~ "lol" })  => notify;
}`],

    [`monitor @thermostat.get_temperature(), @xkcd.get_comic() { title =~ "lol" }  => notify;`,
    `AlmondGenerated() {
    @thermostat.temperature(), (@xkcd.get_comic() { title =~ "lol" } && @xkcd.get_comic(number=10) { title =~ "lol" })  => notify;
}`],

    [`monitor @thermostat.get_humidity(), @xkcd.get_comic() { title =~ "lol" }  => notify;
}`, `AlmondGenerated() {
    @thermostat.humidity(), @xkcd.get_comic() { title =~ "lol" }  => notify;
}`]*/
];

function promiseLoop(array, fn) {
    return (function loop(i) {
        if (i === array.length)
            return Q();
        return Q(fn(array[i], i)).then(() => loop(i+1));
    })(0);
}

const PERMISSION_DATABASE = [
    `true : @com.gmail.inbox, sender_address == "bob@stanford.edu"^^tt:email_address => *`,
    `true : * => @org.thingpedia.builtin.thingengine.builtin.say`,
    `true : * => @com.facebook.post, status =~ "funny" && status =~ "lol"`,
    `true : * => @com.facebook.post, status =~ "https://www.wsj.com" || status =~ "https://www.washingtonpost.com"`,
    `true : * => @com.twitter.post, status =~ "funny"`,
    `true : @com.bing.web_search, query == "cats" && description =~ "cat" => *`,
    `true : @com.bing.web_search, query == "dogs" && description =~ "dog" => *`,
    `true : * => @thermostat.set_target_temperature, value >= 70F && value <= 75F`,
    `true : * => @com.lg.tv.webos2.set_power, power == enum(off)`,
    `group_member(source, "role:sister"^^tt:contact_group) : * => @com.lg.tv.webos2.set_power, power == enum(on)`,
    `source == "mom@stanford.edu"^^tt:contact : * => @com.lg.tv.webos2.set_power, power == enum(on)`,
    `true : @com.xkcd.get_comic => *`,

    `true : @security-camera.current_event, @org.thingpedia.builtin.thingengine.phone.get_gps() { location == makeLocation(1,2) } => notify`,
    `true : @thermostat.get_temperature, @com.xkcd.get_comic(number=10) { title =~ "lol" } => notify`,
    `true : @thermostat.get_humidity, @com.xkcd.get_comic() { title =~ "lol" } => notify`,

    'true : @com.instagram.get_pictures, caption =~ "trip" => notify',
];

class MockGroupDelegate {
    getGroups(principal) {
        switch (principal) {
        case 'omlet-messaging:testtesttest':
            return Q(['omlet-feed:family', 'role:mom']);
        case 'omlet-messaging:sistertest':
            return Q(['omlet-feed:family', 'role:sister']);
        case 'omlet-messaging:strangertext':
            return Q([]);
        default:
            return Q([]);
        }
    }
}

function main() {
    var checker = new PermissionChecker(CVC4Solver, schemaRetriever, new MockGroupDelegate());

    return Q.all(PERMISSION_DATABASE.map((a, i) => {
        console.log('Parsing rule ', i+1);
        return checker.allowed(Grammar.parsePermissionRule(a));
    })).then(() => {
        const principal = Ast.Value.Entity('omlet-messaging:testtesttest', 'tt:contact', null);

        return promiseLoop(TEST_CASES, ([input, expected, options], i) => {
            console.error('Test case #' + (i+1));
            //console.log('Checking program');
            //console.log(input);
            return checker.check(principal, Grammar.parse(input), options).then((prog) => {
                if (prog) {
                    console.log('Program accepted');
                    let code = typeof prog === 'boolean' ? prog : prog.prettyprint(true);
                    if (code !== expected) {
                        console.error('Test case #' + (i+1) + ' FAIL');
                        console.error('Program does not match what expected');
                        console.error('Expected:');
                        console.error(expected);
                        console.error('Generated:');
                        console.error(code);
                    } else {
                        console.error('Test case #' + (i+1) + ' PASS');
                        console.error('Program matches what expected');
                    }

                    if (typeof prog !== 'boolean') {
                        let compiler = new Compiler();
                        compiler.setSchemaRetriever(schemaRetriever);
                        return compiler.compileProgram(prog);
                    }
                } else if (expected !== null) {
                    console.error('Test case #' + (i+1) + ' FAIL');
                    console.error('Program rejected unexpectedly');
                } else {
                    console.error('Test case #' + (i+1) + ' PASS');
                    console.error('Program rejected as expected');
                }

                // quiet eslint
                return Promise.resolve();
            });
        });
    });
}
module.exports = main;
if (!module.parent)
    main();
