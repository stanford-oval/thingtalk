const Q = require('q');
const fs = require('fs');

const AppCompiler = require('../lib/compiler');
const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');
const { prettyprint } = require('../lib/prettyprint');

const _mockSchemaDelegate = require('./mock_schema_delegate');

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
	        var codegenned = prettyprint(ast);
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

