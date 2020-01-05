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
const interpolate = require('string-interp');
const Type = require('../type');
const I18n = require('../i18n');
const { clean } = require('../utils');

const { Value } = require('./values');

/**
 * The abstract representation of a slot.
 *
 * A slot is a placeholder for a value that can be replaced or changed by
 * API user. This API is used to iterate all values (parameters and filters)
 * in a program.
 *
 * @alias Ast~AbstractSlot
 */
class AbstractSlot {
    /**
     * Construct a new abstract slot.
     *
     * @param {module.Ast:Invocation|null} prim - the primitive associated with this slot, if any
     * @param {Object.<string, Ast.ScopeEntry>} scope - available names for parameter passing
     * @protected
     */
    constructor(prim, scope) {
        assert(prim || prim === null);
        this._prim = prim;


        this._scope = scope;
        this._options = undefined;
    }

    /**
     * The primitive associated with this slot, if any.
     * @type {Ast.Invocation|null}
     * @readonly
     */
    get primitive() {
        return this._prim;
    }
    /**
     * The function argument associated with this slot, if any.
     * @type {Ast.ArgumentDef|null}
     * @readonly
     */
    get arg() {
        return null;
    }
    /**
     * Names which are available for parameter passing into this slot.
     * @type {Object.<string, Ast.ScopeEntry>}
     * @readonly
     */
    get scope() {
        return this._scope;
    }

    /**
     * The available options to parameter pass from.
     *
     * This is the subset of {Ast~AbstractSlot#scope} whose type matches
     * that of this slot.
     * @type {Object.<string, Ast.ScopeEntry>}
     * @readonly
     */
    get options() {
        // this is computed lazily because it needs this.type, which
        // is not available in the constructor

        if (this._options)
            return this._options;

        let options = [];
        const slotType = this.type;
        for (var vname in this._scope) {
            let option = this._scope[vname];
            if (Type.isAssignable(option.type, slotType))
                options.push(option);
        }
        return this._options = options;
    }

    /* istanbul ignore next */
    /**
     * The type of this slot.
     * @type {Type}
     */
    get type() {
        throw new Error('Abstract method');
    }
    /* istanbul ignore next */
    /**
     * Retrieve the question to ask the user to fill this slot.
     *
     * @param {string} locale - the locale to use
    getPrompt(locale) {
        throw new Error('Abstract method');
    }
    /* istanbul ignore next */
    get() {
        throw new Error('Abstract method');
    }
    /* istanbul ignore next */
    set(value) {
        throw new Error('Abstract method');
    }

    isUndefined() {
        return this.get().isUndefined;
    }
    isConcrete() {
        return this.get().isConcrete();
    }
    isCompilable() {
        const value = this.get();
        if (value.isUndefined)
            return false;
        if (!value.isConcrete())
            return false;

        const valueType = value.getType();
        const slotType = this.type;
        if (valueType.isEntity && slotType.isEntity && valueType.type === 'tt:username' && slotType.type !== 'tt:username')
            return false;

        return true;
    }
}

class InputParamSlot extends AbstractSlot {
    constructor(prim, scope, arg, slot) {
        super(prim, scope);
        this._arg = arg;
        this._slot = slot;
    }

    toString() {
        return `InputParamSlot(${this._slot.name} : ${this.type})`;
    }

    get _argcanonical() {
        return this._arg ? this._arg.canonical : clean(this._slot.name);
    }

    get arg() {
        return this._arg || null;
    }
    get type() {
        if (this._arg)
            return this._arg.type;
        else
            return Type.Any;
    }
    get tag() {
        return `in_param.${this._slot.name}`;
    }
    getPrompt(locale) {
        if (this._arg && this._arg.metadata.prompt)
            return this._arg.metadata.prompt;

        const argcanonical = this._argcanonical;
        const _ = I18n.get(locale).gettext;
        return interpolate(_("Please tell me the ${argcanonical}."), //"
            { argcanonical }, { locale });
    }
    get() {
        return this._slot.value;
    }
    set(value) {
        this._slot.value = value;
    }
}

class DeviceAttributeSlot extends AbstractSlot {
    constructor(prim, attr) {
        super(prim, {});
        this._slot = attr;
        assert(this._slot.name === 'name');
    }

    toString() {
        return `DeviceAttributeSlot(${this._slot.name} : ${this.type})`;
    }

    get type() {
        return Type.String;
    }
    get tag() {
        return `attribute.${this._slot.name}`;
    }
    getPrompt(locale) {
        // this method should never be used, because $? does not typecheck in a device
        // attribute, but we include for completeness, and just in case
        const _ = I18n.get(locale).gettext;
        return _("Please tell me the name of the device you would like to use.");
    }
    get() {
        return this._slot.value;
    }
    set(value) {
        this._slot.value = value;
    }
}

class FilterSlot extends AbstractSlot {
    constructor(prim, scope, arg, filter) {
        super(prim && prim.isPermissionRule ? null : prim, scope);

        this._isSourceFilter = prim && prim.isPermissionRule;
        this._arg = arg;
        this._filter = filter;
    }

    toString() {
        return `FilterSlot(${this._filter.name} ${this._filter.operator} : ${this.type})`;
    }

    get _argcanonical() {
        return this._arg ? this._arg.canonical : clean(this._filter.name);
    }

    // overidde the default option handling to filter out non-sensical filters such as "x == x"
    get options() {
        if (this._options)
            return this._options;
        let options = [];

        const slotType = this.type;
        for (var vname in this._scope) {
            let option = this._scope[vname];
            if (Type.isAssignable(option.type, slotType)) {
                if (option.value.isVarRef && option.value.name === this._filter.name &&
                    option._prim === this._prim)
                    continue;
                if (option.value.isEvent)
                    continue;
                options.push(option);
            }
        }
        return this._options = options;
    }

    get arg() {
        return this._arg || null;
    }
    get type() {
        if (this._isSourceFilter) {
            switch (this._filter.operator) {
            case 'in_array':
                return new Type.Array(Type.Entity('tt:contact'));
            default:
                return Type.Entity('tt:contact');
            }
        } else if (this._arg) {
            switch (this._filter.operator) {
            case 'contains':
                return this._arg.type.elem;
            case 'in_array':
                return new Type.Array(this._arg.type);
            default:
                return this._arg.type;
            }
        } else {
            return Type.Any;
        }
    }
    get tag() {
        return `filter.${this._filter.operator}.${this._isSourceFilter ? '$' : ''}${this._filter.name}`;
    }
    getPrompt(locale) {
        const _ = I18n.get(locale).gettext;
        if (['==', 'contains', 'in_array', '=~'].indexOf(this._filter.operator) >= 0 &&
            this._arg && this._arg.metadata.prompt)
            return this._arg.metadata.prompt;

        if (this._isSourceFilter)
            return _("Who is allowed to ask you for this command?");

        const argcanonical = this._argcanonical;

        let question;
        switch (this._filter.operator) {
        case '>=':
            question = _("What should the ${argcanonical} be greater than?");
            break;
        case '<=':
            question = _("What should the ${argcanonical} be less than?");
            break;
        case 'starts_with':
            question = _("How should the ${argcanonical} start with?");
            break;
        case 'ends_with':
            question = _("How should the ${argcanonical} end with?");
            break;
        case '=~':
            question = _("What should the ${argcanonical} contain?");
            break;
        case '==':
            question = _("What should the ${argcanonical} be equal to?");
            break;
        default:
            // ugly default but guaranteed to work...
            question = _("Please tell me the value of the filter on the ${argcanonical}.");
            break;
        }

        return interpolate(question, { argcanonical }, { locale });
    }
    get() {
        return this._filter.value;
    }
    set(value) {
        this._filter.value = value;
    }
}

class ArrayIndexSlot extends AbstractSlot {
    constructor(prim, scope, type, array, parent, index) {
        super(prim, scope);
        this._type = type;
        this._array = array;
        if (typeof parent === 'string') {
            this._baseTag = parent;
            this._parent = null;
        } else {
            this._baseTag = parent.tag;
            this._parent = parent;
        }
        this._index = index;
    }

    toString() {
        return `ArrayIndexSlot([${this._index}] : ${this.type})`;
    }

    get _argcanonical() {
        return this._parent._argcanonical;
    }

    get type() {
        return this._type;
    }
    get tag() {
        return `${this._baseTag}.${this._index}`;
    }
    getPrompt(locale) {
        const _ = I18n.get(locale).gettext;

        switch (this._baseTag) {
        case 'table.index':

            if (this._array.length === 1)
                return _("Which result do you want?");

            return interpolate(_("${index:ordinal:\
                =1 {What is the index of the first result you would like?}\
                =2 {What is the index of the second result you would like?}\
                =3 {What is the index of the third result you would like?}\
                one {What is the index of the ${index}st result you would like?}\
                two {What is the index of the ${index}nd result you would like?}\
                few {What is the index of the ${index}rd result you would like?}\
                other {What is the index of the ${index}th result you would like?}\
            }"), { index: this._index+1 }, { locale });

        case 'attimer.time':
            if (this._array.length === 1)
                return _("When do you want your command to run?");

            return interpolate(_("${index:ordinal:\
                =1 {What is the first time you would like your command to run?}\
                =2 {What is the second time you would like your command to run?}\
                =3 {What is the third time you would like your command to run?}\
                one {What is the ${index}st time you would like your command to run?}\
                two {What is the ${index}nd time you would like your command to run?}\
                few {What is the ${index}rd time you would like your command to run?}\
                other {What is the ${index}th time you would like your command to run?}\
            }"), { index: this._index+1 }, { locale });

        case 'filter.in_array.$source':
            if (this._array.length === 1)
                return _("Who is allowed to ask you for this command?");

            return interpolate(_("${index:ordinal:\
                =1 {Who is the first friend who is allowed to ask you for this command?}\
                =2 {Who is the second friend who is allowed to ask you for this command?}\
                =3 {Who is the third friend who is allowed to ask you for this command?}\
                one {Who is the ${index}st friend who is allowed to ask you for this command?}\
                two {Who is the ${index}nd friend who is allowed to ask you for this command?}\
                few {Who is the ${index}rd friend who is allowed to ask you for this command?}\
                other {Who is the ${index}th friend who is allowed to ask you for this command?}\
            }"), { index: this._index+1 }, { locale });

        default:
            assert(this._parent);
            // array is input parameter or filter
            if (this._array.length === 1)
                return this._parent.getPrompt(locale);

            return interpolate(_("${index:ordinal:\
                =1 {What would you like the first ${argcanonical} to be?}\
                =2 {What would you like the second ${argcanonical} to be?}\
                =3 {What would you like the third ${argcanonical} to be?}\
                one {What would you like the ${index}st ${argcanonical} to be?}\
                two {What would you like the ${index}nd ${argcanonical} to be?}\
                few {What would you like the ${index}rd ${argcanonical} to be?}\
                other {What would you like the ${index}th ${argcanonical} to be?}\
            }"), { index: this._index+1, argcanonical: this._argcanonical }, { locale });
        }
    }
    get() {
        return this._array[this._index];
    }
    set(value) {
        this._array[this._index] = value;
    }
}

class FieldSlot extends AbstractSlot {
    constructor(prim, scope, type, container, baseTag, field) {
        super(prim, scope);
        this._type = type;
        this._container = container;
        this._tag = baseTag + '.' + field;
        this._field = field;
    }

    toString() {
        return `FieldSlot(${this._field} : ${this.type})`;
    }

    get type() {
        return this._type;
    }
    get tag() {
        return this._tag;
    }

    getPrompt(locale) {
        const _ = I18n.get(locale).gettext;

        switch (this._tag) {
        case 'program.principal':
            return _("Who should run this command?");
        case 'timer.base':
            return _("When would you like your command to start?");
        case 'timer.interval':
            return _("How often should your command run?");
        case 'timer.frequency':
            return _("How many times should your command run during that time interval?");
        case 'attimer.expiration_date':
            return _("When should your command stop?");
        case 'history.base':
        case 'slice.base':
            return _("What is the first result you would like?");
        case 'history.delta':
        case 'slice.limit':
            return _("How many results would you like?");
        case 'result_ref.index':
            return _("Which result do you want?");

        default:
            // should never be hit, because all cases are covered, but who knows...
            return interpolate(_("What ${field:enum} would you like?"), {
                field: this._field
            });
        }
    }
    get() {
        return this._container[this._field];
    }
    set(value) {
        this._container[this._field] = value;
    }
}

function makeScope(invocation) {
    // make out parameters available in the "scope", which puts
    // them as possible options for a later slot fill
    const schema = invocation.schema;
    if (!schema)
        return null;
    const scope = {};
    for (let argname in schema.out) {
        let argcanonical = schema.getArgCanonical(argname);

        let kind;
        if (invocation.isVarRef)
            kind = null;
        else if (invocation.isResultRef)
            kind = invocation.kind;
        else
            kind = invocation.selector.kind;
        scope[argname] = {
            value: Value.VarRef(argname),
            type: schema.out[argname],
            argcanonical: argcanonical,

            _prim: invocation,
            kind: kind,
            kind_canonical: schema.class ? (schema.class.metadata.canonical || null) : null,
        };
    }
    scope['$event'] = {
        value: Value.Event(null),
        type: Type.String,
    };
    return scope;
}

function* recursiveYieldArraySlots(slot) {
    yield slot;
    const value = slot.get();
    if (!value.isArray)
        return;

    const type = slot.type;
    assert(type.isArray);
    for (let i = 0; i < value.value.length; i++)
        yield* recursiveYieldArraySlots(new ArrayIndexSlot(slot.primitive, slot.scope, type.elem, value.value, slot, i));
}

module.exports = {
    recursiveYieldArraySlots,
    makeScope,
    InputParamSlot,
    DeviceAttributeSlot,
    FilterSlot,
    ArrayIndexSlot,
    FieldSlot,
};
