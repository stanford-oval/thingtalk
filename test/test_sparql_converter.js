// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-

"use strict";

const AppGrammar = require("../lib/grammar_api");
const SchemaRetriever = require("../lib/schema");
const SparqlConverter = require("../lib/sparql_converter");

const _mockSchemaDelegate = require("./mock_schema_delegate");
const _mockMemoryClient = require("./mock_memory_client");
var assert = require("assert");

const _schemaRetriever = new SchemaRetriever(
    _mockSchemaDelegate,
    _mockMemoryClient,
    true
);

async function main() {
    //thingtalk code
    const code = [
        `
    // Filter for person who has last name Curry, plays Basketball, and project for Father
    now => [P22] of @org.wikidatasportsskill.athlete(), P734 == "Curry"
    && P641 == ["Q5372"^^org.wikidatasportsskill:sports] => notify;
    `,
        `
    // Filter for person who was born on September 29, 1988, and plays Football
    now => @org.wikidatasportsskill.athlete(), P569 == makeDate(1977, 8, 4)
    && P641 == ["Q41323"^^org.wikidatasportsskill:sports] => notify;
    `,
        `
    // Filter for person who was 231 cm and plays Basketball
    now => @org.wikidatasportsskill.athlete(), P2048 == 231cm
    && P641 == ["Q5372"^^org.wikidatasportsskill:sports] => notify;
    `,
        `
    // Filter for person who was drafted by the cavs and won the MVP award
    now => @org.wikidatasportsskill.athlete(),
    P647 == "Q162990"^^org.wikidatasportsskill:sports_teams("Cleveland Cavaliers")
    && P166 == ["Q222047"^^org.wikidatasportsskill:award_received("NBA Most Valuable Player Award")] => notify;
    `,
        `
    // Filter for person who played for the Lakers and Warriors
    now => @org.wikidatasportsskill.athlete(),
    P54 == ["Q121783"^^org.wikidatasportsskill:sports_teams("Los Angeles Lakers"),
    "Q157376"^^org.wikidatasportsskill:sports_teams("Golden State Warriors")] => notify;
    `,
        `
    // Join for team Steve Kerr coaches (Warriors) and players who were drafted by that team
    now => (([sports_team, P286] of @org.wikidatasportsskill.sports_team(),
    P286 == "Q523630"^^org.wikidata:human('Steve Kerr'))
    join ([P647] of @org.wikidatasportsskill.athlete())), P647 == sports_team => notify;
    `,

        `
    // Filter for person who has last name Curry, plays Basketball, and get the second result
    now => @org.wikidatasportsskill.athlete()[1:2], P734 == "Curry"
    && P641 == ["Q5372"^^org.wikidatasportsskill:sports] => notify;
    `,
    ];
    const queries = [
        "https://query.wikidata.org/sparql?query=%0ASELECT%20distinct%20%3Fv1%20%3Fv1Label%20%3Fv2Label%20%3Fv3Label%20WHERE%7B%0A%0A%3Fitem1%20%3Flabel%20'Curry'%40en.%0A%0A%3Fv1%20wdt%3AP734%20%3Fitem1.%0A%3Fv1%20wdt%3AP641%20wd%3AQ5372.%0A%0A%0A%3Fv1%20wdt%3AP22%20%3Fv3.%0A%0A%0ASERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22.%20%7D%0A%0A%7D%0Alimit%2010%0A%2C0%2C0%2C3",
        "https://query.wikidata.org/sparql?query=%0ASELECT%20distinct%20%3Fv1%20%3Fv1Label%20%3Fv2Label%20%3Fv3Label%20WHERE%7B%0A%0A%0A%3Fv1%20wdt%3AP569%20%221977-08-04%22%5E%5Exsd%3AdateTime.%0A%3Fv1%20wdt%3AP641%20wd%3AQ41323.%0A%0A%0A%0A%0ASERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22.%20%7D%0A%0A%7D%0Alimit%2010%0A%2C0%2C0%2C1",
        "https://query.wikidata.org/sparql?query=%0ASELECT%20distinct%20%3Fv1%20%3Fv1Label%20%3Fv2Label%20%3Fv3Label%20WHERE%7B%0A%0A%0A%3Fv1%20wdt%3AP2048%20%22231%22%5E%5Exsd%3Adecimal.%0A%3Fv1%20wdt%3AP641%20wd%3AQ5372.%0A%0A%0A%0A%0ASERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22.%20%7D%0A%0A%7D%0Alimit%2010%0A%2C0%2C0%2C1",
        "https://query.wikidata.org/sparql?query=%0ASELECT%20distinct%20%3Fv1%20%3Fv1Label%20%3Fv2Label%20%3Fv3Label%20WHERE%7B%0A%0A%0A%3Fv1%20wdt%3AP647%20wd%3AQ162990.%0A%3Fv1%20wdt%3AP166%20wd%3AQ222047.%0A%0A%0A%0A%0ASERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22.%20%7D%0A%0A%7D%0Alimit%2010%0A%2C0%2C0%2C1",
        "https://query.wikidata.org/sparql?query=%0ASELECT%20distinct%20%3Fv1%20%3Fv1Label%20%3Fv2Label%20%3Fv3Label%20WHERE%7B%0A%0A%0A%3Fv1%20wdt%3AP54%20wd%3AQ121783.%0A%3Fv1%20wdt%3AP54%20wd%3AQ157376.%0A%0A%0A%0A%0ASERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22.%20%7D%0A%0A%7D%0Alimit%2010%0A%2C0%2C0%2C1",
        "https://query.wikidata.org/sparql?query=%0ASELECT%20distinct%20%3Fv1%20%3Fv1Label%20%3Fv2Label%20%3Fv3Label%20WHERE%7B%0A%0A%0A%3Fv1%20wdt%3AP286%20wd%3AQ523630.%0A%0A%3Fv2%20wdt%3AP647%20%3Fv1.%0A%0A%0A%0ASERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22.%20%7D%0A%0A%7D%0Alimit%2010%0A%2C0%2C0%2C2",
        "https://query.wikidata.org/sparql?query=%0ASELECT%20distinct%20%3Fv1%20%3Fv1Label%20%3Fv2Label%20%3Fv3Label%20WHERE%7B%0A%0A%3Fitem1%20%3Flabel%20'Curry'%40en.%0A%0A%3Fv1%20wdt%3AP734%20%3Fitem1.%0A%3Fv1%20wdt%3AP641%20wd%3AQ5372.%0A%0A%0A%0A%0ASERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22.%20%7D%0A%0A%7D%0Alimit%2010%0A%2C1%2C2%2C1",
    ];

    Promise.all(
        code.map((code) => {
            let promise = new Promise((resolve, reject) => {
                code = code.trim();
                AppGrammar.parseAndTypecheck(code, _schemaRetriever).then(
                    async (program) => {
                        //convert from ast to sparql
                        const sparqlQuery = await SparqlConverter.toSparql(
                            program
                        );
                        const queryURL =
                            "https://query.wikidata.org/sparql" +
                            "?query=" +
                            encodeURIComponent(sparqlQuery);
                        resolve(queryURL);
                    }
                );
            });
            return promise;
        })
    ).then((values) => {
        for (var i = 0; i < values.length; i++)
            assert.strictEqual(values[i], queries[i]);
    });
}

module.exports = main;
if (!module.parent) main();
