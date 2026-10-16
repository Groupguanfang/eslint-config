import type { JSRuleDefinition, Rule, SourceCode } from 'eslint'

export interface BuiltinImportOptions {
  fixTo?: FixTo
  patterns?: string[]
}

export type FixTo = 'namespace-import' | 'default-import'

export const RULE_NAME = 'builtin-import'

type MessageId = 'preferDefaultOrNamespace' | 'preferModuleObject'
type ImportKind = 'type' | 'value'
type RuleNode<Type extends Rule.Node['type']> = Extract<Rule.Node, { type: Type }>
type BaseImportDeclaration = RuleNode<'ImportDeclaration'>
type BaseImportSpecifier = RuleNode<'ImportSpecifier'>
type BaseImportDefaultSpecifier = RuleNode<'ImportDefaultSpecifier'>
type BaseImportNamespaceSpecifier = RuleNode<'ImportNamespaceSpecifier'>
type VariableDeclarator = RuleNode<'VariableDeclarator'>
type Identifier = RuleNode<'Identifier'>
type ObjectPattern = RuleNode<'ObjectPattern'>
type ScopeVariable = ReturnType<SourceCode['getDeclaredVariables']>[number]

type ImportDeclaration = BaseImportDeclaration & {
  assertions?: Rule.Node[]
  importKind?: ImportKind
  specifiers: ImportDeclarationSpecifier[]
}

type ImportSpecifier = BaseImportSpecifier & {
  importKind?: ImportKind
  parent: ImportDeclaration
}

type ImportDefaultSpecifier = BaseImportDefaultSpecifier & {
  importKind?: ImportKind
  parent: ImportDeclaration
}

type ImportNamespaceSpecifier = BaseImportNamespaceSpecifier & {
  importKind?: ImportKind
  parent: ImportDeclaration
}

type ImportDeclarationSpecifier
  = ImportSpecifier
    | ImportDefaultSpecifier
    | ImportNamespaceSpecifier

const DEFAULT_PATTERNS = [
  '/^(?:node|bun|deno):/',
  'vscode',
]
const DEFAULT_FIX_TO: FixTo = 'namespace-import'
const REGEXP_PATTERN = /^\/(.+)\/([a-z]*)$/iu

function toMatcher(pattern: string): (value: string) => boolean {
  const match = REGEXP_PATTERN.exec(pattern)

  if (match) {
    const expression = new RegExp(match[1], match[2])
    return value => expression.test(value)
  }

  return value => value === pattern
}

function toNamespaceName(source: string): string {
  const withoutProtocol = source.replace(/^[a-z]+:/iu, '')
  const parts = withoutProtocol.split(/[^\w$]+/iu).filter(Boolean)
  const name = parts
    .map((part, index) => index === 0
      ? part
      : `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('')

  if (!name) return 'builtinModule'

  return /^[a-z_$]/iu.test(name) ? name : `module${name}`
}

function getUniqueName(
  sourceCode: SourceCode,
  source: string,
  reservedNames: ReadonlySet<string> = new Set(),
): string {
  const usedNames = new Set(
    sourceCode.scopeManager.scopes.flatMap(scope => scope.variables.map(variable => variable.name)),
  )
  const preferredName = toNamespaceName(source)

  if (!usedNames.has(preferredName) && !reservedNames.has(preferredName)) return preferredName

  const moduleName = `${preferredName}Module`
  if (!usedNames.has(moduleName) && !reservedNames.has(moduleName)) return moduleName

  for (let index = 2; ; index++) {
    const candidate = `${moduleName}${index}`
    if (!usedNames.has(candidate) && !reservedNames.has(candidate)) return candidate
  }
}

function getImportedName(specifier: ImportSpecifier): string {
  if (specifier.imported.type === 'Identifier') return specifier.imported.name

  return String(specifier.imported.value)
}

function getMemberExpression(namespaceName: string, importedName: string): string {
  return /^[a-z_$][\w$]*$/iu.test(importedName)
    ? `${namespaceName}.${importedName}`
    : `${namespaceName}[${JSON.stringify(importedName)}]`
}

function hasUnsafeImportSyntax(sourceCode: SourceCode, declaration: ImportDeclaration): boolean {
  return sourceCode.getCommentsInside(declaration).length > 0
    || Boolean(declaration.attributes?.length)
    || Boolean(declaration.assertions?.length)
}

function getVariable(sourceCode: SourceCode, specifier: ImportSpecifier) {
  return sourceCode.getDeclaredVariables(specifier)[0]
}

function getVariableReferenceFixes(
  fixer: Rule.RuleFixer,
  variable: ScopeVariable,
  replacement: string,
  definitionIdentifier?: Identifier,
): Rule.Fix[] | null {
  const fixes: Rule.Fix[] = []
  const fixedShorthandProperties = new Set<RuleNode<'Property'>>()

  for (const reference of variable.references) {
    if (definitionIdentifier && reference.identifier.range?.[0] === definitionIdentifier.range?.[0]) continue
    if (reference.isWrite?.()) return null

    if (reference.identifier.type !== 'Identifier') return null

    const identifier = reference.identifier as RuleNode<'Identifier'>
    const parent = identifier.parent

    if (parent?.type === 'ExportSpecifier') return null

    if (parent?.type === 'Property' && parent.shorthand) {
      if (!fixedShorthandProperties.has(parent)) {
        fixes.push(fixer.replaceText(parent, `${identifier.name}: ${replacement}`))
        fixedShorthandProperties.add(parent)
      }
      continue
    }

    if (identifier.name !== replacement) fixes.push(fixer.replaceText(identifier, replacement))
  }

  return fixes
}

function getReferenceFixes(
  fixer: Rule.RuleFixer,
  sourceCode: SourceCode,
  specifier: ImportSpecifier,
  targetName: string,
  targetImportStyle: FixTo,
): Rule.Fix[] | null {
  const variable = getVariable(sourceCode, specifier)
  if (!variable) return null

  const importedName = getImportedName(specifier)
  const replacement = importedName === 'default'
    ? targetImportStyle === 'default-import'
      ? targetName
      : `${targetName}.default`
    : getMemberExpression(targetName, importedName)

  return getVariableReferenceFixes(fixer, variable, replacement)
}

interface DestructuredBinding {
  identifier: Identifier
  importedName: string
}

function getDestructuredBindings(pattern: ObjectPattern): DestructuredBinding[] | null {
  const bindings: DestructuredBinding[] = []

  for (const property of pattern.properties) {
    if (property.type !== 'Property' || property.value.type !== 'Identifier') return null

    const importedName = property.key.type === 'Identifier' && !property.computed
      ? property.key.name
      : property.key.type === 'Literal' && typeof property.key.value === 'string'
        ? property.key.value
        : null
    if (importedName === null) return null

    bindings.push({
      identifier: property.value as Identifier,
      importedName,
    })
  }

  return bindings
}

function getDeclaredVariable(
  sourceCode: SourceCode,
  declaration: VariableDeclarator,
  identifier: Identifier,
): ScopeVariable | undefined {
  return sourceCode.getDeclaredVariables(declaration)
    .find(variable => variable.identifiers.some(declared => declared.range?.[0] === identifier.range?.[0]))
}

function isUnshadowedRequire(sourceCode: SourceCode, node: Rule.Node): boolean {
  for (let scope: ReturnType<SourceCode['getScope']> | null = sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get('require')
    if (variable) return variable.defs.length === 0
  }

  return true
}

function getLoadedModuleSource(
  sourceCode: SourceCode,
  declaration: VariableDeclarator,
): string | null {
  let expression = declaration.init
  if (!expression) return null

  let isAwaited = false
  if (expression.type === 'AwaitExpression') {
    isAwaited = true
    expression = expression.argument
  }

  if (isAwaited && expression.type === 'ImportExpression') {
    return expression.source.type === 'Literal' && typeof expression.source.value === 'string'
      ? expression.source.value
      : null
  }

  if (
    expression.type === 'CallExpression'
    && expression.callee.type === 'Identifier'
    && expression.callee.name === 'require'
    && !expression.optional
    && expression.arguments.length === 1
    && expression.arguments[0]?.type === 'Literal'
    && typeof expression.arguments[0].value === 'string'
    && isUnshadowedRequire(sourceCode, expression as unknown as Rule.Node)
  ) {
    return expression.arguments[0].value
  }

  return null
}

function isTypeOnlyImport(
  declarations: ImportDeclaration[],
  namedSpecifiers: ImportSpecifier[],
): boolean {
  return declarations.every(declaration => declaration.importKind === 'type')
    || namedSpecifiers.every(specifier => specifier.importKind === 'type')
}

function isRuntimeImport(specifier: ImportDeclarationSpecifier): boolean {
  return specifier.parent.importKind !== 'type' && specifier.importKind !== 'type'
}

const builtinImport: JSRuleDefinition<{
  MessageIds: MessageId
  RuleOptions: [BuiltinImportOptions?]
}> & { name: typeof RULE_NAME } = {
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require default or namespace imports and module-object bindings for selected built-in modules.',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          fixTo: {
            enum: ['namespace-import', 'default-import'],
            description: 'The preferred import style for built-in modules. Defaults to `"namespace-import"`.',
          },
          patterns: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
            description: 'The patterns to match for built-in modules. Defaults to `["/^vscode/", "/^(?:node|bun|deno):/"]`.',
          },
        },
      },
    ],
    messages: {
      preferDefaultOrNamespace: 'Use a default or namespace import from {{source}}.',
      preferModuleObject: 'Assign the module object from {{source}} instead of destructuring it.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    const options = context.options[0]
    const fixTo = options?.fixTo ?? DEFAULT_FIX_TO
    const patterns = options?.patterns ?? DEFAULT_PATTERNS
    const matchers = patterns.map(toMatcher)
    const generatedNames = new Set<string>()

    return {
      Program(program) {
        const importsBySource = new Map<string, ImportDeclaration[]>()

        for (const statement of program.body) {
          if (statement.type !== 'ImportDeclaration') continue

          const declaration = statement as unknown as ImportDeclaration
          const source = declaration.source.value
          if (typeof source !== 'string' || !matchers.some(matcher => matcher(source))) continue

          const declarations = importsBySource.get(source) ?? []
          declarations.push(declaration)
          importsBySource.set(source, declarations)
        }

        for (const [source, declarations] of importsBySource) {
          const namedSpecifiers = declarations.flatMap(declaration =>
            declaration.specifiers.filter(
              (specifier): specifier is ImportSpecifier => specifier.type === 'ImportSpecifier',
            ),
          )

          if (namedSpecifiers.length === 0) continue

          const requiresRuntime = namedSpecifiers.some(isRuntimeImport)
          const namespaceSpecifier = declarations
            .flatMap(declaration => declaration.specifiers)
            .find((specifier): specifier is ImportNamespaceSpecifier =>
              specifier.type === 'ImportNamespaceSpecifier'
              && (!requiresRuntime || isRuntimeImport(specifier)),
            )
          const defaultSpecifier = declarations
            .flatMap(declaration => declaration.specifiers)
            .find((specifier): specifier is ImportDefaultSpecifier =>
              specifier.type === 'ImportDefaultSpecifier'
              && (!requiresRuntime || isRuntimeImport(specifier)),
            )
          const namedDefaultSpecifier = namedSpecifiers
            .find(specifier => getImportedName(specifier) === 'default'
              && (!requiresRuntime || isRuntimeImport(specifier)))
          const existingTargetSpecifier = fixTo === 'namespace-import'
            ? namespaceSpecifier ?? defaultSpecifier
            : defaultSpecifier ?? namespaceSpecifier
          const targetImportStyle: FixTo = existingTargetSpecifier?.type === 'ImportNamespaceSpecifier'
            ? 'namespace-import'
            : existingTargetSpecifier
              ? 'default-import'
              : fixTo
          const convertedDefaultSpecifier = targetImportStyle === 'default-import'
            ? namedDefaultSpecifier
            : undefined
          const targetSpecifier = existingTargetSpecifier ?? convertedDefaultSpecifier
          const targetName = targetSpecifier?.local.name ?? getUniqueName(sourceCode, source)
          const namedDeclarations = declarations.filter(declaration =>
            declaration.specifiers.some(specifier => specifier.type === 'ImportSpecifier'),
          )
          const canFixImports = namedDeclarations
            .every(declaration => !hasUnsafeImportSyntax(sourceCode, declaration))

          context.report({
            node: namedSpecifiers[0],
            messageId: 'preferDefaultOrNamespace',
            data: { source },
            fix: canFixImports
              ? (fixer) => {
                  const referenceFixes: Rule.Fix[] = []
                  for (const specifier of namedSpecifiers) {
                    const fixes = getReferenceFixes(
                      fixer,
                      sourceCode,
                      specifier,
                      targetName,
                      targetImportStyle,
                    )
                    if (!fixes) return null
                    referenceFixes.push(...fixes)
                  }

                  const importFixes: Rule.Fix[] = []
                  const sourceText = sourceCode.getText(declarations[0].source)
                  const shouldCreateImport = !existingTargetSpecifier
                  const targetDeclaration = shouldCreateImport
                    ? convertedDefaultSpecifier?.parent ?? namedDeclarations[0]
                    : null

                  for (const declaration of namedDeclarations) {
                    const existingDefault = declaration.specifiers
                      .find((specifier): specifier is ImportDefaultSpecifier =>
                        specifier.type === 'ImportDefaultSpecifier',
                      )

                    if (existingDefault) {
                      const typeKeyword = declaration.importKind === 'type' ? ' type' : ''
                      const semicolon = sourceCode.getText(declaration).trimEnd().endsWith(';') ? ';' : ''
                      importFixes.push(fixer.replaceText(
                        declaration,
                        `import${typeKeyword} ${existingDefault.local.name} from ${sourceCode.getText(declaration.source)}${semicolon}`,
                      ))
                    }
                    else if (declaration === targetDeclaration) {
                      const typeKeyword = isTypeOnlyImport(namedDeclarations, namedSpecifiers) ? ' type' : ''
                      const semicolon = sourceCode.getText(declaration).trimEnd().endsWith(';') ? ';' : ''
                      const importClause = targetImportStyle === 'namespace-import'
                        ? `* as ${targetName}`
                        : targetName
                      importFixes.push(fixer.replaceText(
                        declaration,
                        `import${typeKeyword} ${importClause} from ${sourceText}${semicolon}`,
                      ))
                    }
                    else {
                      importFixes.push(fixer.remove(declaration))
                    }
                  }

                  return [...importFixes, ...referenceFixes]
                }
              : undefined,
          })
        }
      },
      VariableDeclarator(node) {
        const declaration = node as VariableDeclarator
        if (declaration.id.type !== 'ObjectPattern') return

        const source = getLoadedModuleSource(sourceCode, declaration)
        if (source === null || !matchers.some(matcher => matcher(source))) return

        const pattern = declaration.id as ObjectPattern
        const bindings = getDestructuredBindings(pattern)
        const targetName = getUniqueName(sourceCode, source, generatedNames)
        generatedNames.add(targetName)

        context.report({
          node: pattern,
          messageId: 'preferModuleObject',
          data: { source },
          fix: bindings && sourceCode.getCommentsInside(pattern).length === 0
            ? (fixer) => {
                const referenceFixes: Rule.Fix[] = []

                for (const binding of bindings) {
                  const variable = getDeclaredVariable(sourceCode, declaration, binding.identifier)
                  if (!variable) return null

                  const fixes = getVariableReferenceFixes(
                    fixer,
                    variable,
                    getMemberExpression(targetName, binding.importedName),
                    binding.identifier,
                  )
                  if (!fixes) return null
                  referenceFixes.push(...fixes)
                }

                return [fixer.replaceText(pattern, targetName), ...referenceFixes]
              }
            : undefined,
        })
      },
    }
  },
}

export default builtinImport
