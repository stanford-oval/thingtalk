const Q = require('q');
const fs = require('fs');

const AppCompiler = require('../lib/compiler');
const AppGrammar = require('../lib/grammar');
const SchemaRetriever = require('../lib/schema');
const codegen = require('../lib/prettyprint');

var _mockSchemaDelegate = {
    _schema: {
        "builtin": {
            "triggers": {
                "timer": {
                    args: ["interval"],
                    types: ["Measure(ms)"]
                },
                "at": {
                    args: ["time"],
                    types: ["Time"]
                }
            },
            "queries": {
                "get_time": {
                    args: ["time"],
                    types: ["Date"]
                }
            },
            "actions": {
                "notify" : {
                    args: ["message"],
                    types: ["String"]
                },
                "debug_log": {
                    args: ["message"],
                    types: ["String"]
                }
            }
        },
        "security-camera": {
            "triggers": {},
            "queries": {
                "get_snapshot": {
                    args: ["snapshot"],
                    types: ["Picture"]
                }
            },
            "actions": {}
        },
        "youtube": {
            "triggers": {},
            "queries": {
                "search_videos": {
                    args: ["query", "video_url"],
                    types: ["String", "Entity(tt:url)"]
                }
            },
            "actions": {}
        },
        "phone": {
            "triggers": {
                "receive_sms": {
                    args: ["from", "body"],
                    types: ["Entity(tt:phone_number)", "String"]
                }
            },
            "actions": {
                "send_sms": {
                    args: ["to", "body"],
                    types: ["Entity(tt:phone_number)", "String"]
                }
            },
            "queries": {}
        },
        "ninegag": {
            "triggers": {},
            "actions": {},
            "queries": {
                "get_latest": {
                    args: ["arg1", "arg2", "picture_url"],
                    types: ["String", "String", "Entity(tt:picture)"]
                }
            }
        },
        "twitter": {
            "triggers": {
                "source": {
                    args: ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"],
                    types: ["String","Array(String)","Array(String)","String","String","Boolean"],
                }
            },
            "actions": {
                "sink": {
                    args: ["status"],
                    types: ["String"]
                }
            },
            "queries": {}
        },
        "sabrina": {
            "triggers": {
                "listen": {
                    args: ["message"],
                    types: ["String"]
                }
            },
            "actions": {
                "say": {
                    args: ["message"],
                    types: ["String"]
                },
                "picture": {
                    args: ["picture_url"],
                    types: ["Entity(tt:picture)"]
                }
            },
            "queries": {}
        },
        "weatherapi": {
            "triggers": {
                "weather": {
                    args: ["location", "temperature"],
                    types: ["Location", "Measure(C)"]
                }
            },
            "actions": {},
            "queries": {}
        },
        "omlet": {
            "triggers": {
                "incomingmessage": {
                    args: ["type", "message"],
                    types: ["Enum(text,picture)", "String"]
                }
            },
            "actions": {},
            "queries": {}
        },
        "test": {
            "triggers": {
                "source": {
                    args: ["value"],
                    types: ["Number"]
                }
            },
            "actions": {},
            "queries": {}
        },
        "thermostat": {
            "triggers": {
                "temperature": {
                    args: ["time", "temperature"],
                    types: ["Date", "Measure(C)"]
                }
            },
            "actions": {
                "set_target_temperature": {
                    args: ["value"],
                    types: ["Measure(C)"]
                }
            },
            "queries": {}
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

