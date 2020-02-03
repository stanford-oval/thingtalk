// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

/**
 * Base class (interface) for traversing the AST using the visitor
 * pattern.
 *
 * During the traversal, each node will call the {@link Ast.NodeVisitor#enter}
 * method when visiting the node.
 *
 * After that, the the node will call the appropriate {@link Ast.NodeVisitor#visit}
*  method based on the node type. If the visit method returns true,
 * (which is the default for non-overridden methods), traversal continues
 * with children.
 *
 * After children have been visited, the node will call {@link Ast.NodeVisitor#exit} before
 * returning to the parent. {@link Ast.NodeVisitor#exit} is called regardless of the return value
 * of visit, so {@link Ast.NodeVisitor#enter} and {@link Ast.NodeVisitor#exit} are always paired.
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
 * @alias Ast.NodeVisitor
 * @abstract
 */
class NodeVisitor {
    /**
     * Begin visiting a node.
     *
     * This is called for all nodes before calling the corresponding
     * visit method.
     *
     * @param {Ast~Node} node - the node being entered
     */
    enter(node) {}

    /**
     * End visiting a node.
     *
     * This is called for all nodes after calling the corresponding
     * visit method and visiting all children.
     *
     * This method is not called if {@link Ast.NodeVisitor#enter} or
     * visit throws an exception.
     *
     * @param {Ast~Node} node - the node being exited
     */
    exit(node) {}

    // values
    // TODO should use different methods for different
    // Ast.Value subclasses
    visitValue(node) {}

    // bookkeeping

    /* istanbul ignore next */
    visitBookkeeping(node) {
        return true;
    }
    /* istanbul ignore next */
    visitSpecialBookkeepingIntent(node) {
        return true;
    }
    /* istanbul ignore next */
    visitChoiceBookkeepingIntent(node) {
        return true;
    }
    /* istanbul ignore next */
    visitCommandListBookkeepingIntent(node) {
        return true;
    }
    /* istanbul ignore next */
    visitAnswerBookkeepingIntent(node) {
        return true;
    }
    /* istanbul ignore next */
    visitPredicateBookkeepingIntent(node) {
        return true;
    }

    // classes
    /* istanbul ignore next */
    visitClassDef(node) {
        return true;
    }
    /* istanbul ignore next */
    visitFunctionDef(node) {
        return true;
    }
    /* istanbul ignore next */
    visitComputeDef(node) {
        return true;
    }
    /* istanbul ignore next */
    visitArgumentDef(node) {
        return true;
    }
    /* istanbul ignore next */
    visitClassImportStmt(node) {
        return true;
    }
    /* istanbul ignore next */
    visitMixinImportStmt(node) {
        return true;
    }

    // expressions
    /* istanbul ignore next */
    visitDeviceSelector(node) {
        return true;
    }
    /* istanbul ignore next */
    visitBuiltinSelector(node) {
        return true;
    }
    /* istanbul ignore next */
    visitInputParam(node) {
        return true;
    }
    /* istanbul ignore next */
    visitInvocation(node) {
        return true;
    }
    /* istanbul ignore next */
    visitTrueBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitFalseBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitAndBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitOrBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitNotBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitAtomBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitExternalBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitVarRefBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitComputeBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitListExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitPrimaryScalarExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitDerivedScalarExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitAggregationScalarExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitFilterScalarExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitFlattenedListScalarExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    visitVarRefScalarExpression(node) {
        return true;
    }

    // streams, tables, actions
    /* istanbul ignore next */
    visitVarRefTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitResultRefTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitInvocationTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitFilteredTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitProjectionTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitComputeTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitAliasTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitAggregationTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitSortedTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitIndexTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitSlicedTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitJoinTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitWindowTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitTimeSeriesTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitSequenceTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitHistoryTable(node) {
        return true;
    }
    /* istanbul ignore next */
    visitVarRefStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitTimerStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitAtTimerStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitMonitorStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitEdgeNewStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitEdgeFilterStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitFilteredStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitProjectionStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitComputeStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitAliasStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitJoinStream(node) {
        return true;
    }
    /* istanbul ignore next */
    visitVarRefAction(node) {
        return true;
    }
    /* istanbul ignore next */
    visitInvocationAction(node) {
        return true;
    }
    /* istanbul ignore next */
    visitSpecifiedPermissionFunction(node) {
        return true;
    }
    /* istanbul ignore next */
    visitBuiltinPermissionFunction(node) {
        return true;
    }
    /* istanbul ignore next */
    visitClassStarPermissionFunction(node) {
        return true;
    }
    /* istanbul ignore next */
    visitStarPermissionFunction(node) {
        return true;
    }

    // statements and inputs
    /* istanbul ignore next */
    visitDeclaration(node) {
        return true;
    }
    /* istanbul ignore next */
    visitAssignment(node) {
        return true;
    }
    /* istanbul ignore next */
    visitRule(node) {
        return true;
    }
    /* istanbul ignore next */
    visitCommand(node) {
        return true;
    }
    /* istanbul ignore next */
    visitOnInputChoice(node) {
        return true;
    }
    /* istanbul ignore next */
    visitDataset(node) {
        return true;
    }
    /* istanbul ignore next */
    visitProgram(node) {
        return true;
    }
    /* istanbul ignore next */
    visitPermissionRule(node) {
        return true;
    }
    /* istanbul ignore next */
    visitLibrary(node) {
        return true;
    }
    /* istanbul ignore next */
    visitExample(node) {
        return true;
    }

    // dialogue states
    visitDialogueState(node) {
        return true;
    }
    visitDialogueHistoryItem(node) {
        return true;
    }
    visitDialogueHistoryResult(node) {
        return true;
    }
}
module.exports = NodeVisitor;
