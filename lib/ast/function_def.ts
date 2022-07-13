// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

import Node, {
    SourceRange,
    NLAnnotationMap,
    AnnotationMap,
    AnnotationSpec,
    implAnnotationsToSource,
    nlAnnotationsToSource,
} from './base';
import Type from '../type';
import { Value } from './values';
import { ClassDef } from './class_def';
import NodeVisitor from './visitor';
import { clean } from '../utils';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';

// Class and function definitions

function makeIndex(args : string[]) : Record<string, number> {
    const index : Record<string, number> = {};
    let i = 0;
    for (const a of args)
        index[a] = i++;
    return index;
}

/**
 * The direction of a function argument (parameter).
 *
 */
export enum ArgDirection {
    IN_REQ = 'in req',
    IN_OPT = 'in opt',
    OUT = 'out'
}

/**
 * The definition of a function argument, with it's name, type and annotations.
 *
 * This class is also used to define fields in {@link Type.Compound} types.
 *
 */
export class ArgumentDef extends Node {
    /**
     * The direction of this argument.
     */
    direction : ArgDirection|null;
    /**
     * The argument name.
     */
    name : string;
    /**
     * The argument type.
     */
    type : Type;
    /**
     * The argument metadata (translatable annotations).
     */
    nl_annotations : NLAnnotationMap;
    /**
     * The argument annotations.
     */
    impl_annotations : AnnotationMap;
    /**
     * Whether this argument is an input or output argument.
     */
    is_input : boolean;
    /**
     * Whether this argument is required.
     */
    required : boolean;
    unique : boolean;
    private _is_compound_field : boolean;

    /**
     * Construct a new argument definition.
     *
     * @param location - the position of this node in the source code
     * @param direction - the direction of the argument, or null for a struct field
     * @param name - the argument name
     * @param type - the argument type
     * @param annotations - annotations of the argument
     * @param [annotations.nl={}] - natural-language annotations (translatable annotations)
     * @param [annotations.impl={}] - implementation annotations
     */
    constructor(location : SourceRange|null,
                direction : ArgDirection|null,
                name : string,
                type : Type,
                annotations : AnnotationSpec = {},
                is_compound_field = false) {
        super(location);

        this.direction = direction;
        this.is_input = direction ? direction !== ArgDirection.OUT : true;
        this.required = direction ? direction === ArgDirection.IN_REQ : true;
        this.name = name;
        this.type = type;
        this.nl_annotations = annotations.nl || {};
        this.impl_annotations = annotations.impl || {};

        this._is_compound_field = is_compound_field || this.direction === null;

        this.unique = this.impl_annotations.unique && this.impl_annotations.unique.isBoolean && this.impl_annotations.unique.toJS() === true;
        if (this.direction && type instanceof Type.Compound)
            this._updateFields(type);
        if (this.type instanceof Type.Array && this.type.elem instanceof Type.Compound)
            this._flattenCompoundArray();
    }

    toSource() : TokenStream {
        let list : TokenStream;
        if (!this.direction || this._is_compound_field)
            list = List.concat(this.name, ':', this.type.toSource());
        else
            list = List.concat(...this.direction.split(' '), this.name, ':', this.type.toSource());
        list = List.concat(list,
            nlAnnotationsToSource(this.nl_annotations),
            implAnnotationsToSource(this.impl_annotations));
        return list;
    }

    private _updateFields(type : Type.Compound) {
        for (const field in type.fields) {
            const argumentDef = type.fields[field];
            argumentDef.direction = this.direction;
            argumentDef.is_input = this.is_input;
            argumentDef.required = this.required;

            if (argumentDef.type instanceof Type.Compound)
                this._updateFields(argumentDef.type);
            if (argumentDef.type instanceof Type.Array && argumentDef.type.elem instanceof Type.Compound)
                this._updateFields(argumentDef.type.elem);
        }
    }

    // if a parameter is an array of compounds, flatten the compound
    private _flattenCompoundArray() {
        assert(this.type instanceof Type.Array && this.type.elem instanceof Type.Compound);

        const compoundType = this.type.elem as Type.Compound;
        for (const [name, field] of this._iterateCompoundArrayFields(compoundType))
            compoundType.fields[name] = field;
    }

    // iteratively flatten compound fields inside an array
    private *_iterateCompoundArrayFields(compound : Type.Compound, prefix = '') : Generator<[string, ArgumentDef], void> {
        for (const fname in compound.fields) {
            const field = compound.fields[fname].clone();
            yield [prefix + fname, field];

            if (field.type instanceof Type.Compound)
                yield *this._iterateCompoundArrayFields(field.type, `${prefix}${fname}.`);

            if (field.type instanceof Type.Array && field.type.elem instanceof Type.Compound)
                field._flattenCompoundArray();
        }
    }

     /**
     * The canonical form of this argument.
     *
     * This is the primary form of the `#_[canonical]` annotation,
     * if present, or an automatically derived string based on the
     * argument name.
     *
     */
    get canonical() : string {
        const canonical = this.nl_annotations.canonical;
        if (typeof canonical === 'string')
            return canonical;
        if (typeof canonical === 'object') {
            if ('base' in canonical)
                return canonical['base'][0];
            if ('property' in canonical)
                return canonical['property'][0];
            if ('npp' in canonical)
                return canonical['npp'][0];
        }
        return clean(this.name);
    }

    /**
     * Read and normalize an implementation annotation from this function definition.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation normalized value, or `undefined` if the
     *         annotation is not present
     */
    getImplementationAnnotation<T>(name : string) : T|undefined {
        if (Object.prototype.hasOwnProperty.call(this.impl_annotations, name))
            return this.impl_annotations[name].toJS() as T;
        else
            return undefined;
    }

    /**
     * Read a natural-language annotation from this function definition.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation value, or `undefined` if the
     *         annotation is not present
     */
    getNaturalLanguageAnnotation<T>(name : string) : T|undefined {
        if (Object.prototype.hasOwnProperty.call(this.nl_annotations, name))
            return this.nl_annotations[name] as T;
        else
            return undefined;
    }

    /**
     * Clone this argument and return a new object with the same properties.
     *
     * @return {Ast.ArgumentDef} the new instance
     */
    clone() : ArgumentDef {
        const nl = {};
        Object.assign(nl, this.nl_annotations);
        const impl = {};
        Object.assign(impl, this.impl_annotations);

        return new ArgumentDef(this.location, this.direction, this.name, this.type, { nl, impl },
            this._is_compound_field);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitArgumentDef(this);
        visitor.exit(this);
    }

    /**
     * All natural language metadata for this argument
     * (canonical, confirmation, formatted).
     * @deprecated metadata is deprecated and should not be used. Use {@link Ast.ArgumentDef.nl_annotations} instead.
     */
    get metadata() : NLAnnotationMap {
        return this.nl_annotations;
    }

    /**
     * Implementation annotations
     * @deprecated annotations is deprecated and should not be used. Use {@link Ast.ArgumentDef.impl_annotations} instead.
     */
    get annotations() : AnnotationMap {
        return this.impl_annotations;
    }

    /**
     * Read and normalize an annotation from this argument.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation normalized value, or `undefined` if the
     *         annotation is not present
     * @deprecated getAnnotation is deprecated and should not be used. Use {@link Ast.ArgumentDef.getImplementationAnnotation} instead.
     */
    getAnnotation<T>(name : string) : T|undefined {
        return this.getImplementationAnnotation<T>(name);
    }
}

/**
 * Callback type for a filter on arguments.
 *
 * @param {Ast.ArgumentDef} arg - the argument to check
 * @return {boolean} whether the argument passes the filter
 */
export type ArgumentFilterCallback = (arg : ArgumentDef) => boolean;

export type FunctionType = 'stream' | 'query' | 'action';

/**
 * The definition of a ThingTalk function (inside a class).
 *
 * Function definitions are semi-immutable: you should not modify a function definition
 * received from outside. Instead, you should call {@link Ast.FunctionDef.clone}
 * to create a new instance you can modify. This includes modifying metadata and annotations
 * through the {@link Ast.FunctionDef.metadata} and {@link Ast.FunctionDef.annotations}
 * properties. Failure to call {@link Ast.FunctionDef.clone} will result in obsure
 * type checking errors.
 *
 */
export class FunctionDef extends Node {
    private _functionType : FunctionType;
    private _name : string;
    private _qualifiedName : string;
    private _qualifiers : {
        is_list : boolean;
        is_monitorable : boolean;
    };
    private _nl_annotations : NLAnnotationMap;
    private _impl_annotations : AnnotationMap;
    private _args : string[];
    private _types : Type[];
    private _argmap : Record<string, ArgumentDef>;
    private _index : Record<string, number>;
    private _inReq : Type.TypeMap;
    private _inOpt : Type.TypeMap;
    private _out : Type.TypeMap;
    private _extends : string[];
    private _class : ClassDef|null;
    /**
     * The canonical forms of arguments defined by this expression signature.
     *
     * @deprecated Use {@link Ast.FunctionDef.getArgument} and
     *             {@link Ast.ArgumentDef.canonical} instead.
     */
    argcanonicals : string[];
    /**
     * The question (prompts) of arguments defined by this expression signature.
     *
     * @deprecated Use {@link Ast.FunctionDef.getArgument} and
     *             {@link Ast.ArgumentDef.metadata}`.prompt` instead.
     */
    questions : string[];

    /**
     * Whether this signature defines a `list` query function.
     *
     * This is always false on action and stream signatures.
     *
     */
    is_list : boolean;
    /**
     * Whether this signature defines a `monitorable` query function.
     *
     * This is always false on action signatures, and always true on stream signatures.
     *
     */
    is_monitorable : boolean;
    require_filter : boolean;
    default_projection : string[];
    minimal_projection : string[]|undefined;
    no_filter : boolean;

    /**
     * Construct a new function definition.
     *
     * @param location - the position of this node in the source code
     * @param functionType - the function type (`stream`, `query` or `action`)
     * @param {Ast.ClassDef|null} klass - the class that the function belongs to
     * @param {string} name - the function name
     * @param {string[]|null} _extends - functions that are extended by this definition
     * @param {Ast.ArgumentDef[]} args - the arguments in this function
     * @param {Object.<string, any>} qualifiers - the qualifiers of the function
     * @param {boolean} [qualifiers.is_list=false] - whether this function defines a `list` query
     * @param {boolean} [qualifiers.is_monitorable=false] - whether this function defines a `monitorable` query
     * @param {Object.<string, Object>} annotations - function annotations
     * @param {Object.<string, any>} [annotations.nl={}] - natural language annotations of the function (translatable annotations)
     * @param {Object.<string, Ast.Value>} [annotations.impl={}]- implementation annotations
     */
    constructor(location : SourceRange|null,
                functionType : FunctionType,
                klass : ClassDef|null,
                name : string,
                _extends : string[],
                qualifiers : {
                    is_list : boolean;
                    is_monitorable : boolean;
                },
                args : ArgumentDef[],
                annotations : AnnotationSpec = {}) {
        super(location);
        assert(functionType === 'stream' || functionType === 'query' || functionType === 'action');
        assert(Array.isArray(args));

        // load up options for function signature from qualifiers and annotations
        if (functionType === 'action') {
            assert(!qualifiers.is_list);
            assert(!qualifiers.is_monitorable);
        }

        this._name = name;
        this._qualifiedName = (klass ? klass.name : '') + '.' + name;
        this._qualifiers = qualifiers;
        this._extends = _extends || [];
        this._class = klass;

        this._nl_annotations = annotations.nl || {};
        this._impl_annotations = annotations.impl || {};

        this._functionType = functionType;

        this._args = [];
        this._types = [];
        this._argmap = {};
        this._inReq = {};
        this._inOpt = {};
        this._out = {};
        this._index = {};

        this.argcanonicals = [];
        this.questions = [];

        // flatten compound parameters
        args = this._flattenCompoundArguments(args);
        this._loadArguments(args);

        this.is_list = qualifiers.is_list || false;
        this.is_monitorable = qualifiers.is_monitorable || false;

        if ('require_filter' in this._impl_annotations)
            this.require_filter = this._impl_annotations.require_filter.toJS() as boolean;
        else
            this.require_filter = false;
        if ('default_projection' in this._impl_annotations && this._impl_annotations.default_projection.isArray)
            this.default_projection = this._impl_annotations.default_projection.toJS() as string[];
        else
            this.default_projection = [];

        this.minimal_projection = undefined;
        if ('minimal_projection' in this._impl_annotations && this._impl_annotations.minimal_projection.isArray)
            this.minimal_projection = this._impl_annotations.minimal_projection.toJS() as string[];

        this.no_filter = false;

        // delay setting the default #[minimal_projection] if the class is not yet constructed
        if (this._class !== null)
            this._setMinimalProjection();
    }

    /**
     * The function name, as declared in the ThingTalk code.
     */
    get name() : string {
        return this._name;
    }

    /**
     * The full name of the function, including the class name.
     *
     * This has the form of `<class-name>.<function-name>` if the
     * function belongs to a class, and `.<function-name>` otherwise.
     *
     * Hence, it's possible to distinguish functions that have no
     * class with the leading dot.
     */
    get qualifiedName() : string {
        return this._qualifiedName;
    }

    /**
     * The names of the arguments defined by this expression signature.
     *
     * This does not include arguments inherited from parent functions.
     */
    get args() : string[] {
        return this._args;
    }

    /**
     * The type of this signature, either `stream`, `query` or `action`
     */
    get functionType() : FunctionType {
        return this._functionType;
    }

    /**
     * The names of the base functions this signature extends.
     */
    get extends() : string[] {
        return this._extends;
    }

    /**
     * The class definition associated with this signature, or `null` if this
     * signature was not created as part of a ThingTalk class.
     */
    get class() : ClassDef|null {
        return this._class;
    }

    // for compatibility
    /**
     * The list of types of the arguments defined by this signature.
     *
     * This list includes the arguments defined by parent classes, and is in the
     * order returned by {@link Ast.FunctionDef.iterateArguments}.
     * @deprecated This property is deprecated because it is slow to compute if
     *             function inheritance is used, and not particularly useful.
     *             Use {@link Ast.FunctionDef.iterateArguments} instead.
     */
    get types() : Type[] {
        if (this.extends.length === 0)
            return this._types;
        const types = [];
        for (const arg of this.iterateArguments())
            types.push(arg.type);
        return types;
    }
    /**
     * A map of required input arguments defined by this signature, and their type.
     *
     * The map includes the arguments defined by parent classes.
     * @deprecated This property is deprecated because it is slow to compute if
     *             function inheritance is used.
     *             Use {@link Ast.FunctionDef.iterateArguments} instead.
     */
    get inReq() : Type.TypeMap {
        if (this.extends.length === 0)
            return this._inReq;
        const args : Type.TypeMap = {};
        for (const arg of this.iterateArguments()) {
            if (arg.required)
                args[arg.name] = arg.type;
        }
        return args;
    }
    /**
     * A map of optional input arguments defined by this signature, and their type.
     *
     * The map includes the arguments defined by parent classes.
     * @deprecated This property is deprecated because it is slow to compute if
     *             function inheritance is used.
     *             Use {@link Ast.FunctionDef.iterateArguments} instead.
     */
    get inOpt() : Type.TypeMap {
        if (this.extends.length === 0)
            return this._inOpt;
        const args : Type.TypeMap = {};
        for (const arg of this.iterateArguments()) {
            if (arg.is_input && !arg.required)
                args[arg.name] = arg.type;
        }
        return args;
    }
    /**
     * A map of output arguments defined by this signature, and their type.
     *
     * The map includes the arguments defined by parent classes.
     * @deprecated This property is deprecated because it is slow to compute if
     *             function inheritance is used.
     *             Use {@link Ast.FunctionDef.iterateArguments} instead.
     */
    get out() : Type.TypeMap {
        if (this.extends.length === 0)
            return this._out;
        const args : Type.TypeMap = {};
        for (const arg of this.iterateArguments()) {
            if (!arg.is_input)
                args[arg.name] = arg.type;
        }
        return args;
    }

    /**
     * The index of arguments in args.
     *.
     * @deprecated This property is deprecated and will not work properly for functions with inheritance
     */
    get index() : Record<string, number> {
        if (this.extends.length === 0)
            return this._index;
        throw new Error(`The index API for functions is deprecated and cannot be used with function inheritance`);
    }

    private _loadArguments(args : ArgumentDef[]) {
        this._args = this._args.concat(args.map((a) => a.name));
        this._types = this._types.concat(args.map((a) => a.type));
        this._index = makeIndex(this._args);

        for (const arg of args) {
            if (arg.is_input && arg.required)
                this._inReq[arg.name] = arg.type;
            else if (arg.is_input)
                this._inOpt[arg.name] = arg.type;
            else
                this._out[arg.name] = arg.type;
        }

        for (const arg of args) {
            this.argcanonicals.push(arg.canonical);
            this.questions.push(arg.metadata.question || arg.metadata.prompt || '');
            this._argmap[arg.name] = arg;
        }

    }

    private _flattenCompoundArguments(args : ArgumentDef[]) : ArgumentDef[] {
        let flattened = args;
        const existed = args.map((a) => a.name);
        for (const arg of args)
            flattened = flattened.concat(this._flattenCompoundArgument(existed, arg));
        return flattened;
    }

    private _flattenCompoundArgument(existed : string[], arg : ArgumentDef) {
        let flattened = existed.includes(arg.name) ? [] : [arg];
        if (arg.type instanceof Type.Compound) {
            for (const f in arg.type.fields) {
                const a = arg.type.fields[f].clone();
                a.name = arg.name + '.' + a.name;
                flattened = flattened.concat(this._flattenCompoundArgument(existed, a));
            }
        }
        return flattened;
    }

    toString() : string {
        return this.prettyprint();
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitFunctionDef(this)) {
            for (const arg of this.args)
                this._argmap[arg].visit(visitor);
        }
        visitor.exit(this);
    }

    /**
     * Whether the signature includes an argument with the given name.
     *
     * This method takes into account function extension.
     *
     * @param argname - the argument name
     * @return `true` if the argument is present on this or a parent signature
     */
    hasArgument(arg : string) : boolean {
        if (arg in this._argmap)
            return true;
        const inheritArguments = this.getImplementationAnnotation<boolean>('inherit_arguments');
        if (inheritArguments !== false && this.extends.length > 0) {
            const functionType = this.functionType === 'stream' ? 'query' : this.functionType;
            for (const fname of this.extends) {
                const f = this.class!.getFunction(functionType, fname)!;
                if (f.hasArgument(arg))
                    return true;
            }
        }
        return false;
    }

    /**
     * Retrieve the argument definition with the given name.
     *
     * This method takes into account function extension.
     *
     * @param argname - the argument name
     * @return the argument definition, or `undefined`
     *         if the argument does not exist
     */
    getArgument(argname : string) : ArgumentDef|undefined {
        if (argname in this._argmap)
            return this._argmap[argname];
        const inheritArguments = this.getImplementationAnnotation<boolean>('inherit_arguments');
        if (inheritArguments !== false && this.extends.length > 0) {
            const functionType = this.functionType === 'stream' ? 'query' : this.functionType;
            for (const fname of this.extends) {
                const f = this.class!.getFunction(functionType, fname)!;
                const arg = f.getArgument(argname);
                if (arg)
                    return arg;
            }
        }
        return undefined;
    }

    /**
     * Retrieve the type of the argument with the given name.
     *
     * This is a convenience method that combines {@link Ast.FunctionDef.getArgument}
     * and {@link Ast.ArgumentDef.type}.
     *
     * @param argname - the argument name
     * @return the argument type, or `undefined`
     *         if the argument does not exist
     */
    getArgType(argname : string) : Type|undefined {
        const arg = this.getArgument(argname);
        if (arg)
            return arg.type;
        else
            return undefined;
    }

    /**
     * Retrieve the canonical form of the argument with the given name.
     *
     * This is a convenience method that combines {@link Ast.FunctionDef.getArgument}
     * and {@link Ast.ArgumentDef.canonical}.
     *
     * @param argname - the argument name
     * @return the argument's canonical form, or `undefined`
     *         if the argument does not exist
     */
    getArgCanonical(argname : string) : string|undefined {
        const arg = this.getArgument(argname);
        if (arg)
            return arg.canonical;
        else
            return undefined;
    }

    /**
     * Retrieve the NL annotations of the argument with the given name.
     *
     * This is a convenience method that combines {@link Ast.FunctionDef.getArgument}
     * and {@link Ast.ArgumentDef.metadata}.
     *
     * @param argname - the argument name
     * @return the argument's NL annotations, or `undefined`
     *         if the argument does not exist
     */
    getArgMetadata(argname : string) : NLAnnotationMap|undefined {
        const arg = this.getArgument(argname);
        if (arg)
            return arg.nl_annotations;
        else
            return undefined;
    }

    /**
     * Check if the argument with the given name is an input.
     *
     * This is a convenience method that combines {@link Ast.FunctionDef.getArgument}
     * and {@link Ast.ArgumentDef.is_input}.
     *
     * @param argname - the argument name
     * @return whether the argument is an input, or `undefined`
     *         if the argument does not exist
     */
    isArgInput(argname : string) : boolean|undefined {
        const arg = this.getArgument(argname);
        if (arg)
            return arg.is_input;
        else
            return undefined;
    }

    /**
     * Check if the argument with the given name is required.
     *
     * This is a convenience method that combines {@link Ast.FunctionDef.getArgument}
     * and {@link Ast.ArgumentDef.required}.
     *
     * @param argname - the argument name
     * @return whether the argument is required, or `undefined`
     *         if the argument does not exist
     */
    isArgRequired(argname : string) : boolean|undefined {
        const arg = this.getArgument(argname);
        if (arg)
            return arg.required;
        else
            return undefined;
    }

    /**
     * Iterate all arguments in this signature.
     *
     * Iteration includes also arguments inherited from parent functions
     *
     * @param {Set} [returned=new Set] - a set of returned argument names to avoid duplicates
     */
    *iterateArguments(returned = new Set<string>()) : Generator<ArgumentDef, void> {
        for (const arg of this.args) {
            if (!returned.has(arg)) {
                returned.add(arg);
                yield this._argmap[arg];
            }
        }
        const inheritArguments = this.getImplementationAnnotation<boolean>('inherit_arguments');
        if (this.extends.length > 0 && inheritArguments !== false) {
            if (!this.class)
                throw new Error(`Class information missing from the function definition.`);
            for (const fname of this.extends) {
                const functionType = this.functionType === 'stream' ? 'query' : this.functionType;
                const parent = this.class.getFunction(functionType, fname);
                assert(parent);
                yield *parent.iterateArguments(returned);
            }
        }
    }

    /**
     * Check if this expression signature has any input arguments.
     */
    hasAnyInputArg() : boolean {
        for (const arg of this.iterateArguments()) {
            if (arg.is_input)
                return true;
        }
        return false;
    }

    /**
     * Check if this expression signature has any output arguments.
     */
    hasAnyOutputArg() : boolean {
        for (const arg of this.iterateArguments()) {
            if (!arg.is_input)
                return true;
        }
        return false;
    }

    // extract arguments from base functions
    private _flattenSubFunctionArguments() {
        return Array.from(this.iterateArguments());
    }

    /**
     * Clone this expression signature into a new signature with the given arguments.
     *
     * This is an internal method called by {@link FunctionDef.clone}
     * and similar functions. Subclasses can override it to call the subclass's
     * constructor.
     *
     * @param {Ast.ArgumentDef[]} args - the arguments in the new signature
     * @param {boolean} flattened - whether the new signature should be flattened or it
     *        it should preserve the extension relation
     * @return {Ast.FunctionDef} a clone of this signature, with a new
     *         set of arguments.
     */
    private _cloneInternal(args : ArgumentDef[], flattened = false) : FunctionDef {
        // clone qualifiers
        const qualifiers = Object.assign({}, this._qualifiers);

        // clone annotations
        const nl : NLAnnotationMap = {};
        Object.assign(nl, this.nl_annotations);
        const impl : AnnotationMap = {};
        Object.assign(impl, this.impl_annotations);
        const annotations = { nl, impl };

        const clone = new FunctionDef(this.location, this.functionType, this.class,
            this.name, flattened ? [] : this.extends, qualifiers, args, annotations);
        // set minimal projection now, in case this.class is null
        clone._setMinimalProjection();
        return clone;
    }

    /**
     * Clone this function definition into a new definition with the same arguments.
     *
     * @return a clone of this definition
     */
    clone() : FunctionDef {
        return this._cloneInternal(this.args.map((a) => this._argmap[a]));
    }

    /**
     * Add a new argument to this signature.
     *
     * This method does not mutate the instance, it returns a new instance with
     * the added argument.
     *
     * @param toAdd - the argument to add
     * @return a clone of this signature with a new argument
     */
    addArguments(toAdd : ArgumentDef[]) : FunctionDef {
        const args = this.args.map((a) => this._argmap[a]);
        args.push(...toAdd);
        return this._cloneInternal(args);
    }

    /**
     * Remove an argument from this signature.
     *
     * This method does not mutate the instance, it returns a new instance without
     * the removed argument.
     *
     * @param {string} arg - the name of the argument to remove
     * @return {Ast.FunctionDef} a clone of this signature with one fewer argument
     */
    removeArgument(arg : string) : FunctionDef {
        if (arg in this._argmap) {
            const args = this.args.filter((a) => a !== arg).map((a) => this._argmap[a]);
            return this._cloneInternal(args);
        } else if (this.hasArgument(arg)) {
            const args = this._flattenSubFunctionArguments()
                .filter((a) => a.name !== arg);
            return this._cloneInternal(args, true);
        } else {
            return this;
        }
    }

    /**
     * Remove all arguments that do not match a predicate from this signature.
     *
     * This method does not mutate the instance, it returns a new instance with
     * only the arguments that pass the predicate.
     *
     * @param {Ast~ArgumentFilterCallback} filter - a filter callback
     * @return {Ast.FunctionDef} a clone of this signature
     */
    filterArguments(filter : ArgumentFilterCallback) : FunctionDef {
        const args = this._flattenSubFunctionArguments().filter(filter);
        return this._cloneInternal(args, true);
    }

    /**
     * Clone this expression signature into a signature of the given type.
     *
     * This is used during typechecking to convert a table into a stream.
     */
    asType(type : FunctionType) : FunctionDef {
        const clone = this.clone();
        clone._functionType = type;
        return clone;
    }

    toSource() : TokenStream {
        // this is somewhat ugly
        // we first generate in turn:
        // - the type of function (query / action)
        // - the name
        // - the parenthesis
        // - the parent functions (`extends foo, bar, baz`)
        //
        // we set a tab stop at this position
        //
        // then we generate all the arguments
        // arguments are separated by ',' and '\n'
        // '\n' respects the tab stop so it is aligned at the parenthesis
        //
        // after the arguments we remove the tab stop and do the metadata/annotations
        // finally, we add ';' and newlines

        let list : TokenStream = List.concat(this.functionType, ' ', this.name);

        if (this._extends.length > 0)
            list = List.concat(list, 'extends', List.join(this._extends.map((e) => List.singleton(e)), ','));

        // set a tab stop immediately after the parenthesis
        list = List.concat(list, '(', '\t=+');

        let first = true;
        for (const argname of this.args) {
            if (argname.indexOf('.') >= 0)
                continue;

            const arg = this._argmap[argname];
            if (first) {
                list = List.concat(list, arg.toSource());
                first = false;
            } else {
                list = List.concat(list, ',', '\n', arg.toSource());
            }
        }

        // remove the tab stop
        list = List.concat(list, ')', '\t=-',
            nlAnnotationsToSource(this.nl_annotations),
            implAnnotationsToSource(this.impl_annotations),
            ';');

        if (this.is_list)
            list = List.concat('list', list);
        if (this.is_monitorable)
            list = List.concat('monitorable', list);

        return list;
    }

    setClass(klass : ClassDef|null) : void {
        this._class = klass;
        this._qualifiedName = (klass ? klass.name : '') + '.' + this._name;
        this._setMinimalProjection();
    }

    removeDefaultProjection() : void {
        this.default_projection = [];
        delete this._impl_annotations.default_projection;
    }

    removeMinimalProjection() : void {
        this.minimal_projection = [];
        delete this._impl_annotations.minimal_projection;
    }

    private _setMinimalProjection() {
        if (this.minimal_projection === undefined) {
            const idArg = this.getArgument('id');
            if (idArg && !idArg.is_input) {
                this.minimal_projection = ['id'];
                this._impl_annotations.minimal_projection = new Value.Array([new Value.String('id')]);
            } else {
                this.minimal_projection = [];
                this._impl_annotations.minimal_projection = new Value.Array([]);
            }
        }
        if (this.default_projection.length > 0) {
            // if default_projection is specified, all minimally present
            // arguments must be part of it
            for (const arg of this.minimal_projection)
                assert(this.default_projection.includes(arg));
        }
    }

    /**
     * All natural language annotations for this function
     * (canonical, confirmation, formatted).
     */
    get nl_annotations() : NLAnnotationMap {
        return this._nl_annotations;
    }
    /**
     * Implementation annotations (e.g. "url", "poll_interval" or "json_key")
     *
     */
    get impl_annotations() : AnnotationMap {
        return this._impl_annotations;
    }

    /**
     * Read and normalize an implementation annotation from this function definition.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation normalized value, or `undefined` if the
     *         annotation is not present
     */
    getImplementationAnnotation<T>(name : string) : T|undefined {
        if (Object.prototype.hasOwnProperty.call(this.impl_annotations, name))
            return this.impl_annotations[name].toJS() as T;
        else
            return undefined;
    }

    /**
     * Read a natural-language annotation from this function definition.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation value, or `undefined` if the
     *         annotation is not present
     */
    getNaturalLanguageAnnotation<T>(name : string) : T|undefined {
        if (Object.prototype.hasOwnProperty.call(this.nl_annotations, name))
            return this.nl_annotations[name] as T;
        else
            return undefined;
    }

    /**
     * The canonical form of this function.
     *
     * This should be preferred over accessing the `canonical` property
     * of {@link Ast.FunctionDef.metadata} because it will ensure
     * a canonical form exists even if the annotation is not present.
     */
    get canonical() : string|undefined {
        return this.nl_annotations.canonical;
    }

    /**
     * The confirmation string for this function.
     *
     * This is a convenience property for accessing the `confirmation` property
     * of {@link Ast.FunctionDef.metadata}. It will return `undefined`
     * if the annotation is not present.
     */
    get confirmation() : string|undefined {
        return this.nl_annotations.confirmation;
    }

    /**
     * Iterate all bases of this function (including indirect bases)
     */
    *iterateBaseFunctions() : IterableIterator<string> {
        yield this.name;
        if (this.extends.length > 0) {
            if (!this.class)
                throw new Error(`Class information missing from the function definition.`);
            for (const fname of this.extends) {
                const functionType = this.functionType === 'stream' ? 'query' : this.functionType;
                const f = this.class.getFunction(functionType, fname);
                if (!f)
                    throw new TypeError(`Parent function ${fname} not found`);
                yield* f.iterateBaseFunctions();
            }
        }
    }

    /**
     * Read and normalize an annotation from this function definition.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation normalized value, or `undefined` if the
     *         annotation is not present
     * @deprecated getAnnotation is deprecated and should not be used. Use {@link Ast.FunctionDef.getImplementationAnnotation} instead.
     */
    getAnnotation<T>(name : string) : T|undefined {
        return this.getImplementationAnnotation<T>(name);
    }

    /**
     * All natural language metadata for this function
     * (canonical, confirmation, formatted).
     * @deprecated metadata is deprecated and should not be used. Use {@link Ast.FunctionDef.nl_annotations} instead.
     */
    get metadata() : NLAnnotationMap {
        return this._nl_annotations;
    }
    /**
     * Implementation annotations (e.g. "url", "poll_interval" or "json_key")
     * @deprecated annotations is deprecated and should not be used. Use {@link Ast.FunctionDef.impl_annotations} instead.
     */
    get annotations() : AnnotationMap {
        return this._impl_annotations;
    }
}
