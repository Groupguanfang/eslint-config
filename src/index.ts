import type { OptionsConfig as AntfuOptionsConfig, TypedFlatConfigItem as AntfuTypedFlatConfigItem, Awaitable, Rules } from '@antfu/eslint-config'
import type { Linter } from 'eslint'
import type { FlatConfigComposer } from 'eslint-flat-config-utils'
import type { NailyConfigNames, RuleOptions as NailyRuleOptions } from './typegen'
import antfu, { isInEditorEnv } from '@antfu/eslint-config'
import builtinImport from './builtin-import'
import ifOneline from './if-oneline'
import interfaceNaming from './interface-naming'
import requireOverride from './require-override'

const EDITOR_LOG_KEY = Symbol.for('naily-eslint-config/editor-log')

export interface NailyTypedFlatConfigItem extends AntfuTypedFlatConfigItem {
  rules?: Rules & Pick<NailyRuleOptions, Extract<keyof NailyRuleOptions, `naily/${string}`>>
}

export interface NailyOptionsConfig extends AntfuOptionsConfig {
  freedom?: true
  convention?: boolean
}

export function naily(
  options?: NailyOptionsConfig & Omit<NailyTypedFlatConfigItem, 'files' | 'ignores'>,
  ...userConfigs: Awaitable<NailyTypedFlatConfigItem | NailyTypedFlatConfigItem[] | FlatConfigComposer<any, any> | Linter.Config[]>[]
): FlatConfigComposer<NailyTypedFlatConfigItem, NailyConfigNames> {
  const detectedEditor = isInEditorEnv()
  const isInEditor = options?.isInEditor ?? detectedEditor
  const editorLogState = globalThis as typeof globalThis & Record<symbol, boolean>
  const shouldLog = detectedEditor && isInEditor && !editorLogState[EDITOR_LOG_KEY]

  const configComposer: FlatConfigComposer<NailyTypedFlatConfigItem, NailyConfigNames> = antfu({
    ...options,
    isInEditor: shouldLog ? undefined : isInEditor,
  }, ...userConfigs)
    .removeRules('antfu/if-newline')
    .append({
      name: 'naily',
      plugins: {
        naily: {
          rules: {
            [ifOneline.name]: ifOneline,
            [builtinImport.name]: builtinImport,
            [interfaceNaming.name]: interfaceNaming,
            [requireOverride.name]: requireOverride,
          },
        },
      },
      rules: {
        'naily/if-oneline': 'error',
        'naily/builtin-import': [
          'error',
          {
            fixTo: 'default-import',
            patterns: ['/^(?:node|bun|deno):/', 'vscode'],
          },
        ],
        'naily/require-override': 'error',
        'ts/method-signature-style': ['error', 'method'],
        'ts/no-namespace': 'off',
        'vue/singleline-html-element-content-newline': 'off',
      },
    })

  if (shouldLog) editorLogState[EDITOR_LOG_KEY] = true

  const typescriptOptions = typeof options?.typescript === 'object' ? options.typescript : undefined
  const typescriptParserOptions = typescriptOptions && 'parserOptions' in typescriptOptions ? typescriptOptions : undefined
  if (
    options?.typescript !== false
    && !(typescriptOptions && 'tsconfigPath' in typescriptOptions && typescriptOptions.tsconfigPath)
    && typescriptParserOptions?.parserOptions?.projectService === undefined
    && typescriptParserOptions?.parserOptions?.project === undefined
  ) {
    configComposer.append({
      name: 'naily/typescript/project-service',
      files: typescriptParserOptions?.filesTypeAware ?? ['**/*.?([cm])ts', '**/*.?([cm])tsx'],
      ignores: typescriptParserOptions?.ignoresTypeAware ?? ['**/*.md/**', '**/*.astro/*.ts'],
      languageOptions: {
        parserOptions: {
          projectService: true,
        },
      },
    })
  }

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

export { type RuleOptions as NailyRuleOptions } from './typegen'
export * from '@antfu/eslint-config'

export default naily
