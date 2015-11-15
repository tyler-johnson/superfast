BIN = ./node_modules/.bin
LIB = $(wildcard lib/* lib/*/*)
OUT = index.js cli.js
SRC = $(OUT:%.js=lib/%.js)

build: $(OUT)

%.js: lib/%.js $(LIB)
	# $< -> $@
	@echo "#!/usr/bin/env node\n\n" > $@
	@node -e "require(\"rollup\").rollup({\
		entry: \"$<\",\
		plugins: [ require(\"rollup-plugin-string\")({\
	        extensions: [\".jst\"]\
	    }) ]\
	}).then(function(bundle) {\
		var result = bundle.generate({\
			format: \"cjs\"\
		});\
		console.log(result.code);\
	});" >> $@

clean:
	rm $(OUT)

.PHONY: build
