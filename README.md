# Naily ESLint Config

It's based on [@antfu/eslint-config](https://github.com/antfu/eslint-config) and [eslint-flat-config-utils](https://github.com/antfu/eslint-flat-config-utils).

## Installation

```bash
npm install --save-dev naily-eslint-config
```

## Usage

```ts
import naily from 'naily-eslint-config'

export default naily()
```

## Differences from @antfu/eslint-config

I very like the way @antfu/eslint-config is organized, so I keep almost all the rules from it, but I have some little changes:

- Disable `antfu/if-newline` rule.
- Add `naily/if-oneline` rule.

- Add `naily/typescript/convention` rule when `convention` is `true`.
- Add `naily/typescript/unsafe` rule when `freedom` is `true`.

- Disable `vue/singleline-html-element-content-newline` rule.
