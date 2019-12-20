// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Ast = require('./ast');
const Type = require('./type');
const { clean, cleanKind } = require('./utils');
const FormatUtils = require('./format_utils');
const { Currency } = require('./builtin/values');
const I18n = require('./i18n');

class Describer {
    constructor(gettext, locale = gettext.locale, timezone) {
        if (!gettext)
            gettext = I18n.get(locale);
        this._ = gettext.dgettext.bind(gettext, 'thingtalk');
        this.locale = locale;
        this.timezone = timezone;

        this._format = new FormatUtils(locale, timezone, gettext);
    }

    _displayLocation(loc) {
        if (loc.isAbsolute) {
            if (loc.display)
                return loc.display;
            else
                return this._("[Latitude: %.3f deg, Longitude: %.3f deg]").format(loc.lat, loc.lon);
        } else if (loc.isUnresolved) {
            return loc.name;
        } else {
            switch (loc.relativeTag) {
            case 'current_location':
                return this._("here");
            case 'home':
                return this._("at home");
            case 'work':
                return this._("at work");
            default:
                return loc.relativeTag;
            }
        }
    }

    _describeDate(date, operator, offset) {
        let base;

        if (date === null) {
            base = this._("now");
        } else if (date.isDateEdge) {
            let unit;
            switch (date.unit) {
            case 'ms':
                unit = this._("this millisecond");
                break;
            case 's':
                unit = this._("this second");
                break;
            case 'm':
                unit = this._("this minute");
                break;
            case 'h':
                unit = this._("this hour");
                break;
            case 'day':
                unit = this._("today");
                break;
            case 'week':
                unit = this._("this week");
                break;
            case 'mon':
                unit = this._("this month");
                break;
            case 'year':
                unit = this._("this year");
                break;
            }
            if (date.edge === 'start_of')
                base = this._("the start of %s").format(unit);
            else
                base = this._("the end of %s").format(unit);
        } else {
            if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0)
                base = this._format.dateToString(date);
            else
                base = this._format.dateAndTimeToString(date);
        }

        if (offset && operator === '+')
            return this._("%s past %s").format(this.describeArg(offset, {}), base);
        else if (offset && operator === '-')
            return this._("%s before %s").format(this.describeArg(offset, {}), base);
        else
            return base;
    }

    _describeTime(time) {
        if (time.isAbsolute) {
            const date = new Date;
            date.setHours(time.hour);
            date.setMinutes(time.minute);
            date.setSeconds(time.second);
            if (time.second !== 0) {
                return this._format.timeToString(date, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            } else {
                return this._format.timeToString(date, {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } else {
            switch (time.relativeTag) {
                case 'morning':
                    return this._('the morning');
                case 'evening':
                    return this._('the evening');
                default:
                    return time.relativeTag;
            }
        }
    }

    _describePlaceholder(type) {
        return '____';
    }

    describeArg(arg, scope = {}) {
        if (arg.display)
            return arg.display;
        if (arg.isArray)
            return arg.value.map((v) => this.describeArg(v, scope)).join(', ');
        if (arg.isVarRef) {
            let name;
            if (arg.name in scope)
                name = scope[arg.name];
            else
                name = clean(arg.name);
            return this._("the %s").format(name);
        }
        if (arg.isContextRef) {
            switch (arg.name) {
            case 'selection':
                return this._("the selection on the screen");
            default:
                throw new Error(`unsupported context value`);
            }
        }
        if (arg.isUndefined)
            return '____';
        if (arg.isEvent) {
            switch (arg.name) {
            case 'program_id':
                return this._("the program ID");
            case 'type':
                return this._("the device type");
            default:
                return this._("the result");
            }
        }
        if (arg.isLocation)
            return this._displayLocation(arg.value);
        if (arg.isString)
            return `“${arg.value}”`;
        if (arg.isEntity) {
            if (arg.type === 'tt:username' || arg.type === 'tt:contact_name' || arg.type === 'tt:contact_group_name')
                return '@' + arg.value;
            if (arg.type === 'tt:hashtag')
                return '#' + arg.value;
            return arg.value;
        }
        if (arg.isNumber)
            return arg.value.toLocaleString();
        if (arg.isCurrency)
            return new Currency(arg.value, arg.code).toLocaleString(this.locale);
        if (arg.isEnum)
            return clean(arg.value);
        if (arg.isMeasure)
            return arg.value + ' ' + arg.unit;
        if (arg.isCompoundMeasure)
            return arg.value.map((v) => this.describeArg(v, scope)).join(' ');
        if (arg.isBoolean)
            return arg.value ? this._("true") : this._("false");
        if (arg.isDate)
            return this._describeDate(arg.value, arg.operator, arg.offset);
        if (arg.isTime)
            return this._describeTime(arg.value);

        return String(arg);
    }

    _describeOperator(argcanonical, op, value, negate, ptype) {
        switch (op) {
        case 'contains':
            if (negate)
                return this._("the %s do not contain %s").format(argcanonical, value);
            else
                return this._("the %s contain %s").format(argcanonical, value);
        case 'substr':
        case '=~':
            if (negate)
                return this._("the %s does not contain %s").format(argcanonical, value);
            else
                return this._("the %s contains %s").format(argcanonical, value);
        case 'in_array':
        case '~=':
            if (negate)
                return this._("%s does not contain the %s").format(value, argcanonical);
            else
                return this._("%s contains the %s").format(value, argcanonical);
        case 'starts_with':
            if (negate)
                return this._("the %s does not start with %s").format(argcanonical, value);
            else
                return this._("the %s starts with %s").format(argcanonical, value);
        case 'ends_with':
            if (negate)
                return this._("the %s does not end with %s").format(argcanonical, value);
            else
                return this._("the %s ends with %s").format(argcanonical, value);
        case 'prefix_of':
            if (negate)
                return this._("the %s is not a prefix of %s").format(argcanonical, value);
            else
                return this._("the %s is a prefix of %s").format(argcanonical, value);
        case 'suffix_of':
            if (negate)
                return this._("the %s is not a suffix of %s").format(argcanonical, value);
            else
                return this._("the %s is a suffix of %s").format(argcanonical, value);
        case '==':
            if (negate)
                return this._("the %s is not equal to %s").format(argcanonical, value);
            else
                return this._("the %s is equal to %s").format(argcanonical, value);
        case '<=':
            if (ptype.isTime || ptype.isDate) {
                if (negate)
                    return this._("the %s is after %s").format(argcanonical, value);
                else
                    return this._("the %s is before %s").format(argcanonical, value);
            } else {
                if (negate)
                    return this._("the %s is greater than %s").format(argcanonical, value);
                else
                    return this._("the %s is less than or equal to %s").format(argcanonical, value);
            }
        case '>=':
            if (ptype.isTime || ptype.isDate) {
                if (negate)
                    return this._("the %s is before %s").format(argcanonical, value);
                else
                    return this._("the %s is after %s").format(argcanonical, value);
            } else {
                if (negate)
                    return this._("the %s is less than %s").format(argcanonical, value);
                else
                    return this._("the %s is greater than or equal to %s").format(argcanonical, value);
            }
        default:
            throw new TypeError('Invalid operator ' + op);
        }
    }

    _describeAtomFilter(expr, schema, scope, negate, canonical_overwrite = {}) {
        let filter = expr;
        let argname = filter.name;
        let argcanonical;
        if (argname in canonical_overwrite) {
            argcanonical = canonical_overwrite[argname];
        } else if (schema) {
            if (argname in schema.index)
                argcanonical = schema.getArgCanonical(argname);
            else
                argcanonical = scope[argname];
        } else {
            argcanonical = scope[argname];
        }
        let value = this.describeArg(filter.value, scope);
        let ptype;
        if (schema === null)
            ptype = Type.Entity('tt:contact');
        else
            ptype = schema.out[argname] || schema.inReq[argname] || schema.inOpt[argname];
        return this._describeOperator(argcanonical, filter.operator, value, negate, ptype);
    }

    describeFilter(expr, schema, scope = {}, canonical_overwrite = {}) {
        const recursiveHelper = (expr) => {
            if (expr.isTrue || (expr.isAnd && expr.operands.length === 0))
                return this._("true");
            if (expr.isFalse || (expr.isOr && expr.operands.length === 0))
                return this._("false");
            if (expr.isAnd)
                return expr.operands.map(recursiveHelper).reduce((x, y) => this._("%s and %s").format(x, y));
            if (expr.isOr)
                return expr.operands.map(recursiveHelper).reduce((x, y) => this._("%s or %s").format(x, y));
            if (expr.isNot && expr.expr.isAtom)
                return this._describeAtomFilter(expr.expr, schema, scope, true, canonical_overwrite);
            if (expr.isNot)
                return this._("not %s").format(recursiveHelper(expr.expr));
            if (expr.isExternal) {
                if (expr.selector.kind === 'org.thingpedia.builtin.thingengine.builtin' &&
                    expr.channel === 'get_time') {
                    const schema = expr.schema.clone();
                    return this.describeFilter(expr.filter, schema, scope, { time: this._("current time") });
                }
                if (expr.selector.kind === 'org.thingpedia.builtin.thingengine.builtin' &&
                    expr.channel === 'get_gps') {
                    const schema = expr.schema.clone();
                    return this.describeFilter(expr.filter, schema, scope, { location: this._("my location") });
                }

                const primdesc = this.describePrimitive(expr, scope, []);

                if (expr.filter.isAtom) {
                    // common case
                    return this._describeOperator(this._("the %s of %s").format(expr.filter.name, primdesc),
                                                  expr.filter.operator,
                                                  this.describeArg(expr.filter.value, scope),
                                                  false,
                                                  expr.schema.out[expr.filter.name]);
                } else if (expr.filter.isNot && expr.filter.expr.isAtom) {
                    // common case 2
                    return this._describeOperator(this._("the %s of %s").format(expr.filter.expr.name, primdesc),
                                                  expr.filter.expr.operator,
                                                  this.describeArg(expr.filter.expr.value, scope),
                                                  true,
                                                  expr.schema.out[expr.filter.expr.name]);
                } else {
                    // general case
                    return this._("for %s, %s").format(primdesc,
                        this.describeFilter(expr.filter, expr.schema, scope), canonical_overwrite);
                }
            }
            return this._describeAtomFilter(expr, schema, scope, false, canonical_overwrite);
        };

        return recursiveHelper(expr);
    }

    _getDeviceAttribute(selector, name) {
        for (let attr of selector.attributes) {
            if (attr.name === name)
                return this.describeArg(attr.value, {});
        }
        return undefined;
    }

    describePrimitive(obj, scope, extraInParams = []) {
        if (obj.selector.isBuiltin) {
            if (obj.channel === 'return')
                return this._("send it to me");
            else if (obj.channel === 'notify')
                return this._("notify you");
            else if (obj.channel === 'save')
                return this._("save it");
            else
                throw new TypeError();
        }

        var kind = obj.selector.kind;
        var channel = obj.channel;
        var schema = obj.schema;

        var confirm;
        if (kind === 'remote' || kind.startsWith('__dyn')) {
            // special case internal sending/receiving
            if (channel === 'send')
                confirm = this._("send it to $__principal");
            else if (channel === 'receive')
                confirm = this._("you receive something from $__principal");
            else
                throw TypeError('Invalid @remote channel ' + channel);
        } else {
            confirm = schema.confirmation;

            let cleanKind = obj.schema.class ? obj.schema.class.canonical : clean(obj.selector.kind);

            let selector;
            let name = this._getDeviceAttribute(obj.selector, 'name');
            if (obj.selector.device)
                selector = this._("your %s").format(obj.selector.device.name);
            else if (obj.selector.all && name)
                selector = this._("all your %s %s").format(name, cleanKind);
            else if (obj.selector.all)
                selector = this._("all your %s").format(cleanKind);
            else if (name)
                selector = this._("your %s %s").format(name, cleanKind);
            else
                selector = this._("your %s").format(cleanKind);

            if (confirm.indexOf('$__device') >= 0)
                confirm = confirm.replace('$__device', selector);
            else if (confirm.indexOf('${__device}') >= 0)
                confirm = confirm.replace('${__device}', selector);
        }

        let firstExtra = true;
        for (let inParam of obj.in_params.concat(extraInParams)) {
            let argname = inParam.name;
            let ptype = obj.schema.inReq[argname] || obj.schema.inOpt[argname];
            let argcanonical = schema.getArgCanonical(argname);
            let value = inParam.value.isUndefined ?
                this._describePlaceholder(ptype) : this.describeArg(inParam.value, scope);
            if (confirm.indexOf('$' + argname) >= 0) {
                confirm = confirm.replace('$' + argname, value);
            } else if (confirm.indexOf('${' + argname + '}') >= 0) {
                confirm = confirm.replace('${' + argname + '}', value);
            } else {
                if (argname.startsWith('__'))
                    continue;
                if (kind === 'remote' || kind.startsWith('__dyn'))
                    continue;
                if (inParam.value.isUndefined && inParam.name in obj.schema.inReq)
                    continue;
                if (firstExtra) {
                    confirm = confirm + this._(" with %s equal to %s").format(argcanonical, value);
                    firstExtra = false;
                } else {
                    confirm = confirm + this._(" and %s equal to %s").format(argcanonical, value);
                }
            }
        }

        return confirm;
    }

    describeTable(table, extraInParams) {
        if (table.isVarRef) {
            return clean(table.name);
        } else if (table.isResultRef) {
            if (table.index.isNumber && table.index.value === -1) {
                return this._("the last %s").format(table.schema.metadata.canonical || clean(table.channel));
            } else if (table.index.isNumber && table.index.value === 1) {
                return this._("the first %s").format(table.schema.metadata.canonical || clean(table.channel));
            } else if (table.index.isNumber && table.index.value < 0) {
                return this._("the %d-th last %s").format(-table.index.value,
                    table.schema.metadata.canonical || clean(table.channel));
            } else {
                return this._("the %d-th %s").format(this.describeArg(table.index),
                    table.schema.metadata.canonical || clean(table.channel));
            }
        } else if (table.isInvocation) {
            return this.describePrimitive(table.invocation, {}, extraInParams);
        } else if (table.isFilter) {
            return this._("%s if %s").format(this.describeTable(table.table, extraInParams),
                this.describeFilter(table.filter, table.schema));
        } else if (table.isProjection) {
            return this._("the %s of %s").format(
                this._describeArgList(table.args, table.schema),
                this.describeTable(table.table, extraInParams));
        } else if (table.isCompute) {
            return this._("a value computed from %s").format(
                this.describeTable(table.table, extraInParams)); // FIXME
        } else if (table.isAlias) {
            return this.describeTable(table.table, extraInParams);
        } else if (table.isAggregation) {
            if (table.field === '*')
                return this._("the number of %s").format(this.describeTable(table.table, extraInParams));

            let desc;
            switch (table.operator) {
            case 'avg':
                desc = this._("the average %s in %s");
                break;
            case 'min':
                desc = this._("the minimum %s in %s");
                break;
            case 'max':
                desc = this._("the maximum %s in %s");
                break;
            case 'sum':
                desc = this._("the sum of the %s in %s");
                break;
            case 'count':
                desc = this._("the number of %ss in %s");
                break;
            default:
                throw new TypeError(`Invalid aggregation ${table.operator}`);
            }
            return desc.format(
                table.schema.getArgCanonical(table.field),
                this.describeTable(table.table, extraInParams)
            );

        // recognize argmin/argmax
        } else if (table.isIndex && table.indices.length === 1 && table.indices[0].isNumber && table.table.isSort &&
            (table.indices[0].value === 1 || table.indices[0].value === -1)) {
            if ((table.indices[0].value === 1 && table.table.direction === 'asc') ||
                (table.indices[0].value === -1 && table.table.direction === 'desc')) {
                return this._("the %s with the minimum %s").format(
                    this.describeTable(table.table.table, extraInParams),
                    table.schema.getArgCanonical(table.table.field));
            } else {
                return this._("the %s with the maximum %s").format(
                    this.describeTable(table.table.table, extraInParams),
                    table.schema.getArgCanonical(table.table.field));
            }

        // recognize argmin/argmax top K
        } else if (table.isSlice && table.table.isSort && table.base.isNumber &&
            (table.base.value === 1 || table.base.value === -1)) {
                if ((table.base.value === 1 && table.table.direction === 'asc') ||
                    (table.base.value === -1 && table.table.direction === 'desc')) {
                return this._("the %s %s with the minimum %s").format(
                        this.describeArg(table.limit),
                        this.describeTable(table.table.table, extraInParams),
                    table.schema.getArgCanonical(table.table.field));
            } else {
                return this._("the %s %s with the maximum %s").format(
                        this.describeArg(table.limit),
                        this.describeTable(table.table.table, extraInParams),
                    table.schema.getArgCanonical(table.table.field));
            }
        } else if (table.isSort) {
            if (table.direction === 'asc') {
                return this._("the %s sorted by increasing %s").format(
                    this.describeTable(table.table, extraInParams),
                    table.schema.getArgCanonical(table.field)
                );
            } else {
                return this._("the %s sorted by decreasing %s").format(
                    this.describeTable(table.table, extraInParams),
                    table.schema.getArgCanonical(table.field)
                );
            }
        } else if (table.isIndex && table.indices.length === 1 && table.indices[0].isNumber &&
            (table.indices[0].value === 1 || table.indices[0].value === -1)) {
            if (table.indices[0].value === 1) {
                return this._("the first %s").format(
                    this.describeTable(table.table, extraInParams),
                );
            } else {
                return this._("the last %s").format(
                    this.describeTable(table.table, extraInParams),
                );
            }
        } else if (table.isIndex && table.indices.length === 1) {
            return this._("the %s-nth %s").format(
                this.describeArg(table.indices[0]),
                this.describeTable(table.table, extraInParams),
            );
        } else if (table.isIndex) {
            return this._("elements %s of the %s").format(
                this.describeArg(Ast.Value.Array(table.indices)),
                this.describeTable(table.table, extraInParams),
            );
        } else if (table.isSlice && table.base.isNumber &&
            (table.base.value === 1 || table.base.value === -1)) {
            if (table.base.value === 1) {
                return this._("the first %s %s").format(
                    this.describeArg(table.limit),
                    this.describeTable(table.table, extraInParams),
                );
            } else {
                return this._("the last %s %s").format(
                    this.describeArg(table.limit),
                    this.describeTable(table.table, extraInParams),
                );
            }
        } else if (table.isSlice) {
            return this._("%d elements starting from %s of the %s").format(
                this.describeArg(table.limit),
                this.describeArg(table.base),
                this.describeTable(table.table, extraInParams),
            );
        } else if (table.isJoin) {
            let lhsParams = extraInParams.filter((p) => p.name in table.lhs.schema.inReq || p.name in table.lhs.schema.inOpt);
            let rhsParams = extraInParams.filter((p) => p.name in table.rhs.schema.inReq || p.name in table.rhs.schema.inOpt);

            return this._("%s and %s").format(
                this.describeTable(table.lhs, lhsParams),
                this.describeTable(table.rhs, rhsParams.concat(table.in_params))
            );
        } else if (table.isWindow) {
            if (table.base.isNumber && table.base.value === 1) {
                return this._("the latest %s results of %s").format(
                    this.describeArg(table.delta),
                    this.describeStream(table.stream)
                );
            } else {
                return this._("the latest %s results, starting at the %d-th, of %s").format(
                    this.describeArg(table.delta),
                    this.describeArg(table.base),
                    this.describeStream(table.stream)
                );
            }
        } else if (table.isTimeSeries) {
            if (table.base.isDate && table.base.value === null) {
                return this._("the results in the last %s of %s").format(
                    this.describeArg(table.delta),
                    this.describeStream(table.stream)
                );
            } else {
                return this._("the results in the %s prior to %s of %s").format(
                    this.describeArg(table.delta),
                    this.describeArg(table.base),
                    this.describeStream(table.stream)
                );
            }
        } else if (table.isSequence) {
            if (table.base.isNumber && table.base.value === 1) {
                return this._("the latest %s %s").format(
                    this.describeArg(table.delta),
                    this.describeTable(table.table, [])
                );
            } else {
                return this._("the latest %s %s, starting at the %d-th").format(
                    this.describeArg(table.delta),
                    this.describeTable(table.table, []),
                    this.describeArg(table.base)
                );
            }
        } else if (table.isHistory) {
            if (table.base.isDate && table.base.value === null) {
                return this._("the %s that changed in in the last %s").format(
                    this.describeTable(table.table, []),
                    this.describeArg(table.delta)
                );
            } else {
                return this._("the %s that changed in the %s prior to %s").format(
                    this.describeTable(table.table, []),
                    this.describeArg(table.delta),
                    this.describeArg(table.base)
                );
            }
        } else {
            throw new TypeError();
        }
    }

    _describeArgList(args, schema) {
        return args.map((argname) => schema.getArgCanonical(argname)).join(", ");
    }

    describeStream(stream) {
        if (stream.isVarRef) {
            return clean(stream.name);
        } else if (stream.isTimer) {
            if (stream.base.value === null) {
                if (stream.frequency === null) {
                    return this._("every %s").format(this.describeArg(stream.interval));
                } else {
                    return this._("%s times every %s").format(
                        this.describeArg(stream.frequency),
                        this.describeArg(stream.interval)
                    );
                }
            } else if (stream.frequency === null) {
                return this._("every %s starting %s").format(
                    this.describeArg(stream.interval),
                    this.describeArg(stream.base)
                );
            } else {
                return this._("%s times every %s starting %s").format(
                    this.describeArg(stream.frequency),
                    this.describeArg(stream.interval),
                    this.describeArg(stream.base)
                );
            }
        } else if (stream.isAtTimer) {
            const times = stream.time.map((t) => this.describeArg(t));

            if (stream.expiration_date === null) {
              return this._("every day at %s").format(
                  times.length > 1 ? times.reduce((t1, t2) => this._("%s and %s").format(t1, t2)) : times[0]
              );
            } else {
              return this._("every day at %s until %s").format(
                  times.length > 1 ? times.reduce((t1, t2) => this._("%s and %s").format(t1, t2)) : times[0],
                  this.describeArg(stream.expiration_date)
              );
            }
        } else if (stream.isMonitor) {
            if (stream.table.isFilter) {
                // flip monitor of filter to filter of monitor
                if (stream.table.schema.is_list) {
                    return this._("when %s change if %s").format(
                        this.describeTable(stream.table.table, []),
                        this.describeFilter(stream.table.filter, stream.table.schema));
                } else {
                    return this._("when %s changes if %s").format(
                        this.describeTable(stream.table.table, []),
                        this.describeFilter(stream.table.filter, stream.table.schema)
                    );
                }
            }

            if (stream.table.schema.is_list)
                return this._("when %s change").format(this.describeTable(stream.table, []));
            else
                return this._("when %s changes").format(this.describeTable(stream.table, []));
        } else if (stream.isEdgeNew) {
            return this._("%s changes").format(this.describeStream(stream.stream)); // XXX weird
        } else if (stream.isEdgeFilter) {
            return this._("%s and it becomes true that %s").format(
                this.describeStream(stream.stream),
                this.describeFilter(stream.filter, stream.schema)
            );
        } else if (stream.isFilter) {
            return this._("%s and %s").format(
                this.describeStream(stream.stream),
                this.describeFilter(stream.filter, stream.schema)
            );
        } else if (stream.isProjection) {
            return this._("the %s of %s").format(
                this._describeArgList(stream.args, stream.schema),
                this.describeStream(stream.stream)
            );
        }  else if (stream.isCompute) {
            return this._("a value computed from %s").format(
                this.describeStream(stream.stream)); // FIXME
        } else if (stream.isAlias) {
            return this.describeStream(stream.stream);
        } else if (stream.isJoin) {
            return this._("%s, get %s").format(
                this.describeStream(stream.stream),
                this.describeTable(stream.table, stream.in_params)
            );
        } else {
            throw new TypeError();
        }
    }

    _describeAction(action) {
        if (action.isVarRef)
            return clean(action.name);
        else if (action.isInvocation)
            return this.describePrimitive(action.invocation);
        else
            throw new TypeError();
    }

    _describeActionList(actions) {
        return actions.map((a) => this._describeAction(a)).join(', ');
    }

    _describeRule(r) {
        if (r.isRule) {
            if (r.stream.isJoin) {
                return this._("do the following: %s, and then %s").format(
                    this.describeStream(r.stream),
                    this._describeActionList(r.actions),
                );
            } else {
                return this._("%s %s").format(
                    this._describeActionList(r.actions),
                    this.describeStream(r.stream)
                );
            }
        } else if (r.table !== null) {
            return this._("get %s and then %s").format(
                this.describeTable(r.table, []),
                this._describeActionList(r.actions));
        } else {
            return this._describeActionList(r.actions);
        }
    }

    _describeDeclaration(d) {
        if (d.type === 'stream')
            return this._("let %s be %s").format(clean(d.name), this.describeStream(d.value));
        else if (d.type === 'table' || d.isAssignment)
            return this._("let %s be %s").format(clean(d.name), this.describeTable(d.value, []));
        else
            return this._("let %s be %s").format(clean(d.name), this._describeAction(d.value));
    }

    describeProgram(program) {
        let desc = program.declarations.concat(program.rules).map((r) => {
            if (r.isDeclaration || r.isAssignment)
                return this._describeDeclaration(r);
            else
                return this._describeRule(r);
        }).join('; ');
        if (program.principal)
            return this._("tell %s: %s").format(this.describeArg(program.principal), desc);
        else
            return desc;
    }

    describePermissionFunction(permissionFunction, functionType, scope) {
        if (permissionFunction.isSpecified) {
            let kind = permissionFunction.kind;
            let schema = permissionFunction.schema;

            let confirm = schema.confirmation;
            confirm = confirm.replace('$__device', clean(kind));

            if (!permissionFunction.filter.isTrue) {
                let filterClone = permissionFunction.filter.clone().optimize();

                if (!filterClone.isAnd)
                    filterClone = new Ast.BooleanExpression.And([filterClone]);

                filterClone.operands.forEach((operand, i) => {
                    // don't traverse Ors or Nots
                    if (!operand.isAtom)
                        return;
                    if (operand.operator !== '==')
                        return;

                    let argname = operand.name;
                    if (confirm.indexOf('$' + argname) >= 0) {
                        confirm = confirm.replace('$' + argname, this.describeArg(operand.value, scope));
                        filterClone.operands[i] = Ast.BooleanExpression.True;
                    } else if (confirm.indexOf('${' + argname + '}') >= 0) {
                        confirm = confirm.replace('${' + argname + '}', this.describeArg(operand.value, scope));
                        filterClone.operands[i] = Ast.BooleanExpression.True;
                    }
                });
                filterClone = filterClone.optimize();

                if (!filterClone.isTrue)
                    confirm = this._("%s if %s").format(confirm, this.describeFilter(filterClone, schema, scope));
            }
            for (let argname of schema.args) {
                let argcanonical = schema.getArgCanonical(argname);
                if (confirm.indexOf('$' + argname) >= 0)
                    confirm = confirm.replace('$' + argname, this._("any %s").format(argcanonical));
                else if (confirm.indexOf('${' + argname + '}') >= 0)
                    confirm = confirm.replace('${' + argname + '}', this._("any %s").format(argcanonical));
            }

            for (let argname in permissionFunction.schema.out)
                scope[argname] = schema.getArgCanonical(argname);

            return confirm;
        } else {
            assert(permissionFunction.isClassStar);

            // class star
            let kind = permissionFunction.kind;
            if (kind === 'org.thingpedia.builtin.thingengine.builtin') {
                // very weird edge cases...
                switch (functionType) {
                case 'query':
                    return this._("your clock");
                case 'action':
                    return this._("send you messages, configure new accounts and open links");
                }
            }

            switch (functionType) {
            case 'query':
                return this._("your %s").format(capitalize(cleanKind(kind)));
            case 'action':
                return this._("perform any action on your %s").format(capitalize(cleanKind(kind)));
            default:
                return '';
            }
        }
    }

    describePermissionRule(permissionRule) {
        let principal;
        if (permissionRule.principal.isTrue)
            principal = this._("anyone");
        else if (permissionRule.principal.isAtom && permissionRule.principal.operator === '==')
            principal = this.describeArg(permissionRule.principal.value);
        else if (permissionRule.principal.isAtom && permissionRule.principal.operator === 'group_member')
            principal = this._("anyone in the %s group").format(this.describeArg(permissionRule.principal.value));
        else
            principal = this._("anyone if %s").format(this.describeFilter(permissionRule.principal, null, { source: this._("requester") }));

        const scope = {};
        if (permissionRule.query.isBuiltin) {
            if (permissionRule.action.isBuiltin) {
                throw new Error();
            } else if (permissionRule.action.isStar) {
                return this._("%s is allowed to perform any action").format(principal);
            } else {
                return this._("%s is allowed to %s").format(principal,
                    this.describePermissionFunction(permissionRule.action, 'action', scope));
            }
        } else if (permissionRule.query.isStar) {
            if (permissionRule.action.isBuiltin) {
                return this._("%s is allowed to read all your data").format(principal);
            } else if (permissionRule.action.isStar) {
                return this._("%s is allowed to read all your data and then perform any action with it").format(principal);
            } else {
                return this._("%s is allowed to read all your data and then use it to %s").format(
                    principal,
                    this.describePermissionFunction(permissionRule.action, 'action', scope));
            }
        } else {
            if (permissionRule.action.isBuiltin) {
                return this._("%s is allowed to read %s").format(
                    principal,
                    this.describePermissionFunction(permissionRule.query, 'query', scope)
                );
            } else if (permissionRule.action.isStar) {
                return this._("%s is allowed to read %s and then perform any action with it").format(
                    principal,
                    this.describePermissionFunction(permissionRule.query, 'query', scope)
                );
            } else {
                return this._("%s is allowed to read %s and then use it to %s").format(
                    principal,
                    this.describePermissionFunction(permissionRule.query, 'query', scope),
                    this.describePermissionFunction(permissionRule.action, 'action', scope)
                );
            }
        }
    }

    _describeSpecial(specialType) {
        switch (specialType) {
            case 'yes':
                return this._("yes");
            case 'no':
                return this._("no");
            case 'failed':
                return this._("I did not understand");
            case 'train':
                return this._("train me again");
            case 'back':
                return this._("go back");
            case 'more':
                return this._("show more results");
            case 'empty':
                return this._("no action");
            case 'debug':
                return this._("show debugging information");
            case 'maybe':
                return this._("maybe");
            case 'nevermind':
                return this._("cancel");
            case 'stop':
                return this._("stop");
            case 'help':
                return this._("help");
            case 'makerule':
                return this._("make a new command");
            case 'wakeup':
                return this._("wake up");
            default:
                return clean(specialType);
        }
    }

    _describeBookkeeping(input) {
        const intent = input.intent;
        if (intent.isSpecial)
            return this._describeSpecial(intent.type);
        else if (intent.isCommandList)
            return this._("list the commands of %s, in category %s").format(this.describeArg(intent.device), clean(intent.category));
        else if (intent.isChoice)
            return this._("choice number %d").format(intent.value+1);
        else if (intent.isAnswer)
            return this.describeArg(intent.value);
        else if (intent.isPredicate)
            return this.describeFilter(intent.predicate);
        else
            throw new TypeError();
    }

    describe(input) {
        if (input.isProgram)
            return this.describeProgram(input);
        else if (input.isPermissionRule)
            return this.describePermissionRule(input);
        else if (input.isBookkeeping)
            return this._describeBookkeeping(input);
        else
            throw new TypeError(`Unrecognized input type ${input}`);
    }
}

function capitalize(str) {
    return str.split(/\s+/g).map((word) => word[0].toUpperCase() + word.substring(1)).join(' ');
}

function capitalizeSelector(prim) {
    if (prim.isResultRef)
        return doCapitalizeSelector(prim.kind, prim.channel);
    else if (prim instanceof Ast.Invocation)
        return doCapitalizeSelector(prim.selector.kind, prim.channel);
    else
        return clean(prim.name);
}

function doCapitalizeSelector(kind, channel) {
    kind = cleanKind(kind);

    if (kind === 'builtin' || kind === 'remote' || kind.startsWith('__dyn_'))
        return capitalize(clean(channel));
    else
        return capitalize(kind);
}

function getProgramName(_, program) {
    let descriptions = [];
    for (let [,prim] of program.iteratePrimitives(true)) {
        if (prim instanceof Ast.Invocation && prim.selector.isBuiltin)
            descriptions.push(_("Notification"));
        else
            descriptions.push(capitalizeSelector(prim));
    }
    return descriptions.join(" ⇒ ");
}
function pubGetProgramName(gettext, program) {
    return getProgramName(gettext.dgettext.bind(gettext, 'thingtalk'), program);
}

const _warned = {};
function compatGetDescriber(fn, gettext) {
    const name = fn.name.replace('pubD', 'd');
    if (!_warned[name]) {
        _warned[name] = true;
        console.log(`Describe.${name} is deprecated, switch to Describe.Describer`);
    }

    // default timezone, cannot do better than that...
    return new Describer(gettext, gettext.locale, 'America/Los_Angeles');
}

function pubDescribeArg(gettext, arg, scope = {}) {
    const desc = compatGetDescriber(pubDescribeArg, gettext);
    return desc.describeArg(arg, scope);
}
function pubDescribeFilter(gettext, filter, schema, scope = {}) {
    const desc = compatGetDescriber(pubDescribeFilter, gettext);
    return desc.describeFilter(filter, schema, scope);
}
function pubDescribeProgram(gettext, program) {
    const desc = compatGetDescriber(pubDescribeProgram, gettext);
    return desc.describeProgram(program);
}

function pubDescribePrimitive(gettext, prim, scope) {
    const desc = compatGetDescriber(pubDescribePrimitive, gettext);
    return desc.describePrimitive(prim, scope);
}
function pubDescribeStream(gettext, stream) {
    const desc = compatGetDescriber(pubDescribeStream, gettext);
    return desc.describeStream(stream);
}
function pubDescribeTable(gettext, table, extraInParams = []) {
    const desc = compatGetDescriber(pubDescribeTable, gettext);
    return desc.describeTable(table, extraInParams);
}

function pubDescribePermissionRule(gettext, permissionRule) {
    const desc = compatGetDescriber(pubDescribePermissionRule, gettext);
    return desc.describePermissionRule(permissionRule);
}
function pubDescribePermissionFunction(gettext, permissionFunction, functionType, scope) {
    const desc = compatGetDescriber(pubDescribePermissionFunction, gettext);
    return desc.describePermissionFunction(permissionFunction, functionType, scope);
}


module.exports = {
    Describer,
    describeArg: pubDescribeArg,
    describeFilter: pubDescribeFilter,
    describeProgram: pubDescribeProgram,
    describePrimitive: pubDescribePrimitive,
    describeStream: pubDescribeStream,
    describeTable: pubDescribeTable,
    describePermissionRule: pubDescribePermissionRule,
    describePermissionFunction: pubDescribePermissionFunction,
    getProgramName: pubGetProgramName
};
