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

import Node, { SourceRange } from "./base";
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
    SliceExpression, 
    primitiveArrayEquals } from "./expression";
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
import { AndBooleanExpression, AtomBooleanExpression, BooleanExpression, ComparisonSubqueryBooleanExpression, DontCareBooleanExpression, ExistentialSubqueryBooleanExpression, NotBooleanExpression, OrBooleanExpression, TrueBooleanExpression } from "./boolean_expression";
import { SyntaxPriority } from "./syntax_priority";
import { Program } from "./program";
import { optimizeChainExpression, optimizeFilter } from "../optimize";
import assert from 'assert';
import { EntityValue, UndefinedValue, Value } from "./values";
import { DialogueHistoryResultItem, DialogueState } from "./dialogues";
// import arrayEquals from "./array_equals";



export class Levenshtein extends Statement {
    expression : ChainExpression;
    // possibilities: `$continue` for now
    op : string;

    // When constructiing new Levenshtein, there is no need to set location
    // location is set from last-turn expression during apply
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
            this.expression.toSource()
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

export type APICall = 
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
export function ifOverlap(e1Invocations : APICall[], apiCalls : APICall[]) : boolean {
    for (const i of e1Invocations) {
        for (const j of apiCalls) {
            if (i instanceof FunctionCallExpression && j instanceof FunctionCallExpression && i.name === j.name)
                return true;
            if (i instanceof InvocationExpression && j instanceof InvocationExpression && i.invocation.channel === j.invocation.channel && i.invocation.selector.kind === j.invocation.selector.kind)
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
export function applyLevenshteinWrapper(e1 : Program, e2 : Program, dialogueState ?: DialogueState) : Program {
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
            thisStatement.expression = applyLevenshtein(e1Statement.expression, e2Statement, dialogueState);
            res.statements.push(thisStatement);
        }
    }
    return res;
}

export function toChainExpression(e1 : Program) : ChainExpression {
    return (e1.statements[0] as ExpressionStatement).expression;
}

export function applyLevenshteinExpressionStatement(e1 : ExpressionStatement, e2 : Levenshtein, dialogueState ?: DialogueState) : ExpressionStatement {
    const res = e1.clone();
    res.expression = applyLevenshtein(e1.expression, e2, dialogueState);
    return res;
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
 * This will also return an optimized result for any wrapper function to use
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
export function applyLevenshtein(e1 : ChainExpression, e2 : Levenshtein, dialogueState ?: DialogueState) : ChainExpression {
    // console.log(`old expression: ${e1.prettyprint()}`);
    // console.log(`lev expression: ${e2.prettyprint()}`);
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
                const [top, bottom, _] = chopExpression(e1expr, e2Predicates, dialogueState);
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
    res.schema = res.last.schema;
    const res_ = optimizeChainExpression(res);
    return res_;
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
function chopExpression(expr : Expression, e2Predicates : BooleanExpression[], dialogueState ?: DialogueState) : [Expression, Expression, boolean] {
    // console.log(`chopExpression ${expr.prettyprint()}`);
    // base case 1
    if (isSchema(expr))
        return [new LevenshteinPlaceholder(null, null), expr, false];
    
    // base case 2
    if (expr instanceof FilterExpression) {
        const [ifConflict, newFilter] = predicateResolution(expr.filter, e2Predicates, dialogueState);
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
    const [top, bottom, ifConflict] = chopExpression((expr as NoneSchemaType).expression, e2Predicates, dialogueState);
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

function ifComparable(e1Value : Value, e2Value : Value) : boolean {
    return (e1Value.isString && e2Value.isString) || (e1Value.isNumber && e2Value.isNumber);
}


/** This function iterates through all boolean expressions occuring in the incoming levenshtein
 *  to determine whether an AtomBooleanExpression-like expression from last turn contradicts and/or repeats
 *  any of the incoming filters
 * 
 * 
 * @param e1     - AtomBooleanExpression-like expressions
 * 
 */
function predicateResolutionSingleE1(e1 : BooleanExpression,
                                     e2expr : BooleanExpression[],
                                     dialogueState ?: DialogueState) : [boolean, BooleanExpression|undefined] {
    // we must finish iterating through all of e2expr before deciding if it's a repetition
    // because we could have a conflict later on
    // this flag is used for that purpose
    let isRepetition = false;
    
    for (const e2 of e2expr) {
        // striaght up repetition
        if (e1.equals(e2)) {
            isRepetition = true;
            continue;
        }
        // if anyone conflicts, it is a conflict
        // if anyone repeats, it is a repetition
        if (e2 instanceof AndBooleanExpression) {                
            for (const eachRes of e2.operands.map((x) => predicateResolutionSingleE1(e1, [x], dialogueState))) {
                if (eachRes[0])
                    return [true, undefined];
                if (eachRes[1] === undefined)
                    isRepetition = true;
            }
        } 
        // if all conflict, it is a conflict
        // if anyone repeats, it is a repetition
        if (e2 instanceof OrBooleanExpression) {
            let isConflict = true;
            for (const eachRes of e2.operands.map((x) => predicateResolutionSingleE1(e1, [x], dialogueState))) {
                if (eachRes[0] === false)
                    isConflict = false;
                if (eachRes[1] === undefined)
                    isRepetition = true;
            }
            if (isConflict)
                return [true, undefined];
        }
        
        if (e1 instanceof AtomBooleanExpression) {
            if (e2 instanceof AtomBooleanExpression && e1.name === e2.name) {
                // if both are quality, always a contradiction
                if (e1.operator === "==" && e2.operator === "==")
                    return [true, undefined];

                const e1Value : Value = e1.value;
                const e2Value : Value = e2.value;

                // the new value is the same, it's a conflict (because the opeartor must be different, otherwise is picked up above)
                if (e1Value.equals(e2Value)) {
                    assert(e1.operator !== e2.operator);
                    return [true, undefined];
                }

                // deal with arithmetic operators (==, <=, >=, <, >)
                // NOTE: we prioritize judging the same expression as being contradictory
                //       because there is no easier way to express a refinement conflict
                if (ifComparable(e1Value, e2Value)) {
                    // same operator, but updated value, always consdier as conflict
                    if (e1.operator === e2.operator)
                        return [true, undefined];
                    
                    // if one has equality, always consider as conflict
                    if (e1.operator === "==" || e2.operator === "==")
                        return [true, undefined];
                    
                    // 4 choice of opeartor (<, <=, >, >=), each has two options. A total of 8 conditions
                    if ((e1.operator === "<=" && e2.operator === ">=" && e1Value < e2Value)  ||
                        (e1.operator === ">=" && e2.operator === "<=" && e1Value > e2Value)  ||
                        (e1.operator === "<"  && e2.operator === ">"  && e1Value <= e2Value) ||
                        (e1.operator === "<=" && e2.operator === ">"  && e1Value <= e2Value) ||
                        (e1.operator === "<"  && e2.operator === ">=" && e1Value <= e2Value) ||
                        (e1.operator === ">"  && e2.operator === "<"  && e1Value >= e2Value) ||
                        (e1.operator === ">=" && e2.operator === "<"  && e1Value >= e2Value) ||
                        (e1.operator === ">" && e2.operator === "<="  && e1Value >= e2Value))
                        return [true, undefined];
                }

                const softMatchOperators = ["==", "~=", "=~"];
                if (e1Value.isString && e2Value.isString && softMatchOperators.includes(e1.operator) && softMatchOperators.includes(e2.operator))
                    return [true, undefined];
                
                // special cased ID processing
                // in first turn, ID is soft-matched, while in later turns it is picked up as ==
                // so if we see an == later on, discard the previous soft match
                if (e1.operator === "=~" && e2.operator === "==" && e1.name === "id")
                    return [true, undefined];
            } else if (e2 instanceof NotBooleanExpression) {
                // De-Morgan already done in e2 during Levenshtein optimize
                assert(!(e2.expr instanceof AndBooleanExpression || e2.expr instanceof OrBooleanExpression));
                if (e1.equals(e2.expr))
                    return [true, undefined];
            }
            if (e2 instanceof DontCareBooleanExpression && e1.name === e2.name)
                return [true, undefined];
            
            // special case id parameter
            // if e1 is of the form `filter id === ...`, this implies that we are carrying certain results by value
            // instead of by reference (filter by the qualities)
            // in such cases, we search back the dialogue state to retrieve the attributes information about this id
            // and determine if it conflicts with the given expression 
            if (e1.name === "id" && e1.operator === "==" && e1.value instanceof EntityValue && e2 instanceof AtomBooleanExpression) {
                const IdVisitor = new RetrieveIDInformation(e1.value);
                dialogueState?.visit(IdVisitor);
                if (IdVisitor.res && IdVisitor.res[e2.name] && !IdVisitor.res[e2.name].equals(e2.value))
                    return [true, undefined];
            }
        }
        
        if (e1 instanceof NotBooleanExpression && e2 instanceof AtomBooleanExpression) {
            assert(!(e1.expr instanceof AndBooleanExpression || e1.expr instanceof OrBooleanExpression));
            if (e1.expr instanceof AtomBooleanExpression && e1.expr.equals(e2))
                return [true, undefined];
        }
    
    }
    
    if (isRepetition)
        return [false, undefined];
    return [false, e1];
}

/** Recursively apply de morgan laws to push down NOT opeartors at the lowest level
 * 
 * @param {BooleanExpression } expr
 * @returns {BooleanExpression} expression in which de-morgan is recursively applied
 */
function deMorgen(expr : BooleanExpression) : BooleanExpression {
    // recursive step
    if (!(expr instanceof NotBooleanExpression)) {
        if (expr instanceof AndBooleanExpression || expr instanceof OrBooleanExpression) {
            expr.operands = expr.operands.map((x) => deMorgen(x));
        } else if (expr instanceof ExistentialSubqueryBooleanExpression) {
            // for the following two cases, because we don't know whether expr.subquery or expr.rhs are boolean expressions
            // we use the filter predicates to run through. This risks running the recurse optimize part twice
            const visitor = new OptimizeFilterPredicates();
            expr.subquery.visit(visitor);
        } else if (expr instanceof ComparisonSubqueryBooleanExpression) {
            const visitor = new OptimizeFilterPredicates();
            expr.rhs.visit(visitor);
        }

        // if AtomBooleanExpression, DontCareBooleanExpression, TrueBooleanExpression, FalseBooleanExpression, ComputeBooleanExpression, don't do anything
        return expr;
    }
        

    
    const innerExpr = expr.expr;
    if (innerExpr instanceof AndBooleanExpression) {
        const res = new OrBooleanExpression(innerExpr.location, []);
        res.operands = innerExpr.operands.map((x) => new NotBooleanExpression(x.location, deMorgen(x)));
        return res;
    } else if (innerExpr instanceof OrBooleanExpression) {
        const res = new AndBooleanExpression(innerExpr.location, []);
        res.operands = innerExpr.operands.map((x) => new NotBooleanExpression(x.location, deMorgen(x)));
        return res;
    }
    return expr;
}

/** Given a predicate and a list of predicates to compare against, determine if the predicate
 *  conflicts / does not conflict with the list of predicate.
 *  If conflicts, it determines which part of the predicate does not conflict.
 *  If does not conflict, it determines if it is a repetition (see below for details)
 * 
 * @param {BooleanExpression} oldExpr - the single predicate to determine whether conflicts occur
 * @param {BooleanExpression[]} incomingExprs - the list of predicates to compare against (in delta)
 * @param {DialogueState} dialogueState - the current dialogue state, to facilitate resolutions regarding the id field
 * 
 * @return {[boolean, BooleanExpression|undefined]} - the behavior is the following;
 * if the first result is true, this indicates that there is a conflict
 *     if the second result is undefined, this means that the entire `oldExpr` conflicts
 *     if the second result is defined, it is the non-conflicting part of `oldExpr`
 * 
 * if the first result is false, this indicates that there is no conflict
 *     if the second result is undefined, this means that `oldExpr` is a repetition of some of the predicates in `incomingExprs`
 *     if the second result is defined, it is the non-repetitive part of `oldExpr`
*/
function predicateResolution(oldExpr : BooleanExpression,
                             incomingExprs : BooleanExpression[],
                             dialogueState ?: DialogueState) : [boolean, BooleanExpression|undefined] {
    oldExpr = deMorgen(oldExpr);
    if (oldExpr instanceof AndBooleanExpression) {
        let   ifConflict = false;
        const oldCompatiblePart = oldExpr.clone();
        oldCompatiblePart.operands = [];
        for (const i of oldExpr.operands.map((x) => predicateResolution(x, incomingExprs, dialogueState))) {
            if (i[0])
                ifConflict = true;
            
            if (i[1] !== undefined)
                oldCompatiblePart.operands.push(i[1]);
        }
        return [ifConflict, oldCompatiblePart];
    } else if (oldExpr instanceof OrBooleanExpression) {
        let   ifConflict = true;
        const oldCompatiblePart = oldExpr.clone();
        oldCompatiblePart.operands = [];
        for (const i of oldExpr.operands.map((x) => predicateResolution(x, incomingExprs, dialogueState))) {
            if (i[0] === false)
                ifConflict = false;
            
            if (i[1] !== undefined)
                oldCompatiblePart.operands.push(i[1]);
        }
        // for some reason, if an or expression has operands length === 0, it will optimize to false
        if (oldCompatiblePart.operands.length === 0)
            return [ifConflict, BooleanExpression.True];
        return [ifConflict, oldCompatiblePart];
    }

    return predicateResolutionSingleE1(oldExpr, incomingExprs, dialogueState);
}

// if a parameter exists in `old` parameter list that does not exist in `incoming`
// add to `incoming`
// if a parameter exists in `old` that is `undefinied` in new, also replace the `undefined` with it
function changeParams(incoming : InputParam[], old : InputParam[]) : InputParam[] {
    for (const i of old) {
        const possiblePlace = incoming.map((param) => {
            return param.name;
        }).indexOf(i.name);
        if (possiblePlace < 0)
            incoming.push(i.clone());
        else if (incoming[possiblePlace].value instanceof UndefinedValue)
            incoming[possiblePlace] = i.clone();
    }
    incoming.sort(sortByName);
    return incoming;
}

function sortByName(p1 : InputParam, p2 : InputParam) : -1|0|1 {
    if (p1.name < p2.name)
        return -1;
    if (p1.name > p2.name)
        return 1;
    return 0;
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

export function getAllInvocationExpression(node : Node) {
    const visitor = new GetInvocationExpressionVisitor();
    node.visit(visitor);
    return visitor.invocation;
}

export function getAllFilterNames(node : Node) {
    const visitor = new GetAllFilterNames();
    node.visit(visitor);
    return visitor.names;
}

// given an old list of API call, modify the incoming levenshtein API call
// in the following manner: if a parameter does not exist, add to it
class ModifyInvocationExpressionVisitor extends NodeVisitor {
    incomingInvocation : APICall[];

    constructor(incomingInvocation : APICall[]) {
        super();
        this.incomingInvocation = incomingInvocation;
    }

    // inv currently is from old
    visitFunctionCallExpression(inv : FunctionCallExpression) : boolean {
        for (const temp of this.incomingInvocation) {
            if (temp instanceof FunctionCallExpression && inv.name === temp.name) {
                inv.in_params = changeParams(temp.in_params, inv.in_params);
                break;
            }
        }
        return true;
    }

    // inv currently is from old
    visitInvocationExpression(inv : InvocationExpression) : boolean {
        for (const temp of this.incomingInvocation) {
            if (temp instanceof InvocationExpression &&
                inv.invocation.channel === temp.invocation.channel) {
                // inv.invocation.selector.equals(temp.invocation.selector)) {

                // NOTE: we do not require selector to be the same, because the constructed delta currently does not deal with this.
                //       instead, we copy from the old expression
                // TODO: investigate whether this is the best apporach.
                inv.invocation.in_params = changeParams(temp.invocation.in_params, inv.invocation.in_params);
                break;
            }
        }
        return true;
    }
}

class RetrieveIDInformation extends NodeVisitor {
    res ?: Record<string, Value>;
    
    constructor(private id : EntityValue) {
        super();
    }

    visitDialogueHistoryResultItem(node : DialogueHistoryResultItem) : boolean {
        const nodeId = node.value!['id'] as Value;
        if (nodeId && nodeId.equals(this.id) && !this.res) {
            this.res = node.value! as Record<string, Value>;
            return false;
        }
        return true;
    }
}


/** If a predicate in an AndBooleanExpression or OrBooleanExpression is a repetition of other predicates,
 *  get rid of it (using `predicateResolution`)
 */
class OptimizeFilterPredicates extends NodeVisitor {
    visitFilterExpression(node : FilterExpression) : boolean {
        node.filter = deMorgen(node.filter);
        if (node.filter instanceof AndBooleanExpression || node.filter instanceof OrBooleanExpression) {
            node.filter.operands = this.recurse(node.filter.operands);
            node.filter = optimizeFilter(node.filter);
        }
        return true;
    }

    recurse(predicates : BooleanExpression[]) : BooleanExpression[] {
        if (predicates.length <= 0)
            return [];
        if (predicates.length === 1)
            return predicates;
        const res = predicateResolution(predicates[0], predicates.slice(1));
        if (res[0] === false && res[1] === undefined)
            return this.recurse(predicates.slice(1));
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

/**
 * 
 * @param e1_ applied delta expression
 * @param e2_ standard expression (Gio's expression)
 * @param oldExpr 
 * @returns 
 */
export function determineSameExpressionLevenshtein(e1_ : ChainExpression, e2_ : ChainExpression, incoming ?: Levenshtein[], old ?: ChainExpression) : boolean {
    if (e1_.equals(e2_))
        return true;

    let e1 = e1_.clone();
    let e2 = e2_.clone();
    e1 = optimizeChainExpression(e1);
    e2 = optimizeChainExpression(e2);
    if (e1.equals(e2))
        return true;
    
    // this chunk deals with filters being pushed down (or being swapped around)
    // for any two expressions having the same filters (regardless of their locations)
    // this will consider them as equal (provided the other parts equal too, of course)
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
    }

    // This chunk deals with projection occuring in last-turn being wiped out in new turn (II.)
    e1 = e1_.clone();
    e2 = e2_.clone();
    if (e1.expressions.length !== e2.expressions.length)
        return false;

    if (incoming && old) {
        const visitor3 = new GetAllFilterNames();
        for (const eachL of incoming) {
            // assert(eachL.statements.length === 1);
            // assert(eachL.statements[0] instanceof Levenshtein);
            eachL.visit(visitor3);
        }
        old.visit(visitor3);
        // console.log(visitor3.names);

        for (let i = 0; i < e1.expressions.length; i ++) {
            let singleE1 = e1.expressions[i];
            let singleE2 = e2.expressions[i];

            // try to find a projection where they differ (must be in the same position)
            while (!isSchema(singleE1) && !isSchema(singleE2)) {
                if (singleE1 instanceof ProjectionExpression && singleE2 instanceof ProjectionExpression) {
                    if (!primitiveArrayEquals(singleE1.args, singleE2.args)) {
                        let same = true;
                        // everything in expected has to appear in generated expression
                        // console.log(singleE2.args);
                        // console.log(singleE1.args);
                        for (const j of singleE2.args) {
                            if (!singleE1.args.includes(j)) {
                                same = false;
                                break;
                            }
                        }
                        if (!same)
                            break;
                        // `same` must be true here

                        // things in generated might not appear in expected, provided they appear in the added filter
                        // but if something in generated that does not appear in expected and is not mentioned in added filter, discard
                        // console.log(visitor3.names);
                        for (const j of singleE1.args) {
                            if (!singleE2.args.includes(j)) {
                                if (!visitor3.names.includes(j)) {
                                    same = false;
                                    break;
                                }
                            }
                        }
                        if (!same)
                            break;
                        // if execute to here it means they differ by some names that were mentioned in last turn filter
                        singleE1.args = singleE2.args;
                        break;
                    }

                }
                singleE1 = (singleE1 as NoneSchemaType).expression;
                singleE2 = (singleE2 as NoneSchemaType).expression;
            }
        }
        if (e1.equals(e2))
            return true;
    }

    // This chunk deals with old slot value being kept in static delta while thrown out in Gio's implementation
    // This gets all the filters out of the applied result and Gio's expression, and check if both results are equal
    // Further, it checks if Gio's result is always a subset of the applied result, and the ones not appearing must come from old filters
    // namely: (gold \subseteq applied) && (applied - gold \subseteq old)
    // Further, this also takes into account of possibly projection modified, so e1 and e2 are not cloned from source again

    if (old) {
        // e1 = e1_.clone();
        // e2 = e2_.clone();
        e1.visit(new ResetFilterPredicates());
        e2.visit(new ResetFilterPredicates());
        e1 = optimizeChainExpression(e1);
        e2 = optimizeChainExpression(e2);
        if (e1.equals(e2)) {
            const visitor4 = new GetAllAtomBooleanExpressions();
            const visitor5 = new GetAllAtomBooleanExpressions();
            const visitor6 = new GetAllAtomBooleanExpressions();
            e1_.visit(visitor4);
            e2_.visit(visitor5);
            old.visit(visitor6);
            const appliedPredicates = visitor4.atomBooleanExpressions;
            const goldPredicates    = visitor5.atomBooleanExpressions;
            const oldPredicates     = visitor6.atomBooleanExpressions;
            
            let same = true;
            // check if everything in gold appears in applied
            for (const eachGold of goldPredicates) {
                let found = false;
                for (const eachApplied of appliedPredicates) {
                    if (eachGold.equals(eachApplied)) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    same = false;
                    break;
                }
            }
            if (same) {
                for (const eachApplied of appliedPredicates) {
                    let found = false;
                    for (const eachGold of goldPredicates) {
                        if (eachApplied.equals(eachGold)) {
                            found = true;
                            break;
                        }
                    }
                    // if something in applied does not appear in gold, it must be from old expression
                    if (!found) {
                        for (const eachOld of oldPredicates) {
                            if (eachApplied.equals(eachOld)) {
                                found = true;
                                break;
                            }
                        }

                    }
                    if (!found) {
                        same = false;
                        break;
                    }
                }
            }
            if (same)
                return true;
            
        }
    }
    // const oldSelector = (old?.expressions[0] as InvocationExpression).invocation.selector;
    // const incomingSelector = (incoming![0].expression.expressions[0] as InvocationExpression).invocation.selector;

    // console.log(`incoming: ${incoming?.map((i) => i.prettyprint())}, ${incomingSelector.kind}, ${incomingSelector.id}, ${incomingSelector.all}, ${incomingSelector.attributes.map((i) => i.prettyprint())}`);
    // console.log(`old     : ${old?.prettyprint()}, ${oldSelector.kind}, ${oldSelector.id}, ${oldSelector.all}, ${oldSelector.attributes.map((i) => i.prettyprint())}`);
    // console.log(`Selector: ${(e1.expressions[0] as InvocationExpression).invocation.selector.equals((e2.expressions[0] as InvocationExpression).invocation.selector)}`);
    // console.log(`Selector 1: ${(e1.expressions[0] as InvocationExpression).invocation.selector.kind}, ${(e1.expressions[0] as InvocationExpression).invocation.selector.id}, ${(e1.expressions[0] as InvocationExpression).invocation.selector.all}, ${(e1.expressions[0] as InvocationExpression).invocation.selector.attributes.map((i) => i.prettyprint())}`);
    // console.log(`Selector 2: ${(e2.expressions[0] as InvocationExpression).invocation.selector.kind}, ${(e2.expressions[0] as InvocationExpression).invocation.selector.id}, ${(e2.expressions[0] as InvocationExpression).invocation.selector.all}, ${(e2.expressions[0] as InvocationExpression).invocation.selector.attributes.map((i) => i.prettyprint())}`);
    // console.log(`Channel: ${(e1.expressions[0] as InvocationExpression).invocation.channel === (e2.expressions[0] as InvocationExpression).invocation.channel}`);
    // console.log(`Input Params: ${arrayEquals((e1.expressions[0] as InvocationExpression).invocation.in_params, (e2.expressions[0] as InvocationExpression).invocation.in_params)}`);
    // console.log(`Input Params 1: ${(e1.expressions[0] as InvocationExpression).invocation.in_params.map((i) => i.prettyprint())}`);
    // console.log(`Input Params 2: ${(e2.expressions[0] as InvocationExpression).invocation.in_params.map((i) => i.prettyprint())}`);
    return false;
}

class ResetFilterPredicates extends NodeVisitor {
    visitFilterExpression(node : FilterExpression) : boolean {
        node.filter = new TrueBooleanExpression();
        return true;
    }
}

class GetAllFilterNames extends NodeVisitor {
    names : string[] = [];
    visitAtomBooleanExpression(node : AtomBooleanExpression) : boolean {
        this.names.push(node.name);
        return true;
    }
}

class GetAllAtomBooleanExpressions extends NodeVisitor {
    atomBooleanExpressions : AtomBooleanExpression[] = [];
    visitAtomBooleanExpression(node : AtomBooleanExpression) : boolean {
        this.atomBooleanExpressions.push(node);
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
