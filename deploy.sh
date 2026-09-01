#!/bin/bash
# 一键部署到 108:同步代码 → 重启服务 → 健康检查。用法: ./deploy.sh
set -e
HOST=pd108
DIR='~/apps/json-flow-editor'
PORT=4244

ssh "$HOST" "mkdir -p $DIR"
rsync -a --delete --exclude .git --exclude node_modules --exclude server.log "$(dirname "$0")/" "$HOST:$DIR/"
# [s]erver 括号技巧:防止 pkill -f 匹配到 ssh 会话自身的命令行把自己杀掉
ssh "$HOST" "chmod +x $DIR/start.sh; pkill -f '[s]erver.py $PORT' 2>/dev/null; sleep 1.2; $DIR/start.sh $PORT; sleep 0.7; curl -s -o /dev/null -w '108本机HTTP:%{http_code}\n' http://127.0.0.1:$PORT/"
curl -s -m 5 -o /dev/null -w "跨机HTTP:%{http_code}\n" "http://192.168.67.108:$PORT/"
echo "部署完成: http://192.168.67.108:$PORT/"
