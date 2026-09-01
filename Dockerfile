# json-flow-editor 的 pod:一个能直接 SSH 进去干活的容器,不是只会跑进程的黑盒。
# 里面有 python(跑服务)、node/npm(在 pod 里就能重新构建)、git、openssh。
FROM python:3.11-alpine

RUN apk add --no-cache openssh nodejs npm git su-exec rsync \
 && ssh-keygen -A \
 && sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config \
 && sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config \
 && echo "HostKey /etc/ssh/keys/ssh_host_ed25519_key" >> /etc/ssh/sshd_config \
 && echo "HostKey /etc/ssh/keys/ssh_host_rsa_key" >> /etc/ssh/sshd_config

WORKDIR /app
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# 代码不再烤进镜像:/app 由 compose 挂宿主目录,改完文件立刻生效,不用重建镜像
EXPOSE 4244 22
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4244/api/list >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
