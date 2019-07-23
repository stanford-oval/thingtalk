"use strict";

require("../test/polyfill");

//main template for wikidata query
const q = `
SELECT distinct ?v1 ?v1Label ?v2Label ?v3Label WHERE{

  %s
  %s
  %s
  %s

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }

}
limit 10
`;

//wikidata triplet templates

//gets wikidata representation of raw values (e.g. San Francisco = Q62)
const get_label_triplet = `?item%d ?label '%s'@en.\n`;

//makes query based on wikidata representation
const get_label_parameter_triplet = `?v1 wdt:%s ?item%d.\n`;

//for some values(e.g. numbers) there is no wikidata represntation
const no_label_triplet = `?v1 wdt:%s %s.\n`;

const get_projection_triplet = `?v1 wdt:%s ?v3.\n`;

module.exports = {
  toSparql(input) {
    if (
      input["rules"].length > 0 &&
      input["rules"][0]["table"]["table"] !== undefined
    )
      return this.program_to_sparql(input);
    else return "";
  },

  program_to_sparql(program) {
    let projection_triplet = "";
    let output_index = 1;
    let table = program["rules"][0]["table"];

    //if there is a projection
    if (program["rules"][0]["table"]["args"] !== undefined) {
      let projection = program["rules"][0]["table"]["args"][0];
      projection_triplet = get_projection_triplet.format(projection);
      output_index = 3;
      table = program["rules"][0]["table"]["table"];
    }

    //default slice
    let slice = [0, 0];

    //if there is a join
    if (table["lhs"] !== undefined || table["table"]["lhs"] !== undefined) {
      table = program["rules"][0]["table"]["table"];
      //if there is an additional projection within the join
      if (
        table["rhs"]["args"] !== undefined &&
        table["rhs"]["args"].length > 1
      ) {
        projection_triplet = get_projection_triplet.format(
          table["rhs"]["args"][0]
        );
        output_index = 3;
      }

      if (projection_triplet === "") output_index = 2;

      let rhs_param = table["rhs"]["args"][table["rhs"]["args"].length - 1];
      //triplet for joins
      let join_triplet = "?v2 wdt:%s ?v1.".format(rhs_param);

      let lhs_sparql = this.table_to_sparql(
        table["lhs"]["table"],
        join_triplet,
        projection_triplet.replace("v1", "v2")
      );

      return [lhs_sparql, slice, output_index];
      //if there is a slice
    } else if (
      table["table"] !== undefined &&
      table["table"]["base"] !== undefined
    ) {
      let base = table["table"]["base"]["value"];
      let limit = table["table"]["limit"]["value"];
      slice[0] = base;
      slice[1] = limit;
    }

    let sparql_query = this.table_to_sparql(table, "", projection_triplet);
    return [sparql_query, slice, output_index];
  },

  table_to_sparql(table, join_triplet, projection_triplet) {
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
      return q.format(
        label_triplets,
        parameter_triplets,
        join_triplet,
        projection_triplet
      );
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
        return q.format(
          label_triplets,
          parameter_triplets,
          join_triplet,
          projection_triplet
        );
      } else {
        let triplets = this.filter_to_triplet(filters, schema, 1);
        if (triplets[triplets.length - 1]) {
          return q.format(
            triplets[0],
            triplets[1],
            join_triplet,
            projection_triplet
          );
        } else {
          return q.format("", triplets[0], join_triplet, projection_triplet);
        }
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
