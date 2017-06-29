const Q = require('q');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const genRandomRules = require('../lib/gen_random_rule');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');
const db = require('./db');

var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);

function main() {
    db.withClient((dbClient) => {
        return db.selectAll(dbClient, "select kind from device_schema where approved_version is not null and kind_type <> 'primary'", []);
    }).then((rows) => {
        let kinds = rows.map(r => r.kind);

        let stream = genRandomRules(kinds, schemaRetriever, parseInt(process.argv[2]) || 100, {
            applyHeuristics: false,
            allowUnsynthesizable: true,
            samplingPolicy: 'uniform',
            language: 'en',
            actionArgConstantProbability: 0.6,
            argConstantProbability: 0.4,
            requiredArgConstantProbability: 0.9
        });

        stream.on('data', (prog) => console.log(Ast.prettyprint(prog, true).trim()));
        stream.on('end', () => process.exit());
    }).done();
}
main();
