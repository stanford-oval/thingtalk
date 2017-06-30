const Q = require('q');
const fs = require('fs');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');
const { optimizeProgram } = require('../lib/optimize');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');

var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);

function promiseLoop(array, fn) {
    return (function loop(i) {
        if (i === array.length)
            return Q();
        return Q(fn(array[i], i)).then(() => loop(i+1));
    })(0);
}

class MockGroupDelegate {
    getGroups(principal) {
        switch (principal) {
        case 'omlet-messaging:testtesttest':
            return Q(['omlet-feed:family', 'role:mom']);
        case 'omlet-messaging:sistertest':
            return Q(['omlet-feed:family', 'role:sister']);
        case 'omlet-messaging:strangertext':
            return Q([]);
        default:
            return Q([]);
        }
    }
}

function main() {
    let input = fs.readFileSync(process.argv[2]).toString('utf8').split('====');
    // remove the last test case (which is empty)
    input.pop();

    const principal = Ast.Value.Entity('omlet-messaging:testtesttest', 'tt:contact', null);

    console.error('Found ' + input.length + ' test cases');

    promiseLoop(input, (testCase, i) => {
        let checker = new PermissionChecker(schemaRetriever, new MockGroupDelegate());

        let [permissionDB, programCode] = testCase.split(';;');
        programCode = programCode.trim();
        return Promise.all(permissionDB.trim().split('\n').map((line) => {
            return checker.allowed(Grammar.parsePermissionRule(line));
        })).then(() => {
            return Grammar.parseAndTypecheck(programCode, schemaRetriever);
        }).then((program) => {
            let begin = (new Date).getTime();
            return checker.check(principal, program).then((prog) => {
                let end = (new Date).getTime();
                let time = end - begin;
                if (prog) {
                    let newCode = Ast.prettyprint(prog, false).trim();
                    //console.error(newCode);
                    console.error('ALLOWED,' + i + ',' + time + ',' + programCode.length + ',' + newCode.length);
                } else {
                    console.error('REJECTED,' + i + ',' + time + ',' + programCode.length + ',0');
                }
            });
        }).catch((e) => {
            console.error(e);
            console.error('Test Case');
            console.error(testCase);
            throw e;
        });
    }).catch((e) => {
        console.error(e);
    });
}
main();
