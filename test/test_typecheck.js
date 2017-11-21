const Q = require('q');
const fs = require('fs');

const AppCompiler = require('../lib/compiler');
const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');
const Type = require('../lib/type');
const { prettyprint } = require('../lib/prettyprint');

const _mockSchemaDelegate = require('./mock_schema_delegate');

class DummyMemoryClient {
    constructor() {
        this._tables = new Map;
    }

    getSchema(table) {
        return Q(this._tables.get(table) || null);
    }

    createTable(table, args, types) {
        console.log('CreateSchema for ' + table + ' ', args);
        this._tables.set(table, { args: args, types: types });
        return Q();
    }
}
const _mockMemoryClient = new DummyMemoryClient();
_mockMemoryClient.createTable('Q1', ['steps', 'col1', 'col2', 'field', 'foo'], [Type.Number, Type.Number, Type.Number, Type.Number, Type.String]);
_mockMemoryClient.createTable('Q0', ['field1', 'field2'], [Type.Number, Type.Number]);
_mockMemoryClient.createTable('Q2', ['col2'], [Type.Number]);
_mockMemoryClient.createTable('t', [], []);

const _schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient);

function typecheckTest() {
    var code = fs.readFileSync('./test/sample.apps').toString('utf8').split('====');

    Q.all(code.map(function(code) {
        code = code.trim();
        Q(AppGrammar.parseAndTypecheck(code, _schemaRetriever)).catch((e) => {
            if (code.indexOf(`** typecheck: expect ${e.name} **`) >= 0)
                return;
            console.error('Failed');
            console.error(code);
            console.error(e);
        });
    }));
}

typecheckTest();
