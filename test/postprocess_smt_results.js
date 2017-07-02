const Q = require('q');
const fs = require('fs');
const byline = require('byline');
const csv = require('csv');

function main() {
    const num_allowed = process.argv[2];
    let output = csv.stringify({
        columns: ['id', 'num_allowed', 'result', 'total_time', 'old_code_length', 'new_code_length',
        'num_smt_calls', 'num_smt_timeouts', 'total_smt_time', 'max_smt_time', 'min_smt_time',
        'old_code_clauses', 'new_code_clauses'],
        header: (num_allowed === '0')
    });
    output.pipe(process.stdout);
    process.stdin.setEncoding('utf8');
    let input = byline(process.stdin);

    input.on('end', () => output.end());

    let smtResults = [];
    let smtTimeouts = 0;
    input.on('data', (line) => {
        let match = /^SMT elapsed time: ([0-9]+)$/.exec(line);
        if (match !== null) {
            smtResults.push(parseInt(match[1]));
            return;
        }
        if (/^SMT TIMED OUT$/.test(line)) {
            smtTimeouts++;
            return;
        }

        if (/^(ALLOWED|REJECTED)/.test(line)) {
            let [result, id, total_time, old_code_length, new_code_length, old_code_clauses, new_code_clauses] = line.split(',');
            old_code_length = parseInt(old_code_length);
            new_code_length = parseInt(new_code_length);
            old_code_clauses = parseInt(old_code_clauses);
            new_code_clauses = parseInt(new_code_clauses);
            total_time = parseInt(total_time);
            id = parseInt(id);
            output.write({
                id: num_allowed + '_' + id,
                num_allowed, result, old_code_length, new_code_length, old_code_clauses, new_code_clauses, total_time,
                num_smt_calls: smtResults.length,
                num_smt_timeouts: smtTimeouts,
                total_smt_time: smtResults.reduce((a, b) => a+b, 0),
                max_smt_time: smtResults.reduce((a, b) => Math.max(a, b), -Infinity),
                min_smt_time: smtResults.reduce((a, b) => Math.min(a, b), +Infinity)
            });
            smtResults.length = 0;
            smtTimeouts = 0;
            return;
        }

        console.error('Unexpected line ' + line);
    });
}
main();
