# neko-lucia

Session library maintained by [@Ducheved](https://github.com/Ducheved).

Independent MIT fork of Lucia v3 (see `LICENSE` + `NOTICE`). Not affiliated with the original Lucia project.

| Package | Description |
|---------|-------------|
| `@ducheved/neko-lucia` | Core session API |
| `@ducheved/neko-lucia-adapter-drizzle` | Drizzle adapters (PostgreSQL / MySQL / SQLite) |

## Install

From npm (after you publish):

```bash
pnpm add @ducheved/neko-lucia @ducheved/neko-lucia-adapter-drizzle
```

From a local checkout:

```bash
pnpm add @ducheved/neko-lucia@file:../neko-lucia/packages/lucia
pnpm add @ducheved/neko-lucia-adapter-drizzle@file:../neko-lucia/packages/adapter-drizzle
```

## Develop

```bash
pnpm install
pnpm build
pnpm test
```

## Release

1. Bump versions in `packages/*/package.json`
2. Push a tag `vX.Y.Z` (or run the Publish workflow manually)
3. CI builds, tests, and publishes to npm

Requires repository secrets / OIDC as documented in `.github/workflows/publish.yml`.

## License

MIT. Based on Lucia by pilcrowOnPaper — see `NOTICE`.
