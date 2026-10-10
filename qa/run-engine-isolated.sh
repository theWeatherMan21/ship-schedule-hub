#!/bin/bash
# 用独立 profile 跑引擎测试，绝不跟爹地正在用的 App 抢 profile（10-09 教训：
# 我用默认 profile 跑后台验证，和他 App 里的查询撞锁 → 他那边"没有任何结果"）
# 用法：bash qa/run-engine-isolated.sh --origin Ningbo --destination Istanbul --carriers msc
exec env SSH_PROFILE_DIR="${SSH_PROFILE_DIR:-/tmp/ssh-qa-profile-$$}" SSH_DATA_DIR="${SSH_DATA_DIR:-$PWD/.qa-data}" \
  node "$(dirname "$0")/../engine/query.mjs" "$@"
