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
import { Statement, IsExecutableVisitor } from "./statement";
import { OldSlot, AbstractSlot, ScopeMap } from "./slots";
import { DeviceSelector, InputParam } from "./invocation";
import { Expression } from "./expression";
import { Rule, Command } from "./statement";
import { AtomBooleanExpression, BooleanExpression } from "./boolean_expression";
import { SyntaxPriority } from "./syntax_priority";



export class Levenshtein extends Statement {
    expression : ChainExpression;
    // possibilities: `cont` for now
    op : string;

    constructor(location : SourceRange|null, 
                expression : ChainExpression, 
                op : string) {
        super(location);
        this.expression = expression;
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
 * 4. At that point, add all incoming query on top of it;
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
        const [e2Predicates, returnType, apiCalls] = walkExpression(e2expr);
        
        for (let i = 0; i < e1Invocations.length; i ++) {
            if (e1Invocations[i].filter((value) => apiCalls.includes(value)) !== []) {
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
                let newBottom = changeSchema(e2expr, bottom);

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
    return res;
}




/**change the schema in
 * @param {Expression} before to match that of
 * @param {Expression} newSchema
 * note that newSchema does not have to be an API call or Join
 * it can be anything, as long as it outputs type Records
 */

function changeSchema(before : Expression, newSchema : Expression, checkLevenshteinPlaceholder ?: boolean) : Expression {
    if (isSchema(before) || (checkLevenshteinPlaceholder && before instanceof LevenshteinPlaceholder))  {
        // console.log("Levenshtein changeSchema: original expression (printed below) is already a schema, nothing to change");
        // console.log(`${before.prettyprint()}`);
        return newSchema;
    }

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
    }
    return exprCopy;
}


// statically resolve predicate conflicts using SMT,
// and return whether this e1Predicate conflict with any in e2Predicates
// true for conflict (we don't care about which one it conflicts, just that it conflicts) 
// and false for not conflict
function predicateResolution(expr : BooleanExpression,
                             e2Predicates : BooleanExpression[]) : [boolean, BooleanExpression|undefined] {
    // this is super simple at the moment.
    // for now, if e1Predicate is not atomic, return False;
    // if it is, compare with each of e2Predicates
    // conflict is only detected if they are all using direct comparison "==" and have different values

    // TODO: in the future, use more advanced heuristics
            
    if (expr instanceof AtomBooleanExpression &&
        expr.operator === "==") {
        for (const expr2 of e2Predicates) {
            if (expr2 instanceof AtomBooleanExpression &&
                    expr2.operator === "==" &&
                    expr.name === expr2.name &&
                    !expr.value.equals(expr2.value)) {
                // console.debug(`applyLevenshtein (predicateResolution): given ${expr} and ${e2Predicates} to compare, detected contradiction`);
                return [true, undefined];
            }
        }
    }
    // console.debug(`applyLevenshtein (predicateResolution): given ${expr} and ${e2Predicates} to compare, no contradiction`);

    return [false, undefined];
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


// this returns all the predicates inside filter
class GetFilterPredicates extends NodeVisitor {
    predicates : BooleanExpression[] = [];

    visitFilterExpression(node : FilterExpression) : boolean {
        this.predicates.push(node.filter);
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
// 2. the result type (Records, Attributes, or Number);
//          -> for adding compatible opeartors back on top
// 3. all API invocations.
//          -> for determining if the incoming expression is referring to the same schema
function walkExpression(expr : Expression) : [BooleanExpression[], ReturnTypes, APICall[]] {

    // Here, we get all predicates stored into predicates
    const visitor = new GetFilterPredicates();
    expr.visit(visitor);
    const predicates = visitor.predicates;

    const visitor2 = new GetInvocationExpressionVisitor();
    expr.visit(visitor2);
    const apiCalls = visitor2.invocation;

    return [predicates, determineReturnType(expr), apiCalls];
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
