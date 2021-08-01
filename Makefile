%.ts : %.lr tools/generate-parser/*.ts tools/generate-parser/grammar.js
	ts-node tools/generate-parser $@ $<

%.js : %.pegjs
	pegjs -o $@ $<

all = \
	tools/generate-parser/grammar.js \
	lib/nn-syntax/parser.ts \
	lib/new-syntax/parser.ts \
	lib/grammar.js \
	test/test_sr_parser_generator.ts

dist: lib lib/* lib/ast/* lib/compiler/* lib/nn-syntax/* lib/runtime/* lib/utils/* $(all) tsconfig.json
	tsc --build tsconfig.json
	touch $@

all: dist

lib/grammar.js : lib/grammar.pegjs
	pegjs --allowed-start-rules input,type_ref,permission_rule -o $@ $<

%.html : %.lr
	ts-node tools/generate-parser --wsn $< | kgt -l wsn -e ebnfhtml5 > $@
