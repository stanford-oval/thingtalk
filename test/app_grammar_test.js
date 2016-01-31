const Q = require('q');
const fs = require('fs');

const AppCompiler = require('../lib/compiler');
const AppGrammar = require('../lib/grammar');

function parserTest() {
    var code = fs.readFileSync('./test/sample.apps').toString('utf8').split('====');

    code.forEach(function(code) {
        try {
            var ast = AppGrammar.parse(code);
        } catch(e) {
            console.log('Parsing failed');
            console.log(code);
            console.log(e);
            return;
        }

        try {
            var compiler = new AppCompiler();

            compiler.compileProgram(ast);
            /*compiler.rules.forEach(function(r, i) {
                console.log('Rule ' + (i+1));
                console.log('Inputs', r.inputs);
                console.log('Output', r.output);
            });*/
        } catch(e) {
            console.log('Compilation failed');
            console.log(code);
            console.log(e.stack);
            return;
        }
    });
}

parserTest();

