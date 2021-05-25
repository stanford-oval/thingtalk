// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Silei Xu <silei@cs.stanford.edu>

import assert from 'assert';

import Node, { SourceRange } from './base';
import NodeVisitor from './visitor';
import { FunctionDef } from './function_def';
import { Value } from './values';

import {
    iterateSlots2InputParams,
    makeScope,
    DeviceAttributeSlot,
    AbstractSlot,
    OldSlot,
    ScopeMap,
    InvocationLike
} from './slots';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';
import arrayEquals from './array_equals';

interface Device {
    name : string;
}

/**
 * An expression that maps to one or more devices in Thingpedia.
 *
 * Selectors correspond to the `@`-device part of the ThingTalk code,
 * up to but not including the function name.
 *
 */
export class DeviceSelector extends Node {
    kind : string;
    id : string|null;
    principal : null;
    attributes : InputParam[];
    all : boolean;
    device ?: Device;

    /**
     * Construct a new device selector.
     *
     * @param location - the position of this node in the source code
     * @param kind - the Thingpedia class ID
     * @param id - the unique ID of the device being selected, or null
     *                           to select devices according to the attributes, or
     *                           all devices if no attributes are specified
     * @param principal - reserved/deprecated, must be `null`
     * @param attributes - other attributes used to select a device, if ID is unspecified
     * @param [all=false] - operate on all devices that match the attributes, instead of
     *                                having the user choose
     */
    constructor(location : SourceRange|null,
                kind : string,
                id : string|null,
                principal : null,
                attributes : InputParam[] = [],
                all = false) {
        super(location);

        assert(typeof kind === 'string');
        this.kind = kind;

        assert(typeof id === 'string' || id === null);
        this.id = id;

        assert(principal === null);
        this.principal = principal;

        this.attributes = attributes;

        this.all = all;
    }

    getAttribute(name : string) : InputParam|undefined {
        for (const attr of this.attributes) {
            if (attr.name === name)
                return attr;
        }
        return undefined;
    }

    toSource() : TokenStream {
        this.attributes.sort((p1, p2) => {
            if (p1.name < p2.name)
                return -1;
            if (p1.name > p2.name)
                return 1;
            return 0;
        });

        const attributes : TokenStream[] = [];
        if (this.all) {
            attributes.push(List.concat('all', '=', 'true'));
        } else if (this.id && this.id !== this.kind) {
            // note: we omit the device ID if it is identical to the kind (which indicates there can only be
            // one device of this type in the system)
            // this reduces the amount of stuff we have to encode/predict for the common cases

            const name = this.attributes.find((attr) => attr.name === 'name');
            const id = new Value.Entity(this.id, 'tt:device_id', name ? name.value.toJS() as string : null);
            attributes.push(List.concat('id', '=', id.toSource()));
        }

        for (const attr of this.attributes) {
            if (attr.value.isUndefined)
                continue;
            if (attr.name === 'name' && this.id)
                continue;

            attributes.push(List.concat(attr.name, '=', attr.value.toSource()));
        }
        if (attributes.length === 0)
            return List.singleton('@' + this.kind);
        return List.concat('@' + this.kind, '(', List.join(attributes, ','), ')');
    }

    clone() : DeviceSelector {
        const attributes = this.attributes.map((attr) => attr.clone());
        return new DeviceSelector(this.location, this.kind, this.id, this.principal, attributes, this.all);
    }

    equals(other : DeviceSelector) : boolean {
        return other instanceof DeviceSelector &&
            this.kind === other.kind &&
            this.id === other.id &&
            arrayEquals(this.attributes, other.attributes) &&
            this.all === other.all;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDeviceSelector(this)) {
            for (const attr of this.attributes)
                attr.visit(visitor);
        }
        visitor.exit(this);
    }

    toString() : string {
        return `Device(${this.kind}, ${this.id ? this.id : ''}, )`;
    }
}

/**
 * AST node corresponding to an input parameter passed to a function.
 */
export class InputParam extends Node {
    isInputParam = true;
    /**
     * The input argument name.
     */
    name : string;
    /**
     * The value being passed.
     */
    value : Value;

    /**
     * Construct a new input parameter node.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} name - the input argument name
     * @param {Ast.Value} value - the value being passed
     */
    constructor(location : SourceRange|null,
                name : string,
                value : Value) {
        super(location);

        assert(typeof name === 'string');
        this.name = name;

        assert(value instanceof Value);
        this.value = value;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitInputParam(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    toSource() : TokenStream {
        return List.concat(this.name, '=', this.value.toSource());
    }

    clone() : InputParam {
        return new InputParam(this.location, this.name, this.value.clone());
    }

    equals(other : InputParam) : boolean {
        return this.name === other.name &&
            this.value.equals(other.value);
    }

    toString() : string {
        return `InputParam(${this.name}, ${this.value})`;
    }
}

/**
 * An invocation of a ThingTalk function.
 *
 */
export class Invocation extends Node {
    isInvocation = true;
    /**
     * The selector choosing where the function is invoked.
     */
    selector : DeviceSelector;
    /**
     * The function name being invoked.
     */
    channel : string;
    /**
     * The input parameters passed to the function.
     */
    in_params : InputParam[];
    /**
     * Type signature of the invoked function.
     * This property is guaranteed not `null` after type-checking.
     */
    schema : FunctionDef|null;
    __effectiveSelector : DeviceSelector|null = null;

    /**
     * Construct a new invocation.
     *
     * @param location - the position of this node in the source code
     * @param {Ast.DeviceSelector} selector - the selector choosing where the function is invoked
     * @param {string} channel - the function name
     * @param {Ast.InputParam[]} in_params - input parameters passed to the function
     * @param {Ast.FunctionDef|null} schema - type signature of the invoked function
     */
    constructor(location : SourceRange|null,
                selector : DeviceSelector,
                channel : string,
                in_params : InputParam[],
                schema : FunctionDef|null) {
        super(location);

        assert(selector instanceof DeviceSelector);
        this.selector = selector;

        assert(typeof channel === 'string');
        this.channel = channel;

        assert(Array.isArray(in_params));
        this.in_params = in_params;

        assert(schema === null || schema instanceof FunctionDef);
        this.schema = schema;
    }

    toSource() : TokenStream {
        // filter out parameters that are required and undefined
        let filteredParams = this.in_params;
        if (this.schema) {
            const schema : FunctionDef = this.schema;
            filteredParams = this.in_params.filter((ip) => {
                return !ip.value.isUndefined || !schema.isArgRequired(ip.name);
            });
        }

        return List.concat(this.selector.toSource(), '.', this.channel,
            '(', List.join(filteredParams.map((ip) => ip.toSource()), ','), ')');
    }

    clone() : Invocation {
        const clone = new Invocation(
            this.location,
            this.selector.clone(),
            this.channel,
            this.in_params.map((p) => p.clone()),
            this.schema ? this.schema.clone(): null
        );
        clone.__effectiveSelector = this.__effectiveSelector;
        return clone;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitInvocation(this)) {
            this.selector.visit(visitor);
            for (const in_param of this.in_params)
                in_param.visit(visitor);
        }
        visitor.exit(this);
    }

    toString() : string {
        const in_params = this.in_params && this.in_params.length > 0 ? this.in_params.toString() : '';
        return `Invocation(${this.selector.toString()}, ${this.channel}, ${in_params}, )`;
    }

    /**
     * Iterate all slots (scalar value nodes) in this invocation.
     *
     * @param scope - available names for parameter passing
     * @deprecated Use {@link Ast.Invocation.iterateSlots2} instead.
     */
    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike, ScopeMap]> {
        yield [null, this.selector, this, {}];
        for (const in_param of this.in_params)
            yield [this.schema, in_param, this, scope];
        return [this, makeScope(this)];
    }

    /**
     * Iterate all slots (scalar value nodes) in this invocation.
     *
     * @param {Object.<string, Ast~SlotScopeItem>} scope - available names for parameter passing
     */
    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike, ScopeMap]> {
        if (this.selector instanceof DeviceSelector) {
            for (const attr of this.selector.attributes)
                yield new DeviceAttributeSlot(this, attr);

            // note that we yield the selector after the device attributes
            // this way, almond-dialog-agent will first ask any question to slot-fill
            // the device attributes (if somehow it needs to) and then use the chosen
            // device attributes to choose the device
            yield this.selector;
        }
        return yield* iterateSlots2InputParams(this, scope);
    }
}
