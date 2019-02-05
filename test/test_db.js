"use strict";

const Q = require('q');
Q.longStackSupport = true;

require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const _mockMemoryClient = require('./mock_memory_client');
var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

const TEST_CASES = [
    [`now => @com.mai-hub.get() => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  try {
    _t_0 = {};
    _t_1 = await env.invokeQuery(0, _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.title;
        _t_8 = _t_5.picture_url;
        _t_9 = _t_5.link;
        _t_10 = _t_5.alt_text;
        try {
          await env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke query", _exc_);
  }`]]
];

const GeneratorFunction = Object.getPrototypeOf(async function(){}).constructor;
function test(i) {
    console.log('Test Case #' + (i+1));

    let [code, expected] = TEST_CASES[i];

    return Q.try(() => {
        var compiler = new Compiler(true);
        compiler.setSchemaRetriever(schemaRetriever);

        return compiler.compileCode(code).then(() => {
            let rules = compiler.rules;
            for (let j = 0; j < Math.max(expected.length, rules.length); j++) {
                let { code } = rules[j] || [];
                code = code.replace(/new Date\([0-9]+\)/g, 'new Date(XNOWX)');

                if (code === undefined || code.trim() !== expected[j].trim()) {
                    console.error('Test Case #' + (i+1) + ': compiled code does not match what expected');
                    //console.error('Expected: ' + expected[j]);
                    console.error('Compiled: ' + code);
                    if (process.env.TEST_MODE)
                        throw new Error(`testCompiler ${i+1} FAILED`);
                } else {
                    new GeneratorFunction('__builtin', 'env', code);
                }
            }
        });
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Code: ' + code);
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return Q(test(i)).then(() => loop(i+1));
}
function main() {
    return loop(0);
}
module.exports = main;
if (!module.parent)
    main();
