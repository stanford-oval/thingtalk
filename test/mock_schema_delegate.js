"use strict";

const Thingpedia = require('./thingpedia.json');
const Mixins = require('./mixins.json');
const Ast = require('../lib/ast');
const Type = require('../lib/type');
const { extractImports } = require('../lib/ast/manifest_utils');
const Q = require('q');
const fs = require('fs');
const path = require('path');

// Parse the semi-obsolete JSON format for schemas used
// by Thingpedia into a FunctionDef
function makeSchemaFunctionDef(functionType, functionName, schema, useMeta, parent) {
    const args = [];
    // compat with Thingpedia API quirks
    const types = schema.types || schema.schema;

    types.forEach((type, i) => {
        type = Type.fromString(type);
        const argname = schema.args[i];
        const argrequired = !!schema.required[i];
        const arginput = !!schema.is_input[i];
        const argunique = schema.unique ? !!schema.unique[i] : false;

        let direction;
        if (argrequired)
            direction = Ast.ArgDirection.IN_REQ;
        else if (arginput)
            direction = Ast.ArgDirection.IN_OPT;
        else
            direction = Ast.ArgDirection.OUT;
        const metadata = {};
        if (useMeta) {
            metadata.prompt = schema.questions[i] || '';
            metadata.canonical = schema.argcanonicals[i] || argname;
        }
        const annotations = {};
        annotations['unique'] = Ast.Value.Boolean(argunique);

        args.push(new Ast.ArgumentDef(direction, argname,
            type, metadata, annotations));
    });

    const metadata = {};
    if (useMeta) {
        metadata.canonical = schema.canonical || '';
        metadata.confirmation = schema.confirmation || '';
    }
    const annotations = schema.annotations;

    return new Ast.FunctionDef(functionType,
                               functionName,
                               args,
                               schema.is_list,
                               schema.is_monitorable,
                               metadata,
                               annotations,
                               parent);
}

function makeSchemaClassDef(kind, schema, useMeta) {
    const imports = extractImports(schema);
    const metadata = {};
    const annotations = {};
    const parent = new Ast.ClassDef(kind, null, {}, {}, imports, metadata, annotations);

    const queries = {};
    for (let name in schema.queries)
        queries[name] = makeSchemaFunctionDef('query', name, schema.queries[name], useMeta, parent);
    const actions = {};
    for (let name in schema.actions)
        actions[name] = makeSchemaFunctionDef('action', name, schema.actions[name], useMeta, parent);

    return new Ast.ClassDef(kind, null, queries, actions,
                            imports, metadata, annotations);
}

module.exports = {
    _schema: {},
    _meta: {},
    _mixins: {},

    // The Thingpedia APIs were changed to return ThingTalk class
    // definitions rather than JSON
    // We convert our JSON datafiles into ThingTalk code here

    async getSchemas(kinds, useMeta) {
        const source = useMeta ? this._meta : this._schema;

        const classes = [];
        for (let kind of kinds) {
            // emulate Thingpedia's behavior of creating an empty class
            // for invalid/unknown/invisible devices
            if (!source[kind])
                continue;
            classes.push(makeSchemaClassDef(kind, source[kind], useMeta));
        }
        const input = new Ast.Input.Meta(classes, []);
        return input.prettyprint();
    },
    async getDeviceCode(kind) {
        const data = await Q.nfcall(fs.readFile, path.resolve(path.dirname(module.filename), kind + '.json'));
        const parsed = JSON.parse(data);

        const classDef = Ast.ClassDef.fromManifest(kind, parsed);
        return classDef.prettyprint();
    },

    // FIXME mixins too should be changed
    getMixins() {
        return Promise.resolve(this._mixins);
    },

    getAllExamples() {
        return Promise.resolve('dataset @org.thingpedia.everything language "en" {\
    action () := @com.twitter.post()\
    #[id=0]\
    #_[preprocessed=["tweet something", "post on twitter"]];\
\
    action (p_status : String) := @com.twitter.post(status=p_status)\
    #[id=1]\
    #_[preprocessed=["tweet ${p_status}", "post ${p_status} on twitter"]];\
\
    query (p_query : String) := @com.bing.web_search(query=p_query)\
    #[id=2]\
    #_[preprocessed=["websites matching ${p_query}", "${p_query:const} websites", "${p_query:const} on bing"]];\
\
    query (p_query : String) := @com.bing.image_search(query=p_query)\
    #[id=3]\
    #_[preprocessed=["images matching ${p_query}", "${p_query:const} images"]];\
}');
    },

    getAllDeviceNames() {
        let names = [];
        for (let kind in this._meta)
            names.push({ kind, kind_canonical: this._meta[kind].kind_canonical });
        return Promise.resolve(names);
    },

    getAllEntityTypes() {
        return Promise.resolve(require('./entities.json').data);
    }
};
for (let dev of Thingpedia.data) {
    module.exports._meta[dev.kind] = dev;
    module.exports._schema[dev.kind] = {
        module_type: dev.module_type,
        query_language: dev.query_language,
        queries: {},
        actions: {}
    };

    for (let what of ['queries', 'actions']) {
        for (let name in dev[what]) {
            let from = dev[what][name];
            let annotations = {};
            if ('require_filter' in from)
                annotations.require_filter = Ast.Value.Boolean(from.require_filter);
            if ('default_projection' in from)
                annotations.default_projection = Ast.Value.Array(from.default_projection.map((v) => Ast.Value.String(v)));
            module.exports._schema[dev.kind][what][name] = {
                types: from.schema,
                args: from.args,
                required: from.required,
                is_input: from.is_input,
                is_list: from.is_list,
                is_monitorable: from.is_monitorable,
                unique: from.unique,
                annotations: annotations
            };
        }
    }
}
for (let mixin of Mixins.data) {
    module.exports._mixins[mixin.kind] = mixin;
}
