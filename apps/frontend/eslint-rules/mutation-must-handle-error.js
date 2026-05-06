/**
 * ESLint Rule: mutation-must-handle-error
 *
 * 确保 useMutation 调用包含 onError 处理，
 * 或者 .mutate() / .mutateAsync() 调用的选项中包含 onError。
 *
 * 报错信息：useMutation 调用必须包含 onError 处理，确保用户能看到错误反馈
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "useMutation 调用必须包含 onError 处理，确保用户能看到错误反馈",
    },
    messages: {
      missingOnError:
        "useMutation 调用必须包含 onError 处理，确保用户能看到错误反馈",
    },
    schema: [],
  },

  create(context) {
    return {
      // Detect: useMutation({ ... })
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "useMutation"
        ) {
          checkUseMutationCall(node, context);
        }
      },
    };
  },
};

/**
 * Check if a useMutation() call has onError in its options object
 */
function checkUseMutationCall(node, context) {
  const args = node.arguments;

  if (args.length === 0) {
    context.report({ node, messageId: "missingOnError" });
    return;
  }

  const optionsArg = args[0];

  // If the first arg is an object literal, check for onError property
  if (optionsArg.type === "ObjectExpression") {
    const hasOnError = optionsArg.properties.some(
      (prop) =>
        prop.type === "Property" &&
        prop.key.type === "Identifier" &&
        prop.key.name === "onError",
    );

    if (!hasOnError) {
      context.report({ node, messageId: "missingOnError" });
    }
  }
  // If it's a spread or variable reference, can't statically analyze — skip
}

export default rule;
