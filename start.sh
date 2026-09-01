#!/bin/sh
# 自愈启动:进程不在就拉起(幂等,可挂 crontab 每分钟守护)。用法: start.sh [port]
cd "$(dirname "$0")" || exit 1
PORT="${1:-4244}"
# 日志超 10MB 截断
if [ -f server.log ] && [ "$(wc -c < server.log)" -gt 10485760 ]; then
  : > server.log
fi
if ! pgrep -f "[s]erver.py $PORT" >/dev/null 2>&1; then
  (setsid nohup python3 server.py "$PORT" >> server.log 2>&1 &)
fi
