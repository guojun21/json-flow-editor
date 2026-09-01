# json-flow-editor 运行时:只用 Python 标准库,不装任何依赖。
# 基础镜像固定用 108 本地已有的 tag(那台机器没有 registry 出网,拉不了新镜像)。
FROM python:3.11-alpine

WORKDIR /app
# 代码进镜像;data/ 由 compose 挂载宿主目录,改图不随镜像重建丢
COPY server.py ./
COPY index.html ./
COPY dist ./dist
COPY data ./data

EXPOSE 4244
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4244/api/list >/dev/null || exit 1

CMD ["python3", "server.py", "4244"]
