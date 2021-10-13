// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
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


import assert from 'assert';

import Parser from './test_sr_parser_generator';

export default async function main() {
    const parser = new Parser();
    assert.strictEqual(parser.parse(['monitor', 'thermostat.get_temp', 'twitter.post', 'param:text', 'qs0']),
        `combine monitor thermostat.get_temp with apply twitter.post string = qs0`);
    assert.strictEqual(parser.parse(['xkcd.get_comic', 'param:number', 'num0', 'notify']),
        `apply xkcd.get_comic number = num0 then notify`);
}
if (!module.parent)
    main();
