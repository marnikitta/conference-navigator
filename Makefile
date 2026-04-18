.PHONY: install dev build preview serve lint lint-fix format typecheck check clean

install:
	npm install

dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

serve: build
	cd dist && python3 -m http.server 8001

lint:
	npm run lint

lint-fix:
	npm run lint:fix

format:
	npm run format

typecheck:
	npm run typecheck

check: lint typecheck

clean:
	rm -rf dist node_modules/.tmp
