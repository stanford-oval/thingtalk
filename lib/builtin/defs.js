// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import Type from '../type';
import * as fndef from '../ast/function_def';

// Definitions of ThingTalk operators

/**
 * Definition of a ThingTalk operator.
 *
 * @typedef Builtin.OpDefinition
 * @property {Type[][]} types - the possible overloads of this operator; each array
 *           member is an overload: the first N-1 elements are the input types and the last
 *           is the result type
 * @property {Callable} [overload] - compute which implementation to use for a given overload
 * @property {string} [op] - a JavaScript operator that implement this ThingTalk operator
 * @property {string} [fn] - a function in the {@link Builtin} namespace that implements this operator
 * @package
 */

/**
 * Definitions (type signatures) of ThingTalk binary comparison operators.
 *
 * @alias Builtin.BinaryOps
 * @constant
 * @package
 * @type {Object.<string, Builtin.OpDefinition>}
 */
export const BinaryOps = {
    '>=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [new Type.Measure(''), new Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean],
                [Type.Time, Type.Time, Type.Boolean],
                [Type.Currency, Type.Currency, Type.Boolean]],
        op: '>='
    },
    '<=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [new Type.Measure(''), new Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean],
                [Type.Time, Type.Time, Type.Boolean],
                [Type.Currency, Type.Currency, Type.Boolean]],
        op: '<='
    },
    '==': {
        types: [['a', 'a', Type.Boolean]],
        fn: 'equality',
    },
    '=~': {
        types: [[Type.String, Type.String, Type.Boolean],
                [new Type.Entity(''), Type.String, Type.Boolean]],
        fn: 'like',
    },
    '~=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.String, new Type.Entity(''), Type.Boolean]],
        fn: 'like',
        flip: true
    },
    starts_with: {
        types: [[Type.String, Type.String, Type.Boolean]],
        fn: 'startsWith',
    },
    ends_with: {
        types: [[Type.String, Type.String, Type.Boolean]],
        fn: 'endsWith',
    },
    prefix_of: {
        types: [[Type.String, Type.String, Type.Boolean]],
        fn: 'startsWith',
        flip: true
    },
    suffix_of: {
        types: [[Type.String, Type.String, Type.Boolean]],
        fn: 'endsWith',
        flip: true
    },

    /**
     * `contains`: array containment with equality
     *
     * `contains(a, b) = ∃ x. x ∈ a && b == x`
     */
    'contains': {
        types: [[new Type.Array('a'), 'a', Type.Boolean],
                [Type.RecurrentTimeSpecification, Type.Date, Type.Boolean],
                [Type.RecurrentTimeSpecification, Type.Time, Type.Boolean]],
        overload: (t1, t2, t3) => {
            if (t1 === Type.RecurrentTimeSpecification)
                return { fn: 'recurrentTimeSpecContains' };
            else
                return { fn: 'contains' };
        }
    },
    /**
     * `in_array`: array membership with equality
     *
     * `in_array(a, b) = ∃ x. x ∈ b && a == x`
     *
     * NOTE (Thm): `in_array(a, [x1, x2, ... xn]) = a == x1 || a == x2 || ... || x == xn`
     */
    'in_array': {
        types: [['a', new Type.Array('a'), Type.Boolean]],
        fn: 'contains',
        flip: true
    },
    /**
     * `contains~`: array containment with similarity
     *
     * `contains~(a, b) = ∃ x. x ∈ a && b =~ x`
     */
    'contains~': {
        types: [[new Type.Array(Type.String), Type.String, Type.Boolean],
                [new Type.Array(new Type.Entity('')), Type.String, Type.Boolean]],
        fn: 'containsLike',
    },
    /**
     * `in_array~`: array membership with similarity
     *
     * `in_array~(a, b) = ∃ x. x ∈ b && x =~ a`
     *
     * NOTE (Thm): `in_array~(a, [x1, x2, ... xn]) = x1 =~ a || x2 =~ a || ... || xn =~ a`
     */
    'in_array~': {
        types: [[Type.String, new Type.Array(Type.String), Type.Boolean],
                [new Type.Entity(''), new Type.Array(Type.String), Type.Boolean]],
        fn: 'inArrayLike',
    },
    /**
     * `~contains`: reverse array containment with similarity
     *
     * `~contains(a, b) = ∃ x. x ∈ a && b ~= x`
     *
     * NOTE (Thm): `~contains(a, b) = in_array~(b, a)`
     */
    '~contains': {
        types: [[new Type.Array(Type.String), Type.String, Type.Boolean],
                [new Type.Array(Type.String), new Type.Entity(''), Type.Boolean]],
        fn: 'inArrayLike',
        flip: true,
    },
    /**
     * `~in_array`: array membership with similarity
     *
     * `~in_array(a, b) = ∃ x. x ∈ b && x ~= a`
     *
     * NOTE (Thm): `~in_array(a, b) = contains~(b, a)`
     */
    '~in_array': {
        types: [[Type.String, new Type.Array(Type.String), Type.Boolean],
                [Type.String, new Type.Array(new Type.Entity('')), Type.Boolean]],
        fn: 'containsLike',
        flip: true,
    },
    'has_member': {
        types: [[new Type.Entity('tt:contact_group'), new Type.Entity('tt:contact'), Type.Boolean]],
    },
    'group_member': {
        types: [[new Type.Entity('tt:contact'), new Type.Entity('tt:contact_group'), Type.Boolean]],
    }
};

/**
 * Definitions (type signatures) of ThingTalk unary operators.
 *
 * @alias Builtin.UnaryOps
 * @constant
 * @package
 * @type {Object.<string, Builtin.OpDefinition>}
 */
export const UnaryOps = {
    '!': {
        types: [[Type.Boolean, Type.Boolean]],
        op: '!'
    },
    'is_not_null': {
        types: [[Type.Any, Type.Boolean]],
        fn: 'is_not_null'
    },
    'get_time': {
        types: [[Type.Date, Type.Time]],
        fn: 'getTime'
    },
    'get_currency': {
        types: [[Type.Number, Type.Currency]],
        fn: 'getCurrency'
    }
};

/**
 * Definitions (type signatures) of ThingTalk scalar operators.
 *
 * @alias Builtin.ScalarExpressionOps
 * @constant
 * @package
 * @type {Object.<string, Builtin.OpDefinition>}
 */
export const ScalarExpressionOps = {
    '+': {
        types: [[Type.String, Type.String, Type.String],
                [Type.Number, Type.Number, Type.Number],
                [Type.Currency, Type.Currency, Type.Currency],
                [new Type.Measure(''), new Type.Measure(''), new Type.Measure('')],
                [Type.Date, new Type.Measure('ms'), Type.Date],
                [Type.Time, new Type.Measure('ms'), Type.Time]],
        overload: (t1, t2, t3) => {
            if (t1 === Type.Date)
                return { fn: 'dateAdd' };
            else if (t1 === Type.Time)
                return { fn: 'timeAdd' };
            else
                return { op: '+' };
        }
    },
    '-': {
        types: [[Type.Number, Type.Number, Type.Number],
                [Type.Currency, Type.Currency, Type.Currency],
                [new Type.Measure(''), new Type.Measure(''), new Type.Measure('')],
                [Type.Date, new Type.Measure('ms'), Type.Date],
                [Type.Time, new Type.Measure('ms'), Type.Time]],
        op: '-',
        overload: (t1, t2, t3) => {
            if (t1 === Type.Date)
                return { fn: 'dateSub' };
            else if (t1 === Type.Time)
                return { fn: 'timeSub' };
            else
                return { op: '-' };
        }
    },
    '*': {
        types: [[Type.Number, Type.Number, Type.Number],
                [Type.Currency, Type.Number, Type.Currency],
                [new Type.Measure(''), Type.Number, new Type.Measure('')]],
        op: '*'
    },
    '/': {
        types: [[Type.Number, Type.Number, Type.Number],
                [Type.Currency, Type.Number, Type.Currency],
                [new Type.Measure(''), Type.Number, new Type.Measure('')]],
        op: '/'
    },
    '%': {
        types: [[Type.Number, Type.Number, Type.Number]],
        op: '%'
    },
    '**': {
        types: [[Type.Number, Type.Number, Type.Number]],
        op: '**'
    },
    'distance': {
        types: [[Type.Location, Type.Location, new Type.Measure('m')]],
        fn: 'distance'
    },
    'max': {
        types: [[new Type.Array(Type.Number), Type.Number],
                [new Type.Array(Type.Currency), Type.Currency],
                [new Type.Array(new Type.Measure('')), new Type.Measure('')]],
        fn: 'aggregateMax',
    },
    'min': {
        types: [[new Type.Array(Type.Number), Type.Number],
                [new Type.Array(Type.Currency), Type.Currency],
                [new Type.Array(new Type.Measure('')), new Type.Measure('')]],
        fn: 'aggregateMin',
    },
    'sum': {
        types: [[new Type.Array(Type.Number), Type.Number],
                [new Type.Array(Type.Currency), Type.Currency],
                [new Type.Array(new Type.Measure('')), new Type.Measure('')]],
        fn: 'aggregateSum',
    },
    'avg': {
        types: [[new Type.Array(Type.Number), Type.Number],
                [new Type.Array(Type.Currency), Type.Currency],
                [new Type.Array(new Type.Measure('')), new Type.Measure('')]],
        fn: 'aggregateAvg',
    },
    'count': {
        types: [[new Type.Array('x'), Type.Number]],
        fn: 'count',
    }
};

/**
 * Definitions (type signatures) of ThingTalk aggregation operators.
 *
 * @alias Builtin.Aggregations
 * @constant
 * @package
 * @type {Object.<string, Builtin.OpDefinition>}
 */
export const Aggregations = {
    'max': {
        types: [[Type.Number, Type.Number],
                [Type.Currency, Type.Currency],
                [new Type.Measure(''), new Type.Measure('')]]
    },
    'min': {
        types: [[Type.Number, Type.Number],
                [Type.Currency, Type.Currency],
                [new Type.Measure(''), new Type.Measure('')]]
    },
    'sum': {
        types: [[Type.Number, Type.Number],
                [Type.Currency, Type.Currency],
                [new Type.Measure(''), new Type.Measure('')]]
    },
    'avg': {
        types: [[Type.Number, Type.Number],
                [Type.Currency, Type.Currency],
                [new Type.Measure(''), new Type.Measure('')]]
    },
    'count': {
        types: [[Type.Any, Type.Number]]
    }
};

function builtinFunction(name) {
    return new fndef.FunctionDef(null, 'action', null, name, [], {}, [], {});
}
/**
 * Definitions (type signatures) of builtin ThingTalk actions.
 *
 * These are the actions that can be called with a {@link Ast.Selector.Builtin}
 * selector.
 *
 * @alias Builtin.Actions
 * @constant
 * @package
 * @type {Object.<string, Ast.FunctionDef>}
 */
export const Actions = {
    'notify': builtinFunction('notify'),
    'return': builtinFunction('return'),
    'save': builtinFunction('save'),
};
/**
 * Definitions (type signatures) of builtin ThingTalk queries.
 *
 * These are the queries that can be called with a {@link Ast.Selector.Builtin}
 * selector. In this version of ThingTalk, there are no such queries.
 *
 * @alias Builtin.Queries
 * @constant
 * @package
 * @type {Object.<string, Ast.FunctionDef>}
 */
export const Queries = {
};
