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
  const code = [
    `
    // Filter for person whose first name is Stephen and last name Curry
    now => [athlete] of @org.wikidatasportsskill.athlete(), P735 == "Stephen" && P734 == "Curry" => notify;
    `,
    `
    // Filter for person who was drafted by the cavs and won the MVP award
    now => [athlete] of @org.wikidatasportsskill.athlete(),
    P647 == "Q162990"^^org.wikidatasportsskill:sports_teams("Cleveland Cavaliers")
    && P166 == ["Q222047"^^org.wikidatasportsskill:award_received("NBA Most Valuable Player Award")] => notify;
    `,
    `
    // Filter for person who has played for the Lakers and Warriors
    now => [athlete] of @org.wikidatasportsskill.athlete(),
    P54 == ["Q121783"^^org.wikidatasportsskill:sports_teams("Los Angeles Lakers"),
    "Q157376"^^org.wikidatasportsskill:sports_teams("Golden State Warriors")] => notify;
    `,
    `
    now => (([sports_team, P286] of @org.wikidatasportsskill.sports_team(),
    P286 == "Q523630"^^org.wikidata:human('Steve Kerr'))
    join ([athlete, P647] of @org.wikidatasportsskill.athlete())), P647 == sports_team => notify;
    `
  ];
  const answers = [
    "Stephen Curry",
    "LeBron James",
    "Wilt Chamberlain",
    "Klay Thompson"
  ];

  Promise.all(
    code.map((code) => {
      let promise = new Promise((resolve, reject) => {
        code = code.trim();
        AppGrammar.parseAndTypecheck(code, _schemaRetriever).then((program) => {
          const sparqlQuery = SparqlConverter.program_to_sparql(program);
          //if there is a join
          if (sparqlQuery[1]) {
            SparqlQuery.query(sparqlQuery[0]).then((response) => {
              let query_output =
                response["results"]["bindings"][0]["v2Label"]["value"];

              resolve(query_output);
            });

            //there is no join
          } else {
            SparqlQuery.query(sparqlQuery[0]).then((response) => {
              let query_output =
                response["results"]["bindings"][0]["vLabel"]["value"];

              resolve(query_output);
            });
          }
        });
      });
      return promise;
    })
  ).then((values) => {
    for (var i = 0; i < values.length; i++)
      assert.strictEqual(answers[i], values[i]);
  });
}

main();
