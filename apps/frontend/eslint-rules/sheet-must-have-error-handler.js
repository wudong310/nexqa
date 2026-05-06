/**
 * ESLint Rule: sheet-must-have-error-handler
 *
 * 检测 <XXXSheet 组件使用时，确保传了 onError 或 onRetry prop。
 *
 * 检测模式：JSX 元素名以 "Sheet" 结尾（排除 shadcn/ui 的基础 Sheet 组件）
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "以 Sheet 结尾的业务组件必须传 onError 或 onRetry prop，确保错误有反馈",
    },
    messages: {
      missingErrorHandler:
        '"{{name}}" 组件建议传入 onError 或 onRetry prop，确保操作错误有反馈通道',
    },
    schema: [],
  },

  create(context) {
    const baseSheetComponents = new Set([
      "Sheet",
      "SheetContent",
      "SheetHeader",
      "SheetTitle",
      "SheetDescription",
      "SheetFooter",
      "SheetClose",
      "SheetOverlay",
      "SheetPortal",
      "SheetTrigger",
    ]);

    return {
      JSXOpeningElement(node) {
        const name = getElementName(node.name);
        if (!name) return;

        // Only check components ending with "Sheet" that aren't base UI
        if (!name.endsWith("Sheet")) return;
        if (baseSheetComponents.has(name)) return;

        const hasOnError = node.attributes.some(
          (attr) =>
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "onError",
        );

        const hasOnRetry = node.attributes.some(
          (attr) =>
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "onRetry",
        );

        if (!hasOnError && !hasOnRetry) {
          context.report({
            node,
            messageId: "missingErrorHandler",
            data: { name },
          });
        }
      },
    };
  },
};

function getElementName(nameNode) {
  if (nameNode.type === "JSXIdentifier") {
    return nameNode.name;
  }
  if (nameNode.type === "JSXMemberExpression") {
    return nameNode.property.name;
  }
  return null;
}

export default rule;
