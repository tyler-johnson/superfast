BIN = ./node_modules/.bin
SRC = $(wildcard src/* src/*/*)
TEST = $(wildcard test/* test/*/*)

build: index.js

index.js: src/index.js $(SRC)
	$(BIN)/rollup $< -c > $@

clean:
	rm -f index.js

test.js: test/index.js $(TEST)
	$(BIN)/rollup $< -c > $@

test: test.js
	node test.js

.PHONY: build clean test