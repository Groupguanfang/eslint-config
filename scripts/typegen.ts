import fs from 'node:fs/promises'
import { CONFIG_PRESET_FULL_ON } from '@antfu/eslint-config'
import { flatConfigsToRulesDTS } from 'eslint-typegen/core'
import { builtinRules } from 'eslint/use-at-your-own-risk'
import naily from '../src/index'

const configs = await naily({
  ...CONFIG_PRESET_FULL_ON,
  convention: true,
  freedom: true,
})
  .prepend({
    plugins: {
      '': {
        rules: Object.fromEntries(builtinRules.entries()),
      },
    },
  })

const configNames = configs.map(i => i.name).filter(Boolean) as string[]

let dts = `// @ts-nocheck\n${await flatConfigsToRulesDTS(configs, {
  includeAugmentation: false,
})}`

dts += `
// Names of all the configs
export type NailyConfigNames = ${configNames.map(i => `'${i}'`).join(' | ')}
`

await fs.writeFile('src/typegen.ts', dts)
