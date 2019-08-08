// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-

"use strict";

const AppGrammar = require("../lib/grammar_api");
const SchemaRetriever = require("../lib/schema");
const Helper = require("../lib/helper");

const _mockSchemaDelegate = require("./mock_schema_delegate");
const _mockMemoryClient = require("./mock_memory_client");
var assert = require("assert");

const _schemaRetriever = new SchemaRetriever(
    _mockSchemaDelegate,
    _mockMemoryClient,
    true
);

const TEST_CASES = [
    [
        `
    // Filter for person who has last name Curry, plays Basketball, and project for Father
    now => [P22] of @org.wikidatasportsskill.athlete(), P734 == "Curry"
    && P641 == ["Q5372"^^org.wikidatasportsskill:sports] => notify;
        `,
        `
    SELECT distinct ?v1Label WHERE{
    ?item1 ?label 'Curry'@en.
    ?v2 wdt:P734 ?item1.
    ?v2 wdt:P641 wd:Q5372.
    ?v2 wdt:P22 ?v1.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    limit 10`,
    ],
    [
        `
    // monitor for person who was born on September 29, 1988, and plays Football
    now => @org.wikidatasportsskill.athlete(), P569 == makeDate(1977, 8, 4)
    && P641 == ["Q41323"^^org.wikidatasportsskill:sports] => notify;
        `,
        `
    SELECT distinct ?v1Label WHERE{
    ?v1 wdt:P569 "1977-08-04"^^xsd:dateTime.
    ?v1 wdt:P641 wd:Q41323.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    limit 10
        `,
    ],
    [
        `
    // Filter for persons who are over 230 cm and play Basketball
    now => @org.wikidatasportsskill.athlete(), (P2048 >= 231cm)
    && P641 == ["Q5372"^^org.wikidatasportsskill:sports] => notify;
        `,
        `
    SELECT distinct ?v1Label WHERE{
    ?v1 wdt:P2048 ?compValue.
    FILTER(?compValue >= "231"^^xsd:decimal).
    ?v1 wdt:P641 wd:Q5372.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    limit 10
        `,
    ],
    [
        `
    // Filter for person who was drafted by the cavs and won the MVP award
    now => @org.wikidatasportsskill.athlete(),
    P647 == "Q162990"^^org.wikidatasportsskill:sports_teams("Cleveland Cavaliers")
    && P166 == ["Q222047"^^org.wikidatasportsskill:award_received("NBA Most Valuable Player Award")] => notify;
    `,
        `
    SELECT distinct ?v1Label WHERE{
    ?v1 wdt:P647 wd:Q162990.
    ?v1 wdt:P166 wd:Q222047.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    limit 10
        `,
    ],
    [
        `
    // Filter for person who played for the Lakers and Warriors
    now => @org.wikidatasportsskill.athlete(),
    P54 == ["Q121783"^^org.wikidatasportsskill:sports_teams("Los Angeles Lakers"),
    "Q157376"^^org.wikidatasportsskill:sports_teams("Golden State Warriors")] => notify;
        `,
        `
    SELECT distinct ?v1Label WHERE{
    ?v1 wdt:P54 wd:Q121783.
    ?v1 wdt:P54 wd:Q157376.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    limit 10
        `,
    ],
    [
        `
    // Join for team Steve Kerr coaches (Warriors) and players who were drafted by that team
    now => ((([id] of @org.wikidatasportsskill.sports_team() as lhs),
    P286 == "Q523630"^^org.wikidatasportsskill:athletes('Steve Kerr'))
    join (@org.wikidatasportsskill.athlete())), P647 == lhs.id => notify;
        `,
        `
    SELECT distinct ?v1Label WHERE{
    ?v2 wdt:P286 wd:Q523630.
    ?v2 wdt:P31 wd:Q12973014.
    ?v1 wdt:P647 ?v2.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    limit 10
        `,
    ],
    [
        `
    // Filter for persons who were drafted by the warriors and sort for the youngest players
    now => sort P569 desc of @org.wikidatasportsskill.athlete(), P647 == "Q157376"^^org.wikidatasportsskill:sports_teams("Golden State Warriors") => notify;
        `,
        `
    SELECT distinct ?v1Label WHERE{
    ?v1 wdt:P569 ?counter.
    ?v1 wdt:P647 wd:Q157376.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY desc(?counter)
    limit 10
        `,
    ],
    [
        `
    // Join for basketball team the players who were drafted by that team and the players which are head coaches
    now => ((((@org.wikidatasportsskill.sports_team(),
    P641 == "Q5372"^^org.wikidatasportsskill:sports('Basketball')) as lhs)
    join (([id, P647] of @org.wikidatasportsskill.athlete()) as rhs))
    join ([id] of @org.wikidatasportsskill.sports_team())), P647 == lhs.id && P286 == rhs.id => notify;
        `,
        `
    SELECT distinct ?v1Label WHERE{
    ?v4 wdt:P641 wd:Q5372.
    ?v3 wdt:P647 ?v4.
    ?v3 wdt:P647 ?v2.
    ?v2 wdt:P31 wd:Q2066131.
    ?v1 wdt:P286 ?v2.
    ?v1 wdt:P31 wd:Q12973014.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    limit 10
        `,
    ],
    [
        `
    now => @org.wikidatasportsskill.athlete(), P413 == ["Q212413"^^org.wikidatasportsskill:position_played_on_team('Guard')]
    && P166 == ["Q31391"^^org.wikidatasportsskill:award_received("NBA All-Star Game Most Valuable Player Award")]
    || P166 == ["Q222047"^^org.wikidatasportsskill:award_received("NBA Most Valuable Player Award")] => notify;
        `,
        `
    SELECT distinct ?v1Label WHERE{
    {?v1 wdt:P166 wd:Q222047.}
    UNION
    {?v1 wdt:P413 wd:Q212413.
    ?v1 wdt:P166 wd:Q31391.}
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    limit 10
    `,
    ],
    [
        `
    now => (((@org.wikidata.person(), contains(P1830, 'Microsoft')) as lhs)
    join ([P735, P19] of @org.wikidata.person())), id==lhs.P22 => notify;
        `,
        `
    SELECT distinct ?v1Label WHERE{
    ?v3 wdt:P1830 ?compValue.
    ?compValue rdfs:label ?label .
    FILTER CONTAINS(?label, 'Microsoft').
    ?v3 wdt:P22 ?v2.
    ?v2 wdt:P31 wd:Q5.
    ?v2 wdt:P735|wdt:P19 ?v1.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    limit 10
        `,
    ],
];

async function test(index) {
    let thingtalk = TEST_CASES[index][0];
    let sparql = TEST_CASES[index][1];
    await AppGrammar.parseAndTypecheck(thingtalk, _schemaRetriever).then(
        (program) => {
            //convert from ast to sparql
            let sparqlQuery = Helper.toSparql(program);
            compare_sparqls(sparql, sparqlQuery);
        }
    );
}

function compare_sparqls(sqarqlQuery1, sqarqlQuery2) {
    //remove all whitespaces
    let lines1 = sqarqlQuery1.replace(/\s+/g, "");
    let lines2 = sqarqlQuery2.replace(/\s+/g, "");

    assert.strictEqual(lines1, lines2);
}

async function main() {
    for (var i = 0; i < TEST_CASES.length; i++) {
        console.log("TEST CASE #" + (i + 1));
        await test(i);
    }
}

module.exports = main;
if (!module.parent) main();
