// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

//const Ast = require('./ast');
const Type = require('../type');
const { prettyprintType, prettyprintAnnotations } = require('../prettyprint');
const { Value } = require('./values');
const toJS = require('./toJS');
const { clean } = require('../utils');

// Class and function definitions

function makeIndex(args) {
    var index = {};
    var i = 0;
    for (var a of args)
        index[a] = i++;
    return index;
}

/**
 * The direction of a function argument (parameter).
 *
 * @enum
 * @alias Ast.ArgDirection
 */
const ArgDirection = {
    IN_REQ: 'in req',
    IN_OPT: 'in opt',
    OUT: 'out'
};
module.exports.ArgDirection = ArgDirection;

function legacyAnnotationToValue(value) {
    let v = null;
    if (typeof value === 'string')
        v = Value.String(value);
    else if (typeof value === 'boolean')
        v = Value.Boolean(value);
    else if (typeof value === 'number')
        v = Value.Number(value);
    else if (Array.isArray(value))
        v = Value.Array(value.map((elem) => legacyAnnotationToValue(elem)));
    return v;
}

/**
 * The definition of a function argument, with it's name, type and annotations.
 *
 * This class is also used to define fields in {@link Type.Compound} types.
 *
 * @alias Ast.ArgumentDef
 */
class ArgumentDef {
    /**
     * Construct a new argument definition.
     *
     * @param {Ast.ArgDirection|null} direction - the direction of the argument, or null for a struct field
     * @param {string} name - the argument name
     * @param {Type} type - the argument type
     * @param {Object.<string, any>} metadata - argument metadata (translatable annotations)
     * @param {Object.<string, Ast.Value>} annotations - argument annotations
     */
    constructor(direction, name, type, metadata, annotations) {
        /**
         * The direction of this argument.
         * @type {Ast.ArgDirection|null}
         * @readonly
         */
        this.direction = direction;
        /**
         * Whether this argument is an input or output argument.
         * @type {boolean}
         * @readonly
         */
        this.is_input = direction ? direction !== ArgDirection.OUT : undefined;
        /**
         * Whether this argument is required.
         * @type {boolean}
         * @readonly
         */
        this.required = direction ? direction === ArgDirection.IN_REQ : undefined;
        /**
         * The argument name.
         * @type {string}
         */
        this.name = name;
        /**
         * The argument type.
         * @type {Type}
         */
        this.type = type;
        /**
         * The argument metadata (translatable annotations).
         * @type {Object.<string,any>}
         */
        this.metadata = metadata || {};
        /**
         * The argument annotations.
         * @type {Object.<string,Ast.Value>}
         */
        this.annotations = annotations || {};

        this.unique = this.annotations.unique && this.annotations.unique.isBoolean && this.annotations.unique.value === true;
        if (this.direction && type.isCompound)
            this._updateFields(type);
        if (this.type.isArray && this.type.elem.isCompound)
            this._flattenCompoundArray(this);
    }

    _updateFields(type) {
        for (let field in type.fields) {
            const argumentDef = type.fields[field];
            argumentDef.direction = this.direction;
            argumentDef.is_input = this.is_input;
            argumentDef.required = this.required;

            if (argumentDef.type.isCompound)
                this._updateFields(argumentDef.type);
            if (argumentDef.type.isArray && argumentDef.type.elem.isCompound)
                this._updateFields(argumentDef.type.elem);
        }
    }

    // if a parameter is an array of compounds, flatten the compound
    _flattenCompoundArray(arg) {
        assert(arg.type.isArray && arg.type.elem.isCompound);
        for (let [name, field] of this._iterateCompoundArrayFields(arg.type.elem))
            arg.type.elem.fields[name] = field;
    }

    // iteratively flatten compound fields inside an array
    *_iterateCompoundArrayFields(compound, prefix='') {
        for (let fname in compound.fields) {
            let field = compound.fields[fname].clone();
            yield [prefix + fname, field];

            if (field.type.isCompound)
                yield *this._iterateCompoundArrayFields(field.type, `${prefix}${fname}.`);

            if (field.type.isArray && field.type.elem.isCompound)
                this._flattenCompoundArray(field);
        }

    }

     /**
     * The canonical form of this argument.
     *
     * This is the primary form of the `#_[canonical]` annotation,
     * if present, or an automatically derived string based on the
     * argument name.
     *
     * @type {string}
     * @readonly
     */
    get canonical() {
        let canonical = this.metadata.canonical;
        if (typeof canonical === 'string')
            return canonical;
        if (typeof canonical === 'object' && 'npp' in canonical)
            return canonical['npp'][0];
        return clean(this.name);
    }

    /**
     * Read and normalize an annotation from this argument.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation normalized value, or `undefined` if the
     *         annotation is not present
     */
    getAnnotation(key) {
        if (Object.prototype.hasOwnProperty.call(this.annotations, key))
            return this.annotations[key].toJS();
        else
            return undefined;
    }

    /**
     * Clone this argument and return a new object with the same properties.
     *
     * @return {Ast.ArgumentDef} the new instance
     */
    clone() {
        const metadata = {};
        Object.assign(metadata, this.metadata);
        const annotations = {};
        Object.assign(annotations, this.annotations);

        return new ArgumentDef(this.direction, this.name, this.type,
            metadata, annotations);
    }

    /**
     * Convert this AST node to a string of ThingTalk code.
     *
     * @param {string} [prefix] - an optional prefix to apply when printing the type
     * @return {string} - the ThingTalk code that corresponds to this argument definition
     */
    toString(prefix = '') {
        return `${this.direction} ${this.name}: ${prettyprintType(this.type, prefix)}${prettyprintAnnotations(this, ' ', false)}`;
    }

    /**
     * Convert this argument definition to prettyprinted ThingTalk code.
     *
     * @param {string} [prefix] - prefix each output line with this string (for indentation)
     * @return {string} the prettyprinted code
     */
    prettyprint(prefix = '') {
        return `${prefix}${this}`;
    }

    toManifest() {
        const obj = {
            name: this.name,
            type: prettyprintType(this.type),
            question: this.metadata['prompt'] || '',
            is_input: this.is_input,
            required: this.required
        };
        for (let key in this.annotations)
            obj[key] = this.annotations[key].toJS();
        return obj;
    }

    static fromManifest(manifest) {
        let is_input = manifest.is_input;
        let required = manifest.required;
        let direction = is_input ? (required ? ArgDirection.IN_REQ : ArgDirection.IN_OPT) : ArgDirection.OUT;
        let name = manifest.name;
        let type = Type.fromString(manifest.type);
        let metadata = {};
        if (manifest.question && manifest.question.length > 0) metadata.prompt = manifest.question;
        let annotations = {};
        for (let key in manifest) {
            if (['is_input', 'required', 'type', 'name', 'question'].indexOf(key) >= 0)
                continue;
            const v = legacyAnnotationToValue(manifest[key]);
            if (v)
                annotations[key] = v;
        }

        return new ArgumentDef(direction, name, type, metadata, annotations);
    }
}
module.exports.ArgumentDef = ArgumentDef;

/**
 * Callback type for a filter on arguments.
 *
 * @param {Ast.ArgumentDef} arg - the argument to check
 * @return {boolean} whether the argument passes the filter
 * @callback Ast~ArgumentFilterCallback
 */

/**
 * The signature (functional type) of a ThingTalk expression, either a query,
 * stream or action.
 *
 * Expression signature objects are basically bags of input and output arguments,
 * with a few extra bits. They are constructed during type checking, and attached
 * to other AST nodes to give the overall type of the expression represented by
 * that node.
 *
 * @alias Ast.ExpressionSignature
 */
class ExpressionSignature {
    /**
     * Construct a new expression signature.
     *
     * Client code should not construct {@link Ast.ExpressionSignature},
     * and should prefer constructing {@link Ast.FunctionDef} instead.
     *
     * @param {string} functionType - the signature type (`stream`, `query` or `action`)
     * @param {Ast.ClassDef|null} klass - the class definition the signature belongs to
     * @param {string[]|null} _extends - signature definitions that are extended by this definition
     * @param {Ast.ArgumentDef[]} args - the arguments in this signature
     * @param {Object.<string, any>} options - additional options of the signature
     * @param {boolean} [options.is_list=false] - whether this signature defines a `list` query function
     * @param {boolean} [options.is_monitorable=false] - whether this signature defines a `monitorable` query function
     * @param {boolean} [options.require_filter=false] - whether this expression must be filtered to typecheck correctly
     * @param {string[]} [options.default_projection=[]] - list of argument names that are applied as projection to this function
     *                                        when no other projection is present
     * @param {boolean} [options.no_filter=false] - whether filtering is allowed on expressions with this signature
     * @package
     */
    constructor(functionType, klass, _extends, args, options) {
        // ignored, for compat only
        this.kind_type = 'other';
        this._functionType = functionType;

        assert(functionType === 'stream' || functionType === 'query' || functionType === 'action');
        assert(Array.isArray(args));

        /**
         * The names of the arguments defined by this expression signature.
         *
         * This does include arguments inherited from parent functions.
         *
         * @type {string[]}
         * @readonly
         */
        this.args = [];
        this._types = [];
        this._argmap = {};
        this._inReq = {};
        this._inOpt = {};
        this._out = {};

        /**
         * The canonical forms of arguments defined by this expression signature.
         *
         * @type {string[]}
         * @readonly
         * @deprecated Use {@link Ast.ExpressionSignature#getArgument} and
         *             {@link Ast.ArgumentDef#canonical} instead.
         */
        this.argcanonicals = [];

        /**
         * The question (prompts) of arguments defined by this expression signature.
         *
         * @type {string[]}
         * @readonly
         * @deprecated Use {@link Ast.ExpressionSignature#getArgument} and
         *             {@link Ast.ArgumentDef#metadata}`.prompt` instead.
         */
        this.questions = [];

        // flatten compound parameters
        args = this._flattenCompoundArguments(args);
        this._loadArguments(args);

        /**
         * Whether this signature defines a `list` query function.
         *
         * This is always false on action and stream signatures.
         *
         * @type {boolean}
         * @readonly
         */
        this.is_list = options.is_list || false;

        /**
         * Whether this signature defines a `monitorable` query function.
         *
         * This is always false on action signatures, and always true on stream signatures.
         *
         * @type {boolean}
         * @readonly
         */
        this.is_monitorable = options.is_monitorable || false;
        this.require_filter = options.require_filter || false;
        this.default_projection = options.default_projection || [];
        this.no_filter = options.no_filter || false;

        this._extends = _extends || [];
        this._class = klass;
    }

    _loadArguments(args) {
        this.args = this.args.concat(args.map((a) => a.name));
        this._types = this._types.concat(args.map((a) => a.type));
        this._index = makeIndex(this.args);

        for (let arg of args) {
            if (arg.is_input && arg.required)
                this._inReq[arg.name] = arg.type;
            else if (arg.is_input)
                this._inOpt[arg.name] = arg.type;
            else
                this._out[arg.name] = arg.type;
        }

        for (let arg of args) {
            this.argcanonicals.push(arg.canonical);
            this.questions.push(arg.metadata.question || arg.metadata.prompt || '');
            this._argmap[arg.name] = arg;
        }

    }

    _flattenCompoundArguments(args) {
        let flattened = args;
        const existed = args.map((a) => a.name);
        for (let arg of args)
            flattened = flattened.concat(this._flattenCompoundArgument(existed, arg));
        return flattened;
    }

    _flattenCompoundArgument(existed, arg) {
        let flattened = existed.includes(arg.name) ? [] : [arg];
        if (arg.type.isCompound) {
            for (let f in arg.type.fields) {
                const a = arg.type.fields[f].clone();
                a.name = arg.name + '.' + a.name;
                flattened = flattened.concat(this._flattenCompoundArgument(existed, a));
            }
        }
        return flattened;
    }

    /**
     * Whether the signature includes an argument with the given name.
     *
     * This method takes into account function extension.
     *
     * @param {string} arg - the argument name
     * @return {boolean} `true` if the argument is present on this or a parent signature
     */
    hasArgument(arg) {
        if (arg in this._argmap)
            return true;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
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
     * @param {string} arg - the argument name
     * @return {Ast.ArgumentDef|undefined} the argument definition, or `undefined`
     *         if the argument does not exist
     */
    getArgument(arg) {
        if (arg in this._argmap)
            return this._argmap[arg];
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.getArgument(arg);
            }
        }
        return undefined;
    }

    /**
     * Retrieve the type of the argument with the given name.
     *
     * This is a convenience method that combines {@link Ast.ExpressionSignature#getArgument}
     * and {@link Ast.ArgumentDef#type}.
     *
     * @param {string} arg - the argument name
     * @return {Type|undefined} the argument type, or `undefined`
     *         if the argument does not exist
     */
    getArgType(arg) {
        if (arg in this._argmap)
            return this._argmap[arg].type;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.getArgType(arg);
            }
        }
        return undefined;
    }

    /**
     * Retrieve the canonical form of the argument with the given name.
     *
     * This is a convenience method that combines {@link Ast.ExpressionSignature#getArgument}
     * and {@link Ast.ArgumentDef#canonical}.
     *
     * @param {string} arg - the argument name
     * @return {string|undefined} the argument's canonical form, or `undefined`
     *         if the argument does not exist
     */
    getArgCanonical(arg) {
        if (arg in this._argmap)
            return this._argmap[arg].canonical;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.getArgCanonical(arg);
            }
        }
        return undefined;
    }

    /**
     * Retrieve the metadata of the argument with the given name.
     *
     * This is a convenience method that combines {@link Ast.ExpressionSignature#getArgument}
     * and {@link Ast.ArgumentDef#metadata}.
     *
     * @param {string} arg - the argument name
     * @return {Object.<string,any>|undefined} the argument's metadata, or `undefined`
     *         if the argument does not exist
     */
    getArgMetadata(arg) {
        if (arg in this._argmap)
            return this._argmap[arg].metadata;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.getArgMetadata(arg);
            }
        }
        return undefined;
    }

    /**
     * Check if the argument with the given name is an input.
     *
     * This is a convenience method that combines {@link Ast.ExpressionSignature#getArgument}
     * and {@link Ast.ArgumentDef#is_input}.
     *
     * @param {string} arg - the argument name
     * @return {boolean|undefined} whether the argument is an input, or `undefined`
     *         if the argument does not exist
     */
    isArgInput(arg) {
        if (arg in this._argmap)
            return this._argmap[arg].is_input;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.isArgInput(arg);
            }
        }
        return undefined;
    }

    /**
     * Check if the argument with the given name is an input.
     *
     * This is a convenience method that combines {@link Ast.ExpressionSignature#getArgument}
     * and {@link Ast.ArgumentDef#required}.
     *
     * @param {string} arg - the argument name
     * @return {boolean|undefined} whether the argument is required, or `undefined`
     *         if the argument does not exist
     */
    isArgRequired(arg) {
        if (arg in this._argmap)
            return this._argmap[arg].required;
        if (this.extends.length > 0) {
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
                if (f.hasArgument(arg))
                    return f.isArgRequired(arg);
            }
        }
        return undefined;
    }

    /**
     * Iterate all arguments in this signature.
     *
     * Iteration includes also arguments inherited from parent functions
     *
     * @param {Set} [returned=new Set] - a set of returned argument names to avoid duplicates
     * @yields {Ast.ArgumentDef}
     */
    *iterateArguments(returned = new Set) {
        for (let arg of this.args) {
            if (!returned.has(arg)) {
                returned.add(arg);
                yield this._argmap[arg];
            }
        }
        if (this.extends.length > 0) {
            if (!this.class)
                throw new Error(`Class information missing from the function definition.`);
            for (let fname of this.extends)
                yield *this.class.getFunction(this.functionType, fname).iterateArguments(returned);
        }
    }

    // extract arguments from base functions
    _flattenSubFunctionArguments() {
        const args = [];
        for (let arg of this.iterateArguments())
            args.push(arg);
        return args;
    }

    /**
     * Clone this expression signature into a new signature with the given arguments.
     *
     * This is an internal method called by {@link ExpressionSignature#clone}
     * and similar functions. Subclasses can override it to call the subclass's
     * constructor.
     *
     * @param {Ast.ArgumentDef[]} args - the arguments in the new signature
     * @param {boolean} flattened - whether the new signature should be flattened or it
     *        it should preserve the extension relation
     * @return {Ast.ExpressionSignature} a clone of this signature, with a new
     *         set of arguments.
     */
    _cloneInternal(args, flattened=false) {
        return new ExpressionSignature(
            this.functionType,
            this._class,
            flattened ? [] : this.extends,
            args,
            {
                is_list: this.is_list,
                is_monitorable: this.is_monitorable,
                require_filter: this.require_filter,
                default_projection: this.default_projection,
                no_filter: this.no_filter
            });
    }

    /**
     * Clone this expression signature into a new signature with the same arguments.
     *
     * @return {Ast.ExpressionSignature} a clone of this signature
     */
    clone() {
        return this._cloneInternal(this.args.map((a) => this._argmap[a]));
    }

    /**
     * Add a new argument to this signature.
     *
     * This method does not mutate the instance, it returns a new instance with
     * the added argument.
     *
     * @param {Ast.ArgumentDef} toAdd - the argument to add
     * @return {Ast.ExpressionSignature} a clone of this signature with a new argument
     */
    addArguments(toAdd) {
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
     * @return {Ast.ExpressionSignature} a clone of this signature with one fewer argument
     */
    removeArgument(arg) {
        if (arg in this._argmap) {
            const args = this.args.filter((a) => a !== arg).map((a) => this._argmap[a]);
            return this._cloneInternal(args);
        } else if (this.hasArgument(arg)) {
            const args = this._flattenSubFunctionArguments();
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
     * @return {Ast.ExpressionSignature} a clone of this signature
     */
    filterArguments(filter) {
        const args = this._flattenSubFunctionArguments().map((a) => a.name)
            .filter((a, i) => filter(this.getArgument(a), i)).map((a) => this.getArgument(a));

        return this._cloneInternal(args, true);
    }

    /**
     * The type of this signature, either `stream`, `query` or `action`
     * @type {string}
     * @readonly
     */
    get functionType() {
        return this._functionType;
    }

    /**
     * The names of the base functions this signature extends.
     * @type {string[]}
     * @readonly
     */
    get extends() {
        return this._extends;
    }

    /**
     * The class definition associated with this signature, or `null` if this
     * signature was not created as part of a ThingTalk class.
     * @type {Ast.ClassDef|null}
     * @readonly
     */
    get class() {
        return this._class;
    }

    // for compatibility
    /**
     * The list of types of the arguments defined by this signature.
     *
     * This list includes the arguments defined by parent classes, and is in the
     * order returned by {@link Ast.ExpressionSignature#iterateArguments}.
     * @type {Type[]}
     * @readonly
     * @deprecated This property is deprecated because it is slow to compute if
     *             function inheritance is used, and not particularly useful.
     *             Use {@link Ast.ExpressionSignature#iterateArguments} instead.
     */
    get types() {
        if (this.extends.length === 0)
            return this._types;
        const types = [];
        for (let arg of this.iterateArguments())
            types.push(arg.type);
        return types;
    }
    /**
     * A map of required input arguments defined by this signature, and their type.
     *
     * The map includes the arguments defined by parent classes.
     * @type {Object.<string,Type>}
     * @readonly
     * @deprecated This property is deprecated because it is slow to compute if
     *             function inheritance is used.
     *             Use {@link Ast.ExpressionSignature#iterateArguments} instead.
     */
    get inReq() {
        if (this.extends.length === 0)
            return this._inReq;
        const args = {};
        for (let arg of this.iterateArguments()) {
            if (arg.required)
                args[arg.name] = arg.type;
        }
        return args;
    }
    /**
     * A map of optional input arguments defined by this signature, and their type.
     *
     * The map includes the arguments defined by parent classes.
     * @type {Object.<string,Type>}
     * @readonly
     * @deprecated This property is deprecated because it is slow to compute if
     *             function inheritance is used.
     *             Use {@link Ast.ExpressionSignature#iterateArguments} instead.
     */
    get inOpt() {
        if (this.extends.length === 0)
            return this._inOpt;
        const args = {};
        for (let arg of this.iterateArguments()) {
            if (arg.is_input && !arg.required)
                args[arg.name] = arg.type;
        }
        return args;
    }
    /**
     * A map of output arguments defined by this signature, and their type.
     *
     * The map includes the arguments defined by parent classes.
     * @type {Object.<string,Type>}
     * @readonly
     * @deprecated This property is deprecated because it is slow to compute if
     *             function inheritance is used.
     *             Use {@link Ast.ExpressionSignature#iterateArguments} instead.
     */
    get out() {
        if (this.extends.length === 0)
            return this._out;
        const args = {};
        for (let arg of this.iterateArguments()) {
            if (!arg.is_input)
                args[arg.name] = arg.type;
        }
        return args;
    }

    /**
     * The index of arguments in args.
     *.
     * @type {Object.<string,Number>}
     * @readonly
     * @deprecated This property is deprecated and will not work properly for functions with inheritance
     */
    get index() {
        if (this.extends.length === 0)
            return this._index;
        throw new Error(`The index API for functions is deprecated and cannot be used with function inheritance`);
    }
}
module.exports.ExpressionSignature = ExpressionSignature;

/**
 * The definition of a ThingTalk function (inside a class).
 *
 * A function definition is a particular type of {@link Ast.ExpressionSignature}
 * that also has a name and annotations.
 *
 * Function definitions are semi-immutable: you should not modify a function definition
 * received from outside. Instead, you should call {@link Ast.FunctionDef#clone}
 * to create a new instance you can modify. This includes modifying metadata and annotations
 * throw the {@link Ast.FunctionDef#metadata} and {@link Ast.FunctionDef#annotations}
 * properties. Failure to call {@link Ast.FunctionDef#clone} will result in obsure
 * type checking errors.
 *
 * @alias Ast.FunctionDef
 * @extends Ast.ExpressionSignature
 */
class FunctionDef extends ExpressionSignature {
    /**
     * Construct a new function definition.
     *
     * @param {string} functionType - the function type (`stream`, `query` or `action`)
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
    constructor(functionType, klass, name, _extends, qualifiers, args, annotations) {
        // load up options for function signature from qualifiers and annotations
        const options = {};
        options.is_list = qualifiers.is_list || false;
        options.is_monitorable = qualifiers.is_monitorable || false;

        if (annotations.impl) {
            if ('require_filter' in annotations.impl)
                options.require_filter = annotations.impl.require_filter.value;
            else
                options.require_filter = false;
            if ('default_projection' in annotations.impl && annotations.impl.default_projection.isArray) {
                options.default_projection = annotations.impl.default_projection.value.map((param) => {
                    return param.value;
                });
            } else {
                options.default_projection = [];
            }
        }

        super(functionType, klass, _extends, args, options);

        this._name = name;
        this._qualifiers = qualifiers;
        this._nl_annotations = annotations.nl || {};
        this._impl_annotations = annotations.impl || {};
    }

    /**
     * The function name.
     * @type {string}
     * @readonly
     */
    get name() {
        return this._name;
    }

    /**
     * All natural language annotations for this function
     * (canonical, confirmation, formatted).
     * @type {Object.<string,any>}
     * @readonly
     */
    get nl_annotations() {
        return this._nl_annotations;
    }
    /**
     * Implementation annotations (e.g. "url", "poll_interval" or "json_key")
     * @type {Object.<string,Ast.Value>}
     * @readonly
     *
     */
    get impl_annotations() {
        return this._impl_annotations;
    }

    /**
     * Read and normalize an implementation annotation from this function definition.
     *
     * @param {string} name - the annotation name
     * @return {any|undefined} the annotation normalized value, or `undefined` if the
     *         annotation is not present
     */
    getImplementationAnnotation(name) {
        if (Object.prototype.hasOwnProperty.call(this.impl_annotations, name))
            return this.impl_annotations[name].toJS();
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
    getNaturalLanguageAnnotation(name) {
        if (Object.prototype.hasOwnProperty.call(this.nl_annotations, name))
            return this.nl_annotations[name];
        else
            return undefined;
    }

    /**
     * Convert this function definition to prettyprinted ThingTalk code.
     *
     * @param {string} [prefix] - prefix each output line with this string (for indentation)
     * @return {string} the prettyprinted code
     */
    toString(prefix = '') {
        let annotations = prettyprintAnnotations(this);

        const extendclause = this._extends.length > 0 ? ` extends ${this._extends.join(', ')}` : '';
        const firstline = `${prefix}${this.is_monitorable ? 'monitorable ' : ''}${this.is_list ? 'list ' : ''}${this.functionType} ${this.name}${extendclause}`;
        // skip arguments flattened from compound param
        const args = this.args.filter((a) => !a.includes('.'));

        let padding = ' '.repeat(firstline.length+1);
        if (args.length === 0)
            return `${firstline}()${annotations};`;
        if (args.length === 1)
            return `${firstline}(${this._argmap[args[0]].toString(padding)})${annotations};`;

        let buffer = `${firstline}(${this._argmap[args[0]].toString(padding)},\n`;
        for (let i = 1; i < args.length-1; i++)
            buffer += `${padding}${this._argmap[args[i]].toString(padding)},\n`;
        buffer += `${padding}${this._argmap[args[args.length-1]].toString(padding)})${annotations};`;
        return buffer;
    }

    /**
     * Convert this function definition to prettyprinted ThingTalk code.
     *
     * This is an alias for {@link Ast.FunctionDef#toString}.
     *
     * @param {string} [prefix] - prefix each output line with this string (for indentation)
     * @return {string} the prettyprinted code
     */
    prettyprint(prefix = '') {
        return this.toString(prefix);
    }

    /**
     * The canonical form of this function.
     *
     * This should be preferred over accessing the `canonical` property
     * of {@link Ast.FunctionDef#metadata} because it will ensure
     * a canonical form exists even if the annotation is not present.
     * @type {string}
     * @readonly
     */
    get canonical() {
        return this.nl_annotations.canonical;
    }

    /**
     * The confirmation string for this function.
     *
     * This is a convenience property for accessing the `confirmation` property
     * of {@link Ast.FunctionDef#metadata}. It will return `undefined`
     * if the annotation is not present.
     * @type {string|undefined}
     * @readonly
     */
    get confirmation() {
        return this.nl_annotations.confirmation;
    }

    _cloneInternal(args, flattened=false) {
        // clone qualifiers
        const qualifiers = Object.assign({}, this._qualifiers);

        // clone annotations
        const nl = {};
        Object.assign(nl, this.nl_annotations);
        const impl = {};
        Object.assign(impl, this.impl_annotations);
        const annotations = { nl, impl };

        return new FunctionDef(this.functionType, this.class, this.name, this.extends, qualifiers, args, annotations);
    }

    /**
     * Iterate all bases of this function (including indirect bases)
     *
     * @yields {Ast.FunctionDef}
     */
    *iterateBaseFunctions() {
        yield this.name;
        if (this.extends.length > 0) {
            if (!this.class)
                throw new Error(`Class information missing from the function definition.`);
            for (let fname of this.extends) {
                const f = this.class.getFunction(this.functionType, fname);
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
     * @deprecated getAnnotation is deprecated and should not be used. Use {@link Ast.FunctionDef#getImplementationAnnotation} instead.
     */
    getAnnotation(name) {
        if (Object.prototype.hasOwnProperty.call(this.annotations, name))
            return this.annotations[name].toJS();
        else
            return undefined;
    }

    /**
     * All natural language metadata for this function
     * (canonical, confirmation, formatted).
     * @type {Object.<string,any>}
     * @readonly
     * @deprecated metadata is deprecated and should not be used. Use {@link Ast.FunctionDef#nl_annotations} instead.
     */
    get metadata() {
        return this._nl_annotations;
    }
    /**
     * Implementation annotations (e.g. "url", "poll_interval" or "json_key")
     * @type {Object.<string,Ast.Value>}
     * @readonly
     * @deprecated annotations is deprecated and should not be used. Use {@link Ast.FunctionDef#impl_annotations} instead.
     */
    get annotations() {
        return this._impl_annotations;
    }


    toManifest() {
        let interval = this._annotations['poll_interval'];
        const obj = {
            args: this.args.map((a) => this._argmap[a].toManifest()),
            canonical: this.canonical,
            is_list: this.is_list,
            poll_interval: this.is_monitorable ? interval.toJS() : -1,
            confirmation: this.confirmation,
            formatted: this.metadata.formatted || [],
        };
        for (let key in this._annotations) {
            if (key === 'poll_interval')
                continue;
            obj[key] = this._annotations[key].toJS();
        }
        return obj;
    }

    static fromManifest(functionType, name, manifest) {
        let args = manifest.args.map((a) => ArgumentDef.fromManifest(a));
        let is_list = functionType === 'query' ? !!manifest.is_list : false;
        let is_monitorable = functionType === 'query' ? manifest.poll_interval !== -1 : false;
        let nl = {
            canonical: manifest.canonical || '',
            confirmation: manifest.confirmation || '',
            confirmation_remote: manifest.confirmation_remote || '',
        };
        if (functionType === 'query')
            nl.formatted = toJS(manifest.formatted);

        let impl = {};
        if (is_monitorable)
            impl['poll_interval'] = new Value.Measure(manifest.poll_interval, 'ms');
        for (let key in manifest) {
            if (['args', 'is_list', 'is_monitorable', 'poll_interval',
                 'canonical', 'confirmation', 'confirmation_remote', 'formatted'].indexOf(key) >= 0)
                continue;
            const v = legacyAnnotationToValue(manifest[key]);
            if (v)
                impl[key] = v;
        }

        if (manifest.url)
            impl.url = new Value.String(manifest.url);
        return new FunctionDef(functionType, null, name, [], { is_list, is_monitorable }, args, { nl, impl });
    }
}
module.exports.FunctionDef = FunctionDef;
