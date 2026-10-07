#!/bin/bash
# TRANSLATIO 邮件桥：agently-cli 轮询 → 提取 [TRANSLATIO] 邮件 → ingest 推入 LSHOT
# 每 10 分钟由 LaunchAgent 调用一次；已有邮件自动跳过（ingest 端做 URL 去重）
export PATH=/Users/lingsongxiong/.nvm/versions/node/v24.15.0/bin:$PATH

# 1) 拉最近 10 分钟内的邮件
SINCE=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
RAW=$(agently-cli message +list --limit 20 --after "$SINCE" 2>/dev/null)
[ -z "$RAW" ] && exit 0

# 2) 提取 TRANSLATIO 邮件并推入 ingest
echo "$RAW" | node /Users/lingsongxiong/mydev/LSHOT/scripts/translatio-bridge.mpl
