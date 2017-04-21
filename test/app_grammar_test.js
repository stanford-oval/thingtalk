const Q = require('q');
const fs = require('fs');

const AppCompiler = require('../lib/compiler');
const AppGrammar = require('../lib/grammar');
const SchemaRetriever = require('../lib/schema');
const codegen = require('../lib/codegen');

var _mockSchemaDelegate = {
    _schema: {
        "builtin": {
            "triggers": {
                "timer": ["Measure(ms)"],
                "at": ["Time"]
            },
            "queries": {
                "get_time": ["Date"]
            },
            "actions": {
                "notify" : ["String"],
                "debug_log": ["String"]
            }
        },
        "security-camera": {
            "triggers": {},
            "queries": { "get_snapshot": ["Picture"] },
            "actions": {}
        },
        "youtube": {
            "triggers": {},
            "queries": {
                "search_videos": ["String", "Entity(tt:url)"]
            },
            "actions": {}
        },
        "phone": {
            "triggers": {
                "receive_sms": ["Entity(tt:phone_number)", "String"]
            },
            "actions": {
                "send_sms": ["Entity(tt:phone_number)", "String"]
            },
            "queries": {}
        },
        "ninegag": {
            "triggers": {},
            "actions": {},
            "queries": {
                "get_latest": ["String", "String", "Entity(tt:picture)"]
            }
        },
        "twitter": {
            "triggers": {
                "source": ["String","Array(String)","Array(String)","String","String","Boolean"],
            },
            "actions": {
                "sink": ["String"]
            },
            "queries": {
                "retweets_of_me": ["String","Array(String)","Array(String)","String"]
            }
        },
        "linkedin": {
            "triggers": {
                "profile": ["String","String","String","String","Any","String"],
            },
            "actions": {},
            "queries": {}
        },
        "sabrina": {
            "triggers": {
                "listen": ["String"],
            },
            "actions": {
                "say": ["String"],
                "picture": ["Entity(tt:picture)"]
            },
            "queries": {}
        },
        "weatherapi": {
            "triggers": {
                "weather": ["Location", "Measure(C)"],
                "sunrise": ["Number", "Number", "Date", "Date"]
            },
            "actions": {},
            "queries": {}
        },
        "omlet": {
            "triggers": {
                "newmessage": ["Enum(text,picture)", "String"],
                "incomingmessage": ["Enum(text,picture)", "String"]
            },
            "actions": {
                "send": ["String", "String"]
            },
            "queries": {}
        },
        "test": {
            "triggers": {
                "source": ["Number"],
            },
            "actions": {},
            "queries": {}
        },
        "scale": {
            "triggers": {
                "source": ["Date","Measure(kg)"],
            },
            "actions": {},
            "queries": {}
        },
        "thermostat": {
            "triggers": {
                "temperature": ["Date", "Measure(C)"]
            },
            "actions": {
                "set_target_temperature": ["Measure(C)"],
            },
            "queries": {}
        },
        "imgflip": {
            "triggers": {},
            "actions": {},
            "queries": {
                "list": ["String", "String"],
                "generate": ["String", "String", "String", "String", "Entity(tt:picture)"]
            }
        },
        "facebook": {
            "triggers": {},
            "actions": {
                "post_picture": ["Entity(tt:picture)"]
            },
            "queries": {}
        },
        "ytranslate": {
            "triggers": {},
            "actions": {},
            "queries": {
                "translate": ["String","String","String","String"],
                "detect_language": ["String","String"]
            }
        }
    },

    getSchemas: function() {
        return this._schema;
    },

    getMetas: function() {
        return this._meta;
    }
};

function parserTest() {
    var code = fs.readFileSync('./test/sample.apps').toString('utf8').split('====');

    Q.all(code.map(function(code) {
        code = code.trim();
        try {
            var ast = AppGrammar.parse(code);
	        //console.log(String(ast.statements));
        } catch(e) {
            console.error('Parsing failed');
            console.error(code);
            console.error(e);
            return;
        }

        try {
	        var codegenned = codegen(ast);
	        var astgenned = AppGrammar.parse(codegenned);
        } catch(e) {
            console.error('Codegen failed');
            console.error('Codegenned:');
	        console.error(codegenned);
	        console.error('====\nCode:');
	        console.error(code);
	        console.error('====');
            console.error(e.stack);
        }

        return Q.try(function() {
            var compiler = new AppCompiler();
            compiler.setSchemaRetriever(new SchemaRetriever(_mockSchemaDelegate));

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

