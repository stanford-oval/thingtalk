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

function countFilterClauses(filter) {
    if (filter.isTrue || filter.isFalse)
        return 0;
    if (filter.isAnd || filter.isOr)
        return filter.operands.reduce((x, y) => x + countFilterClauses(y), 0);
    if (filter.isNot)
        return countFilterClauses(filter.expr);
    return 1;
}
function countClauses(prog) {
    let count = 0;
    for (let rule of prog.rules) {
        if (rule.trigger)
            count += countFilterClauses(rule.trigger.filter);
        for (let query of rule.queries)
            count += countFilterClauses(query.filter);
    }
    return count;
}
function countMaxClauses(permissionDB) {
    let count = 0;
    for (let permission of permissionDB) {
        let triggerclauses = permission.trigger.isSpecified ? countFilterClauses(permission.trigger.filter) : 0;
        let queryclauses = permission.query.isSpecified ? countFilterClauses(permission.query.filter) : 0;
        let actionclauses = permission.action.isSpecified ? countFilterClauses(permission.action.filter) : 0;
        count += 2 * triggerclauses + queryclauses + actionclauses;
    }
    return count;
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
        permissionDB = permissionDB.trim().split('\n').map(Grammar.parsePermissionRule);
        programCode = programCode.trim();
        return Promise.all(permissionDB.map((permission) => {
            return checker.allowed(permission);
        })).then(() => {
            return Grammar.parseAndTypecheck(programCode, schemaRetriever);
        }).then((program) => {
            let clausesBefore = countClauses(program);
            let maxClauses = clausesBefore + countMaxClauses(permissionDB);
            let begin = (new Date).getTime();
            return checker.check(principal, program).then((prog) => {
                let end = (new Date).getTime();
                let time = end - begin;
                if (prog) {
                    let clausesAfter = countClauses(prog);
                    let newCode = Ast.prettyprint(prog, false).trim();
                    //console.error(newCode);
                    console.error('ALLOWED,' + i + ',' + time + ',' + programCode.length + ',' + newCode.length +',' + clausesBefore + ',' + clausesAfter + ',' + maxClauses);
                } else {
                    console.error('REJECTED,' + i + ',' + time + ',' + programCode.length + ',0,' + clausesBefore + ',0,' + maxClauses);
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
