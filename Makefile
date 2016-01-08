BIN = ./node_modules/.bin
LIB = $(wildcard lib/* lib/*/*)
OUT = index.js cli.js
DOCS = $(wildcard docs/*.md)
DOCSNOINDEX = $(filter-out docs/index.md, $(DOCS))
MAN = $(DOCSNOINDEX:docs/%.md=man/superfast-%.1)

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
	process.stdout.write(result.code);
}).catch(function(e) {
	process.nextTick(function() {
		throw e;
	});
});
endef

export ROLLUP

build: build-src build-man
build-src: $(OUT)
build-man: $(MAN) man/superfast.1

cli.js: lib/cli.js
	# $< -> $@
	@echo "#!/usr/bin/env node\n" > $@
	@node -e "$$ROLLUP" >> $@

index.js: lib/index.js $(LIB)
	# $< -> $@
	@node -e "$$ROLLUP" > $@

man:
	@mkdir -p man

man/superfast.1: docs/index.md man/
	# $< -> $@
	@$(BIN)/remark -u remark-man $< > $@

man/superfast-%.1: docs/%.md man/
	# $< -> $@
	@$(BIN)/remark -u remark-man $< > $@

clean:
	rm -rf $(OUT) man/

.PHONY: build
