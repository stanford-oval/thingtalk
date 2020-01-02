// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Node = require('./base');
const Ast = require('.');
const {
    prettyprintType,
    prettyprintAnnotations,
    prettyprintFilterExpression,
    prettyprintScalarExpression
} = require('../prettyprint');

/**
 * The definition of a compute function.
 *
 * @alias Ast.ComputeDef
 * @extends Ast~Node
 */
class ComputeDef extends Node {
    /**
     * Construct a new compute function definition.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     */
    constructor(location, name, type, args, computation, metadata, annotations) {
        super(location);
        this._name = name;
        this._type = type;
        this._args = args;
        this._computation = computation;
        this._metadata = metadata;
        this._annotations = annotations;
    }

    get name() {
        return this._name;
    }

    get type() {
        return this._type;
    }

    get args() {
        return this._args;
    }

    get computation() {
        return this._computation;
    }

    get metadata() {
        return this._metadata;
    }

    get annotations() {
        return this._annotations;
    }

    toString(prefix = '') {
        const args = this.args.map((a) => `${a.prettyprint()}`).join(', ');
        const annotations = prettyprintAnnotations(this);
        let computation;
        if (this._computation instanceof Ast.ScalarExpression)
            computation = prettyprintScalarExpression(this.computation);
        if (this._computation instanceof Ast.BooleanExpression)
            computation = prettyprintFilterExpression(this.computation);

        return `${prefix}compute ${this.name}(${args}) : ${prettyprintType(this.type)} := ${computation}${annotations};`;
    }

    async visit(visitor) {
        await visitor.enter(this);
        if (await visitor.visitComputeDef(this)) {
            for (let arg of this._args)
                await arg.visit(visitor);
        }
        await visitor.exit(this);
    }

    prettyprint(prefix='') {
        return this.toString(prefix);
    }

    clone() {
        const metadata = {};
        Object.assign(metadata, this.metadata);
        const annotations = {};
        Object.assign(annotations, this.annotations);

        return new ComputeDef(
            this.location,
            this.name,
            this.type,
            this.args.map((a) => a.clone()),
            this.computation.clone(),
            metadata,
            annotations
        );
    }
}
module.exports.ComputeDef = ComputeDef;
