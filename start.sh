#!/bin/bash
set -e

# 切换到脚本所在目录（项目根目录）
cd "$(dirname "$0")"

# ========== 颜色定义 ==========
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}$1${NC}"; }
warn()  { echo -e "${YELLOW}$1${NC}"; }
error() { echo -e "${RED}$1${NC}"; }
cyan()  { echo -e "${CYAN}$1${NC}"; }

# ========== 进程检测与清理 ==========
echo ""
cyan "🔍 检查旧进程..."

# 收集所有相关 PID（端口 + 进程名）
PORT_PIDS=$(/usr/sbin/lsof -ti :3456 -ti :5173 2>/dev/null || true)
NAME_PIDS=$(pgrep -f 'pnpm.*api-test|tsx.*api-test|vite.*api-test' 2>/dev/null || true)

# 合并去重
ALL_PIDS=$(echo -e "${PORT_PIDS}\n${NAME_PIDS}" | grep -v '^$' | sort -u)

if [ -n "$ALL_PIDS" ]; then
  warn "⚠️  发现旧进程: $(echo $ALL_PIDS | tr '\n' ' ')"

  # 先 SIGTERM 优雅退出
  echo $ALL_PIDS | xargs kill 2>/dev/null || true
  sleep 2

  # 检查是否还活着，强制 SIGKILL
  SURVIVED=0
  for PID in $ALL_PIDS; do
    if kill -0 "$PID" 2>/dev/null; then
      warn "   进程 $PID 未响应 SIGTERM，强制终止..."
      kill -9 "$PID" 2>/dev/null || true
      SURVIVED=1
    fi
  done

  if [ "$SURVIVED" -eq 1 ]; then
    sleep 1
  fi

  info "✅ 旧进程已清理"
else
  info "✅ 无旧进程"
fi

# ========== 安装依赖 ==========
echo ""
cyan "📦 检查依赖..."

# 如果 node_modules 不存在，或 lock 文件比 node_modules 新，则安装
if [ ! -d "node_modules" ]; then
  warn "📦 node_modules 不存在，安装依赖..."
  pnpm install
  info "📦 依赖安装完成"
elif [ -f "pnpm-lock.yaml" ] && [ "pnpm-lock.yaml" -nt "node_modules/.package-lock.json" ] 2>/dev/null; then
  warn "📦 lock 文件有更新，同步依赖..."
  pnpm install
  info "📦 依赖已同步"
else
  info "📦 依赖已就绪"
fi

# ========== 启动开发服务器 ==========
echo ""
info "🚀 启动开发服务器..."
echo ""
cyan "   前端: http://localhost:5173/nexqa/"
cyan "   后端: http://localhost:3456"
echo ""

exec pnpm dev
