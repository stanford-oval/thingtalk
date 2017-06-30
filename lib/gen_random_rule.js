// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const stream = require('stream');

const Ast = require('./ast');
const Type = require('./type');
const ThingTalkUtils = require('./utils');
const genValueList = require('./gen_random_value');

const { notifyAction } = require('./generate');
const { optimizeProgram } = require('./optimize');
const { typeCheckProgram } = require('./typecheck');

function sample(distribution) {
    var keys = Object.keys(distribution);
    var sums = new Array(keys.length);
    var rolling = 0;
    for (var i = 0; i < keys.length; i++) {
        sums[i] = rolling + distribution[keys[i]];
        rolling = sums[i];
    }

    var total = sums[keys.length-1];
    var choice = Math.random() * total;

    for (var i = 0; i < keys.length; i++) {
        if (choice <= sums[i])
            return keys[i];
    }
    return keys[keys.length-1];
}

function uniform(array) {
    return array[Math.floor(Math.random()*array.length)];
}

function coin(bias) {
    return Math.random() < bias;
}

const DEFAULT_COMPOSITION_WEIGHTS = {
    'trigger+null+action': 1.5,
    'null+query+action': 1,
    'trigger+null+query': 0.5,
    'trigger+action+query': 1,
    'trigger+null+null': 1,
    'null+query+null': 1,
    'null+null+action': 1,
};

function chooseSchema(allSchemas, policy) {
    if (policy.startsWith('only-'))
        return policy.substr('only-'.length);

    if (policy === 'uniform')
        return uniform(allSchemas);

    throw new Error('Unknown sampling policy ' + policy);
}

function chooseChannel(schemaRetriever, kind, form) {
    return schemaRetriever.getFullMeta(kind).then((fullMeta) => {
        var options = [];
        if (form[0] !== 'null' && Object.keys(fullMeta['triggers']).length !== 0) options.push('trigger');
        if (form[1] !== 'null' && Object.keys(fullMeta['queries']).length !== 0) options.push('query');
        if (form[2] !== 'null' && Object.keys(fullMeta['actions']).length !== 0) options.push('action');
        if (options.length === 0)
            return 'null';
        else
            return uniform(options);
    });
}

function chooseInvocation(schemaRetriever, schemas, samplingPolicy, channelType) {
    var kind = chooseSchema(schemas, samplingPolicy);
    return schemaRetriever.getFullMeta(kind).then((fullMeta) => {
        var channels = fullMeta[channelType];
        var choices = Object.keys(channels);
        if (choices.length === 0) // no channels of this type for this schema, try again
            return chooseInvocation(schemaRetriever, schemas, samplingPolicy, channelType);

        var channelName = uniform(choices);
        channels[channelName].schema = channels[channelName].schema.map((t) => Type.fromString(t));
        var result = ThingTalkUtils.splitArgsForSchema(channels[channelName], channelType, true);
        result.kind = kind;
        result.name = channelName;
        return result;
    });
}

function chooseRule(schemaRetriever, schemas, { samplingPolicy, compositionWeights }) {
    var form = sample(compositionWeights).split('+');
    var trigger, query, action;
    if (!samplingPolicy.startsWith('only-')) {
        trigger = form[0] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'triggers');
        query = form[1] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'queries');
        action = form[2] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'actions');
        return Promise.all([trigger, query, action]);
    } else {
        var kind = samplingPolicy.substr('only-'.length);
        trigger = form[0] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, 'uniform', 'triggers');
        query = form[1] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, 'uniform', 'queries');
        action = form[2] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, 'uniform', 'actions');
        return chooseChannel(schemaRetriever, kind, form).then((channel) => {
            if (channel === 'trigger')
                trigger = chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'triggers');
            else if (channel === 'query')
                query = chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'queries');
            else if (channel === 'action')
                action = chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'actions');
            else
                throw new TypeError('Cannot construct a rule with kind ' + kind + ' (it has no trigger, query or action)');
            return Promise.all([trigger, query, action]);
        });
    }
}

const NUMBER_OP_WEIGHTS = {
    '=': 0.5,
    '>': 1,
    '<': 1,
    '': 2
};
const UNSYNTHESIZABLE_OP_WEIGHTS = {
    '=': 0.5,
    '>': 1,
    '<': 1,
    '>=': 1,
    '<=': 1,
    '': 2
};

const ARRAY_OP_WEIGHTS = {
    'contains': 1,
    '': 2
};

const STRING_OP_WEIGHTS = {
    '=': 1,
    '=~': 1,
    '': 2
};

const OTHER_OP_WEIGHTS = {
    '=': 1,
    '': 2
};

// params should never be assigned unless it's required
const PARAMS_BLACK_LIST = new Set([
    'company_name', 'weather', 'currency_code', 'orbiting_body',
    'home_name', 'away_name', 'home_alias', 'away_alias',
    'watched_is_home', 'scheduled_time', 'game_status',
    'home_points', 'away_points', // should be replaced by watched_points, other_points eventually
    'day',
    'bearing', 'updateTime', //gps
    'deep', 'light', 'rem', 'awakeTime', 'asleepTime', // sleep tracker
    'yield', 'div', 'pay_date', 'ex_div_date', // yahoo finance
    'cloudiness', 'fog',
    'formatted_name', 'headline', // linkedin
    'video_id',
    'image_id',
    '__reserved', // twitter
    'uber_type',
    'count',
    'timestamp', //slack
    'last_modified', 'full_path', 'total', // dropbox
    'estimated_diameter_min', 'estimated_diameter_max',
    'translated_text',
    'sunset', 'sunrise',
    'name' //nasa, meme
]);

// params should use operator is
const PARAMS_OP_IS = new Set([
    'filter', 'source_language', 'target_language', 'detected_language',
    'from_name', 'uber_type',
]);

// params should use operator contain
const PARAMS_OP_CONTAIN = new Set([
    'snippet'
]);

// params should use operator greater
const PARAMS_OP_GREATER = new Set([
    'file_size'
]);

// rhs params should not be assigned by a value from lhs
const PARAMS_BLACKLIST_RHS = new Set([
    'file_name', 'new_name', 'old_name', 'folder_name', 'repo_name',
    'home_name', 'away_name', 'purpose'
]);

// lhs params should not be assigned to a parameter in the rhs
const PARAMS_BLACKLIST_LHS = new Set([
    'orbiting_body', 'camera_used'
]);

function getOpDistribution(type, allowUnsynthesizable) {
    if (type.isNumber || type.isMeasure)
        return allowUnsynthesizable ? UNSYNTHESIZABLE_OP_WEIGHTS : NUMBER_OP_WEIGHTS;
    if (type.isArray)
        return ARRAY_OP_WEIGHTS;
    if (type.isString)
        return STRING_OP_WEIGHTS;
    return OTHER_OP_WEIGHTS;
}

function genRandomFilter(invocation, applyFiltersToInputs, applyFiltersToOutputs, options) {
    let { applyHeuristics, allowUnsynthesizable, filterClauseProbability } = options;
    let args = invocation.args;

    function makeFilterClause() {
        let clause = [];
        args.forEach((argname) => {
            let type = invocation.inReq[argname] || invocation.inOpt[argname] || invocation.out[argname];
            let isInput = !!(invocation.inReq[argname] || invocation.inOpt[argname]);
            if (isInput) {
                if (!applyFiltersToInputs)
                    return;
            } else {
                if (!applyFiltersToOutputs)
                    return;
            }
            if (applyHeuristics && type.isEntity && type.type === 'tt:url')
                return;
            if (applyHeuristics && argname.endsWith('_id') && argname !== 'stock_id')
                return;
            if (applyHeuristics && PARAMS_BLACK_LIST.has(argname))
                return;
            if (applyHeuristics && argname.startsWith('tournament'))
                return;

            let valueList = genValueList(argname, type, applyHeuristics);
            if (valueList.length === 0)
                return;

            let operator;
            if (applyHeuristics && PARAMS_OP_IS.has(argname))
                operator = '=';
            else if (applyHeuristics && PARAMS_OP_CONTAIN.has(argname))
                operator = '=~';
            else if (applyHeuristics && PARAMS_OP_GREATER.has(argname))
                operator = '>';
            else
                operator = sample(getOpDistribution(type, allowUnsynthesizable));
            if (operator)
                clause.push(Ast.BooleanExpression.Atom(Ast.Filter(argname, operator, uniform(valueList))));
        });
        if (clause.length === 0)
            return Ast.BooleanExpression.True;
        return Ast.BooleanExpression.And(clause);
    }


    let filterClauses = [makeFilterClause()];
    if (allowUnsynthesizable && !filterClauses[0].isTrue) {
        while (coin(filterClauseProbability)) {
            let clause = makeFilterClause();
            while (clause.isTrue)
                clause = makeFilterClause();
            filterClauses.push(clause);
        }
    }

    return filterClauses.length === 1 ? filterClauses[0] : Ast.BooleanExpression.Or(filterClauses);
}

function applyFilters(invocation, options, isAction) {
    if (invocation === undefined)
        return null;
    let { applyHeuristics,
          allowUnsynthesizable,
          applyFiltersToInputs,
          actionArgConstantProbability,
          argConstantProbability,
          requiredArgConstantProbability,
          filterClauseProbability } = options;

    let outParams = [];

    let filter;
    if (isAction) {
        filter = Ast.BooleanExpression.True;
    } else {
        filter = genRandomFilter(invocation, allowUnsynthesizable && applyFiltersToInputs, true, options);

        for (var name in invocation.out) {
            if (!invocation.out[name].isAny)
                outParams.push(Ast.OutputParam('v_' + name, name));
        }
    }

    var ret= new Ast.RulePart(Ast.Selector.Device(invocation.kind, null, null), invocation.name, [],
        filter, outParams, invocation);
    return ret;
}

function addConstantInputArguments(invocation, to, options, isAction) {
    if (invocation === undefined)
        return;
    let { applyHeuristics,
          allowUnsynthesizable,
          applyFiltersToInputs,
          actionArgConstantProbability,
          argConstantProbability,
          requiredArgConstantProbability,
          filterClauseProbability } = options;
    let inParams = to.in_params;

    function addInputArgument(argname, type, argrequired) {
        if (applyHeuristics && type.isEntity && type.type === 'tt:url' && !argrequired)
            return;
        if (applyHeuristics && argname.endsWith('_id') && argname !== 'stock_id')
            return;
        if (applyHeuristics && !argrequired && PARAMS_BLACK_LIST.has(argname))
            return;
        if (applyHeuristics && argname.startsWith('tournament'))
            return;

        let valueList = genValueList(argname, type, applyHeuristics);
        if (valueList.length === 0)
            return;

        if (type.isEnum) {
            inParams.push(Ast.InputParam(argname, uniform(valueList)));
        } else if (isAction) {
            if (coin(actionArgConstantProbability)) inParams.push(Ast.InputParam(argname, uniform(valueList)));
            else inParams.push(Ast.InputParam(argname, Ast.Value.Undefined(true)));
        } else if (argrequired) {
            if (coin(requiredArgConstantProbability)) inParams.push(Ast.InputParam(argname, uniform(valueList)));
            else inParams.push(Ast.InputParam(argname, Ast.Value.Undefined(true)));
        } else {
            if (coin(argConstantProbability)) inParams.push(Ast.InputParam(argname, uniform(valueList)));
        }
    }

    for (let argname in invocation.inReq) {
        let type = invocation.inReq[argname];
        addInputArgument(argname, type, true);
    }
    for (let argname in invocation.inOpt) {
        let type = invocation.inOpt[argname];
        addInputArgument(argname, type, false);
    }
}

function applyComposition(from, to, { applyHeuristics, allowUnsynthesizable }, isAction) {
    let usedFromArgs = new Set();

    function filterHelper(filter) {
        if (filter.isTrue || filter.isFalse)
            return;
        if (filter.isOr || filter.isAnd)
            return filter.operands.forEach(filterHelper);
        if (filter.isNot)
            return filterHelper(filter.expr);
        if (filter.filter.operator === '=')
            usedFromArgs.add(filter.filter.name);
    }
    filterHelper(from.filter);
    for (let arg of from.in_params)
        usedFromArgs.add(arg.name);
    let usedToArgs = new Set();
    for (let arg of to.in_params) {
        usedToArgs.add(arg.name);
    }

    let fromArgs = from.schema.args.filter((arg) => from.schema.out[arg] && !usedFromArgs.has(arg));
    let toArgs = to.schema.args.filter((arg) => ((to.schema.inReq[arg] || to.schema.inOpt[arg]) && !usedToArgs.has(arg)));

    for (let toArg of toArgs) {
        let toType = to.schema.inReq[toArg] || to.schema.inOpt[toArg];
        let distribution = {};

        // don't pass numbers
        if (applyHeuristics && toType.isNumber)
            continue;
        if (applyHeuristics && PARAMS_BLACKLIST_RHS.has(toArg))
            continue;
        if (toType.isAny)
            continue;

        distribution[''] = 0.5;

        for (let fromArg of fromArgs) {
            let fromType = from.schema.out[fromArg];

            if (applyHeuristics && fromArg.endsWith('_id'))
                continue;
            if (applyHeuristics && PARAMS_BLACKLIST_LHS.has(fromArg))
                continue;
            if (fromType.isAny)
                continue;

            if (to.schema.inReq[toArg] || isAction) {
                if (Type.isAssignable(toType, fromType))
                    distribution[fromArg] = 1.5;
            } else {
                if (Type.isAssignable(toType, fromType))
                    distribution[fromArg] = 0.5;
            }
        }
        // only pass $event when for 'message' and 'status'
        if (applyHeuristics) {
            if (toType.isString && (toArg === 'message' || toArg === 'status'))
                distribution['$event'] = 0.1;
        } else {
            //if (toType.isString)
            //    distribution['$event'] = 0;
        }
        let chosen = sample(distribution);
        if (!chosen)
            continue;
        if (chosen === '$event')
            to.in_params.push(Ast.InputParam(toArg, Ast.Value.Event(null)));
        else
            to.in_params.push(Ast.InputParam(toArg, Ast.Value.VarRef('v_' + chosen)));
    }
}

const DEBUG = true;

function genOneRandomRule(schemaRetriever, schemas, options) {
    return chooseRule(schemaRetriever, schemas, options).then(([triggerMeta, queryMeta, actionMeta]) => {
        let trigger = applyFilters(triggerMeta, options, false);
        let query = applyFilters(queryMeta, options, false);
        let action = applyFilters(actionMeta, options, true);

        if (query && action)
            applyComposition(query, action, options, true);
        if (trigger && query)
            applyComposition(trigger, query, options, false);
        if (trigger && action && !query)
            applyComposition(trigger, action, options, true);
        addConstantInputArguments(triggerMeta, trigger, options, false);
        addConstantInputArguments(queryMeta, query, options, false);
        addConstantInputArguments(actionMeta, action, options, true);

        let rule = new Ast.Rule(trigger, query ? [query] : [], [action || notifyAction()], false);

        return optimizeProgram(new Ast.Program('AlmondGenerated', [], [], [rule]));
    }).then((prog) => {
        if (!DEBUG)
            return prog;
        return typeCheckProgram(prog, schemaRetriever).then(() => prog).catch((e) => {
            console.error('Program does not typecheck');
            console.error(Ast.prettyprint(prog, false));
            throw e;
        });
    });
}


function genOneRandomAllowed(schemaRetriever, schemas, options) {
    let samplingPolicy = options.samplingPolicy;
    let channelType = uniform(['trigger', 'query', 'action']);

    let invocation;
    if (channelType === 'trigger')
        invocation = chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'triggers');
    else if (channelType === 'query')
        invocation = chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'queries');
    else if (channelType === 'action')
        invocation = chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'actions');
    return invocation.then((invocation) => {
        let precondition = genRandomFilter(invocation, true, false, options);
        let postcondition = genRandomFilter(invocation, false, true, options);

        return Ast.Allowed(invocation.kind, invocation.name, channelType, precondition, postcondition, invocation);
    });
}

const DEFAULT_OPTIONS = {
    samplingPolicy: 'uniform',
    compositionWeights: DEFAULT_COMPOSITION_WEIGHTS,
    applyHeuristics: true,
    allowUnsynthesizable: false,
    applyFiltersToInputs: false,
    filterClauseProbability: 0.2,
    actionArgConstantProbability: 0.3,
    argConstantProbability: 0.1,
    requiredArgConstantProbability: 0.6
}

function makeStream(N, next) {
    var i = 0;
    return new stream.Readable({
        objectMode: true,

        read() {
            if (i === N) {
                this.push(null);
                return;
            }
            i++;
            next(i).then((rule) => {
                this.push(rule);
                return null;
            }, (e) => {
                console.error(e);
                setImmediate(() => this.emit('error', e));
            });
        }
    });
}

function genRandomRules(allSchemas, schemaRetriever, N = 10, options = {}) {
    for (let name in DEFAULT_OPTIONS) {
        if (options[name] === undefined)
            options[name] = DEFAULT_OPTIONS[name];
    }

    return makeStream(N, (i) => genOneRandomRule(schemaRetriever, allSchemas, options));
}

function genRandomAllowed(allSchemas, schemaRetriever, N = 10, options = {}) {
    for (let name in DEFAULT_OPTIONS) {
        if (options[name] === undefined)
            options[name] = DEFAULT_OPTIONS[name];
    }

    return makeStream(N, (i) => genOneRandomAllowed(schemaRetriever, allSchemas, options));
}

module.exports = {
    genRandomRules,
    genRandomAllowed
};
