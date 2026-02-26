import type { TSESTree } from '@typescript-eslint/utils'
import type { Rule } from 'eslint'
import { AST_NODE_TYPES } from '@typescript-eslint/utils'

export const RULE_NAME = 'interface-naming'

export default {
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Force interface naming conventions, support special cases in namespaces.',
      recommended: false,
    },
    schema: [],
    messages: {
      invalidInterfaceName: 'Interface name must start with I, unless in a namespace or the same namespace.',
    },
  },
  create(context: Rule.RuleContext) {
    // 存储所有命名空间的名称
    const namespaceNames = new Set()

    return {
      // 直接监听 TSModuleDeclaration 节点
      TSModuleDeclaration(node: TSESTree.TSModuleDeclaration) {
        if (node.id && node.id.type === AST_NODE_TYPES.Identifier) {
          namespaceNames.add(node.id.name)
        }
      },

      TSInterfaceDeclaration(node: TSESTree.TSInterfaceDeclaration) {
        const interfaceName = node.id.name

        // 检查是否在命名空间内
        let isInNamespace = false
        let parent = node.parent
        while (parent) {
          if (parent.type === AST_NODE_TYPES.TSModuleDeclaration) {
            isInNamespace = true
            break
          }
          parent = parent.parent as TSESTree.Node
        }

        // 检查是否与任何命名空间重名
        const matchesNamespace = namespaceNames.has(interfaceName)

        // 如果不在命名空间内且不与任何命名空间重名，则必须以 I 开头
        if (!isInNamespace && !matchesNamespace && !interfaceName.match(/^I[A-Z]/)) {
          context.report({
            node: node.id,
            messageId: 'invalidInterfaceName',
          })
        }
      },
    }
  },
}
