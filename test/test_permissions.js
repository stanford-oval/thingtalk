const Q = require('q');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');

var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);

function main() {
    var checker = new PermissionChecker(schemaRetriever);

    var allowed = [
        Ast.Allowed('builtin', 'notify', 'actions', Ast.BooleanExpression.True),
        Ast.Allowed('facebook', 'post', 'actions',
            Ast.BooleanExpression.And(
                Ast.BooleanExpression.Atom(Ast.Filter('status', '=~', Ast.Value.String('funny'))),
                Ast.BooleanExpression.Atom(Ast.Filter('status', '=~', Ast.Value.String('lol')))
            )),
        Ast.Allowed('facebook', 'post', 'actions',
            Ast.BooleanExpression.Or(
                Ast.BooleanExpression.Atom(Ast.Filter('status', '=~', Ast.Value.String('https://www.wsj.com'))),
                Ast.BooleanExpression.Atom(Ast.Filter('status', '=~', Ast.Value.String('https://www.washingtonpost.com')))
            )),
        Ast.Allowed('twitter', 'sink', 'actions',
            Ast.BooleanExpression.Atom(Ast.Filter('status', '=~', Ast.Value.String('funny')))),
        Ast.Allowed('twitter', 'search', 'queries',
            Ast.BooleanExpression.Atom(Ast.Filter('query', '=', Ast.Value.String('cats')))),
        Ast.Allowed('twitter', 'search', 'queries',
            Ast.BooleanExpression.Atom(Ast.Filter('hashtags', 'contains', Ast.Value.Entity('cat', 'tt:hashtag', null)))),
        Ast.Allowed('thermostat', 'set_target_temperature', 'actions',
            Ast.BooleanExpression.And(
                Ast.BooleanExpression.Atom(
                    Ast.Filter('value', '>', Ast.Value.Measure(70, 'F'))),
                Ast.BooleanExpression.Atom(
                    Ast.Filter('value', '<=', Ast.Value.Measure(75, 'F'))))),
        Ast.Allowed('lg_webos_tv', 'set_power', 'actions',
            Ast.BooleanExpression.Atom(Ast.Filter('power', '=', Ast.Value.Enum('off'))))
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

`AlmondGenerated() {
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
}`

));
    }).then(() => {
        return checker.check();
    }).done();
}
main();
