#!/bin/sh
# 先把 sshd 拉起来(host key 落宿主盘,重启后指纹不变),再以宿主用户身份跑服务。
set -e
mkdir -p /etc/ssh/keys
[ -f /etc/ssh/keys/ssh_host_ed25519_key ] || ssh-keygen -q -t ed25519 -N '' -f /etc/ssh/keys/ssh_host_ed25519_key
[ -f /etc/ssh/keys/ssh_host_rsa_key ]     || ssh-keygen -q -t rsa -b 3072 -N '' -f /etc/ssh/keys/ssh_host_rsa_key
chmod 600 /etc/ssh/keys/*
# authorized_keys 从只读挂载点复制进来:sshd 的 StrictModes 要求属主是 root、权限 600,
# 直接挂宿主文件会因为属主是 guruicheng 被拒(实测 Permission denied)
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f /tmp/authorized_keys.host ] && cp /tmp/authorized_keys.host /root/.ssh/authorized_keys
chown root:root /root/.ssh/authorized_keys 2>/dev/null || true
chmod 600 /root/.ssh/authorized_keys 2>/dev/null || true
/usr/sbin/sshd -e

APP_UID="${APP_UID:-1003}"
APP_GID="${APP_GID:-1003}"
exec su-exec "$APP_UID:$APP_GID" python3 /app/server.py 4244
