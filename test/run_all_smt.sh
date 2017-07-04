#!/bin/bash

set -e
set -x

APPEND_TEST_CASES="5 10 50"
TEST_CASES="1 ${APPEND_TEST_CASES}"

for i in ${TEST_CASES} ; do
	node ./test/run_smt_test_cases.js ./smt/test.$i 2> ./smt/test.${i}.out
done
node ./test/postprocess_smt_results.js 1 < ./smt/test.1.out > ./smt/results.csv
for i in ${APPEND_TEST_CASES} ; do
	node ./test/postprocess_smt_results.js ${i} < ./smt/test.${i}.out >> ./smt/results.csv
done
