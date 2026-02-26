import type { OptionsConfig as AntfuOptionsConfig, TypedFlatConfigItem as AntfuTypedFlatConfigItem, Awaitable } from '@antfu/eslint-config'
import type { Linter } from 'eslint'
import type { FlatConfigComposer } from 'eslint-flat-config-utils'
import type { NailyConfigNames, RuleOptions } from './typegen'
import antfu from '@antfu/eslint-config'
import ifOneline from './if-oneline'
import interfaceNaming from './interface-naming'

export interface NailyTypedFlatConfigItem extends AntfuTypedFlatConfigItem {
  rules?: Record<string, Linter.RuleEntry<any> | undefined> & Omit<RuleOptions, 'antfu/if-newline'>
}

export interface NailyOptionsConfig extends AntfuOptionsConfig {
  freedom?: true
  convention?: boolean
}

export function naily(
  options?: NailyOptionsConfig & Omit<NailyTypedFlatConfigItem, 'files' | 'ignores'>,
  ...userConfigs: Awaitable<NailyTypedFlatConfigItem | NailyTypedFlatConfigItem[] | FlatConfigComposer<any, any> | Linter.Config[]>[]
): FlatConfigComposer<NailyTypedFlatConfigItem, NailyConfigNames> {
  const configComposer = antfu(options, ...userConfigs)
    .removeRules('antfu/if-newline')
    .append({
      name: 'naily',
      plugins: {
        naily: { rules: { [ifOneline.name]: ifOneline } },
      },
      rules: {
        'naily/if-oneline': 'error',
        'ts/method-signature-style': ['error', 'method'],
        'ts/no-namespace': 'off',
      },
    })

  if (options?.freedom) {
    configComposer.append({
      name: 'naily/typescript/unsafe',
      rules: {
        'ts/no-redeclare': 'off',
        'ts/no-unsafe-declaration-merging': 'off',
      },
    })
  }

  if (options?.convention) {
    configComposer.append({
      name: 'naily/typescript/convention',
      plugins: {
        naily: { rules: { [interfaceNaming.name]: interfaceNaming } },
      },
      rules: {
        'ts/naming-convention': [
          'error',
          // {
          //   selector: 'interface',
          //   format: ['PascalCase'],
          //   custom: {
          //     regex: '^I[A-Z]',
          //     match: true,
          //   },
          // },
          {
            selector: 'typeParameter',
            format: ['PascalCase'],
            prefix: ['T'],
          },
          {
            selector: 'function',
            format: ['camelCase', 'PascalCase'],
          },
          {
            selector: 'variable',
            format: ['camelCase', 'UPPER_CASE'],
            leadingUnderscore: 'allow',
          },
          {
            selector: 'parameter',
            format: ['camelCase'],
            leadingUnderscore: 'allow',
          },
          {
            selector: 'memberLike',
            modifiers: ['private'],
            format: ['camelCase'],
            leadingUnderscore: 'require',
          },
          {
            selector: 'typeLike',
            format: ['PascalCase'],
          },
        ],
      },
    })
  }

  return configComposer
}

export * from './interface-naming'
export { type RuleOptions as NailyRuleOptions } from './typegen'
export * from '@antfu/eslint-config'

export default naily
