// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const http = require('http');
const https = require('https');
const Url = require('url');

const Q = require('q');
//const ThingTalk = require('thingtalk');
const ThingTalk = require('../index');
const ThingpediaClient = require('./thingpediaclient');

const THINGENGINE_URL = 'https://thingpedia.stanford.edu';

function httpRequest(url, auth) {
    let options = Url.parse(url);
    options.headers = {
        'Authorization': auth
    };
    return new Q.Promise((callback, errback) => {
        https.get(options, (res) => {
            res.on('error', errback);
            if (res.statusCode !== 200) {
                let e = new Error('Unexpected HTTP error');
                e.code = res.statusCode;
                res.resume();
                errback(e);
                return;
            }

            let buffers = [];
            let len = 0;
            res.on('data', (buf) => {
                buffers.push(buf);
                len += buf.length;
            });
            res.on('end', () => {
                callback(Buffer.concat(buffers, len));
            });
        });
    }).then((buffer) => {
        return JSON.parse(buffer.toString());
    });
}

const schemaRetriever = new ThingTalk.SchemaRetriever(new ThingpediaClient());
function main() {
    let server = http.createServer();
    server.on('request', (req, res) => {
        let url = Url.parse(req.url, true);

        res.setHeader('Content-Type', 'application/json');
        if (url.pathname !== '/') {
            res.statusCode = 404;
            res.end(JSON.stringify({error:'Not Found'}));
            return;
        }

        let token = url.query.access_token;
        let sentence = url.query.q;
        httpRequest(THINGENGINE_URL + '/me/api/parse?q=' + encodeURIComponent(sentence),
            'Bearer ' + token).then((data) => {
            let top = data.candidates[0];
            if (!top)
                throw new Error("No candidates");
            let code = top.code;
            return Q.all([top, ThingTalk.Grammar.parseAndTypecheck(code, schemaRetriever, true)]);
        }).then(([json, program]) => {
            json.program = {};
            json.program.params = program.params.map((param) => {
                return { name: param.name, type: String(param.type) };
            });
            json.program.rules = program.rules.map((rule, i) => {
                function dovalue(value) {
                    if (value.isVarRef && value.name.startsWith('__slot_')) {
                        return ['Slot', value.name];
                    } else if (value.isVarRef) {
                        return ['VarRef', value.name];
                    } else if (value.isUndefined) {
                        // should never happen, because the server goes through the slots and assigns them
                        return ['Undefined', undefined];
                    } else if (value.isLocation) {
                        let loc = value.value;
                        if (loc.isRelative)
                            return ['Location', loc.relativeTag];
                        else
                            return ['Location', value.toJS()];
                    } else if (value.isDate) {
                        return ['Date', value.value.getTime()];
                    } else if (value.isMeasure) {
                        return [String(value.getType()), { value: value.value, unit: value.unit }];
                    } else {
                        return [String(value.getType()), value.toJS()];
                    }
                }

                let primlist = [];
                function jsonify(from) {
                    if (typeof from !== 'object' || from === null)
                        return from;
                    if (Array.isArray(from))
                        return from.map(jsonify);
                    if (from instanceof ThingTalk.Type)
                        return String(from);
                    let obj = {};
                    for (let name of Object.getOwnPropertyNames(from)) {
                        let v = from[name];
                        if (typeof v === 'function')
                            continue;
                        obj[name] = jsonify(v);
                    }
                    return obj;
                }
                function doprimitive(primId, prim, prefix, scope) {
                    if (prim.selector.isBuiltin)
                        return;

                    let obj = {
                        functionType: prefix,
                        primId: primId,
                        kind: prim.selector.kind,
                        'function': prim.selector.channel,
                        in_params: [],
                        filter: null,
                        out_params: [],
                        schema: jsonify(prim.schema),
                    };
                    primlist.push(obj);

                    for (let in_param of prim.in_params) {
                        let type = prim.schema.inReq[in_param.name] || prim.schema.inOpt[in_param.name];
                        let [valueType, value] = dovalue(in_param.value);
                        obj.in_params.push({
                            name: in_param.name,
                            type: String(type),
                            value: {
                                type: valueType,
                                value: value
                            }
                        });
                    }
                    if (prefix === 'action')
                        return;

                    function dofilter(expr) {
                        if (expr.isTrue || expr.isFalse) {
                            return expr.isTrue ? 'true' : 'false';
                        }
                        if (expr.isAnd || expr.isOr) {
                            return {op: (expr.isAnd ? 'and' : 'or'),
                                operands: expr.operands.map(dofilter)};
                        }
                        if (expr.isNot) {
                            return {op: 'not', operands:[dofilters(expr.expr)]};
                        }

                        let filter = expr.filter;
                        let type = prim.schema.inReq[filter.name] || prim.schema.inOpt[filter.name] || prim.schema.out[filter.name] || scope[filter.name];
                        let [valueType, value] = dovalue(filter.value);
                        return {
                            name: filter.name,
                            type: String(type),
                            operator: filter.operator,
                            value: {
                                type: valueType,
                                value: value
                            }
                        };
                    }
                    obj.filter = dofilter(prim.filter);
                    for (let out_param of prim.out_params) {
                        let type = prim.schema.out[out_param.value];
                        obj.out_params.push({
                            name: out_param.name,
                            type: String(type),
                            value: out_param.value
                        });
                        scope[out_param.name] = type;
                    }
                }

                let scope = {};
                if (rule.trigger)
                    doprimitive(`r${i}_t`, rule.trigger, "trigger", scope);
                rule.queries.forEach((query, j) => doprimitive(`r${i}_q${j}`, query, "query", scope));
                rule.actions.forEach((action, j) => doprimitive(`r${i}_a${j}`, action, "action", scope));
                return primlist;
            });

            res.end(JSON.stringify(json));
        }).catch((e) => {
            res.statusCode = 500;
            res.end(JSON.stringify({error:e.message, code:e.code}));
        });
    });
    server.listen(8123);
}
main();
