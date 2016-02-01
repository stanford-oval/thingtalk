const Q = require('q');
const fs = require('fs');

const AppCompiler = require('../lib/compiler');
const AppGrammar = require('../lib/grammar');

var _mockSchemaRetriever = {
    _schema: {
        "twitter": {
            "triggers": {
                "source": ["String","Array(String)","Array(String)","String","String","Boolean"],
            },
            "actions": {
                "sink": ["String"]
            }
        },
        "linkedin": {
            "triggers": {
                "profile": ["String","String","String","String","Any","String"],
            },
            "actions": {},
        },
        "sabrina": {
            "triggers": {
                "listen": ["String"],
            },
            "actions": {
                "say": ["String"]
            },
        },
        "test": {
            "triggers": {
                "source": ["Number"],
            },
            "actions": {}
        },
        "scale": {
            "triggers": {
                "source": ["Date","Measure(kg)"],
            },
            "actions": {}
        }
    },

    getSchema: function(kind) {
        if (kind in this._schema)
            return Q.delay(1).then(function() {
                return this._schema[kind];
            }.bind(this));
        else
            return Q.reject(new Error("No such schema " + kind));
    }
};

function parserTest() {
    var code = fs.readFileSync('./test/sample.apps').toString('utf8').split('====');

    Q.all(code.map(function(code) {
        try {
            var ast = AppGrammar.parse(code);
        } catch(e) {
            console.log('Parsing failed');
            console.log(code);
            console.log(e);
            return;
        }

        return Q.try(function() {
            var compiler = new AppCompiler();
            //compiler.setSchemaRetriever(_mockSchemaRetriever);

            return compiler.compileProgram(ast).then(function() {
                /*compiler.rules.forEach(function(r, i) {
                    console.log('Rule ' + (i+1));
                    console.log('Inputs', r.inputs);
                    console.log('Output', r.output);
                });*/
            });
        }).catch(function(e) {
            console.log('Compilation failed');
            console.log(code);
            console.log(e.stack);
            return;
        });
    }));
}

parserTest();

