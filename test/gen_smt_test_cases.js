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

function uniformSubset(n, subsetOf) {
    if (n === 0)
        return [];
    if (n >= subsetOf.length)
        return subsetOf;

    let taken = [];
    function next() {
        let idx = Math.floor(Math.random()*n);
        for (let i = 0; i < subsetOf.length; i++) {
            if (taken[i])
                continue;
            if (idx === 0)
                return subsetOf[i];
            idx--;
        }
    }

    let res = [];
    while (n > 0) {
        res.push(next());
        n--;
    }
    return res;
}

function writeTestCase(file, prog, allowedset) {
    for (let allowed of allowedset)
        file.write(Ast.prettyprintAllowed(allowed) + '\n');
    file.write(';;\n');
    file.write(Ast.prettyprint(prog, false) + '\n');
    file.write('====\n');
}

function main() {
    let alloweds = fs.readFileSync('./smt/permissions.test').toString('utf8').trim().split('\n').map(Grammar.parsePermissionRule);
    let allowedmap = new MultiMap;

    alloweds.forEach((allowed) => {
        allowedmap.put(allowed.kind + ':' + allowed.channel, allowed);
    });

    let programs = fs.readFileSync('./smt/programs.test').toString('utf8').trim().split('\n').map(Grammar.parse);

    let files = {};
    for (let n of [0, 1, 5, 10])
        files[n] = fs.createWriteStream('./smt/test.' + n);

    for (let prog of programs) {
        let functions = [];
        for (let rule of prog.rules) {
            if (rule.trigger)
                functions.push(rule.trigger);
            for (let query of rule.queries)
                functions.push(query);
            for (let action of rule.actions) {
                if (action.selector.isBuiltin)
                    continue;
                functions.push(action);
            }
        }
        let allowedsets = functions.map((f) => allowedmap.get(f.selector.kind + ':' + f.channel));

        function tryMany(file, n) {
            // always allow "notify;"
            let testCase = [
                new Ast.Allowed('builtin', 'notify', 'action',
                    Ast.BooleanExpression.True, Ast.BooleanExpression.True, null)
            ]
            let canDo = allowedsets.every((s) => s.length >= n);
            if (!canDo)
                return;

            for (let i = 0; i < functions.length; i++) {
                let allowedset = allowedsets[i];
                for (let allowed of uniformSubset(n, allowedset))
                    testCase.push(allowed);
            }
            writeTestCase(file, prog, testCase);
        }

        for (let n in files)
            tryMany(files[n], n);
    }

    for (let n in files)
        tryMany(files[n]);
}
main();
