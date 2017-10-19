"use strict";

const Q = require('q');
const fs = require('fs');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const Builtin = require('../lib/builtin');
const { genRandomRules, genRandomAllowed } = require('../lib/gen_random_rule');
const MultiMap = require('../lib/multimap');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');
const db = require('./db');

var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);

function countFilterClauses(filter) {
    if (filter.isTrue || filter.isFalse)
        return 0;
    if (filter.isAnd || filter.isOr)
        return filter.operands.reduce((x, y) => x + countFilterClauses(y), 0);
    if (filter.isNot)
        return countFilterClauses(filter.expr);
    return 1;
}

function main() {
    let programs = fs.readFileSync('./smt/programs.test').toString('utf8').trim().split('\n');
    console.log('id,code,encoded,nfunctions,nargs,npredicates');

    for (let i = 0; i < programs.length; i++) {
        let code = programs[i].trim();
        let encoded = JSON.stringify(code);

        let prog = Grammar.parse(programs[i]);
        let nfunctions = 0, nargs = 0, npredicates = 0;
        function doCount(prim) {
            nargs += prim.in_params.length;
            npredicates += countFilterClauses(prim.filter);
        }

        for (let rule of prog.rules) {
            if (rule.trigger) {
                nfunctions ++;
                doCount(rule.trigger);
            }
            for (let query of rule.queries) {
                nfunctions ++;
                doCount(query);
            }
            for (let action of rule.actions) {
                if (action.selector.isBuiltin)
                    continue;
                nfunctions ++;
                doCount(action);
            }
        }

        console.log(`${i},${code.length},${encoded.length},${nfunctions},${nargs},${npredicates}`);
    }
}
main();
