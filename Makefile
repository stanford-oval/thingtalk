%.js : %.lr tools/generate-parser/*.js tools/generate-parser/grammar.js
	node tools/generate-parser $< -o $@
	node -c $@

%.js : %.pegjs
	node ./node_modules/.bin/pegjs -o $@ $<

lib/grammar.js : lib/grammar.pegjs
	node ./node_modules/.bin/pegjs --allowed-start-rules input,program,type_ref,permission_rule -o $@ $<

%.mo : %.po
	msgfmt $< -o $@

all = \
	$(patsubst %.lr,%.js,$(wildcard lib/syntax/*.lr)) \
	$(patsubst %.po,%.mo,$(wildcard po/*.po)) \
	lib/grammar.js \
	test/test_sr_parser_generator.js

all : $(all)
