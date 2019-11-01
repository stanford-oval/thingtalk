"use strict";

const assert = require('assert');
const AppGrammar = require('../lib/grammar_api');
const { prettyprint } = require('../lib/prettyprint');

const TEST_CASES = [
// compound type
`class @org.schema {
  list query local_business(out name: String,
                            out rating: {
                              value: Number #_[canonical="v"],
                              count: Number #[foo=true]
                            });
}
`,

// sub function
`class @org.schema {
  list query local_business(out name: String,
                            out rating: {
                              value: Number,
                              count: Number
                            });

  list query restaurants extends local_business(out serveCuisine: String);
}
`,

// aggregate filter
`now => (@org.schema.restaurant()), count(review) >= 1 => notify;`,

// compute table
`now => compute count(reviews) of (@org.schema.restaurant()) => notify;`,
`now => compute filter(aggregateRating.reviews, author == "Bob") of (@org.schema.restaurants()) => notify;`,
`now => [foo] of (compute filter(aggregateRating.reviews, author == "Bob") as foo of (@org.schema.restaurants())) => notify;`,

// macros
`class @foo.bar {
  compute isTrue() : Boolean := true;

  compute greaterThanZero(in req x: Number) : Boolean := x >= 0;

  compute itself(in req x: Number) : Number := x;

  list query q(out num: Number);
}
now => (@foo.bar.q()), @foo.bar.itself(x=num) >= 0 => notify;
now => (@foo.bar.q()), @for.bar.greaterThanZero(x=num) => notify;`,

// device selectors
`now => @light-bulb(name="bathroom").set_power(power=enum(on));`,
`now => @light-bulb(id="io.home-assistant/http://hassio.local:8123-light.hue_bloom_1", name="bathroom").set_power(power=enum(on));`
];

function main() {
    TEST_CASES.forEach((code, i) => {
        console.log('# Test Case ' + (i+1));

        let ast;
        try {
            ast = AppGrammar.parse(code);
            //console.log(String(ast.statements));
        } catch(e) {
            console.error('Parsing failed');
            console.error(code);
            console.error(e);
            return;
        }

        let codegenned;
        try {
            codegenned = prettyprint(ast, true);
            assert.strictEqual(code, codegenned);
        } catch(e) {
            console.error('Prettyprint failed');
            console.error('Prettyprinted:');
            console.error(codegenned);
            console.error('====\nCode:');
            console.error(code);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }
    });
}
module.exports = main;
if (!module.parent)
    main();
