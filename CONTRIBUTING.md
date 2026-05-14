# Contributing

## Repository structure

```
packages/
├── mcp/    → @cclarity-packages/mcp  (stdio MCP binary: cclarity-mcp)
└── cli/    → @cclarity-packages/cli  (init binary: cclarity)
```

The remote MCP runtime (`api.cclarity.io`) lives in the private **`cclarity-be`** monolith and is deployed independently. This repo is the **public connector surface** only.

---

## Sync policy (source of truth: `cclarity-be`)

The canonical source for `packages/mcp` and `packages/cli` is the private
**`cclarity-be`** monolith at `packages/mcp` / `packages/cli`.

### When to sync

Sync this repo whenever a new version of `@cclarity-packages/mcp` or
`@cclarity-packages/cli` is ready to publish.

### Sync steps

```bash
# 1. From inside cclarity-be, export the latest package sources
rsync -av --delete \
  /path/to/cclarity-be/packages/mcp/src/ \
  /path/to/linkedin-mcp/packages/mcp/src/

rsync -av --delete \
  /path/to/cclarity-be/packages/mcp/package.json \
  /path/to/cclarity-be/packages/mcp/tsconfig.json \
  /path/to/linkedin-mcp/packages/mcp/

rsync -av --delete \
  /path/to/cclarity-be/packages/cli/src/ \
  /path/to/linkedin-mcp/packages/cli/src/

rsync -av --delete \
  /path/to/cclarity-be/packages/cli/package.json \
  /path/to/cclarity-be/packages/cli/tsconfig.json \
  /path/to/linkedin-mcp/packages/cli/

# 2. Update license fields (cclarity-be uses UNLICENSED; public repo uses MIT)
# Already fixed in the package.json files here — re-apply if overwritten.

# 3. Build and test locally
cd packages/mcp && npm ci && npm test && npm run build && cd ../..
cd packages/cli && npm install && npm run build && cd ../..

# 4. Commit + push to main → tag triggers publish
git add -A
git commit -m "chore: sync packages from cclarity-be vX.Y.Z"
git tag mcp-v0.X.Y   # matches package.json version
git push origin main --tags
```

### License field

`cclarity-be/packages/*/package.json` uses `"license": "UNLICENSED"` (private
monolith). After syncing here, the `package.json` files in this repo must keep
`"license": "MIT"`. Check and re-apply if the sync overwrites it.

---

## npm publish strategy

**Single publish owner: this repo.**

- `cclarity-be` does **not** run `npm publish` for `@cclarity-packages/*`.
- CI in this repo publishes on `refs/tags/` (see `.github/workflows/ci.yml`).
- Add a `NPM_TOKEN` secret in **Settings → Secrets and variables → Actions**.

To publish manually:

```bash
cd packages/mcp && npm publish   # publishes @cclarity-packages/mcp
cd packages/cli && npm publish   # publishes @cclarity-packages/cli
```

---

## PRs

Open a PR against `main`. CI must pass before merging.
