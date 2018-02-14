"use strict";

const path = require('path');
const fs = require('fs');
const csv = require('csv');

const Grammar = require('../lib/grammar_api');
const Ast = require('../lib/ast');

var counter = {
    'no_idea': 0,
    'string': 0,
    'number/measure/currency': 0,
    'url': 0,
    'username': 0,
    'email/path': 0,
    'hashtag': 0,
    'phone_number': 0
}

function clean_paraphrase(raw, cleaned) {
    let count = 0;
    raw.on('data', (row) => {
        count += 1;
        if (count === 1) return; // skip headers
        let pid, thingtalk, synthetic;
        [pid, thingtalk, synthetic] = row.slice(0, 3);
        row.slice(3).forEach((paraphrase, i) => {
            paraphrase = new Paraphrase(pid + i.toString(), thingtalk, synthetic, paraphrase);
            paraphrase.clean();
            if (paraphrase.isValid()) {
                cleaned.write(paraphrase.output());
            } else {
                //console.log(paraphrase.output());
            }
        });
    }).on('end', () => {
        console.log(counter);
        cleaned.end();
    }).on('error', (err) => {
        console.error(err);
    });
}

class Paraphrase {
    constructor(pid, thingtalk, synthetic, paraphrase) {
        this.pid = pid;
        this.tt = thingtalk;
        this.synthetic = synthetic;
        this.paraphrase = paraphrase.toLowerCase();
        this.ast = Grammar.parse(thingtalk);
        this.args = this._extract_values();
    }

    output() {
        return {
            id: this.pid,
            thingtalk: this.tt,
            paraphrase: this.paraphrase
        };
    }

    clean(){
        this.paraphrase = this.paraphrase.replace('""', '"');
    }

    isValid() {
        if (this.isNoIdea())
            return false;
        else if (!this.checkValues()) 
            return false;
        return true;
    }

    isNoIdea() {
        const noideas = [
            'no idea', 'don\'t know', 'dont know', 'don\'t understand',
            'dont understand', 'no clue',
            'doesn\'t make sense', 'doesn\'t make any sense',
            'doesnt make sense', 'doesnt make any sense'
        ];
        if (this.paraphrase.length < 5) {
            counter['no_idea'] += 1;
            return true;
        }
        for (let noidea of noideas) {
            if (this.paraphrase === noidea || this.paraphrase.indexOf(noidea) > -1) {
                counter['no_idea'] += 1
                return true;
            }
        }
        return false;
    }

    checkValues() {
        for (let arg of this.args) {
            if (arg.isString) {
                if (this.paraphrase.indexOf('\"' + arg.value + '\"') === -1) {
                    counter['string'] += 1;
                    return false;
                }
            }
            if (arg.isNumber || arg.isMeasure || arg.isCurrency) {
                if (arg.value !== 1 && arg.value !== 0) {
                    let index = this.paraphrase.indexOf(arg.value);
                    let len = arg.value.toString().length;
                    if (index === -1 ||
                        (index !== 0 && this.paraphrase[index - 1] !== ' ') ||
                        (index !== this.paraphrase.length - len && this.paraphrase[index + len] !== ' ')) {
                        //console.log(arg.value, len, index, this.paraphrase);
                        counter['number/measure/currency'] += 1;
                        return false;
                    }
                }
            }
            if (arg.isArray) {
                for (let subarg of arg) {
                    if (!check_values(subarg))
                        return false;
                }
            }
            if (arg.isEntity) {
                if (arg.type === 'tt:username' || arg.type === 'tt:contact_name') {
                    let index = this.paraphrase.indexOf('@' + arg.value);
                    if (index === -1 || (index !== 0 && this.paraphrase[index - 1] !== ' ')) {
                        counter['username'] += 1;
                        return false;
                    }
                } 
                if (arg.type === 'tt:hashtag') {
                    let index = this.paraphrase.indexOf('#' + arg.value);
                    if (index === -1 || (index !== 0 && this.paraphrase[index - 1] !== ' ')) {
                        counter['hashtag'] += 1;
                        return false;
                    }
                }
                if (arg.type === 'tt:url') {
                    if (this.paraphrase.indexOf(arg.value) === -1 &&
                        this.paraphrase.indexOf(arg.value.substring('http://'.length)) === -1) {
                        return false;
                    }
                }
                if (arg.type === 'tt:phone_number') {
                    if (this.paraphrase.indexOf(arg.value) === -1 &&
                        this.paraphrase.indexOf(arg.value.substring('+1'.length)) === -1) {
                        counter['phone_number'] += 1;
                        return false;
                    }
                }
                if (arg.type === 'tt:email_address' || arg.type === 'tt:path_name') {
                    if (this.paraphrase.indexOf(arg.value) === -1) {
                        counter['email/path'] += 1;
                        return false;
                    }
                }
            }
        }
        return true;
    }

    _extract_values() {
        let values = [];
        this._extract_values_loop(this.ast, values);
        return values;
    }

    _extract_values_loop(obj, values) {
        if (obj && typeof obj == 'object') {
            if (obj instanceof Ast.Value)
                values.push(obj);
            else {
                Object.keys(obj).forEach((key) => {
                    this._extract_values_loop(obj[key], values);
                });
            }
        }
    }
}




function main() {
    //const raw = '/home/silei/Workspace/mturk/acl18/batch_3/paraphrase_out_formatted.csv'
    //const cleaned = '/home/silei/Workspace/mturk/acl18/batch_3/paraphrase_out_cleaned.tsv'
    const raw = process.argv[2];
    const cleaned = process.argv[3]

    const parser = csv.parse();
    const input = fs.createReadStream(raw).pipe(parser);
    const output = csv.stringify({ header: true, delimiter: '\t' });
    output.pipe(fs.createWriteStream(cleaned));

    clean_paraphrase(input, output);
}


main();
