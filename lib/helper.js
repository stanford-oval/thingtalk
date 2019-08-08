"use strict";

const SparqlConverter = require("./wikidata_sparql");

module.exports = {
  toSparql(input) {
    return SparqlConverter.toSparql(input);
  }
};
