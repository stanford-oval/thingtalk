// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const stream = require('stream');

const Ast = require('./ast');
const Type = require('./type');
const ThingTalkUtils = require('./utils');
const genValueList = require('./gen_random_value');

const { notifyAction } = require('./generate');
const { optimizeProgram, optimizeFilter } = require('./optimize');
const { typeCheckProgram } = require('./typecheck');

function sample(distribution) {
    let keys = Object.keys(distribution);
    let sums = new Array(keys.length);
    let rolling = 0;
    for (let i = 0; i < keys.length; i++) {
        sums[i] = rolling + distribution[keys[i]];
        rolling = sums[i];
    }

    let total = sums[keys.length-1];
    let choice = Math.random() * total;

    for (let i = 0; i < keys.length; i++) {
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
    'trigger+query+action': 0.5,
    'trigger+null+action': 2,
    'trigger+query+null': 2,
    'trigger+null+null': 1,
    'null+query+action': 1.5,
    'null+query+null': 1,
    'null+null+action': 1,
    // null+null+null: 0
};
const PERMISSION_DEFAULT_COMPOSITION_WEIGHTS = {
    'trigger+query+action': 3,
    'trigger+null+action': 2,
    'trigger+query+null': 2,
    'trigger+null+null': 1,
    'null+query+action': 2,
    'null+query+null': 1,
    'null+null+action': 1,
    // null+null+null: 0

    'star+null+action': 0.5,
    'star+query+action': 0.5,
    'star+query+null': 0.6,
    //'star+null+null': 0.6,

    'trigger+star+action': 0.8,
    'trigger+star+null': 0.9,
    'null+star+action': 0.8,
    //'null+star+null': 0.9,

    'trigger+query+star': 0.1,
    'trigger+null+star': 0.1,
    'null+query+star': 0.1,
    //'null+null+star': 0.1,

    'star+star+action': 0.05,
    //'star+star+null': 0.05,
    'star+query+star': 0.05,
    //'star+null+star': 0.05,
    'trigger+star+star': 0.05,
    //'null+star+star': 0.05,

    // 'star+star+star': 0
};
const REMOTE_PRIMITIVES_DEFAULT_COMPOSITION_WEIGHTS = {
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

function makePermissionFunction(schemaRetriever, schemas, samplingPolicy, schemaType) {
    return chooseInvocation(schemaRetriever, schemas, samplingPolicy, schemaType).then((schema) => {
        let outParams = [];
        for (let name in schema.out)
            outParams.push(Ast.OutputParam('v_' + name, name));
        return Ast.PermissionFunction.Specified(schema.kind, schema.name, Ast.BooleanExpression.True, outParams, schema);
    });
}

function choosePermissionRule(schemaRetriever, schemas, { samplingPolicy, compositionWeights }) {
    var [tform, qform, aform] = sample(compositionWeights).split('+');
    var trigger, query, action;

    if (tform === 'star')
        trigger = Ast.PermissionFunction.Star;
    else if (tform === 'null')
        trigger = Ast.PermissionFunction.Builtin;
    else
        trigger = makePermissionFunction(schemaRetriever, schemas, samplingPolicy, 'triggers');
    if (qform === 'star')
        query = Ast.PermissionFunction.Star;
    else if (qform === 'null')
        query = Ast.PermissionFunction.Builtin;
    else
        query = makePermissionFunction(schemaRetriever, schemas, samplingPolicy, 'queries');
    if (aform === 'star')
        action = Ast.PermissionFunction.Star;
    else if (aform === 'null')
        action = Ast.PermissionFunction.Builtin;
    else
        action = makePermissionFunction(schemaRetriever, schemas, samplingPolicy, 'actions');
    return Promise.all([trigger, query, action]);
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

function genRandomFilter(invocation, applyFiltersToInputs, applyFiltersToOutputs, scope, options) {
    let { applyHeuristics, allowUnsynthesizable, filterClauseProbability } = options;
    let args = invocation.args;

    function getWithTypeFromScope(type) {
        let names = [];
        for (let name in scope) {
            let vtype = scope[name];
            if (vtype.equals(type))
                names.push(Ast.Value.VarRef(name));
        }
        return names;
    }

    function makeFilterClause() {
        let clause = [];
        args.forEach((argname) => {
            let ptype = invocation.inReq[argname] || invocation.inOpt[argname] || invocation.out[argname];
            let type;
            if (ptype.isArray)
                type = ptype.elem;
            else
                type = ptype;
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
            if (applyHeuristics && type.isDate)
                return;

            let valueList = genValueList(argname, type, applyHeuristics);
            if (allowUnsynthesizable)
                valueList = valueList.concat(getWithTypeFromScope(type));
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
                operator = sample(getOpDistribution(ptype, allowUnsynthesizable));
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

function applyFilters(invocation, selector, options, isAction) {
    if (invocation === undefined)
        return null;
    let { allowUnsynthesizable,
          applyFiltersToInputs } = options;

    let outParams = [];

    let filter;
    if (isAction) {
        filter = Ast.BooleanExpression.True;
    } else {
        filter = genRandomFilter(invocation, allowUnsynthesizable && applyFiltersToInputs, true, {}, options);

        for (var name in invocation.out) {
            if (!invocation.out[name].isAny)
                outParams.push(Ast.OutputParam('v_' + name, name));
        }
    }

    var ret= new Ast.RulePart(selector, invocation.name, [],
        filter, outParams, invocation);
    return ret;
}

function mustAvoidDuplicates(value) {
    if (value.isLocation && value.value.isRelative)
        return false;
    if (value.isEnum || value.isBoolean)
        return false;
    if (value.isEntity && value.type === 'tt:device')
        return false;
    if (value.isEvent)
        return false;
    if (value.isUndefined || value.isVarRef)
        return false;
    return true;
}

function stringHash(value) {
    if (value.isEntity)
        return `entity-${value.type}:${value.value}`;
    if (value.isMeasure)
        return `measure-${value.unit}:${value.value}`;
    if (value.isString)
        return `string-"${value.value}"`;
    if (value.isNumber)
        return `num-${value.value}`;
    if (value.isLocation)
        return `loc-lat:${value.value.lat}-lon:${value.value.lon}`;
    if (value.isDate)
        return `date-${value.value.toISOString()}`;
    if (value.isTime)
        return `time-${value.hour}-${value.minute}`;
    throw new TypeError('Should not hash a value of the form ' + value);
}

function chooseValue(valueList, usedValues) {
    let tries = 3;
    while (tries > 0) {
        let value = uniform(valueList);
        if (mustAvoidDuplicates(value)) {
            let hash = stringHash(value);
            if (usedValues.has(hash)) {
                tries--;
                continue;
            }
            usedValues.add(hash);
            return value;
        } else {
            return value;
        }
    }
    return null;
}

function addConstantInputArguments(invocation, to, options, isAction, usedValues) {
    if (invocation === undefined)
        return;
    let { applyHeuristics,
          actionArgConstantProbability,
          argConstantProbability,
          requiredArgConstantProbability } = options;
    let inParams = to.in_params;
    let usedParams = new Set;
    for (let inParam of inParams)
        usedParams.add(inParam.name);

    function addInputArgument(argname, type, argrequired) {
        if (usedParams.has(argname))
            return true;
        if (applyHeuristics && type.isEntity && type.type === 'tt:url' && !argrequired)
            return false;
        if (applyHeuristics && argname.endsWith('_id') && argname !== 'stock_id')
            return false;
        if (applyHeuristics && !argrequired && PARAMS_BLACK_LIST.has(argname))
            return false;
        if (applyHeuristics && argname.startsWith('tournament'))
            return false;

        let valueList = genValueList(argname, type, applyHeuristics);
        if (valueList.length === 0)
            return false;

        if (type.isEnum) {
            inParams.push(Ast.InputParam(argname, uniform(valueList)));
            return true;
        } else {
            let shouldFill = false;

            if (isAction)
                shouldFill = coin(actionArgConstantProbability);
            else if (argrequired)
                shouldFill = coin(requiredArgConstantProbability);
            else
                shouldFill = coin(argConstantProbability);
            if (shouldFill) {
                let value = chooseValue(valueList, usedValues);
                if (value) {
                    inParams.push(Ast.InputParam(argname, value));
                    return true;
                }
            }
        }
        return false;
    }

    for (let argname in invocation.inReq) {
        let type = invocation.inReq[argname];
        if (!addInputArgument(argname, type, true))
            inParams.push(Ast.InputParam(argname, Ast.Value.Undefined(true)));
    }
    for (let argname in invocation.inOpt) {
        let type = invocation.inOpt[argname];
        addInputArgument(argname, type, false);
    }
}

function applyComposition(from, to, { applyHeuristics, allowUnsynthesizable, strictParameterPassing }, isAction) {
    let usedFromArgs = new Set();

    function filterHelper(filter) {
        if (filter.isTrue || filter.isFalse)
            return undefined;
        if (filter.isOr || filter.isAnd)
            return filter.operands.forEach(filterHelper);
        if (filter.isNot)
            return filterHelper(filter.expr);
        if (filter.filter.operator === '=')
            usedFromArgs.add(filter.filter.name);
        return undefined;
    }
    filterHelper(from.filter);
    for (let arg of from.in_params)
        usedFromArgs.add(arg.name);
    let usedToArgs = new Set();
    for (let arg of to.in_params)
        usedToArgs.add(arg.name);


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
            if (strictParameterPassing) {
                if (!toType.equals(fromType))
                    continue;
            } else {
                if (!Type.isAssignable(toType, fromType))
                    continue;
            }

            if (to.schema.inReq[toArg] || isAction)
                distribution[fromArg] = 1.5;
             else
                distribution[fromArg] = 0.5;

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

function createSelector(invocation, remote) {
    if (invocation === undefined)
        return null;

    let selector;
    if (remote) {
        selector = new Ast.Selector.Device(invocation.kind, null, Ast.Value.Entity('person', 'tt:contact_name', 'person'));
    } else {
        selector = new Ast.Selector.Device(invocation.kind, null, null);
    }
    return selector;
}

function genOneRandomRule(schemaRetriever, schemas, options) {
    return chooseRule(schemaRetriever, schemas, options).then(([triggerMeta, queryMeta, actionMeta]) => {
        let trigger = applyFilters(triggerMeta, createSelector(triggerMeta, false), options, false);
        let query = applyFilters(queryMeta, createSelector(queryMeta, false), options, false);
        let action = applyFilters(actionMeta, createSelector(actionMeta, false), options, true);

        if (query && action)
            applyComposition(query, action, options, true);
        if (trigger && query)
            applyComposition(trigger, query, options, false);
        if (trigger && action && !query)
            applyComposition(trigger, action, options, true);
        let usedValues = new Set;
        addConstantInputArguments(triggerMeta, trigger, options, false, usedValues);
        addConstantInputArguments(queryMeta, query, options, false, usedValues);
        addConstantInputArguments(actionMeta, action, options, true, usedValues);

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


function genOneRandomPermissionRule(schemaRetriever, schemas, options) {
    return choosePermissionRule(schemaRetriever, schemas, options).then(([trigger, query, action]) => {
        let scope = {
            __pi: Type.Entity('tt:contact')
        };
        if (trigger.isSpecified) {
            trigger.filter = optimizeFilter(genRandomFilter(trigger.schema, true, true, scope, options));
            for (let outParam of trigger.out_params) {
                let ptype = trigger.schema.inReq[outParam.value] || trigger.schema.inOpt[outParam.value] || trigger.schema.out[outParam.value];
                scope[outParam.name] = ptype;
            }
        }
        if (query.isSpecified) {
            query.filter = optimizeFilter(genRandomFilter(query.schema, true, true, scope, options));
            for (let outParam of query.out_params) {
                let ptype = query.schema.inReq[outParam.value] || query.schema.inOpt[outParam.value] || query.schema.out[outParam.value];
                scope[outParam.name] = ptype;
            }
        }
        if (action.isSpecified)
            action.filter = optimizeFilter(genRandomFilter(action.schema, true, true, scope, options));

        return new Ast.PermissionRule(null, trigger, query, action);
    });
}

function genOneRandomRemoteRule(schemaRetriever, schemas, options) {
    return chooseRule(schemaRetriever, schemas, options).then(([triggerMeta, queryMeta, actionMeta]) => {
        let trigger = applyFilters(triggerMeta, createSelector(triggerMeta, true), options, false);
        let query = applyFilters(queryMeta, createSelector(queryMeta, true), options, false);
        let action = applyFilters(actionMeta, createSelector(actionMeta, true), options, true);

        let usedValues = new Set;
        addConstantInputArguments(triggerMeta, trigger, options, false, usedValues);
        addConstantInputArguments(queryMeta, query, options, false, usedValues);
        addConstantInputArguments(actionMeta, action, options, true, usedValues);

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


const GEN_RULE_DEFAULT_OPTIONS = {
    samplingPolicy: 'uniform',
    compositionWeights: DEFAULT_COMPOSITION_WEIGHTS,
    applyHeuristics: true,
    allowUnsynthesizable: false,
    applyFiltersToInputs: false,
    strictParameterPassing: false,
    filterClauseProbability: 0.2,
    actionArgConstantProbability: 0.3,
    argConstantProbability: 0.1,
    requiredArgConstantProbability: 0.6
};
const GEN_PERMISSIONS_DEFAULT_OPTIONS = {
    samplingPolicy: 'uniform',
    compositionWeights: PERMISSION_DEFAULT_COMPOSITION_WEIGHTS,
    applyHeuristics: true,
    allowUnsynthesizable: true,
    applyFiltersToInputs: false,
    filterClauseProbability: 0.2,
    actionArgConstantProbability: 0.3,
    argConstantProbability: 0.1,
    requiredArgConstantProbability: 0.6
};
const GEN_REMOTE_PRIMITIVES_DEFAULT_OPTIONS = {
    samplingPolicy: 'uniform',
    compositionWeights: REMOTE_PRIMITIVES_DEFAULT_COMPOSITION_WEIGHTS,
    applyHeuristics: true,
    allowUnsynthesizable: false,
    applyFiltersToInputs: false,
    filterClauseProbability: 0.2,
    actionArgConstantProbability: 0.3,
    argConstantProbability: 0.1,
    requiredArgConstantProbability: 0.6
};


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
    for (let name in GEN_RULE_DEFAULT_OPTIONS) {
        if (options[name] === undefined)
            options[name] = GEN_RULE_DEFAULT_OPTIONS[name];
    }

    return makeStream(N, (i) => genOneRandomRule(schemaRetriever, allSchemas, options));
}

function genRandomPermissionRule(allSchemas, schemaRetriever, N = 10, options = {}) {
    for (let name in GEN_PERMISSIONS_DEFAULT_OPTIONS) {
        if (options[name] === undefined)
            options[name] = GEN_PERMISSIONS_DEFAULT_OPTIONS[name];
    }

    return makeStream(N, (i) => genOneRandomPermissionRule(schemaRetriever, allSchemas, options));
}

function genRandomRemoteRules(allSchemas, schemaRetriever, N = 10, options = {}) {
    for (let name in GEN_REMOTE_PRIMITIVES_DEFAULT_OPTIONS) {
        if (options[name] === undefined)
            options[name] = GEN_REMOTE_PRIMITIVES_DEFAULT_OPTIONS[name];
    }

    return makeStream(N, (i) => genOneRandomRemoteRule(schemaRetriever, allSchemas, options));
}


module.exports = {
    genRandomRules,
    genRandomPermissionRule,
    genRandomRemoteRules
};
