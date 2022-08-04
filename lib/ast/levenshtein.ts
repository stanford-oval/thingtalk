// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offArray: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2022 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Shicheng Liu <shicheng@cs.stanford.edu>

import { SourceRange } from "./base";
import { 
    FilterExpression,
    IndexExpression,
    JoinExpression,
    ProjectionExpression,
    SortExpression,
    InvocationExpression,
    FunctionCallExpression, 
    AggregationExpression,
    MonitorExpression,
    BooleanQuestionExpression,
    AliasExpression,
    SliceExpression } from "./expression";
import { TokenStream } from "../syntax_api";
import SchemaRetriever from "../schema";
import NodeVisitor from "./visitor";
import TypeChecker from "../typecheck";
import List from "../utils/list";
import { ChainExpression } from "./expression";
import { Statement, IsExecutableVisitor, ExpressionStatement } from "./statement";
import { OldSlot, AbstractSlot, ScopeMap } from "./slots";
import { DeviceSelector, InputParam } from "./invocation";
import { Expression } from "./expression";
import { Rule, Command } from "./statement";
import { AndBooleanExpression, AtomBooleanExpression, BooleanExpression, NotBooleanExpression, OrBooleanExpression, TrueBooleanExpression } from "./boolean_expression";
import { SyntaxPriority } from "./syntax_priority";
import { Program } from "./program";
import { optimizeChainExpression, optimizeFilter, optimizeRule } from "../optimize";
import assert from 'assert';



export class Levenshtein extends Statement {
    expression : ChainExpression;
    // possibilities: `$continue` for now
    op : string;

    constructor(location : SourceRange|null, 
                expression : Expression, 
                op : string) {
        super(location);
        if (expression instanceof ChainExpression)
            this.expression = expression;
        else
            this.expression = new ChainExpression(expression.location, [expression], expression.schema);
                    
        this.op = op;
    }

    toSource() : TokenStream {
        return List.concat( 
            this.op,
            this.expression.toSource(),
            ';',
        );
    }

    clone() : Levenshtein {
        return new Levenshtein(
            this.location,
            this.expression.clone(), 
            this.op, 
        );
    }

    equals(other : Levenshtein) : boolean {
        return other instanceof Levenshtein && 
            (this.op === other.op) &&
            this.expression.equals(other.expression);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitLevenshtein(this))
            this.expression.visit(visitor);
        visitor.exit(this);
    }

    optimize() {
        const res = this.clone();
        res.expression = optimizeChainExpression(res.expression);

        // we'd like to take care of some redundant filter issues
        res.expression.visit(new OptimizeFilterPredicates());

        return res;
    }

    async typecheck(schemas : SchemaRetriever, getMeta = false) : Promise<this> {
        const typeChecker = new TypeChecker(schemas, getMeta);
        await typeChecker.typeCheckLevenshtein(this);
        return this;
    }

    *iterateSlots() : Generator<OldSlot, void> {
        yield* this.expression.iterateSlots({});
    }

    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.expression.iterateSlots2({});
    }

    get first() : Expression {
        return this.expression.first;
    }

    get last() : Expression {
        return this.expression.last;
    }

    get stream() : Expression|null {
        const first = this.first;
        if (first.schema!.functionType === 'stream')
            return first;
        else
            return null;
    }

    get lastQuery() : Expression|null {
        return this.expression.lastQuery;
    }

    toLegacy(scope_params : string[] = []) : Rule|Command {
        // REVIEW
        throw new Error;
    }

    isExecutable() {
        const visitor = new IsExecutableVisitor;
        this.visit(visitor);
        return visitor.isExecutable;
    }
}

// Possible types associated with ThingTalk operators
enum ReturnTypes {
    Records = 1,
    Attributes = 2,
    Number = 3,
}

type APICall = 
    ( FunctionCallExpression
    | InvocationExpression)

type NoneSchemaType = 
    ( FilterExpression
    | MonitorExpression
    | BooleanQuestionExpression
    | ProjectionExpression
    | AliasExpression
    | AggregationExpression
    | SortExpression
    | IndexExpression
    | SliceExpression)

function isSchema(expr : Expression) : boolean {
    return expr instanceof FunctionCallExpression || expr instanceof InvocationExpression || expr instanceof JoinExpression;
}

// TODO: investigate if there are better approchaes
// building wheels here does not sound appealing
function ifOverlap(e1Invocations : APICall[], apiCalls : APICall[]) : boolean {
    for (const i of e1Invocations) {
        for (const j of apiCalls) {
            if (i instanceof FunctionCallExpression && j instanceof FunctionCallExpression && i.name === j.name)
                return true;
            if (i instanceof InvocationExpression && j instanceof InvocationExpression && i.invocation.channel === j.invocation.channel)
                return true;
        }
    }
    return false;
}

/**
 * Given a last-turn query and a new (i.e., incoming) user utterance
 * constructs the new, complete query.
 * This function is a wrapper for `applyLevenshtein`
 * 
 *
 * @param {Program} e1 - last turn query before the new user utterance
 * @param {Program} e2 - Levenshtein expressing the new user utterance
 * 
 * @return {Program}   - a completed, new query incorporating
 *                       information from both queries
 */
export function applyLevenshteinWrapper(e1 : Program, e2 : Program) : Program {
    const res : Program = e1.clone();
    res.statements = [];
    for (const e2Statement of e2.statements) {
        if (!(e2Statement instanceof Levenshtein))
            continue;
        for (const e1Statement of e1.statements) {
            if (!(e1Statement instanceof ExpressionStatement)) {
                // TODO: test behavior of this
                console.warn("WARNING: applyLevenshtein found last-turn statement that is not of ExpressionStatement type");
                continue;
            }
            const thisStatement : ExpressionStatement = e1Statement.clone();
            thisStatement.expression = applyLevenshtein(e1Statement.expression, e2Statement);
            res.statements.push(thisStatement);
        }
    }
    // NOTE: this is a double optimization b/c I am yet to figure out if the two different
    //       ways to optimize are equiv, in which case we don't need the second optimize here
    return res.optimize();
}

export function applyLevenshteinExpressionStatement(e1 : ExpressionStatement, e2 : Levenshtein) : ExpressionStatement {
    const res = e1.clone();
    res.expression = applyLevenshtein(e1.expression, e2);
    return optimizeRule(res);
}

export function applyMultipleLevenshtein(e1 : ChainExpression, e2 : Levenshtein[]) : ChainExpression {
    for (const expr of e2)
        e1 = applyLevenshtein(e1, expr);
    return e1;
}

export function levenshteinFindSchema(e1 : Expression) : Expression {
    if (e1 instanceof ChainExpression) {
        // NOTE: for now we are only using the first expression
        e1 = e1.expressions[0];
    }
    while (!isSchema(e1))
        e1 = (e1 as NoneSchemaType).expression;
    return e1;
}

/**
 * Given a last-turn query (represented as a ChainExpression)
 * and a new (i.e., incoming) user utterance (represented as a Levenshtein)
 * constructs the new, complete query
 * 
 * The algorithm works in the following stages:
 * 1. Determine if the incoming query is small enough, if so, return it; (TODO)
 * 2. Determine which part of the incoming ChainExpression we should modify,
 *    based on the occuring schemas;
 * 3. Determine where in the last-turn query we should insert the incoming
 *    query. This part contains the following two sub-parts:
 *       a. go down the last-turn query until we find operator that returns
 *            ReturnType.Record
 *       b. statically resolve any predicate conflicts, and determine where
 *            to start inserting;
 * 4. At that point, add all incoming query on top of it (and modify API call)
 * 5. Determine which of the old query is compatible (matches the return type of
 *    incoming query) and add them back.
 * 
 * Note that dynamic execution until we find a non-null result will be implemented in genie runtime
 * 
 *
 * @param {ChainExpression} e1 - last turn query before the new user utterance
 * @param {Levenshtein} e2     - Levenshtein expressing the new user utterance
 * 
 * @return {ChainExpression}   - a completed, new query incorporating
 *                               information from both queries
 */
export function applyLevenshtein(e1 : ChainExpression, e2 : Levenshtein) : ChainExpression {   
    e2 = e2.optimize(); 
    // step 2: understand which part of e1 is related to which API call
    const e1Invocations : APICall[] [] = [];
    for (const expr of e1.expressions) {
        const visitor = new GetInvocationExpressionVisitor();
        expr.visit(visitor);
        e1Invocations.push(visitor.invocation);
    }
    
    // no need to take care of location & schema issues because Levenshtein is internal
    // thus, simply clone should be okay
    const res : ChainExpression = e1.clone();
    res.expressions = [];
    
    for (const e2expr of e2.expression.expressions) {
        let found  = false;
        const [e2Predicates, returnType, apiCalls, joins] = walkExpression(e2expr);
        
        for (let i = 0; i < e1Invocations.length; i ++) {
            if (ifOverlap(e1Invocations[i], apiCalls)) {
                // suppose e1 is of form: e1_0 => e1_1 => e1_2 => ...
                // then, we have stored the API invocation of e1_i inside e1Invocations[i]
                // here, we determine if e1_i has the same schema occuring in this part of e2 (expr)
                // if so, we administer the main apply algorithm on expr with its schema
                // console.debug(`applyLevenshtein: determined ${i}-th (0-based index) expression of old Chainexpression modifies this portion of incoming expression`);
                
                // step 3: understand where to insert the new query
                const e1expr : Expression = e1.expressions[i].clone();
                const [top, bottom, _] = chopExpression(e1expr, e2Predicates);
                // console.debug(`applyLevenshtein: chopExpression returned top=${top.prettyprint()} and bottom=${bottom.prettyprint()}`);
                
                // step 4: add e2expr above `bottom`
                // if the incoming schema is a join, use that
                // TODO: if multiple join statement appears, TBD what to do
                let newBottom : Expression;
                if (joins.length === 0)
                    newBottom = changeSchema(e2expr, bottom);
                else
                    newBottom = changeSchema(e2expr, changeSchema(bottom, joins[0]));                    
                // modify API calls
                newBottom.visit(new ModifyInvocationExpressionVisitor(apiCalls));

                // step 5: determine based on `returnTypes` what to put at the top
                if (returnType === ReturnTypes.Records) 
                    newBottom = changeSchema(top, newBottom, true);

                res.expressions.push(newBottom);
                found = true;
                break;
            }
        }
        
        if (!found) 
            res.expressions.push(e2expr);
        
    }
    return optimizeChainExpression(res);
}




/**change the schema in
 * @param {Expression} before to match that of
 * @param {Expression} newSchema
 * note that newSchema does not have to be an API call or Join
 * it can be anything, as long as it outputs type Records
 */

function changeSchema(before : Expression, newSchema : Expression, checkLevenshteinPlaceholder ?: boolean) : Expression {
    if (isSchema(before) || (checkLevenshteinPlaceholder && before instanceof LevenshteinPlaceholder))
        return newSchema;

    // REVIEW: whether clone is necessary
    before = before.clone();
    let lastTurn : NoneSchemaType = before as NoneSchemaType;
    const res : Expression = before;

    // due to es-link issues, factor this out of the while condition
    function evaluateIsSchemaCondition(before : Expression, checkLevenshteinPlaceholder ?: boolean) {
        return isSchema(before) || (checkLevenshteinPlaceholder && before instanceof LevenshteinPlaceholder);
    }

    while (!evaluateIsSchemaCondition(before, checkLevenshteinPlaceholder)) {
        lastTurn = before as NoneSchemaType;
        before = (before as NoneSchemaType).expression;
    }

    lastTurn.expression = newSchema;
    return res;
}


// this is used as indication for where to substitute the new schema
// technically, `(undefined as any as NoneSchemaType).expression` also works
// but it is difficult to print out when debugging due to AST traversal algorithm calling `.toSource()`
class LevenshteinPlaceholder extends Expression {
    get priority() {
        return SyntaxPriority.Primary;
    }
    toLegacy(into_params ?: InputParam[], scope_params ?: string[]) {
        console.error("toLegacy: If you see this message, there is a problem with Levenshtein internal implementation");
        return undefined as any;
    }
    
    clone() {
        return new LevenshteinPlaceholder(this.location, this.schema);
    }
    
    equals(other : Expression) {
        return other instanceof LevenshteinPlaceholder;
    }
    
    toSource() : TokenStream {
        return List.singleton("LevenshteinPlaceholder");
    }
    
    visit(visitor : NodeVisitor) {
        visitor.enter(this);
        visitor.exit(this);
    }
    
    iterateSlots(scope : ScopeMap) {
        console.error("iterateSlots: If you see this message, there is a problem with Levenshtein internal implementation");
        return undefined as any;
    }
    
    iterateSlots2(scope : ScopeMap) {
        console.error("iterateSlots2: If you see this message, there is a problem with Levenshtein internal implementation");
        return undefined as any;
    }
}


/** this helper function accomplishes the following task in `applyLevenshtein`:
 * 
 *  determine where in the last-turn query we should insert the incoming
 *  query. This part contains the following two sub-parts:
 *    a. go down the last-turn query until we find operator that returns
 *       ReturnType.Record
 *    b. statically resolve any predicate conflicts, and determine where
 *       to start inserting;
 * 
 * @param {Expression} expr                - last-turn expression
 * @param {BooleanExpression} e2Predicates - filters in incoming expression
 * 
 * @return {[Expression, Expression]}
 *                                         - top and bottom of the chopped expression
 */

// base case here:
// 1. we begin with a schema expr 
//      -> return [LevenshteinPlaceholder, expr]
// 2. we begin with a filter statement that is conflicting
//      -> top is LevenshetinPlaceholder, bottom needs to be located

// recursive case:
// either:
// 1. a non-ReturnTypes.Record statement
//      -> we must add the current node to top
// 2. a non-conflicting ReturnTypes.Record statement
//      -> if conflict detected, add current node to top
//      -> if no conflict, add current node to bottom
function chopExpression(expr : Expression, e2Predicates : BooleanExpression[]) : [Expression, Expression, boolean] {
    // console.log(`chopExpression ${expr.prettyprint()}`);
    // base case 1
    if (isSchema(expr))
        return [new LevenshteinPlaceholder(null, null), expr, false];
    
    // base case 2
    if (expr instanceof FilterExpression) {
        const [ifConflict, newFilter] = predicateResolution(expr.filter, e2Predicates);
        if (ifConflict) {
            // if the filter needs to be modified, ask `locateBottom` to determine the new bottom,
            // possibly including the modified filter 
            if (newFilter !== undefined)
                expr.filter = newFilter;
            // if the filter cannot be modified, throw it out
            else
                expr = expr.expression;
            return [new LevenshteinPlaceholder(null, null), locateBottom(expr, e2Predicates), true];
        } else if (newFilter === undefined) {
            // there is the case where there is no conflict, but the old expression
            // still needs to be thrown away
            // e.g.: both old and incoming expression contain the exact same filter
            //       it is not a conflict, but we should throw away the old filter
            //       (side note: `optimize` does not take care of this issue)
            expr.filter = new TrueBooleanExpression();
        } else {
            expr.filter = newFilter;
        }
    }

    // recursive cases
    const [top, bottom, ifConflict] = chopExpression((expr as NoneSchemaType).expression, e2Predicates);
    if (determineReturnType(expr) !== ReturnTypes.Records || ifConflict) {
        (expr as NoneSchemaType).expression = top;
        return [expr, bottom, ifConflict];
    } else {
        (expr as NoneSchemaType).expression = bottom;
        return [top, expr, ifConflict];
    }
}


// locate the last conflicting filter
// excluding that filter, everything is returned
// return value guaranteed to be type ReturnTypes.Records
function locateBottom(expr : Expression, e2Predicates : BooleanExpression[]) : Expression {
    let exprCopy : Expression = expr;
    while (!isSchema(expr)) {
        if (expr instanceof FilterExpression) {
            const [ifConflict, newFilter] = predicateResolution(expr.filter, e2Predicates);
            
            if (ifConflict) {
                if (newFilter !== undefined)
                    expr.filter = newFilter;
                else
                    expr = expr.expression;
                exprCopy = expr;
            }
        }
        expr = (expr as NoneSchemaType).expression;
    }
    return exprCopy;
}

/**
 * @param e1     - AtomBooleanExpression-like expressions
 */
function predicateResolutionSingleE1(e1 : BooleanExpression,
                                     e2expr : BooleanExpression[]) : [boolean, BooleanExpression|undefined] {
    for (const e2 of e2expr) {
        if (e1.equals(e2))
            return [false, undefined];
        if (e1 instanceof AtomBooleanExpression) {
            if (e2 instanceof AtomBooleanExpression) {
                // if (e1.equals(e2))
                    // return [false, undefined];
    
                if (e1.operator === "==" && e2.operator === "==" && e1.name === e2.name) {
                    const e1Value = e1.value;
                    const e2Value = e2.value;
                    if (!e1Value.equals(e2Value))
                        return [true, undefined];
                }
            } else if (e2 instanceof AndBooleanExpression) {                
                for (const eachRes of e2.operands.map((x) => predicateResolutionSingleE1(e1, [x]))) {
                    if (eachRes[0] === true)
                        return [true, undefined];
                }
            } else if (e2 instanceof OrBooleanExpression) {
                let isConflict = true;
                // let res = false;
                for (const eachRes of e2.operands.map((x) => predicateResolutionSingleE1(e1, [x]))) {
                    if (eachRes[0] === false)
                        isConflict = false;
                    // if (eachRes[1] === undefined)
                        // res = true;
                }
                if (isConflict)
                    return [true, undefined];
                // if (res)
                //     return [false, undefined];
            } else if (e2 instanceof NotBooleanExpression) {
                // De-Morgan already done in e2 during Levenshtein optimize
                assert(!(e2.expr instanceof AndBooleanExpression || e2.expr instanceof OrBooleanExpression));
                if (e1.equals(e2.expr))
                    return [true, undefined];
            }
        }
        if (e1 instanceof NotBooleanExpression && e2 instanceof AtomBooleanExpression) {
            assert(!(e1.expr instanceof AndBooleanExpression || e1.expr instanceof OrBooleanExpression));
            if (e1.expr instanceof AtomBooleanExpression && e1.expr.equals(e2))
                return [true, undefined];
        }
    
    }

    return [false, e1];
}

function deMorgen(expr : BooleanExpression) : BooleanExpression {
    // console.log(expr.prettyprint());
    if (expr instanceof AndBooleanExpression) {
        const res = new OrBooleanExpression(expr.location, []);
        res.operands = expr.operands.map((x) => new NotBooleanExpression(x.location, deMorgen(x)));
        return res;
    } else if (expr instanceof OrBooleanExpression) {
        const res = new AndBooleanExpression(expr.location, []);
        res.operands = expr.operands.map((x) => new NotBooleanExpression(x.location, deMorgen(x)));
        return res;
    }
    return expr;
}

/** Given a predicate and a list of predicates to compare against, determine if the predicate
 *  conflicts / does not conflict with the list of predicate.
 *  If conflicts, it determines which part of the predicate does not conflict.
 *  If does not conflict, it determines if it is a repetition (see below for details)
 * 
 * @param {BooleanExpression} expr - the single predicate to determine whether conflicts occur
 * @param {BooleanExpression[]} e2Predicates - the list of predicates to compare against
 * 
 * @return {[boolean, BooleanExpression|undefined]} - the behavior is the following;
 * if the first result is true, this indicates that there is a conflict
 *     if the second result is undefined, this means that the entire `expr` conflicts
 *     if the second result is not undefined, it is the non-conflicting part of `expr`
 * 
 * if the first result is false, this indicates that there is no conflict
 *     if the second result is undefined, this means that `expr` is a repetition of some of the predicates in `e2Predicates`
 *     if the second result is not undefined, it is the non-repetitive part of `expr`
 * 
*/
function predicateResolution(expr : BooleanExpression,
                             e2Predicates : BooleanExpression[]) : [boolean, BooleanExpression|undefined] {
    // TODO: in the future, use more advanced heuristics
    // console.log(`predicateResolution: ${expr.prettyprint()}`);
    if (expr instanceof AndBooleanExpression) {
        const res = expr.clone();
        let resBoolean = false;
        res.operands = [];
        for (const i of expr.operands.map((i) => predicateResolution(i, e2Predicates))) {
            if (i[0])
                resBoolean = true;
            
            if (i[1] !== undefined)
                res.operands.push(i[1]);
        }
        return [resBoolean, res];
    } else if (expr instanceof OrBooleanExpression) {
        const res = expr.clone();
        let resBoolean = true;
        res.operands = [];
        for (const i of expr.operands.map((i) => predicateResolution(i, e2Predicates))) {
            if (i[0] === false)
                resBoolean = false;
            
            if (i[1] !== undefined)
                res.operands.push(i[1]);
        }
        return [resBoolean, res];
    } else if (expr instanceof NotBooleanExpression && (expr.expr instanceof AndBooleanExpression || expr.expr instanceof OrBooleanExpression)) {
        return predicateResolution(deMorgen(expr.expr), e2Predicates);
    }

    return predicateResolutionSingleE1(expr, e2Predicates);
}

// if a parameter exists in `old` parameter list that does not exist in `incoming`
// add to `incoming`
function changeParams(incoming : InputParam[], old : InputParam[]) : InputParam[] {
    for (const i of old) {
        const possiblePlace = incoming.map((param) => {
            return param.name;
        }).indexOf(i.name);
        if (possiblePlace < 0)
            incoming.push(i.clone());
    }
    return incoming;
}


// this records the API calls given an expression
// it simply returns all API calls within an expression
// regardless of whether they are inside join or not
class GetInvocationExpressionVisitor extends NodeVisitor {
    invocation : APICall[] = new Array<APICall>();

    visitFunctionCallExpression(inv : FunctionCallExpression) : boolean {
        this.invocation.push(inv);
        return true;
    }

    visitInvocationExpression(inv : InvocationExpression) : boolean {
        this.invocation.push(inv);
        return true;
    }
}


// given an old list of API call, modify the incoming levenshtein API call
// in the following manner: if a parameter does not exist, add to it
class ModifyInvocationExpressionVisitor extends NodeVisitor {
    compareInvocation : APICall[];

    constructor(compareInvocation : APICall[]) {
        super();
        this.compareInvocation = compareInvocation;
    }

    visitFunctionCallExpression(inv : FunctionCallExpression) : boolean {
        for (const temp of this.compareInvocation) {
            if (temp instanceof FunctionCallExpression && inv.name === temp.name) {
                inv.in_params = changeParams(temp.in_params, inv.in_params);
                break;
            }
        }
        return true;
    }

    visitInvocationExpression(inv : InvocationExpression) : boolean {
        for (const temp of this.compareInvocation) {
            if (temp instanceof InvocationExpression &&
                inv.invocation.channel === temp.invocation.channel &&
                inv.invocation.selector.equals(temp.invocation.selector)) {
                inv.invocation.in_params = changeParams(temp.invocation.in_params, inv.invocation.in_params);
                break;
            }
        }
        return true;
    }
}


/** If a predicate in an AndBooleanExpression or OrBooleanExpression is a repetition of other predicates,
 *  get rid of it (using `predicateResolution`)
 */
class OptimizeFilterPredicates extends NodeVisitor {
    visitFilterExpression(node : FilterExpression) : boolean {
        if (node.filter instanceof AndBooleanExpression || node.filter instanceof OrBooleanExpression) {
            // console.log(node.filter.operands);
            node.filter.operands = this.recurse(node.filter.operands);
            // console.log(node.filter.operands);
            node.filter = optimizeFilter(node.filter);
        }
        if (node.filter instanceof NotBooleanExpression && (node.filter.expr instanceof AndBooleanExpression || node.filter.expr instanceof OrBooleanExpression))
            node.filter = deMorgen(node.filter.expr);
        return true;
    }

    recurse(predicates : BooleanExpression[]) : BooleanExpression[] {
        if (predicates.length <= 0)
            return [];
        if (predicates.length === 1)
            return predicates;
        // console.log(predicates[0]);
        // console.log(predicates.slice(1));
        // console.log(predicateResolution(predicates[0], predicates.slice(1)));
        // console.log(predicateResolution(predicates[0], predicates.slice(1))[0] === false);
        const res = predicateResolution(predicates[0], predicates.slice(1));
        if (res[0] === false && res[1] === undefined) {
            // console.log("triggered");
            return this.recurse(predicates.slice(1));
        }
        return [predicates[0], ...this.recurse(predicates.slice(1))];
    }
}


// this returns all the predicates inside filter
class GetFilterPredicates extends NodeVisitor {
    predicates : BooleanExpression[] = [];

    visitFilterExpression(node : FilterExpression) : boolean {
        this.predicates.push(node.filter);
        return true;
    }
}

// this returns all joins, if they exist
class GetJoinVisitor extends NodeVisitor {
    joins : JoinExpression[] = [];

    visitJoinExpression(node : JoinExpression) : boolean {
        this.joins.push(node);
        return true;
    }

}


function determineReturnType(expr : Expression) : ReturnTypes {
    if (expr instanceof ProjectionExpression || expr instanceof BooleanQuestionExpression) 
        // BooleanQuestionExpression returns yes/no, can be perceieved as attributes
        return ReturnTypes.Attributes;
    else if (expr instanceof AggregationExpression) 
        return ReturnTypes.Number;
    
    // This includes: FilterExpression, SortExpression, IndexExpression, JoinExpression
    // TODO: list others
    return ReturnTypes.Records;
}


// walk the Levenshtein expression to retrieve the following 2 information:
// 1. all predicates that appear in Levenshtein expression
//          -> for static conflict resolution
// 2. the result type (Records, Attributes, or Number)
//          -> for adding compatible opeartors back on top
// 3. all API invocations
//          -> for determining if the incoming expression is referring to the same schema
// 4. all joins
//          -> for determining whether to use the join schema
function walkExpression(expr : Expression) : [BooleanExpression[],
                                              ReturnTypes,
                                              APICall[],
                                              JoinExpression[]] {

    // Here, we get all predicates stored into predicates
    const visitor = new GetFilterPredicates();
    expr.visit(visitor);
    const predicates = visitor.predicates;

    const visitor2 = new GetInvocationExpressionVisitor();
    expr.visit(visitor2);
    const apiCalls = visitor2.invocation;

    const visitor3 = new GetJoinVisitor();
    expr.visit(visitor3);
    const joins = visitor3.joins;

    return [predicates, determineReturnType(expr), apiCalls, joins];
}

export function determineSameExpressionLevenshtein(e1 : ChainExpression, e2 : ChainExpression, flag = "queryRefinement") : boolean {
    e1 = e1.clone();
    e2 = e2.clone();
    if (e1.equals(e2))
        return true;

    e1 = optimizeChainExpression(e1);
    e2 = optimizeChainExpression(e2);
    if (e1.equals(e2))
        return true;
    
    const visitor1 = new GetFilterPredicates();
    const visitor2 = new GetFilterPredicates();
    e1.visit(visitor1);
    e2.visit(visitor2);
    let e1collapsed : BooleanExpression = new AndBooleanExpression(null, visitor1.predicates);
    let e2collapsed : BooleanExpression = new AndBooleanExpression(null, visitor2.predicates);
    e1collapsed = optimizeFilter(e1collapsed);
    e2collapsed = optimizeFilter(e2collapsed);
    if (e1collapsed.equals(e2collapsed)) {
        e1.visit(new ResetFilterPredicates());
        e2.visit(new ResetFilterPredicates());
        e1 = optimizeChainExpression(e1);
        e2 = optimizeChainExpression(e2);
        if (e1.equals(e2))
            return true;
        // console.log("After filters set to true, still fail, not the same expression");
    }
    // else {
    //     console.log("returning false");
    // }
    return false;
}

class ResetFilterPredicates extends NodeVisitor {
    visitFilterExpression(node : FilterExpression) : boolean {
        node.filter = new TrueBooleanExpression();
        return true;
    }
}

// determine at which stage of expr does the insertion become non-null
// it first uses static resolution (using chopExpression)
// then, it dynamically executes until found a non-null solution
// it returns two Expression 
// the first involve those that could be added back on top
// and the second are those that sit at the bottom of the new Expression
// REVIEW: This will be moved to Genie runtime
// function findNonNull(expr1: Expression, expr2: Expression) : [Array<Expression>, Array<Expression>] {
//     // walk through the expression to find those before the first conflict
// }
