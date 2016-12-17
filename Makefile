NAME = superfast
BIN = ./node_modules/.bin
PKGS = $(wildcard packages/*)
PKGNAMES = $(subst packages/,,$(PKGS))
TESTS = $(wildcard packages/*/test/index.js)

build: bootstrap $(PKGNAMES) # cli.js packages/$(NAME)/README.md

bootstrap:
	$(BIN)/lerna bootstrap

test: build
	@ for t in $(TESTS) ; do \
		echo "=>" $$t ; \
		$(BIN)/babel-node $$t || exit 1 ; \
	done

# cli.js: packages/$(NAME)/lib/cli.js
# 	rm -f $@
# 	ln -s $< $@
#
# packages/$(NAME)/README.md: README.md
# 	cp $< $@

define GEN_BABEL
$1: packages/$1

packages/$1: $(subst /src/,/lib/,$2)

packages/$1/lib/cli.js: packages/$1/src/cli.js
	mkdir -p `dirname $$@`
	echo "#!/usr/bin/env node" > $$@
	$(BIN)/babel $$< >> $$@
	chmod +x $$@

packages/$1/lib/%.js: packages/$1/src/%.js
	mkdir -p `dirname $$@`
	$(BIN)/babel $$< > $$@

test-$1: packages/$1/test/index.js build
	$(BIN)/babel-node $$<
endef

$(foreach pkg,$(PKGNAMES), \
	$(eval $(call GEN_BABEL,$(pkg),$(wildcard packages/$(pkg)/src/*.js packages/$(pkg)/src/*/*.js))))

clean:
	rm -rf packages/$(NAME)/README.md cli.js $(wildcard packages/*/lib)
	$(BIN)/lerna clean --yes
