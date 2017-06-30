const Q = require('q');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const { genRandomRules, genRandomAllowed } = require('../lib/gen_random_rule');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');
const db = require('./db');

var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);

const GEN_RULES = true;

function main() {
    db.withClient((dbClient) => {
        return db.selectAll(dbClient, "select kind from device_schema where approved_version is not null and kind_type <> 'primary'", []);
    }).then((rows) => {
        let kinds = rows.map(r => r.kind);

        let N = parseInt(process.argv[2]) || 100;
        let stream;

        if (GEN_RULES) {
            stream = genRandomRules(kinds, schemaRetriever, N, {
                applyHeuristics: false,
                allowUnsynthesizable: true,
                samplingPolicy: 'uniform',
                actionArgConstantProbability: 1,
                argConstantProbability: 0.4,
                requiredArgConstantProbability: 1,
                applyFiltersToInputs: true,
                filterClauseProbability: 0.4
            });

            stream.on('data', (prog) => console.log(Ast.prettyprint(prog, true).trim()));
        } else {
            stream = genRandomAllowed(kinds, schemaRetriever, N, {
                applyHeuristics: false,
                allowUnsynthesizable: true,
                samplingPolicy: 'uniform',
                filterClauseProbability: 0.5
            });

            stream.on('data', (allowed) => console.log(Ast.prettyprintAllowed(allowed).trim()));
        }

        stream.on('end', () => process.exit());
    }).done();
}
main();
