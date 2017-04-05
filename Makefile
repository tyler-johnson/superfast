BIN = ./node_modules/.bin
PKGS = $(wildcard packages/*)
PKGNAMES = $(subst packages/,,$(PKGS))
TESTS = $(wildcard packages/*/test/index.js)
MAINPKG = superfast

build: bootstrap $(PKGNAMES)

bootstrap:
	$(BIN)/lerna bootstrap

test: build
	@ for t in $(TESTS) ; do \
		echo "=>" $$t ; \
		$(BIN)/babel-node $$t || exit 1 ; \
	done

# cli.js: packages/$(MAINPKG)/lib/cli.js
# 	rm -f $@
# 	ln -s $< $@

define GEN_BABEL
$1: packages/$1

packages/$1: packages/$1/index.js

packages/$1/index.js: packages/$1/src/index.js $$(wildcard packages/$1/src/*)
	$(BIN)/rollup $$< -c > $$@

packages/$1/test.js: packages/$1/test/index.js packages/$1/index.js $$(wildcard packages/$1/test/*)
	$(BIN)/rollup $$< -c > $$@

test-$1: packages/$1/test.js build
	$(BIN)/babel-node $$<
endef

$(foreach pkg,$(PKGNAMES), \
	$(eval $(call GEN_BABEL,$(pkg))))

clean:
	rm -rf cli.js $(wildcard packages/*/index.js packages/*/test.js)

clean-all: clean
	$(BIN)/lerna clean --yes

.PHONY: build $(PKGNAMES) clean clean-all bootstrap test $(TESTS)
