"use strict";

require("../test/polyfill");

//main template for wikidata query
const q = `
SELECT distinct ?v ?vLabel ?v2Label WHERE{

  %s
  %s
  *Join*

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }

}
limit 1
`;

//wikidata triplet templates

//gets wikidata representation of raw values (e.g. San Francisco = Q62)
const get_label_triplet = `?item%d ?label '%s'@en.\n`;

//makes query based on wikidata representation
const get_label_parameter_triplet = `?v wdt:%s ?item%d.\n`;

//for some values(e.g. numbers) there is no wikidata represntation
const no_label_triplet = `?v wdt:%s %s.\n`;

module.exports = {
  program_to_sparql(program) {
    let table = program["rules"][0]["table"]["table"];

    if (table["lhs"] !== undefined) {
      let lhs = this.table_to_sparql(table["lhs"]["table"]);
      return [lhs.replace("*Join*", "?v2 wdt:P647 ?v"), true];
    }

    let query = this.table_to_sparql(table);
    return [query.replace("*Join*", ""), false];
  },

  table_to_sparql(table) {
    const filters = table["filter"];
    const schema = table["schema"];

    //if there are multiple filters
    if (filters["operands"] !== undefined) {
      let filter_list = filters["operands"];
      let label_triplets = "";
      let parameter_triplets = "";
      let counter = 1;

      //iterate through filters
      filter_list.map((filter) => {
        let parameter = filter["name"];
        let type = schema["_argmap"][parameter]["type"];

        //special case if the filter is an array
        if (`${type}`.includes("Array")) {
          let value = filter["value"]["value"];

          //converts array into wikidata triplet
          let triplets = this.array_to_triplets(
            value,
            parameter,
            counter,
            `${type}`
          );

          for (var i = 0; i < triplets[1].length; i++) {
            if (triplets[0][i] !== undefined) label_triplets += triplets[0][i];
            parameter_triplets += triplets[1][i];
          }
          counter += triplets[0].length;
        } else {
          //converts each filter into wikidata triplet
          let triplets = this.filter_to_triplet(filter, schema, counter);

          /*
          if filter_to_triplet returns true then the query must first get
          the wikidata representation of the label
          */

          if (triplets[triplets.length - 1]) {
            label_triplets += triplets[0];
            parameter_triplets += triplets[1];
          } else {
            parameter_triplets += triplets[0];
          }
          counter += 1;
        }
      });
      //returns formatted query
      return q.format(label_triplets, parameter_triplets);
    } else {
      let parameter = filters["name"];
      let type = schema["_argmap"][parameter]["type"];
      if (`${type}`.includes("Array")) {
        let label_triplets = "";
        let parameter_triplets = "";
        let value = filters["value"]["value"];
        let triplets = this.array_to_triplets(value, parameter, 1, `${type}`);

        for (var i = 0; i < triplets[1].length; i++) {
          if (triplets[0][i] !== undefined) label_triplets += triplets[0][i];
          parameter_triplets += triplets[1][i];
        }
        return q.format(label_triplets, parameter_triplets);
      } else {
        let triplets = this.filter_to_triplet(filters, schema, 1);
        if (triplets[triplets.length - 1])
          return q.format(triplets[0], triplets[1]);
        else return q.format("", triplets[0]);
      }
    }
  },

  //converts filter to triplet
  filter_to_triplet(filter_input, schema_input, index) {
    const parameter = filter_input["name"];
    const type = schema_input["_argmap"][parameter]["type"];

    let value = filter_input["value"]["value"];
    const isUnique = schema_input["_argmap"][parameter]["unique"];

    if (isUnique) {
      return [no_label_triplet.format(parameter, value), false];
    } else if (`${type}` === "Date") {
      return [
        no_label_triplet.format(parameter, this.parse_date(value)),
        false
      ];
    } else if (`${type}` === "Number") {
      return [no_label_triplet.format(parameter, value), false];
    } else if (`${type}`.includes("Entity")) {
      return [no_label_triplet.format(parameter, "wd:" + value), false];
    } else {
      return [
        get_label_triplet.format(index, value),
        get_label_parameter_triplet.format(parameter, index),
        true
      ];
    }
  },

  //converts array to triplet
  //makes assumption that arrays are always either Strings or Entities
  array_to_triplets(input_array, parameter, index, type) {
    let label_triplets = [];
    let parameter_triplets = [];
    for (var i = 0; i < input_array.length; i++) {
      let value = input_array[i]["value"];
      if (type.includes("Entity")) {
        parameter_triplets.push(
          no_label_triplet.format(parameter, "wd:" + value)
        );
      } else {
        label_triplets.push(get_label_triplet.format(index + i, value));
        parameter_triplets.push(
          get_label_parameter_triplet.format(parameter, index + i)
        );
      }
    }

    return [label_triplets, parameter_triplets];
  },

  //reformat date
  parse_date(date) {
    const formatted_date = `"%d-%s-%s"^^xsd:dateTime`.format(
      date.getFullYear(),
      ("0" + (date.getMonth() + 1)).slice(-2),
      ("0" + date.getDate()).slice(-2)
    );

    return formatted_date;
  }
};
