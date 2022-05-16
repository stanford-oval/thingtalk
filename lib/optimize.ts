// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
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

import assert from 'assert';
import NodeVisitor from './ast/visitor';
import * as Ast from './ast';

import List from './utils/list';
import {
    isUnaryExpressionOp,
    flipOperator,
    getScalarExpressionName
} from './utils';

function flattenAnd(expr : Ast.BooleanExpression) : Ast.BooleanExpression[] {
    const flattened = [];
    if (expr instanceof Ast.AndBooleanExpression) {
        for (const op of expr.operands) {
            const operands = flattenAnd(op);
            operands.forEach((op) => assert(op instanceof Ast.BooleanExpression));
            for (const subop of operands)
                flattened.push(subop);
        }
    } else {
        flattened.push(expr);
    }
    return flattened;
}

function flattenOr(expr : Ast.BooleanExpression) : Ast.BooleanExpression[] {
    const flattened = [];
    if (expr instanceof Ast.OrBooleanExpression) {
        for (const op of expr.operands) {
            const operands = flattenOr(op);
            operands.forEach((op) => assert(op instanceof Ast.BooleanExpression));
            for (const subop of operands)
                flattened.push(subop);
        }
    } else {
        flattened.push(expr);
    }
    return flattened;
}

function compareList<T>(one : List<T>, two : List<T>) : -1|0|1 {
    const oneit = one[Symbol.iterator](), twoit = two[Symbol.iterator]();

    for (;;) {
        const onev = oneit.next(), twov = twoit.next();
        if (onev.done && twov.done)
            return 0;
        if (onev.done)
            return -1;
        if (twov.done)
            return 1;
        if (String(onev.value) < String(twov.value))
            return -1;
        if (String(twov.value) < String(onev.value))
            return 1;
    }
}

// compare according to the lexicographic representation
function compareBooleanExpression(one : Ast.BooleanExpression, two : Ast.BooleanExpression) {
    return compareList(one.toSource(), two.toSource());
}

function optimizeFilter(expr : Ast.BooleanExpression) : Ast.BooleanExpression {
    if (expr.isTrue || expr.isFalse || expr.isDontCare)
        return expr;
    if (expr instanceof Ast.AndBooleanExpression) {
        const operands = flattenAnd(expr).map((o) => optimizeFilter(o)).filter((o) => !o.isTrue);
        operands.forEach((op) => assert(op instanceof Ast.BooleanExpression));
        operands.sort(compareBooleanExpression);
        for (const o of operands) {
            if (o.isFalse)
                return Ast.BooleanExpression.False;
        }
        if (operands.length === 0)
            return Ast.BooleanExpression.True;
        if (operands.length === 1)
            return operands[0];
        return new Ast.BooleanExpression.And(expr.location, operands);
    }
    if (expr instanceof Ast.OrBooleanExpression) {
        const operands = flattenOr(expr).map((o) => optimizeFilter(o)).filter((o) => !o.isFalse);
        operands.forEach((op) => assert(op instanceof Ast.BooleanExpression));
        operands.sort(compareBooleanExpression);
        for (const o of operands) {
            if (o.isTrue)
                return Ast.BooleanExpression.True;
        }
        if (operands.length === 0)
            return Ast.BooleanExpression.False;
        if (operands.length === 1)
            return operands[0];

        // convert "x == foo || x == bar" to "x in_array [foo, bar]"
        // and "x =~ foo || x =~ bar" to "x in_array~ [foo, bar]"
        const equalityFilters : { [key : string] : Ast.Value[] } = {};
        const likeFilters : { [key : string] : Ast.Value[] } = {};
        const otherFilters : Ast.BooleanExpression[] = [];
        for (const operand of operands) {
            if (operand instanceof Ast.AtomBooleanExpression) {
                if (operand.operator === '==') {
                    if (operand.name in equalityFilters)
                        equalityFilters[operand.name].push(operand.value);
                    else
                        equalityFilters[operand.name] = [operand.value];
                } else if (operand.operator === '=~') {
                    if (operand.name in likeFilters)
                        likeFilters[operand.name].push(operand.value);
                    else
                        likeFilters[operand.name] = [operand.value];
                } else {
                    otherFilters.push(operand);
                }
            } else {
                otherFilters.push(operand);
            }
        }
        for (const eqParam in equalityFilters) {
            if (equalityFilters[eqParam].length > 1) {
                otherFilters.push(new Ast.BooleanExpression.Atom(expr.location, eqParam, 'in_array',
                    new Ast.Value.Array(equalityFilters[eqParam])));
            } else {
                otherFilters.push(new Ast.BooleanExpression.Atom(expr.location, eqParam, '==', equalityFilters[eqParam][0]));
            }
        }
        for (const eqParam in likeFilters) {
            if (likeFilters[eqParam].length > 1) {
                otherFilters.push(new Ast.BooleanExpression.Atom(expr.location, eqParam, 'in_array~',
                    new Ast.Value.Array(likeFilters[eqParam])));
            } else {
                otherFilters.push(new Ast.BooleanExpression.Atom(expr.location, eqParam, '=~', likeFilters[eqParam][0]));
            }
        }

        return new Ast.BooleanExpression.Or(expr.location, otherFilters);
    }
    if (expr instanceof Ast.NotBooleanExpression) {
        if (expr.expr instanceof Ast.NotBooleanExpression) // double negation
            return optimizeFilter(expr.expr.expr);

        const subexpr = optimizeFilter(expr.expr);
        if (subexpr.isTrue)
            return Ast.BooleanExpression.False;
        if (subexpr.isFalse)
            return Ast.BooleanExpression.True;
        return new Ast.BooleanExpression.Not(expr.location, subexpr);
    }
    if (expr instanceof Ast.ExternalBooleanExpression) {
        const subfilter = optimizeFilter(expr.filter);
        if (subfilter.isFalse)
            return Ast.BooleanExpression.False;
        // NOTE: it does not hold that if subfilter is True
        // the whole expression is true, because the invocation
        // might return no results!
        return new Ast.BooleanExpression.External(expr.location, expr.selector,
            expr.channel, expr.in_params, subfilter, expr.schema);
    }
    if (expr instanceof Ast.ExistentialSubqueryBooleanExpression) {
        return new Ast.BooleanExpression.ExistentialSubquery(
            expr.location,
            optimizeExpression(expr.subquery)
        );
    }
    if (expr instanceof Ast.ComputeBooleanExpression) {
        const lhs = expr.lhs;
        const rhs = expr.rhs;
        const op = expr.operator;

        // convert to atom filters if possible (easier to deal with as slots)
        if (lhs instanceof Ast.VarRefValue && !lhs.name.startsWith('__const_')) {
            return optimizeFilter(new Ast.BooleanExpression.Atom(expr.location,
                lhs.name, op, rhs));
        }
        if (rhs instanceof Ast.VarRefValue && !rhs.name.startsWith('__const_')) {
            return optimizeFilter(new Ast.BooleanExpression.Atom(expr.location,
                rhs.name, flipOperator(op), lhs));
        }

        // check for common equality cases
        if (lhs.equals(rhs) &&
            (op === '==' || op === '=~' || op === '>=' || op === '<='))
            return Ast.BooleanExpression.True;
        if (lhs.isConstant() && rhs.isConstant() &&
            !lhs.equals(rhs) && op === '==')
            return Ast.BooleanExpression.False;

        // put constants on the right side
        if (lhs.isConstant() && !rhs.isConstant()) {
            return new Ast.BooleanExpression.Compute(expr.location,
                rhs, flipOperator(op), lhs);
        }
        return expr;
    }
    if (expr instanceof Ast.ComparisonSubqueryBooleanExpression)
        return new Ast.BooleanExpression.ComparisonSubquery(null, expr.lhs, expr.operator, optimizeExpression(expr.rhs));
    if (expr instanceof Ast.PropertyPathBooleanExpression)
        return expr;

    assert(expr instanceof Ast.AtomBooleanExpression);

    const lhs = expr.name;
    const rhs = expr.value;
    const op = expr.operator;
    if (rhs instanceof Ast.VarRefValue && rhs.name === lhs) {
        // x = x , x =~ x , x >= x, x <= x
        if (op === '==' || op === '=~' || op === '>=' || op === '<=')
            return Ast.BooleanExpression.True;
    }
    return expr;
}

function compareInputParam(one : Ast.InputParam, two : Ast.InputParam) : -1|0|1 {
    if (one.name < two.name)
        return -1;
    if (two.name < one.name)
        return 1;
    return 0;
}

class UsesParamVisitor extends NodeVisitor {
    pname : string;
    used = false;
    constructor(pname : string) {
        super();
        this.pname = pname;
    }

    visitVarRefValue(value : Ast.VarRefValue) {
        this.used = this.used || value.name === this.pname;
        return true;
    }
    visitAtomBooleanExpressionValue(atom : Ast.AtomBooleanExpression) {
        this.used = this.used || atom.name === this.pname;
        return true;
    }
    // FIXME this is a bit sloppy in that it doesn't track shadowing
    // by nested boolean expressions correctly
    // we cannot do that because we run this code before typechecking
}

function valueUsesParam(expr : Ast.Value, pname : string) {
    const visitor = new UsesParamVisitor(pname);
    expr.visit(visitor);
    return visitor.used;
}

function compareProjArg(one : string, two : string) {
    if (one === two)
        return 0;
    if (one === '*')
        return -1;
    if (two === '*')
        return 1;
    if (one < two)
        return -1;
    else
        return 1;
}

function optimizeExpression(expression : Ast.Expression, allow_projection=true) : Ast.Expression {
    if (expression instanceof Ast.FunctionCallExpression) {
        expression.in_params.sort(compareInputParam);
        return expression;
    }
    if (expression instanceof Ast.InvocationExpression) {
        expression.invocation.in_params.sort(compareInputParam);
        return expression;
    }

    if (expression instanceof Ast.ProjectionExpression) {
        let optimized = optimizeExpression(expression.expression, allow_projection);
        expression.args.sort(compareProjArg);

        // convert projection-of-chain to chain-of-projection (push the projection
        // down to the last element)
        if (optimized instanceof Ast.ChainExpression) {
            const last = optimized.last;

            const newProjection = optimizeExpression(new Ast.ProjectionExpression(expression.location, last,
                expression.args, expression.computations, expression.aliases, expression.schema), allow_projection);
            optimized.expressions[optimized.expressions.length-1] = newProjection;
            return optimized;
        }

        if (expression.computations.length === 0) {
            if (expression.args[0] === '*')
                return optimized;
            if (!allow_projection)
                return optimized;
            if (optimized instanceof Ast.AggregationExpression && !optimized.groupBy)
                return optimized;
        }

        // collapse projection of projection
        // this is quite tricky because of computations
        if (optimized instanceof Ast.ProjectionExpression) {
            const ourNames = [];
            for (let i = 0; i < expression.computations.length; i++)
                ourNames.push(expression.aliases[i] || getScalarExpressionName(expression.computations[i]));

            // remove shadowed computations and computations that are not exposed
            const innerComputations : Ast.Value[] = [];
            const innerAliases : Array<string|null> = [];
            const innerNames : string[] = [];
            const innerArgs = optimized.args;
            const reusedNames : string[] = [];
            const reusedComputations : Ast.Value[] = [];
            const reusedAliases : Array<string|null> = [];
            for (let i = 0; i < optimized.computations.length; i++) {
                const name = optimized.aliases[i] || getScalarExpressionName(optimized.computations[i]);
                // not used in our computations
                if (expression.computations.some((comp) => valueUsesParam(comp, name))) {
                    reusedNames.push(name);
                    reusedComputations.push(optimized.computations[i]);
                    reusedAliases.push(optimized.aliases[i]);
                    continue;
                }

                // not used in another computation and also projected away
                if (!expression.args.includes(name))
                    continue;
                // shadowed
                if (ourNames.includes(name))
                    continue;
                innerNames.push(name);
                innerComputations.push(optimized.computations[i]);
                innerAliases.push(optimized.aliases[i]);
            }

            // if we're using some of the computations in our computations,
            // we need to leave the existing computation
            if (reusedComputations.length > 0) {
                optimized = new Ast.ProjectionExpression(optimized.location, optimized.expression,
                    ['*'], reusedComputations, reusedAliases, optimized.schema);
            } else {
                // else cut the middle man
                optimized = optimized.expression;
            }

            // combine our computations and the inner unrelated computations

            // remove all of our args that were just picking up the computations
            expression.args = expression.args.filter((a) => !innerNames.includes(a));
            if (expression.args[0] === '*')
                expression.args = innerArgs.concat(reusedNames);
            expression.args.sort(compareProjArg);

            // append the computations
            expression.computations.push(...innerComputations);
            expression.aliases.push(...innerAliases);

            expression.expression = optimized;
            return expression;
        }

        // nope, no optimization here
        expression.expression = optimized;
        return expression;
    }

    if (expression instanceof Ast.SortExpression) {
        const optimized = optimizeExpression(expression.expression, allow_projection);

        // flip sort of a projection to projection of a sort
        // this takes care of legacy compute tables as well

        if (optimized instanceof Ast.ProjectionExpression) {
            const computeNames = [];
            for (let i = 0; i < optimized.computations.length; i++)
                computeNames.push(optimized.aliases[i] || getScalarExpressionName(optimized.computations[i]));

            if (expression.value instanceof Ast.VarRefValue &&
                computeNames.length === 1 && computeNames[0] === expression.value.name) {
                // yep, we're sorting on the result of this computation
                expression.value = optimized.computations[0];
            }

            if (computeNames.every((name) => !valueUsesParam(expression.value, name))) {
                // we're not using the computation, good to flip!

                return new Ast.ProjectionExpression(optimized.location,
                    new Ast.SortExpression(expression.location, optimized.expression, expression.value, expression.direction, optimized.expression.schema),
                    optimized.args, optimized.computations, optimized.aliases, optimized.schema);
            }
        }

        // nope, no optimization here
        expression.expression = optimized;
        return expression;
    }

    if (expression instanceof Ast.MonitorExpression) {
        // always allow projection inside a monitor, because the projection affects which parameters we monitor
        const optimized = optimizeExpression(expression.expression, true);
        expression.args?.sort(compareProjArg);

        // convert monitor of a projection to a projection of a monitor
        if (optimized instanceof Ast.ProjectionExpression && optimized.computations.length === 0) {
            const newMonitor = new Ast.MonitorExpression(expression.location, optimized.expression, expression.args || optimized.args, expression.schema);

            if (allow_projection)
                return new Ast.ProjectionExpression(expression.location, newMonitor, optimized.args, optimized.computations, optimized.aliases, expression.schema);
            else
                return newMonitor;
        }

        expression.expression = optimized;
        return expression;
    }

    if (expression instanceof Ast.FilterExpression) {
        expression.filter = optimizeFilter(expression.filter);
        // handle constant filters
        if (expression.filter.isTrue)
            return optimizeExpression(expression.expression, allow_projection);

        const inner = optimizeExpression(expression.expression, allow_projection);
        expression.expression = inner;

        // compress filter of filter
        if (inner instanceof Ast.FilterExpression) {
            expression.filter = optimizeFilter(new Ast.BooleanExpression.And(expression.filter.location,
                [expression.filter, inner.filter]));
            expression.expression = inner.expression;
            return optimizeExpression(expression, allow_projection);
        }

        // switch filter of project to project of filter
        if (inner instanceof Ast.ProjectionExpression &&
            inner.computations.length === 0) {

            if (allow_projection) {
                const optimized = optimizeExpression(new Ast.FilterExpression(
                    inner.location,
                    inner.expression,
                    expression.filter,
                    inner.expression.schema),
                allow_projection);

                return new Ast.ProjectionExpression(
                    expression.location,
                    optimized,
                    inner.args,
                    [], [],
                    inner.schema
                );
            } else {
                return optimizeExpression(new Ast.FilterExpression(
                    expression.location,
                    inner.expression,
                    expression.filter,
                    inner.expression.schema
                ), allow_projection);
            }
        }
    }

    if (expression instanceof Ast.IndexExpression && expression.indices.length === 1) {
        const index = expression.indices[0];
        if (index instanceof Ast.ArrayValue)
            expression.indices = index.value;
    }

    // turn a slice with a constant limit of 1 to an index
    if (expression instanceof Ast.SliceExpression && expression.limit instanceof Ast.NumberValue && expression.limit.value === 1)
        return optimizeExpression(new Ast.IndexExpression(expression.location, expression.expression, [expression.base], expression.expression.schema), allow_projection);

    // flip index of projection to projection of index
    if (expression instanceof Ast.IndexExpression) {
        const optimized = optimizeExpression(expression.expression);
        if (optimized instanceof Ast.ProjectionExpression) {
            const inner = optimized.expression;
            return new Ast.ProjectionExpression(optimized.location,
                new Ast.IndexExpression(expression.location,
                    inner,
                    expression.indices,
                    inner.schema),
                optimized.args,
                optimized.computations,
                optimized.aliases,
                optimized.schema);
        }
        expression.expression = optimized;
        return expression;
    }

    // same thing but for slice
    if (expression instanceof Ast.SliceExpression) {
        const optimized = optimizeExpression(expression.expression);
        if (optimized instanceof Ast.ProjectionExpression) {
            const inner = optimized.expression;
            return new Ast.ProjectionExpression(optimized.location,
                new Ast.SliceExpression(expression.location,
                    inner,
                    expression.base,
                    expression.limit,
                    inner.schema),
                optimized.args,
                optimized.computations,
                optimized.aliases,
                optimized.schema);
        }
        expression.expression = optimized;
        return expression;
    }

    if (expression instanceof Ast.JoinExpression) {
        const lhs = optimizeExpression(expression.lhs);
        const rhs = optimizeExpression(expression.rhs);
        return new Ast.JoinExpression(expression.location, lhs, rhs, expression.schema);
    }

    if (isUnaryExpressionOp(expression)) {
        const inner = optimizeExpression(expression.expression, allow_projection);
        expression.expression = inner;
        return expression;
    }
    if (expression instanceof Ast.ChainExpression) {
        if (expression.expressions.length === 1)
            return optimizeExpression(expression.expressions[0], allow_projection);

        // flatten ChainExpressions
        const newExpressions : Ast.Expression[] = [];
        for (let i = 0; i < expression.expressions.length; i++) {
            const optimized = optimizeExpression(expression.expressions[i],
                allow_projection && i === expression.expressions.length - 1);
            if (optimized instanceof Ast.ChainExpression)
                newExpressions.push(...optimized.expressions);
            else
                newExpressions.push(optimized);
        }
        expression.expressions = newExpressions;
    }

    return expression;
}

function optimizeRule(rule : Ast.ExpressionStatement) : Ast.ExpressionStatement {
    // in old thingtalk, projection was only allowed when there is no action
    // but we don't know that at this stage, because we're running before
    // typechecking, so we don't know if something is an action or not
    const allow_projection = true;
    const newExpression = optimizeExpression(rule.expression, allow_projection);
    if (!(newExpression instanceof Ast.ChainExpression))
        rule.expression = new Ast.ChainExpression(newExpression.location, [newExpression], newExpression.schema);
    else
        rule.expression = newExpression;
    return rule;
}

function optimizeProgram<T extends Ast.Program|Ast.FunctionDeclaration>(program : T) : T {
    const newDeclarations = [];
    for (const decl of program.declarations)
        newDeclarations.push(optimizeProgram(decl));
    program.declarations = newDeclarations;

    const statements : Ast.ExecutableStatement[] = [];
    program.statements.forEach((stmt) => {
        if (stmt instanceof Ast.Assignment) {
            const optimized = optimizeExpression(stmt.value);
            stmt.value = optimized;
            statements.push(stmt);
        } else if (stmt instanceof Ast.ReturnStatement) {
            const optimized = optimizeExpression(stmt.expression);
            stmt.expression = optimized;
            statements.push(stmt);
        } else {
            const newrule = optimizeRule(stmt);
            statements.push(newrule);
        }
    });
    program.statements = statements;
    return program;
}

function optimizeDataset(dataset : Ast.Dataset) : Ast.Dataset {
    const newExamples = [];
    for (const ex of dataset.examples) {

        const optimized = optimizeExpression(ex.value, true);
        if (!optimized)
            continue;
        ex.value = optimized;
        newExamples.push(ex);
    }
    dataset.examples = newExamples;
    return dataset;
}

export {
    optimizeRule,
    optimizeProgram,
    optimizeDataset,
    optimizeFilter
};
