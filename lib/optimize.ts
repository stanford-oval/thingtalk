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
import * as Ast from './ast';

import {
    isUnaryStreamToStreamOp,
    isUnaryTableToTableOp,
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

function optimizeFilter(expr : Ast.BooleanExpression) : Ast.BooleanExpression {
    if (expr.isTrue || expr.isFalse || expr.isDontCare)
        return expr;
    if (expr instanceof Ast.AndBooleanExpression) {
        const operands = flattenAnd(expr).map((o) => optimizeFilter(o)).filter((o) => !o.isTrue);
        operands.forEach((op) => assert(op instanceof Ast.BooleanExpression));
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
            return new Ast.BooleanExpression.False;
        // NOTE: it does not hold that if subfilter is True
        // the whole expression is true, because the invocation
        // might return no results!
        return new Ast.BooleanExpression.External(expr.location, expr.selector,
            expr.channel, expr.in_params, subfilter, expr.schema);
    }
    if (expr.isCompute) {
        // TODO
        return expr;
    }
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

function optimizeStream(stream : Ast.Stream, allow_projection=true) : Ast.Stream|null {
    if (stream.isVarRef || stream.isTimer || stream.isAtTimer)
        return stream;

    if (stream instanceof Ast.ProjectionStream) {
        if (!allow_projection)
            return optimizeStream(stream.stream, allow_projection);

        const optimized = optimizeStream(stream.stream, allow_projection);
        if (!optimized)
            return null;

        // collapse projection of projection
        if (optimized instanceof Ast.ProjectionStream) {
            return new Ast.Stream.Projection(stream.location, optimized.stream,
                stream.args, stream.schema);
        }
        return new Ast.Stream.Projection(stream.location, optimized, stream.args, stream.schema);
    }

    if (stream instanceof Ast.MonitorStream) {
        // always allow projection inside a monitor, because the projection affects which parameters we monitor
        const table = optimizeTable(stream.table, true);
        if (!table)
            return null;

        // convert monitor of a projection to a projection of a monitor
        if (table instanceof Ast.ProjectionTable) {
            const newMonitor = new Ast.Stream.Monitor(table.location, table.table, stream.args || table.args, stream.schema);

            if (allow_projection)
                return new Ast.Stream.Projection(table.location, newMonitor, table.args, stream.schema);
            else
                return newMonitor;
        }

        stream.table = table;
        return stream;
    }

    if (stream instanceof Ast.FilteredStream) {
        stream.filter = optimizeFilter(stream.filter);
        // handle constant filters
        if (stream.filter.isTrue)
            return optimizeStream(stream.stream, allow_projection);
        if (stream.filter.isFalse)
            return null;
        // compress filter of filter
        if (stream.stream instanceof Ast.FilteredStream) {
            stream.filter = optimizeFilter(Ast.BooleanExpression.And([stream.filter, stream.stream.filter]));
            stream.stream = stream.stream.stream;
            return optimizeStream(stream, allow_projection);
        }

        // switch filter of monitor to monitor of filter
        if (stream.stream instanceof Ast.MonitorStream) {
            const newstream = new Ast.Stream.Monitor(
                stream.location,
                new Ast.Table.Filter(stream.location, stream.stream.table, stream.filter, stream.stream.table.schema),
                stream.stream.args,
                stream.stream.schema
            );
            return optimizeStream(newstream, allow_projection);
        }

        // switch filter of project to project of filter
        if (stream.stream instanceof Ast.ProjectionStream) {
            if (allow_projection) {
                return optimizeStream(new Ast.Stream.Projection(
                    stream.location,
                    new Ast.Stream.Filter(stream.location,
                        stream.stream.stream, stream.filter, stream.stream.stream.schema),
                    stream.stream.args,
                    stream.stream.schema
                ), allow_projection);
            } else {
                return optimizeStream(new Ast.Stream.Filter(
                    stream.location,
                    stream.stream.stream,
                    stream.filter,
                    stream.stream.stream.schema
                ), allow_projection);
            }
        }
    } else if (stream instanceof Ast.EdgeNewStream) {
        // collapse edge new of monitor or edge new of edge new
        if (stream.stream.isMonitor || stream.stream.isEdgeNew)
            return optimizeStream(stream.stream, allow_projection);
    } else if (stream instanceof Ast.EdgeFilterStream) {
        stream.filter = optimizeFilter(stream.filter);
        // handle constant filters
        // we don't optimize the isTrue case here: "edge on true" means only once
        if (stream.filter.isFalse)
            return null;
    }

    if (isUnaryStreamToStreamOp(stream)) {
        const inner = optimizeStream(stream.stream, allow_projection);
        if (!inner)
            return null;
        stream.stream = inner;
        return stream;
    }

    if (stream instanceof Ast.JoinStream) {
        const lhs = optimizeStream(stream.stream, allow_projection);
        if (!lhs)
            return null;
        const rhs = optimizeTable(stream.table, allow_projection);
        if (!rhs)
            return null;
        stream.stream = lhs;
        stream.table = rhs;
        return stream;
    }

    return stream;
}

function findComputeTable(table : Ast.Table) : Ast.ComputeTable|null {
    if (table instanceof Ast.ComputeTable)
        return table;
    if (table instanceof Ast.InvocationTable || table instanceof Ast.VarRefTable)
        return null;

    // do not traverse joins or aliases, as those
    // change the meaning of parameters and therefore the expressions
    if (table instanceof Ast.JoinTable || table instanceof Ast.AliasTable ||
        table instanceof Ast.ProjectionTable)
        return null;

    if (isUnaryTableToTableOp(table))
        return findComputeTable(table.table);

    throw new TypeError(table.constructor.name);
}

function expressionUsesParam(expr : Ast.Node, pname : string) : boolean {
    let used = false;
    expr.visit(new class extends Ast.NodeVisitor {
        visitVarRefValue(value : Ast.VarRefValue) {
            used = used || value.name === pname;
            return true;
        }
    });
    return used;
}

function optimizeTable(table : Ast.Table, allow_projection=true) : Ast.Table|null {
    if (table.isVarRef || table.isInvocation)
        return table;

    if (table instanceof Ast.ProjectionTable) {
        if (!allow_projection)
            return optimizeTable(table.table);
        if (table.table.isAggregation)
            return optimizeTable(table.table);

        const optimized = optimizeTable(table.table, allow_projection);
        if (!optimized)
            return null;

        // collapse projection of projection
        if (optimized instanceof Ast.ProjectionTable)
            return new Ast.Table.Projection(table.location, optimized.table, table.args, table.schema);
        return new Ast.Table.Projection(table.location, optimized, table.args, table.schema);
    }

    if (table instanceof Ast.ComputeTable) {
        if (table.expression instanceof Ast.VarRefValue) // entirely redundant
            return optimizeTable(table.table);

        // look for a nested compute table and find one that has the same
        // expression (note that joins and aliases stop the traversal)
        // if so, we remove this compute expression entirely
        let inner = findComputeTable(table.table);
        while (inner) {
            // check that our expression doesn't depend on the result of the computation
            // (if it does, the computation is not redundant)
            const innerOutputName = inner.alias || getScalarExpressionName(inner.expression);

            if (expressionUsesParam(table.expression, innerOutputName))
                break;

            // check that our expression is equal to the inner expression,
            if (inner.expression.equals(table.expression)) {
                // yep, found it!
                return optimizeTable(table.table);
            }

            // try going deeper
            inner = findComputeTable(inner.table);
        }

        // nope, no optimization here
        const optimized = optimizeTable(table.table, allow_projection);
        if (!optimized)
            return null;
        table.table = optimized;
        return table;
    }

    if (table instanceof Ast.FilteredTable) {
        table.filter = optimizeFilter(table.filter);
        // handle constant filters
        if (table.filter.isTrue)
            return optimizeTable(table.table, allow_projection);
        if (table.filter.isFalse)
            return null;
        // compress filter of filter
        if (table.table instanceof Ast.FilteredTable) {
            table.filter = optimizeFilter(new Ast.BooleanExpression.And(table.filter.location,
                [table.filter, table.table.filter]));
            table.table = table.table.table;
            return optimizeTable(table, allow_projection);
        }

        // switch filter of project to project of filter
        if (table.table instanceof Ast.ProjectionTable) {
            if (allow_projection) {
                const optimized = optimizeTable(new Ast.Table.Filter(
                    table.table.location,
                    table.table.table,
                    table.filter,
                    table.table.table.schema),
                    allow_projection);
                if (!optimized)
                    return null;

                return new Ast.Table.Projection(
                    table.location,
                    optimized,
                    table.table.args,
                    table.table.schema
                );
            } else {
                return optimizeTable(new Ast.Table.Filter(
                    table.location,
                    table.table.table,
                    table.filter,
                    table.table.table.schema
                ), allow_projection);
            }
        }
    }

    if (table instanceof Ast.IndexTable && table.indices.length === 1) {
        const index = table.indices[0];
        if (index instanceof Ast.ArrayValue)
            table.indices = index.value;
    }

    // turn a slice with a constant limit of 1 to an index
    if (table instanceof Ast.SlicedTable && table.limit instanceof Ast.NumberValue && table.limit.value === 1)
        return optimizeTable(new Ast.Table.Index(table.location, table.table, [table.base], table.table.schema), allow_projection);

    if (isUnaryTableToTableOp(table)) {
        const inner = optimizeTable(table.table, allow_projection);
        if (!inner)
            return null;
        table.table = inner;
        return table;
    }
    if (table instanceof Ast.JoinTable) {
        const lhs = optimizeTable(table.lhs, allow_projection);
        if (!lhs)
            return null;
        const rhs = optimizeTable(table.rhs, allow_projection);
        if (!rhs)
            return null;
        table.lhs = lhs;
        table.rhs = rhs;
        return table;
    }

    return table;
}

function optimizeRule(rule : Ast.Rule|Ast.Command) : Ast.Rule|Ast.Command|null {
    let allow_projection = false;
    // projectino is only allowed when the actions include notify/return
    if (rule.actions.some((a) => a.isNotify))
        allow_projection = true;
    if (rule instanceof Ast.Rule) {
        const newStream = optimizeStream(rule.stream, allow_projection);
        if (!newStream)
            return null;
        rule.stream = newStream;
    } else if (rule.table) {
        const newTable = optimizeTable(rule.table, allow_projection);
        if (!newTable)
            return null;
        rule.table = newTable;
    }
    if (!rule.actions.length)
        return null;
    return rule;
}

function optimizeProgram(program : Ast.Program) : Ast.Program|null {
    const rules : Ast.ExecutableStatement[] = [];
    program.rules.forEach((rule) => {
        if (rule instanceof Ast.Assignment) {
            rules.push(rule);
        } else {
            const newrule = optimizeRule(rule);
            if (newrule)
                rules.push(newrule);
        }
    });
    program.rules = rules;
    if (program.rules.length === 0 && program.declarations.length === 0 && Object.keys(program.classes).length === 0 && program.oninputs.length === 0)
        return null;
    else
        return program;
}

export {
    optimizeRule,
    optimizeProgram,
    optimizeFilter
};
