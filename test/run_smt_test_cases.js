const Q = require('q');
const fs = require('fs');
const CVC4Solver = require('cvc4');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');
const { optimizeProgram } = require('../lib/optimize');

const { latexprintProgram, latexprintPermission } = require('./latex_format');
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

function countFilterClauses(filter, fn) {
    if (filter.isTrue || filter.isFalse)
        return 0;
    if (filter.isAnd || filter.isOr)
        return filter.operands.reduce((x, y) => x + countFilterClauses(y, fn), 0);
    if (filter.isNot)
        return countFilterClauses(filter.expr, fn);
    if (filter.isExternal)
        return countFilterClauses(filter.filter, fn);
    return fn(filter.filter);
}
function countClauses(prog, fn) {
    let count = 0;
    for (let rule of prog.rules) {
        if (rule.trigger)
            count += countFilterClauses(rule.trigger.filter, fn);
        for (let query of rule.queries)
            count += countFilterClauses(query.filter, fn);
    }
    return count;
}
function countMaxClauses(permissionDB, fn) {
    let count = 0;
    for (let permission of permissionDB) {
        let triggerclauses = permission.trigger.isSpecified ? countFilterClauses(permission.trigger.filter, fn) : 0;
        let queryclauses = permission.query.isSpecified ? countFilterClauses(permission.query.filter, fn) : 0;
        let actionclauses = permission.action.isSpecified ? countFilterClauses(permission.action.filter, fn) : 0;
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
        let checker = new PermissionChecker(CVC4Solver, schemaRetriever, new MockGroupDelegate());

        let [permissionDB, programCode] = testCase.split(';;');
        permissionDB = permissionDB.trim().split('\n').map(Grammar.parsePermissionRule);
        programCode = programCode.trim();
        return Promise.all(permissionDB.map((permission) => {
            return checker.allowed(permission);
        })).then(() => {
            return Grammar.parseAndTypecheck(programCode, schemaRetriever);
        }).then((program) => {
            //for (let permission of permissionDB)
            //    console.log(latexprintPermission(permission));
            //console.log(latexprintProgram(program));
            let clausesBefore = countClauses(program, () => 1);
            let containsClauses = countClauses(program, (filter) => (filter.operator === '=~' ? 1 : 0));
            let maxClauses = clausesBefore + countMaxClauses(permissionDB, () => 1);
            let maxContainsClauses = containsClauses + countMaxClauses(permissionDB, (filter) => (filter.operator === '=~' ? 1 : 0));
            let begin = (new Date).getTime();
            return checker.check(principal, program).then((prog) => {
                let end = (new Date).getTime();
                let time = end - begin;
                if (prog) {
                    let clausesAfter = countClauses(prog, () => 1);
                    let containsClausesAfter = countClauses(prog, (filter) => (filter.operator === '=~' ? 1 : 0));
                    let newCode = Ast.prettyprint(prog, false).trim();
                    //console.error(newCode);
                    //console.error(latexprintProgram(prog));
                    console.error('ALLOWED,' + i + ',' + time + ',' + programCode.length + ',' + newCode.length +',' + clausesBefore + ',' + clausesAfter + ',' + maxClauses + ',' + containsClauses + ',' + containsClausesAfter + ',' + maxContainsClauses);
                } else {
                    console.error('REJECTED,' + i + ',' + time + ',' + programCode.length + ',0,' + clausesBefore + ',0,' + maxClauses + ',' + containsClauses + ',0,' + maxContainsClauses);
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
