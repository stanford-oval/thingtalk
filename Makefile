%.js : %.lr tools/generate-parser/*.js tools/generate-parser/grammar.js
	ts-node tools/generate-parser $@ $<

%.js : %.pegjs
	pegjs -o $@ $<

%.mo : %.po
	msgfmt $< -o $@

all = \
	$(patsubst %.po,%.mo,$(wildcard po/*.po)) \
	tools/generate-parser/grammar.js \
	lib/nn-syntax/parser.js \
	lib/grammar.js \
	test/test_sr_parser_generator.js

dist: lib lib/* lib/ast/* lib/builtin/* lib/compiler/* lib/nn-syntax/* lib/runtime/* $(all)
	tsc --build tsconfig.json
	touch $@

all: dist

lib/grammar.js : lib/grammar.pegjs
	pegjs --allowed-start-rules input,type_ref,permission_rule -o $@ $<
