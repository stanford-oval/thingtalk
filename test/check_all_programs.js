"use strict";

const Q = require('q');
const fs = require('fs');
const deq = require('deep-equal');

const AppCompiler = require('../lib/compiler');
const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');
const prettyprint = require('../lib/prettyprint');
const Ast = require('../lib/ast');
const SEMPRESyntax = require('../lib/sempre_syntax');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');
const db = require('./db');

// go through all programs in the db, and check that they compile

function fillSlots(prog) {
    function fillPrim(prim) {
        if (!prim)
            return;
        for (var inParam of prim.in_params.concat(prim.filters)) {
            if (inParam.value.isUndefined) {
                // make up something
                var type = prim.schema.inReq[inParam.name] || prim.schema.inOpt[inParam.name]
                    || prim.schema.out[inParam.name];

                if (type.isString)
                    inParam.value = Ast.Value.String("bla bla bla");
                else if (type.isMeasure)
                    inParam.value = new Ast.Value.Measure(25, type.unit);
                else if (type.isNumber)
                    inParam.value = Ast.Value.Number(42);
                else if (type.isBoolean)
                    inParam.value = Ast.Value.Boolean(true);
                else if (type.isDate)
                    inParam.value = Ast.Value.Date(new Date(2016, 5, 6, 12, 29, 0), null);
                else if (type.isTime)
                    inParam.value = new Ast.Value.Time(8, 30, 0);
                else if (type.isEntity)
                    inParam.value = new Ast.Value.Entity('bogus', type.type, null);
                else if (type.isEnum)
                    inParam.value = Ast.Value.Enum(type.entries[0]);
                else if (type.isLocation)
                    inParam.value = Ast.Value.Location(Ast.Location.Absolute(90, 0, 'north pole'));
                else
                    throw new TypeError('Unhandled slot type ' + type);
            }
            if (inParam.value.isLocation && inParam.value.value.isRelative) {
                inParam.value.value = Ast.Location.Absolute(90, 0, 'north pole');
            }
        }
    }

    prog.rules.forEach((rule) => {
        fillPrim(rule.trigger);
        rule.queries.forEach(fillPrim);
        rule.actions.forEach(fillPrim);
    });
}

var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);
function check(ex) {
    var json = JSON.parse(ex.target_json);
    if (!json.rule && !json.trigger && !json.query && !json.action)
        return; // ignore if not rule
    return SEMPRESyntax.parseToplevel(schemaRetriever, json).then((prog) => {
        var compiler = new AppCompiler();
        compiler.setSchemaRetriever(schemaRetriever);
        return compiler.verifyProgram(prog).then(() => prog);
    }).then((prog) => {
        fillSlots(prog);
        var compiler = new AppCompiler();
        compiler.setSchemaRetriever(schemaRetriever);
        return compiler.compileProgram(prog).then(() => prog);
    }).then(() => console.log(ex.id + ' ok')).catch((e) => {
        console.log(ex.id + ' error: ' + e.message);
        //console.log(e.stack);
    });
}

function loop(rows, i) {
    if (i === rows.length)
        return Q();

    return check(rows[i]).then(() => loop(rows, i+1));
}

function main() {
    var types = (process.argv[2] || 'test,test-prim0,test-prim1,test-prim2,test-prim3,test-compound0,test-compound1,test-compound2,test-compound3,test-compound4,test3-compound0,test3-compound1,test3-compound2,test3-compound3,test3-compound4,test3-compound5,test3-compound6').split(',');

    db.withClient((dbClient) => {
        return db.selectAll(dbClient, "select id,target_json from example_utterances where type in (?) and language = 'en'", [types]);
    }).then((rows) => {
       return loop(rows, 0);
    }).then(() => process.exit()).done();
}
main();
