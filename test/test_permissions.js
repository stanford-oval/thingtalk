const Q = require('q');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');
const { optimizeProgram } = require('../lib/optimize');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');

var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), false);

const TEST_CASES = [
    [`AlmondGenerated() {
    class @__dyn_0 extends @remote {
        trigger receive(in req __principal : Entity(tt:contact),
                        in req __token : Entity(tt:flow_token),
                        in req __kindChannel : Entity(tt:function),
                        out v : Enum(on, off));
    }
    @__dyn_0.receive(__principal="omlet-messaging:testtesttest"^^tt:contact,
        __token="123456789"^^tt:flow_token,
        __kindChannel=""^^tt:function),
        v_v := v
    =>
    @lg_webos_tv.set_power(power=v_v);
    }`, `AlmondGenerated() {
    class @__dyn_0 extends @remote {
        trigger receive (in req __principal : Entity(tt:contact), in req __token : Entity(tt:flow_token), in req __kindChannel : Entity(tt:function), out v : Enum(on,off));
    }
    @__dyn_0.receive(__principal="omlet-messaging:testtesttest"^^tt:contact, __token="123456789"^^tt:flow_token, __kindChannel=""^^tt:function), true , v_v := v => @lg_webos_tv.set_power(power=v_v) ;
}`],

    [`AlmondGenerated() {
    class @__dyn_0 extends @remote {
        trigger receive(in req __principal : Entity(tt:contact),
                        in req __token : Entity(tt:flow_token),
                        in req __kindChannel : Entity(tt:function),
                        out text : String);
    }
    @__dyn_0.receive(__principal="omlet-messaging:testtesttest"^^tt:contact,
        __token="123456789"^^tt:flow_token,
        __kindChannel=""^^tt:function),
        (text =~ "lol" || text =~ "funny"),
        v_txt := text
    =>
    @facebook.post(status=v_txt);
    }`, `AlmondGenerated() {
    class @__dyn_0 extends @remote {
        trigger receive (in req __principal : Entity(tt:contact), in req __token : Entity(tt:flow_token), in req __kindChannel : Entity(tt:function), out text : String);
    }
    @__dyn_0.receive(__principal="omlet-messaging:testtesttest"^^tt:contact, __token="123456789"^^tt:flow_token, __kindChannel=""^^tt:function), ((text =~ "lol" || text =~ "funny") && ((text =~ "funny" && text =~ "lol") || text =~ "https://www.wsj.com" || text =~ "https://www.washingtonpost.com")) , v_txt := text => @facebook.post(status=v_txt) ;
}`],

    [`AlmondGenerated() {
    class @__dyn_0 extends @remote {
        action send(in req __principal : Entity(tt:contact),
                    in req __token : Entity(tt:flow_token),
                    in req from_name : String,
                    in req from_address : Entity(tt:email_address),
                    in req subject : String,
                    in req date : Date,
                    in req labels : Array(String),
                    in req snippet : String);
    }
    @gmail.receive_email(),
        subject =~ "lol",
        v_from_name := from_name,
        v_from_address := from_address,
        v_subject := subject,
        v_date := date,
        v_labels := labels,
        v_snippet := snippet
    =>
    @__dyn_0.send(__principal="omlet-messaging:testtesttest"^^tt:contact,
        __token="123456789"^^tt:flow_token,
        from_name = v_from_name,
        from_address = v_from_address,
        subject = v_subject,
        date = v_date,
        labels = v_labels,
        snippet = v_snippet);
    }`, `AlmondGenerated() {
    class @__dyn_0 extends @remote {
        action send (in req __principal : Entity(tt:contact), in req __token : Entity(tt:flow_token), in req from_name : String, in req from_address : Entity(tt:email_address), in req subject : String, in req date : Date, in req labels : Array(String), in req snippet : String);
    }
    @gmail.receive_email(), (subject =~ "lol" && from_address = "bob@stanford.edu"^^tt:email_address) , v_from_name := from_name, v_from_address := from_address, v_subject := subject, v_date := date, v_labels := labels, v_snippet := snippet => @__dyn_0.send(__principal="omlet-messaging:testtesttest"^^tt:contact, __token="123456789"^^tt:flow_token, from_name=v_from_name, from_address=v_from_address, subject=v_subject, date=v_date, labels=v_labels, snippet=v_snippet) ;
}`],

    [`AlmondGenerated() {
    class @__dyn_0 extends @remote {
        trigger receive(in req __principal : Entity(tt:contact),
                        in req __token : Entity(tt:flow_token),
                        in req __kindChannel : Entity(tt:function),
                        out q1 : String,
                        out q2 : String);
    }
    @__dyn_0.receive(__principal="omlet-messaging:testtesttest"^^tt:contact,
        __token="123456789"^^tt:flow_token,
        __kindChannel=""^^tt:function),
        v_q1 := q1,
        v_q2 := q2
    =>
    @twitter.search(query="cats")
    =>
    @twitter.search(query=v_q2)
    => notify;
    }`,`AlmondGenerated() {
    class @__dyn_0 extends @remote {
        trigger receive (in req __principal : Entity(tt:contact), in req __token : Entity(tt:flow_token), in req __kindChannel : Entity(tt:function), out q1 : String, out q2 : String);
    }
    @__dyn_0.receive(__principal="omlet-messaging:testtesttest"^^tt:contact, __token="123456789"^^tt:flow_token, __kindChannel=""^^tt:function) , v_q1 := q1, v_q2 := q2 => @twitter.search(query="cats"), (contains(hashtags, "cat"^^tt:hashtag) && (v_q2 =~ "cats" || v_q2 =~ "dogs"))  => @twitter.search(query=v_q2), (contains(hashtags, "cat"^^tt:hashtag) || contains(hashtags, "dog"^^tt:hashtag))  => notify;
}`],

    [`AlmondGenerated() {
    class @__dyn_0 extends @remote {
        trigger receive(in req __principal : Entity(tt:contact),
                        in req __token : Entity(tt:flow_token),
                        in req __kindChannel : Entity(tt:function),
                        out q1 : String,
                        out q2 : String);
    }
    @__dyn_0.receive(__principal="omlet-messaging:testtesttest"^^tt:contact,
        __token="123456789"^^tt:flow_token,
        __kindChannel=""^^tt:function),
        q1 =~ "cats",
        v_q1 := q1,
        v_q2 := q2
    =>
    @twitter.search(query=v_q1),
        text =~ "funny lol", v_txt := text
    =>
    @facebook.post(status=v_txt);
    }`,`AlmondGenerated() {
    class @__dyn_0 extends @remote {
        trigger receive (in req __principal : Entity(tt:contact), in req __token : Entity(tt:flow_token), in req __kindChannel : Entity(tt:function), out q1 : String, out q2 : String);
    }
    @__dyn_0.receive(__principal="omlet-messaging:testtesttest"^^tt:contact, __token="123456789"^^tt:flow_token, __kindChannel=""^^tt:function), q1 =~ "cats" , v_q1 := q1, v_q2 := q2 => @twitter.search(query=v_q1), (text =~ "funny lol" && (contains(hashtags, "cat"^^tt:hashtag) || contains(hashtags, "dog"^^tt:hashtag))) , v_txt := text => @facebook.post(status=v_txt) ;
}`],

    [`AlmondGenerated() {
    now =>
    @twitter.search(query="cats"),
        text =~ "funny lol", v_txt := text
    =>
    @facebook.post(status=v_txt);
    }`, `AlmondGenerated() {
    now => @twitter.search(query="cats"), (text =~ "funny lol" && contains(hashtags, "cat"^^tt:hashtag)) , v_txt := text => @facebook.post(status=v_txt) ;
}`],

    [`AlmondGenerated() {
    now =>
    @twitter.search(query="cats"),
        v_txt := text
    =>
    @facebook.post(status=v_txt);
    }`, `AlmondGenerated() {
    now => @twitter.search(query="cats"), (contains(hashtags, "cat"^^tt:hashtag) && ((text =~ "funny" && text =~ "lol") || text =~ "https://www.wsj.com" || text =~ "https://www.washingtonpost.com")) , v_txt := text => @facebook.post(status=v_txt) ;
}`],

    [`AlmondGenerated() {
    class @__dyn_0 extends @remote {
        trigger receive(in req __principal : Entity(tt:contact),
                        in req __token : Entity(tt:flow_token),
                        in req __kindChannel : Entity(tt:function),
                        out q1 : String,
                        out q2 : String);
    }
    @__dyn_0.receive(__principal="omlet-messaging:testtesttest"^^tt:contact,
        __token="123456789"^^tt:flow_token,
        __kindChannel=""^^tt:function),
        v_q1 := q1,
        v_q2 := q2
    =>
    @twitter.search(query="cats"), true, v_txt := text
    =>
    @twitter.search(query=v_q1), true, v_txt := text
    =>
    @facebook.post(status=v_txt);
    }`,`AlmondGenerated() {
    class @__dyn_0 extends @remote {
        trigger receive (in req __principal : Entity(tt:contact), in req __token : Entity(tt:flow_token), in req __kindChannel : Entity(tt:function), out q1 : String, out q2 : String);
    }
    @__dyn_0.receive(__principal="omlet-messaging:testtesttest"^^tt:contact, __token="123456789"^^tt:flow_token, __kindChannel=""^^tt:function) , v_q1 := q1, v_q2 := q2 => @twitter.search(query="cats"), (contains(hashtags, "cat"^^tt:hashtag) && (v_q1 =~ "cats" || v_q1 =~ "dogs")) , v_txt := text => @twitter.search(query=v_q1), ((contains(hashtags, "cat"^^tt:hashtag) || contains(hashtags, "dog"^^tt:hashtag)) && ((text =~ "funny" && text =~ "lol") || text =~ "https://www.wsj.com" || text =~ "https://www.washingtonpost.com")) , v_txt := text => @facebook.post(status=v_txt) ;
}`]
];

function promiseLoop(array, fn) {
    return (function loop(i) {
        if (i === array.length)
            return Q();
        return Q(fn(array[i], i)).then(() => loop(i+1));
    })(0);
}

const PERMISSION_DATABASE = [
    `AllowedTrigger(_, @gmail.receive_email, true, from_address = "bob@stanford.edu"^^tt:email_address)`,
    `AllowedAction(_, @builtin.notify)`,
    `AllowedAction(_, @facebook.post, status =~ "funny" && status =~ "lol")`,
    `AllowedAction(_, @facebook.post, status =~ "https://www.wsj.com" || status =~ "https://www.washingtonpost.com")`,
    `AllowedAction(_, @twitter.sink, status =~ "funny")`,
    `AllowedQuery(_, @twitter.search, query =~ "cats", contains(hashtags, "cat"^^tt:hashtag))`,
    `AllowedQuery(_, @twitter.search, query =~ "dogs", contains(hashtags, "dog"^^tt:hashtag))`,
    `AllowedAction(_, @thermostat.set_target_temperature, value > 70F && value <= 75F)`,
    `AllowedAction(_, @lg_webos_tv.set_power, power = enum(off))`,
    `AllowedAction("role:mom"^^tt:contact_group, @lg_webos_tv.set_power, power = enum(on))`,

    `AllowedAction(_, @lg_webos_tv.set_power, group_member(__pi, "role:mom"^^tt:contact_group) && power = enum(on))`,

    `AllowedAction(_, @lg_webos_tv.set_power, __pi = "mom@stanford.edu"^^tt:email_address && power = enum(on))`
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
    var checker = new PermissionChecker(schemaRetriever, new MockGroupDelegate());

    Q.all(PERMISSION_DATABASE.map((a) => checker.allowed(Grammar.parsePermissionRule(a)))).then(() => {
        const principal = Ast.Value.Entity('omlet-messaging:testtesttest', 'tt:contact', null);

        return promiseLoop(TEST_CASES, ([input, expected], i) => {
            console.error('Test case #' + (i+1));
            console.log('Checking program');
            console.log(input);
            return checker.check(principal, Grammar.parse(input)).then((prog) => {
                if (prog) {
                    console.log('Program accepted');
                    let code = Ast.prettyprint(prog);
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

                    let compiler = new Compiler();
                    compiler.setSchemaRetriever(schemaRetriever);
                    return compiler.compileProgram(prog);
                } else if (expected !== null) {
                    console.error('Test case #' + (i+1) + ' FAIL');
                    console.error('Program rejected unexpectedly');
                } else {
                    console.error('Test case #' + (i+1) + ' PASS');
                    console.error('Program rejected as expected');
                }
            });
        });
    }).done();
}
main();
