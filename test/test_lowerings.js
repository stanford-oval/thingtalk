const Q = require('q');
const fs = require('fs');
const deq = require('deep-equal');

const AppCompiler = require('../lib/compiler');
const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');
const { prettyprint } = require('../lib/prettyprint');
const SEMPRESyntax = require('../lib/sempre_syntax');
const Generate = require('../lib/generate');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');
const _mockMemoryClient = require('./mock_memory_client');
const db = require('./db');

const TEST_CASES = [
    ['factor', '@security-camera(principal="1234"^^tt:contact).new_event() => notify;',
`Main() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        trigger receive (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out start_time : Date, out has_sound : Boolean, out has_motion : Boolean, out has_person : Boolean, out picture_url : Entity(tt:picture));
    }
    table = "auto+security-camera:new_event:": @__dyn_0.receive(__principal=["1234"^^tt:contact], __program_id=$event.program_id, __flow=0)  => notify;
}`,
[`executor = "1234"^^tt:contact : AlmondGenerated() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in opt start_time : Date, in opt has_sound : Boolean, in opt has_motion : Boolean, in opt has_person : Boolean, in opt picture_url : Entity(tt:picture));
    }
    @security-camera.new_event()  => @__dyn_0.send(__principal=["mock-account:12345678"^^tt:contact("me")], __program_id=$event.program_id, __flow=0, __kindChannel=$event.type) ;
}`]
],

    ['factor', 'now => @security-camera(principal="1234"^^tt:contact).get_snapshot() => notify;',
`Main() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        trigger receive (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out picture_url : Entity(tt:picture));
    }
    table = "auto+security-camera:get_snapshot:": @__dyn_0.receive(__principal=["1234"^^tt:contact], __program_id=$event.program_id, __flow=1)  => notify;
}`,
[`executor = "1234"^^tt:contact : AlmondGenerated() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in opt picture_url : Entity(tt:picture));
    }
    now => @security-camera.get_snapshot()  => @__dyn_0.send(__principal=["mock-account:12345678"^^tt:contact("me")], __program_id=$event.program_id, __flow=1, __kindChannel=$event.type) ;
}`]],

    ['factor', 'now => @security-camera(principal="1234"^^tt:contact).set_power(power=enum(on));',
     'null', ['executor = "1234"^^tt:contact :     now => @security-camera.set_power(power=enum(on)) ;']],

    ['factor', '@org.thingpedia.builtin.thingengine.builtin.timer(interval=10s) => @security-camera(principal="1234"^^tt:contact).set_power(power=enum(on));',
`Main() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in opt interval : Measure(ms));
    }
    @org.thingpedia.builtin.thingengine.builtin.timer(interval=10s)  => @__dyn_0.send(__principal=["1234"^^tt:contact], __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, interval=10s) ;
}`,
[`executor = "1234"^^tt:contact : AlmondGenerated() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        trigger receive (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out interval : Measure(ms));
    }
    @__dyn_0.receive(__principal=["mock-account:12345678"^^tt:contact("me")], __program_id=$event.program_id, __flow=0)  => @security-camera.set_power(power=enum(on)) ;
}`]],

    ['lower', 'now => @security-camera.get_snapshot() => return;',
    'table = "auto+security-camera:get_snapshot:": now => @security-camera.get_snapshot()  => notify;', []],

    ['lower', `"1234"^^tt:contact : now => @security-camera.get_snapshot() => return;`,
`executor = "1234"^^tt:contact : Main() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in opt picture_url : Entity(tt:picture));
    }
    table = "auto+security-camera:get_snapshot:": now => @security-camera.get_snapshot()  => @__dyn_0.send(__principal=["mock-account:12345678"^^tt:contact("me")], __program_id=$event.program_id, __flow=0, __kindChannel=$event.type) ;
}`,
[`AlmondGenerated() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        trigger receive (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out picture_url : Entity(tt:picture));
    }
    @__dyn_0.receive(__principal=["1234"^^tt:contact], __program_id=$event.program_id, __flow=0)  => notify;
}`]],

    ['factor', 'now => @security-camera(principal="1234"^^tt:contact_group).set_power(power=enum(on));',
     'null', ['executor = "1234"^^tt:contact_group :     now => @security-camera.set_power(power=enum(on)) ;']],

    ['factor', '@org.thingpedia.builtin.thingengine.builtin.timer(interval=10s) => @security-camera(principal="1234"^^tt:contact_group).set_power(power=enum(on));',
`Main() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in opt interval : Measure(ms));
    }
    @org.thingpedia.builtin.thingengine.builtin.timer(interval=10s)  => @__dyn_0.send(__principal="1234"^^tt:contact_group, __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, interval=10s) ;
}`,
[`executor = "1234"^^tt:contact_group : AlmondGenerated() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        trigger receive (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out interval : Measure(ms));
    }
    @__dyn_0.receive(__principal=["mock-account:12345678"^^tt:contact("me")], __program_id=$event.program_id, __flow=0)  => @security-camera.set_power(power=enum(on)) ;
}`]],

    ['factor', `LogQueryTestSelection() {
    now => get_record(table="Q4", principal="1234"^^tt:contact), col2 >= 42, v_1 := col1 => notify;
}`, `LogQueryTestSelection() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        trigger receive (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out table : Entity(tt:table), out principal : Entity(tt:contact), out col1 : String, out col2 : Number);
    }
    @__dyn_0.receive(__principal=["1234"^^tt:contact], __program_id=$event.program_id, __flow=1) , v_1 := col1 => notify;
}`, [`executor = "1234"^^tt:contact : AlmondGenerated() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in opt table : Entity(tt:table), in opt principal : Entity(tt:contact), in opt col1 : String, in opt col2 : Number);
    }
    now => get_record(table="Q4"^^tt:table), col2 >= 42, v_1 := col1 => @__dyn_0.send(__principal=["mock-account:12345678"^^tt:contact("me")], __program_id=$event.program_id, __flow=1, __kindChannel=$event.type, table="Q4", principal="1234"^^tt:contact, col1=v_1) ;
}`]]
];

//var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);
var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), _mockMemoryClient, true);
var _mockMessaging = {
    type: 'mock',
    account: '12345678'
};

function safePrettyprint(prog) {
    if (prog === undefined)
        return 'undefined';
    if (prog === null)
        return 'null';
    return prettyprint(prog, true).replace(/__token="[^"]+"/g, `__token="XXXXXXXX"`).trim();
}

function test(i) {
    console.log('Test Case #' + (i+1));
    let [type, testCase, expectedLowered, expectedSend] = TEST_CASES[i];

    return AppGrammar.parseAndTypecheck(testCase, schemaRetriever).then((prog) => {
        let newprogram, sendprograms;
        if (type === 'factor') {
            [newprogram, sendprograms] = Generate.factorProgram(_mockMessaging, prog);
        } else {
            newprogram = prog;
            sendprograms = Generate.lowerReturn(_mockMessaging, prog);
        }

        newprogram = safePrettyprint(newprogram);
        if (newprogram !== expectedLowered) {
            console.error('Test Case #' + (i+1) + ': lowered program does not match what expected');
            console.error('Expected: ' + expectedLowered);
            console.error('Generated: ' + newprogram);
        }

        for (let j = 0; j < Math.max(sendprograms.length, expectedSend.length); j++) {
            let tt = safePrettyprint(sendprograms[j]);
            let expectedTT = expectedSend[j] || 'undefined';
            if (tt !== expectedTT) {
                console.error('Test Case #' + (i+1) + ': program to send does not match what expected');
                console.error('Expected: ' + expectedTT);
                console.error('Generated: ' + tt);
            }
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

loop(0).done();
