# Code Lab vendor files

| File | What | Version | License |
|---|---|---|---|
| `codelab-lib.min.js` | `@jupyterlab/services` (ServerConnection, KernelManager, KernelSpecManager) + a small CodeMirror 6 setup (view, state, commands, language, lang-python, autocomplete), bundled for the browser, exposes `window.CodeLabLib` | services 7.5.11, @codemirror/view 6.43.15 | BSD-3-Clause (Jupyter) / MIT (CodeMirror); full list in `THIRD_PARTY_NOTICES.txt` |

Size: ~530 KB minified (~170 KB gzip).

Rebuild (from a scratch folder, not inside the repo):

```sh
npm i @jupyterlab/services@7.5.11 @codemirror/view @codemirror/state @codemirror/commands \
  @codemirror/language @codemirror/lang-python @codemirror/autocomplete esbuild
cp <repo>/apps/lab/code-lab/vendor/codelab-lib-entry.js .
npx esbuild codelab-lib-entry.js --bundle --format=iife --minify --platform=browser \
  --outfile=codelab-lib.min.js --define:global=globalThis \
  --define:process.env.NODE_ENV='"production"' --legal-comments=none
```
