import type { TSESLint, TSESTree } from '@typescript-eslint/utils'
import type { MethodDeclaration } from 'typescript'

export const RULE_NAME = 'require-override'

const requireOverride: TSESLint.RuleModule<'missingOverride'> & { name: typeof RULE_NAME } = {
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require override on methods inherited from a base class.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingOverride: 'Inherited method {{name}} must be marked with override.',
    },
  },
  create(context) {
    const parserServices = context.sourceCode.parserServices
    if (
      !parserServices?.program
      || !parserServices.esTreeNodeToTSNodeMap
      || !/\.[cm]?tsx?$/u.test(context.filename)
    ) {
      return {}
    }

    const checker = parserServices.program.getTypeChecker()
    const nodeMap = parserServices.esTreeNodeToTSNodeMap
    const sourceCode = context.sourceCode

    function checkClass(node: TSESTree.ClassDeclaration | TSESTree.ClassExpression) {
      if (!node.superClass) return

      const baseConstructor = checker.getTypeAtLocation(nodeMap.get(node.superClass))
      const baseTypes = baseConstructor.getConstructSignatures().map(signature => signature.getReturnType())

      for (const member of node.body.body) {
        if (
          (member.type !== 'MethodDefinition' && member.type !== 'TSAbstractMethodDefinition')
          || member.kind !== 'method'
          || member.override
          || member.accessibility === 'private'
          || member.key.type === 'PrivateIdentifier'
        ) {
          continue
        }

        const method = nodeMap.get(member) as MethodDeclaration
        const symbol = checker.getSymbolAtLocation(method.name)
        if (!symbol) continue

        const hasMethod = (type: (typeof baseTypes)[number]) =>
          checker.getPropertiesOfType(type).some(property => property.escapedName === symbol.escapedName)
        const inherited = member.static
          ? hasMethod(baseConstructor)
          : baseTypes.some(hasMethod)
        if (!inherited) continue

        let firstNameToken = member.computed
          ? sourceCode.getTokenBefore(member.key)
          : sourceCode.getFirstToken(member.key)
        if (!firstNameToken) continue

        const previousToken = sourceCode.getTokenBefore(firstNameToken)
        if (previousToken?.value === '*') firstNameToken = previousToken

        context.report({
          node: member.key,
          messageId: 'missingOverride',
          data: { name: member.computed ? `[${sourceCode.getText(member.key)}]` : sourceCode.getText(member.key) },
          fix: fixer => fixer.insertTextBefore(firstNameToken, 'override '),
        })
      }
    }

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    }
  },
}

export default requireOverride
