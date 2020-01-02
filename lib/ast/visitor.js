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
    async enter(node) {}

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
    async exit(node) {}

    // values
    // TODO should use different methods for different
    // Ast.Value subclasses
    async visitValue(node) {}

    // bookkeeping

    /* istanbul ignore next */
    async visitBookkeeping(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitSpecialBookkeepingIntent(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitChoiceBookkeepingIntent(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitCommandListBookkeepingIntent(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitAnswerBookkeepingIntent(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitPredicateBookkeepingIntent(node) {
        return true;
    }

    // classes
    /* istanbul ignore next */
    async visitClassDef(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitFunctionDef(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitComputeDef(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitArgumentDef(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitClassImportStmt(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitMixinImportStmt(node) {
        return true;
    }

    // expressions
    /* istanbul ignore next */
    async visitDeviceSelector(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitBuiltinSelector(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitInputParam(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitInvocation(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitTrueBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitFalseBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitAndBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitOrBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitNotBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitAtomBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitExternalBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitVarRefBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitComputeBooleanExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitListExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitPrimaryScalarExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitDerivedScalarExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitAggregationScalarExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitFilterScalarExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitFlattenedListScalarExpression(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitVarRefScalarExpression(node) {
        return true;
    }

    // streams, tables, actions
    /* istanbul ignore next */
    async visitVarRefTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitResultRefTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitInvocationTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitFilteredTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitProjectionTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitComputeTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitAliasTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitAggregationTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitSortedTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitIndexTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitSlicedTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitJoinTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitWindowTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitTimeSeriesTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitSequenceTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitHistoryTable(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitVarRefStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitTimerStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitAtTimerStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitMonitorStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitEdgeNewStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitEdgeFilterStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitFilteredStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitProjectionStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitComputeStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitAliasStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitJoinStream(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitVarRefAction(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitInvocationAction(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitSpecifiedPermissionFunction(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitBuiltinPermissionFunction(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitClassStarPermissionFunction(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitStarPermissionFunction(node) {
        return true;
    }

    // statements and inputs
    /* istanbul ignore next */
    async visitDeclaration(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitAssignment(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitRule(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitCommand(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitOnInputChoice(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitDataset(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitProgram(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitPermissionRule(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitLibrary(node) {
        return true;
    }
    /* istanbul ignore next */
    async visitExample(node) {
        return true;
    }
}
module.exports = NodeVisitor;
