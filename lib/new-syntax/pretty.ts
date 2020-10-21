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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import { stringEscape } from '../utils/escaping';
import {
    ConstantToken,
    TokenStream
} from './tokenstream';
import {
    StringLikeEntityType,
} from '../entities';

function simpleEntity<K extends StringLikeEntityType>(token : ConstantToken<K, string>, type : string) {
    return stringEscape(token.value) + '^^' + type;
}

export function prettyprint(tokens : TokenStream) : string {
    let buffer = '';
    let indent = '';
    let needsIndent = true;
    const tabStops : string[] = [];

    function getColumn() {
        const newLine = buffer.lastIndexOf('\n');
        const lastLine = buffer.substring(newLine + 1);
        return lastLine.length;
    }

    for (const token of tokens) {
        if (typeof token === 'string' && token.startsWith(':') && token !== ':' && token !== '::') {
            // type annotation
            buffer += ' : ' + token.substring(1);
            continue;
        }

        // handle the formatting pseudo-tokens first
        switch (String(token)) {
        case ' ': // explicitly add a space
            buffer += ' ';
            continue;

        case '\t+': // increase basic indentation
            indent += '    ';
            continue;

        case '\t-': // decrease basic indentation
            indent = indent.substring(0, indent.length - 4);
            continue;

        case '\t=+': // add a tab stop at the current position
            tabStops.push(' '.repeat(getColumn()));
            continue;

        case '\t=-': // remove a previously added tab stop
            tabStops.pop();
            continue;

        case '\n-': // remove the last newline
            if (buffer.endsWith('\n'))
                buffer = buffer.substring(0, buffer.length-1);
            continue;
        }

        if (needsIndent) {
            if (tabStops.length > 0)
                buffer += tabStops[tabStops.length-1];
            else
                buffer += indent;
            needsIndent = false;
        }
        if (token === '\n') {
            buffer += '\n';
            needsIndent = true;
            continue;
        }

        // convert literals/constants back to their surface representation
        if (token instanceof ConstantToken) {
            const constant = token;

            switch (constant.name) {
            case 'QUOTED_STRING':
                buffer += stringEscape(constant.value);
                break;
            case 'NUMBER':
                buffer += String(constant.value);
                break;
            case 'MEASURE': {
                const measure = constant.value;
                buffer += String(measure.value) + measure.unit;
                break;
            }
            case 'CURRENCY': {
                const currency = constant.value;
                buffer += String(currency.value) + '$' + currency.unit;
                break;
            }
            case 'LOCATION': {
                const location = constant.value;

                if (location.display !== null)
                    buffer += `new Location(${location.latitude}, ${location.longitude}, ${stringEscape(location.display)})`;
                else
                    buffer += `new Location(${location.latitude}, ${location.longitude})`;
                break;
            }
            case 'DATE': {
                const date = constant.value;
                buffer += `new Date(${date.getTime()})`;
                break;
            }
            case 'TIME': {
                const time = constant.value;
                if (time.second !== 0)
                    buffer += `new Time(${time.hour}, ${time.minute}, ${time.second})`;
                else
                    buffer += `new Time(${time.hour}, ${time.minute})`;
                break;
            }
            case 'PICTURE':
                buffer += simpleEntity(constant, 'tt:picture');
                break;
            case 'USERNAME':
                buffer += simpleEntity(constant, 'tt:username');
                break;
            case 'HASHTAG':
                buffer += simpleEntity(constant, 'tt:hashtag');
                break;
            case 'URL':
                buffer += simpleEntity(constant, 'tt:url');
                break;
            case 'PHONE_NUMBER':
                buffer += simpleEntity(constant, 'tt:phone_number');
                break;
            case 'EMAIL_ADDRESS':
                buffer += simpleEntity(constant, 'tt:email_address');
                break;
            case 'PATH_NAME':
                buffer += simpleEntity(constant, 'tt:path_name');
                break;
            case 'GENERIC_ENTITY': {
                const entity = constant.value;
                if (entity.value === null)
                    buffer += 'null';
                else
                    buffer += stringEscape(entity.value);
                buffer += '^^' + entity.type;
                if (entity.display !== null)
                    buffer += '(' + stringEscape(entity.display) + ')';
                break;
            }
            }

            continue;
        }

        // now the actual tokens
        switch (token) {
        case ')':
            // eat a space if we're closing an enum and we had a keyword that introduced a space
            if (/\benum\([a-z]+ $/.test(buffer))
                buffer = buffer.substring(0, buffer.length-1);
            buffer += ')';
            break;

        // add a space before and after certain operators
        case ':':
        case '+':
        case '-':
        case '*':
        case '/':
        case '%':
        case '**':
        case '==':
        case '>=':
        case '<=':
        case '>':
        case '<':
        case '=~':
        case '~=':
        case '||':
        case '&&':
        case '::':
            buffer += ' ' + token + ' ';
            break;

        // add a space after the comma and certain keywords,
        case ',':
        case 'class':
        case 'const':
        case 'dataset':
        case 'extends':
        case 'if':
        case 'import':
        case 'in':
        case 'for':
        case 'let':
        case 'list':
        case 'mixin':
        case 'monitorable':
        case 'new':
        case 'opt':
        case 'out':
        case 'req':
        case 'switch':
        case 'until':
        case 'when':
        case 'while':
            buffer += token + ' ';
            break;

        // add a space BEFORE and AFTER filter, with and of
        // this is necessary because they can follow a variable name immediately
        case 'with':
        case 'filter':
        case 'of':
            buffer += ' ' + token + ' ';
            break;

        // add a space before sort directions, which follow directly a parameter name
        case 'asc':
        case 'desc':
            buffer += ' ' + token;
            break;

        // the following keywords DO NOT receive a space: null, true, false, sort, aggregate, bookkeeping

        // other tokens
        default:
            buffer += token;
        }
    }

    return buffer;
}
