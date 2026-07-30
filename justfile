project_root := justfile_directory()

default: format check test build

build:
    pnpm run build

[parallel]
format: format-flake format-node format-just

[unix]
format-flake:
    nix fmt '{{ project_root }}/flake.nix'

[windows]
format-flake:
    @cmd /c "echo Formatting flakes is only possible from a Nix environment"

format-node:
    pnpm run format

format-just:
    just --fmt --unstable

[parallel]
check: typecheck lint

typecheck: build
    pnpm run typecheck-only

[parallel]
lint: lint-prettier lint-eslint

lint-prettier:
    pnpm run format:check

lint-eslint: build
    pnpm run lint-only

[parallel]
test: test-node test-deno

test-node: build
    pnpm run test-only

test-deno: build
    pnpm run test:deno
