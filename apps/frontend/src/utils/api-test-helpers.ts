/** 从 path 提取模块名，兼容 /api/xxx 和 /xxx 两种格式 */
export function getModuleName(path: string): string {
  const stripped = path.replace(/^\/api\//, "/").replace(/^\//, "");
  const parts = stripped.split("/");
  return parts[0] || "other";
}

/** 方法颜色 class — POST=黄色, GET=蓝色, DELETE=红色, PUT=橙色 */
export function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "POST":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300";
    case "PUT":
      return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
    case "DELETE":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  }
}
