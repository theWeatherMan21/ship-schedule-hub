#!/bin/bash
# 编译静默取证助手（输出屏幕可见窗口 JSON）。放到 ~/bin（持久），别放 scratch（24h 会被清）
set -e
mkdir -p "$HOME/bin"
swiftc -O -o "$HOME/bin/onscreen" "$(dirname "$0")/onscreen.swift"
echo "✓ $HOME/bin/onscreen"
