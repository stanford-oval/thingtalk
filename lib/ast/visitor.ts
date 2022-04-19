// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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

import AstNode from './base';
import type * as Values from './values';
import type * as BK from './control_commands';
import type * as CD from './class_def';
import type { FunctionDef, ArgumentDef } from './function_def';
import type * as Prog from './program';
import type * as Stmt from './statement';
import type * as Perm from './permissions';
import type * as Inv from './invocation';
import type * as BE from './boolean_expression';
import type * as Exp2 from './expression';
import type * as Prim from './legacy';
import type * as D from './dialogues';

/**
 * Base class (interface) for traversing the AST using the visitor
 * pattern.
 *
 * During the traversal, each node will call the {@link Ast.NodeVisitor.enter}
 * method when visiting the node.
 *
 * After that, the the node will call the appropriate visit
 * method based on the node type. If the visit method returns true,
 * (which is the default for non-overridden methods), traversal continues
 * with children.
 *
 * After children have been visited, the node will call {@link Ast.NodeVisitor.exit} before
 * returning to the parent. {@link Ast.NodeVisitor.exit} is called regardless of the return value
 * of visit, so {@link Ast.NodeVisitor.enter} and {@link Ast.NodeVisitor.exit} are always paired.
 *
 * Expected usage:
 * ```javascript
 * const visitor = new class extends Ast.NodeVisitor {
 *    visitMonitorStream(node) {
 *       // do something with it
 *       return true;
 *    }
 * };
 * program.visit(visitor);
 * ```
 *
 */
export default abstract class NodeVisitor {
    /**
     * Begin visiting a node.
     *
     * This is called for all nodes before calling the corresponding
     * visit method.
     *
     * @param node - the node being entered
     */
    enter(node : AstNode) : void {}

    /**
     * End visiting a node.
     *
     * This is called for all nodes after calling the corresponding
     * visit method and visiting all children.
     *
     * This method is not called if {@link Ast.NodeVisitor.enter} or
     * visit throws an exception.
     *
     * @param node - the node being exited
     */
    exit(node : AstNode) : void {}

    // values
    visitValue(node : Values.Value) : boolean {
        return true;
    }

    /* istanbul ignore next */
    visitArrayValue(node : Values.ArrayValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitVarRefValue(node : Values.VarRefValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitArrayFieldValue(node : Values.ArrayFieldValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitComputationValue(node : Values.ComputationValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitFilterValue(node : Values.FilterValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitUndefinedValue(node : Values.UndefinedValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitNullValue(node : Values.NullValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitContextRefValue(node : Values.ContextRefValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitBooleanValue(node : Values.BooleanValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitStringValue(node : Values.StringValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitNumberValue(node : Values.NumberValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitMeasureValue(node : Values.MeasureValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitCurrencyValue(node : Values.CurrencyValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitLocationValue(node : Values.LocationValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitDateValue(node : Values.DateValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitTimeValue(node : Values.TimeValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitEntityValue(node : Values.EntityValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitEnumValue(node : Values.EnumValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitEventValue(node : Values.EventValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitArgMapValue(node : Values.ArgMapValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitObjectValue(node : Values.ObjectValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitRecurrentTimeSpecificationValue(node : Values.RecurrentTimeSpecificationValue) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitRecurrentTimeRule(node : Values.RecurrentTimeRule) : boolean {
        return true;
    }

    // bookkeeping

    /* istanbul ignore next */
    visitControlCommand(node : BK.ControlCommand) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitSpecialControlIntent(node : BK.SpecialControlIntent) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitChoiceControlIntent(node : BK.ChoiceControlIntent) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitAnswerControlIntent(node : BK.AnswerControlIntent) : boolean {
        return true;
    }

    // classes
    /* istanbul ignore next */
    visitClassDef(node : CD.ClassDef) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitFunctionDef(node : FunctionDef) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitArgumentDef(node : ArgumentDef) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitMixinImportStmt(node : CD.MixinImportStmt) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitEntityDef(node : CD.EntityDef) : boolean {
        return true;
    }

    // expressions
    /* istanbul ignore next */
    visitDeviceSelector(node : Inv.DeviceSelector) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitInputParam(node : Inv.InputParam) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitInvocation(node : Inv.Invocation) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitTrueBooleanExpression(node : BE.TrueBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitFalseBooleanExpression(node : BE.FalseBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitAndBooleanExpression(node : BE.AndBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitOrBooleanExpression(node : BE.OrBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitNotBooleanExpression(node : BE.NotBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitAtomBooleanExpression(node : BE.AtomBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitExternalBooleanExpression(node : BE.ExternalBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitDontCareBooleanExpression(node : BE.DontCareBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitComputeBooleanExpression(node : BE.ComputeBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitComparisonSubqueryBooleanExpression(node : BE.ComparisonSubqueryBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitExistentialSubqueryBooleanExpression(node : BE.ExistentialSubqueryBooleanExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitPropertyPathElement(node : BE.PropertyPathElement) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitPropertyPathBooleanExpression(node : BE.PropertyPathBooleanExpression) : boolean {
        return true;
    }


    // streams, tables, actions
    /* istanbul ignore next */
    visitVarRefTable(node : Prim.VarRefTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitInvocationTable(node : Prim.InvocationTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitFilteredTable(node : Prim.FilteredTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitProjectionTable(node : Prim.ProjectionTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitComputeTable(node : Prim.ComputeTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitAliasTable(node : Prim.AliasTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitAggregationTable(node : Prim.AggregationTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitSortedTable(node : Prim.SortedTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitIndexTable(node : Prim.IndexTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitSlicedTable(node : Prim.SlicedTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitJoinTable(node : Prim.JoinTable) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitVarRefStream(node : Prim.VarRefStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitTimerStream(node : Prim.TimerStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitAtTimerStream(node : Prim.AtTimerStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitMonitorStream(node : Prim.MonitorStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitEdgeNewStream(node : Prim.EdgeNewStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitEdgeFilterStream(node : Prim.EdgeFilterStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitFilteredStream(node : Prim.FilteredStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitProjectionStream(node : Prim.ProjectionStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitComputeStream(node : Prim.ComputeStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitAliasStream(node : Prim.AliasStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitJoinStream(node : Prim.JoinStream) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitVarRefAction(node : Prim.VarRefAction) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitInvocationAction(node : Prim.InvocationAction) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitNotifyAction(node : Prim.NotifyAction) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitSpecifiedPermissionFunction(node : Perm.SpecifiedPermissionFunction) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitBuiltinPermissionFunction(node : Perm.BuiltinPermissionFunction) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitClassStarPermissionFunction(node : Perm.ClassStarPermissionFunction) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitStarPermissionFunction(node : Perm.StarPermissionFunction) : boolean {
        return true;
    }

    // new-style expressions
    /* istanbul ignore next */
    visitFunctionCallExpression(node : Exp2.FunctionCallExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitInvocationExpression(node : Exp2.InvocationExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitMonitorExpression(node : Exp2.MonitorExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitFilterExpression(node : Exp2.FilterExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitProjectionExpression(node : Exp2.ProjectionExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitProjectionElement(node : Exp2.ProjectionElement) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitProjectionExpression2(node : Exp2.ProjectionExpression2) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitBooleanQuestionExpression(node : Exp2.BooleanQuestionExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitAliasExpression(node : Exp2.AliasExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitAggregationExpression(node : Exp2.AggregationExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitSortExpression(node : Exp2.SortExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitIndexExpression(node : Exp2.IndexExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitSliceExpression(node : Exp2.SliceExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitChainExpression(node : Exp2.ChainExpression) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitJoinExpression(node : Exp2.JoinExpression) : boolean {
        return true;
    }

    // statements and inputs
    /* istanbul ignore next */
    visitFunctionDeclaration(node : Stmt.FunctionDeclaration) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitAssignment(node : Stmt.Assignment) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitRule(node : Stmt.Rule) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitCommand(node : Stmt.Command) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitExpressionStatement(node : Stmt.ExpressionStatement) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitReturnStatement(node : Stmt.ReturnStatement) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitDataset(node : Stmt.Dataset) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitExample(node : Stmt.Example) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitProgram(node : Prog.Program) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitPermissionRule(node : Prog.PermissionRule) : boolean {
        return true;
    }
    /* istanbul ignore next */
    visitLibrary(node : Prog.Library) : boolean {
        return true;
    }

    // dialogue states
    visitDialogueState(node : D.DialogueState) : boolean {
        return true;
    }
    visitDialogueHistoryItem(node : D.DialogueHistoryItem) : boolean {
        return true;
    }
    visitDialogueHistoryResultList(node : D.DialogueHistoryResultList) : boolean {
        return true;
    }
    visitDialogueHistoryResultItem(node : D.DialogueHistoryResultItem) : boolean {
        return true;
    }
}
