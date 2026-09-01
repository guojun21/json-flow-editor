#!/bin/bash
# 一键部署到 108(容器化):同步代码 → 重建镜像 → 起容器 → 健康检查。用法: ./deploy.sh
set -e
HOST=pd108
DIR='~/apps/json-flow-editor'
PORT=4244

ssh "$HOST" "mkdir -p $DIR"
rsync -a --delete --exclude .git --exclude node_modules --exclude server.log \
  "$(dirname "$0")/" "$HOST:$DIR/"
ssh "$HOST" "cd $DIR && docker compose up -d --build 2>&1 | tail -3 && \
  sleep 2 && docker ps --filter name=json-flow-editor --format '容器:{{.Names}} {{.Status}}' && \
  curl -s -o /dev/null -w '108本机HTTP:%{http_code}\n' http://127.0.0.1:$PORT/"
curl -s -m 5 -o /dev/null -w "跨机HTTP:%{http_code}\n" "http://192.168.67.108:$PORT/"
echo "部署完成: http://192.168.67.108:$PORT/"
