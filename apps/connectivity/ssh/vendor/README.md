# SSH vendor files

| File | What | Version | License |
|---|---|---|---|
| `xterm.min.js`, `xterm.css` | xterm.js terminal (`@xterm/xterm`) | 6.0.0 | MIT (`LICENSE-xterm.txt`) |
| `xterm-addon-fit.min.js` | fit addon (`@xterm/addon-fit`) | 0.11.0 | MIT (`LICENSE-xterm.txt`) |
| `ssh-lib.min.js` | `@microsoft/dev-tunnels-ssh` bundled for the browser, exposes `window.SSHLib` | 3.12.42 | MIT (`LICENSE-dev-tunnels-ssh.txt`, deps in `THIRD_PARTY_NOTICES.txt`) |

`ssh-lib.min.js` uses Web Crypto in the browser (ECDH P-256/P-384, DH group14/16, AES-256-GCM/CTR,
HMAC-SHA2 ETM, RSA-SHA2 / ECDSA host keys). Its Node-only branches (`crypto`, `net`, `os`, `path`,
`stream`, `node-rsa`) are never taken in a browser and are stubbed out at build time.

Rebuild (from a scratch folder, not inside the repo):

```sh
npm i @microsoft/dev-tunnels-ssh@3.12.42 esbuild
cp <repo>/apps/connectivity/ssh/vendor/build/* .
npx esbuild ssh-lib-entry.js --bundle --format=iife --minify --platform=browser \
  --outfile=ssh-lib.min.js --define:global=globalThis --legal-comments=none \
  --inject:./shim-buffer.js --alias:stream=./stub-stream.js \
  --alias:crypto=./stub-empty.js --alias:net=./stub-empty.js --alias:os=./stub-empty.js \
  --alias:path=./stub-empty.js --alias:node-rsa=./stub-empty.js
```

`build/ssh-lib-entry.js` also adds the two channel requests the library does not ship:
`pty-req` (`PtyReq`) and `window-change` (`WinCh`).
