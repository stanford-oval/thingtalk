const Q = require('q');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');
const { optimizeProgram } = require('../lib/optimize');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');

var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);

function main() {
    var checker = new PermissionChecker(schemaRetriever);

    var allowed = [
        Ast.Allowed('gmail', 'receive_email', 'triggers',
            Ast.BooleanExpression.True,
            Ast.BooleanExpression.Atom(Ast.Filter('from_address', '=', Ast.Value.Entity('bob@stanford.edu', 'tt:email_address', null)))),
        Ast.Allowed('builtin', 'notify', 'actions',
            Ast.BooleanExpression.True,
            Ast.BooleanExpression.True),
        Ast.Allowed('facebook', 'post', 'actions',
            Ast.BooleanExpression.And([
                Ast.BooleanExpression.Atom(Ast.Filter('status', '=~', Ast.Value.String('funny'))),
                Ast.BooleanExpression.Atom(Ast.Filter('status', '=~', Ast.Value.String('lol')))
            ]),
            Ast.BooleanExpression.True),
        Ast.Allowed('facebook', 'post', 'actions',
            Ast.BooleanExpression.Or([
                Ast.BooleanExpression.Atom(Ast.Filter('status', '=~', Ast.Value.String('https://www.wsj.com'))),
                Ast.BooleanExpression.Atom(Ast.Filter('status', '=~', Ast.Value.String('https://www.washingtonpost.com')))
            ]),
            Ast.BooleanExpression.True),
        Ast.Allowed('twitter', 'sink', 'actions',
            Ast.BooleanExpression.Atom(Ast.Filter('status', '=~', Ast.Value.String('funny'))),
            Ast.BooleanExpression.True),
        Ast.Allowed('twitter', 'search', 'queries',
            Ast.BooleanExpression.Atom(Ast.Filter('query', '=', Ast.Value.String('cats'))),
            Ast.BooleanExpression.And([
                Ast.BooleanExpression.Atom(Ast.Filter('hashtags', 'contains', Ast.Value.Entity('cat', 'tt:hashtag', null))),
                Ast.BooleanExpression.Atom(Ast.Filter('text', '=~', Ast.Value.String('funny'))),
                Ast.BooleanExpression.Atom(Ast.Filter('text', '=~', Ast.Value.String('lol')))
                ])),
        Ast.Allowed('twitter', 'search', 'queries',
            Ast.BooleanExpression.Atom(Ast.Filter('query', '=', Ast.Value.String('dogs'))),
            Ast.BooleanExpression.Atom(Ast.Filter('hashtags', 'contains', Ast.Value.Entity('dog', 'tt:hashtag', null)))),
        Ast.Allowed('thermostat', 'set_target_temperature', 'actions',
            Ast.BooleanExpression.And([
                Ast.BooleanExpression.Atom(
                    Ast.Filter('value', '>', Ast.Value.Measure(70, 'F'))),
                Ast.BooleanExpression.Atom(
                    Ast.Filter('value', '<=', Ast.Value.Measure(75, 'F')))
            ]),
            Ast.BooleanExpression.True),
        Ast.Allowed('lg_webos_tv', 'set_power', 'actions',
            Ast.BooleanExpression.Atom(Ast.Filter('power', '=', Ast.Value.Enum('off'))),
            Ast.BooleanExpression.True)
    ];

    Q.all(allowed.map((a) => checker.allowed(a))).then(() => {
        return checker.addProgram(
        Ast.Value.Entity('omlet-messaging:testtesttest', 'tt:contact', null),
        Grammar.parse(
/*`AlmondGenerated() {
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
}`*/

/*`AlmondGenerated() {
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
}`*/

/*`AlmondGenerated() {
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
}`*/

/*`AlmondGenerated() {
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
}`*/

`AlmondGenerated() {
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
    @twitter.search(query="cats"), true, text =~ "funny lol", v_txt := text
    =>
    @facebook.post(status=v_txt);
}`

/*`AlmondGenerated() {
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
}`*/

));
    }).then(() => {
        return checker.check();
    }).then((prog) => {
        console.log('Rewritten program');
        console.log(Ast.prettyprint(prog));
        let newprog = optimizeProgram(prog);
        if (newprog) {
            console.log('After optimization');
            console.log(Ast.prettyprint(newprog));
        } else {
            console.log('Program destroyed after optimization');
        }
    }).done();
}
main();
