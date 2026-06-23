---
"nestjs-metrics": patch
---

Ship a `nestjs/` subpath folder stub so the `nestjs-metrics/nestjs` entry
resolves under classic `moduleResolution: "node"` too (not only `node16` /
`nodenext` / `bundler`). Consumers on older NestJS tsconfigs can now import the
NestJS module without changing their resolution setting.
