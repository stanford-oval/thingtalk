"use strict";

const AppGrammar = require("../lib/grammar_api");
const SchemaRetriever = require("../lib/schema");
const SparqlConverter = require("../lib/sparql_converter");
const SPARQLQueryDispatcher = require("./sparql_query");
const SparqlQuery = new SPARQLQueryDispatcher();

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
    // Filter for person who has last name Curry, and plays Basketball
    now => [athlete] of @org.wikidatasportsskill.athlete(), P734 == "Curry"
    && P641 == ["Q5372"^^org.wikidatasportsskill:sports] => notify;
    `,
    `
    // Filter for person who was born on September 29, 1988, and plays Football
    now => [athlete] of @org.wikidatasportsskill.athlete(), P569 == makeDate(1977, 8, 4)
    && P641 == ["Q41323"^^org.wikidatasportsskill:sports] => notify;
    `,
    `
    // Filter for person who was drafted by the cavs and won the MVP award
    now => [athlete] of @org.wikidatasportsskill.athlete(),
    P647 == "Q162990"^^org.wikidatasportsskill:sports_teams("Cleveland Cavaliers")
    && P166 == ["Q222047"^^org.wikidatasportsskill:award_received("NBA Most Valuable Player Award")] => notify;
    `,
    `
    // Filter for person who played for the Lakers and Warriors
    now => [athlete] of @org.wikidatasportsskill.athlete(),
    P54 == ["Q121783"^^org.wikidatasportsskill:sports_teams("Los Angeles Lakers"),
    "Q157376"^^org.wikidatasportsskill:sports_teams("Golden State Warriors")] => notify;
    `,
    `
    // Join for team Steve Kerr coaches (Warriors) and players who were drafted by that team
    now => (([sports_team, P286] of @org.wikidatasportsskill.sports_team(),
    P286 == "Q523630"^^org.wikidata:human('Steve Kerr'))
    join ([athlete, P647] of @org.wikidatasportsskill.athlete())), P647 == sports_team => notify;
    `,
    `
    // Filter for person who has last name Curry, and plays Basketball
    now => [athlete] of @org.wikidatasportsskill.athlete()[1:2], P734 == "Curry"
    && P641 == ["Q5372"^^org.wikidatasportsskill:sports] => notify;
    `
  ];
  const answers = [
    "Stephen Curry",
    "Tom Brady",
    "LeBron James",
    "Wilt Chamberlain",
    "Klay Thompson",
    "Michael Curry"
  ];

  Promise.all(
    code.map((code) => {
      let promise = new Promise((resolve, reject) => {
        code = code.trim();
        AppGrammar.parseAndTypecheck(code, _schemaRetriever).then((program) => {
          //convert from ast to sparql
          const sparqlQuery = SparqlConverter.program_to_sparql(program);

          SparqlQuery.query(sparqlQuery[0]).then((response) => {
            let query_output = [];
            let result = response["results"]["bindings"];
            let start = 0;
            let end = result.length;

            if (sparqlQuery[1][0] !== 0 || sparqlQuery[1][1] !== 0) {
              start = sparqlQuery[1][0];
              end = sparqlQuery[1][1];
            }

            for (var i = start; i < end; i++) {
              //if there is not a join
              if (result[i]["vLabel"] !== undefined) {
                let output = result[i]["vLabel"]["value"];
                query_output.push(output);
                //if there is a join
              } else {
                let output = result[i]["v2Label"]["value"];
                query_output.push(output);
              }
            }

            resolve(query_output);
          });

          //if there is no join
        });
      });
      return promise;
    })
  ).then((values) => {
    for (var i = 0; i < values.length; i++)
      assert.strictEqual(answers[i], values[i][0]);
  });
}

main();
