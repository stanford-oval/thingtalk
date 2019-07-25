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
const Type = require('../type');
const I18n = require('../i18n');
const { clean } = require('../utils');

class AbstractSlot {
    constructor(prim, scope) {
        this._prim = prim;
        this._scope = scope;
    }

    get primitive() {
        return this._prim;
    }
    get scope() {
        return this._scope;
    }

    /* istanbul ignore next */
    get type() {
        throw new Error('Abstract method');
    }
    /* istanbul ignore next */
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
        const gettext = I18n.get(locale);
        if (this._arg && this._arg.metadata.prompt)
            return this._arg.metadata.prompt;

        const canonical = this._argcanonical;
        return gettext.dgettext('thingtalk', "Please tell me the %s.").format(canonical);
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
        super(prim.isPermissionRule ? null : prim, scope);

        this._isSourceFilter = prim.isPermissionRule;
        this._arg = arg;
        this._filter = filter;
    }

    toString() {
        return `FilterSlot(${this._filter.name} ${this._filter.operator} : ${this.type})`;
    }

    get _argcanonical() {
        return this._arg ? this._arg.canonical : clean(this._filter.name);
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
        const gettext = I18n.get(locale);
        if (['==', 'contains', 'in_array', '=~'].indexOf(this._filter.operator) >= 0 &&
            this._arg && this._arg.metadata.prompt)
            return this._arg.metadata.prompt;

        if (this._isSourceFilter)
            return gettext.dgettext('thingtalk', "Who is allowed to ask you for this command?");

        const canonical = this._argcanonical;
        switch (this._filter.operator) {
        case '>=':
            return gettext.dgettext('thingtalk', "What should the %s be greater than?").format(canonical);
        case '<=':
            return gettext.dgettext('thingtalk', "What should the %s be less than?").format(canonical);
        case 'starts_with':
            return gettext.dgettext('thingtalk', "How should the %s start with?").format(canonical);
        case 'ends_with':
            return gettext.dgettext('thingtalk', "How should the %s end with?").format(canonical);
        case '=~':
            return gettext.dgettext('thingtalk', "What should the %s contain?").format(canonical);
        case '==':
            return gettext.dgettext('thingtalk', "How should the %s be equal to?").format(canonical);
        default:
            // ugly default but guaranteed to work...
            return gettext.dgettext('thingtalk', "Please tell me the value of the filter on the %s.").format(canonical);
        }
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
        return `${this._baseTag}[${this._index}]`;
    }
    getPrompt(locale) {
        const gettext = I18n.get(locale);
        const _ = gettext.dgettext.bind(gettext, 'thingtalk');

        switch (this._baseTag) {
        case 'table.index':
            if (this._array.length === 1)
                return _("Which result do you want?");

            switch (this._index) {
            case 0:
                return _("What is the index of the first result you would like?");
            case 1:
                return _("What is the index of the second result you would like?");
            case 2:
                return _("What is the index of the third result you would like?");
            default:
                return _("What is the index of the %dth result you would like?").format(this._index+1);
            }

        case 'attimer.time':
            if (this._array.length === 1)
                return _("When do you want your command to run?");

            switch (this._index) {
            case 0:
                return _("What is the first time you would like your command to run?");
            case 1:
                return _("What is the second time you would like your command to run?");
            case 2:
                return _("What is the third time you would like your command to run?");
            default:
                return _("What is the %dth time you would like your command to run?").format(this._index+1);
            }

        case 'filter.in_array.$source':
            if (this._array.length === 1)
                return _("Who is allowed to ask you for this command?");

            switch (this._index) {
            case 0:
                return _("Who is the first friend who is allowed to ask you for this command?");
            case 1:
                return _("Who is the second friend who is allowed to ask you for this command?");
            case 2:
                return _("Who is the third friend who is allowed to ask you for this command?");
            default:
                return _("Who is the %dth friend who is allowed to ask you for this command?").format(this._index+1);
            }

        default: {
            assert(this._parent);
            // array is input parameter or filter
            if (this._array.length === 1)
                return this._parent.getPrompt(locale);

            const canonical = this._argcanonical;
            switch (this._index) {
            case 0:
                return _("What would you like the first %s to be?").format(canonical);
            case 1:
                return _("What would you like the second %s to be?").format(canonical);
            case 2:
                return _("What would you like the third %s to be?").format(canonical);
            default:
                return _("What would you like the %dth %s to be?").format(this._index+1, canonical);
            }
        }
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
        const gettext = I18n.get(locale);
        const _ = gettext.dgettext.bind(gettext, 'thingtalk');

        switch (this._tag) {
        case 'program.principal':
            return _("Who should run this command?");
        case 'timer.base':
            return _("When would you like your command to start?");
        case 'timer.interval':
            return _("How frequently should your command run?");
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
            return _("What %s would you like?").format(clean(this._field));
        }
    }
    get() {
        return this._container[this._field];
    }
    set(value) {
        this._container[this._field] = value;
    }
}

function* recursiveYieldArraySlots(slot) {
    yield slot;
    const value = slot.get();
    if (!value.isArray)
        return;

    const type = slot.type;
    assert(type.isArray);
    for (let i = 0; i < value.value.length; i++)
        yield* recursiveYieldArraySlots(new ArrayIndexSlot(slot.prim, slot.scope, type.elem, value.value, slot, i));
}

module.exports = {
    recursiveYieldArraySlots,
    InputParamSlot,
    FilterSlot,
    ArrayIndexSlot,
    FieldSlot
};
