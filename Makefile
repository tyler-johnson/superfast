BIN = ./node_modules/.bin
LIB = $(wildcard lib/* lib/*/*)
OUT = index.js cli.js
SRC = $(OUT:%.js=lib/%.js)

define ROLLUP
require("rollup").rollup({
	entry: "$<",
	plugins: [
		require("rollup-plugin-babel")({
			exclude: 'node_modules/**'
		})
	]
}).then(function(bundle) {
	var result = bundle.generate({
		format: "cjs"
	});
	console.log(result.code);
}).catch(function(e) {
	process.nextTick(function() {
		throw e;
	});
});
endef

export ROLLUP

build: $(OUT)

cli.js: lib/cli.js
	# $< -> $@
	@echo "#!/usr/bin/env node\n\n" > $@
	@node -e "$$ROLLUP" >> $@

%.js: lib/%.js $(LIB)
	# $< -> $@
	@node -e "$$ROLLUP" > $@

clean:
	rm $(OUT)

.PHONY: build
