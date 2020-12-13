SHELL=/usr/bin/env bash -e -o pipefail
CI?=false

.PHONY: install
## install: install dependencies
install:
	@npm install -g aws-cdk@1.77.0
	@npm install

.PHONY: lint
lint:
	@npm run lint	

.PHONY: test
test:
	@npm run test

.PHONY: build
## build: build stack
build:
	@npm run build	