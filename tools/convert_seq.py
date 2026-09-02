#!/usr/bin/env python3
"""时序图(排产采集一期四条主链路):生命线 + 消息。每条流程一个文件 seq_1..seq_4。
消息 = 两个锚点(透明小方块,挂在各自生命线的同一高度)之间的连线;同步=实线实心箭头,返回=虚线细箭头。"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LL = ["数采员 / 组长", "前端 Pudu Studio", "供数后端 :4192", "factory-core :4198", "SQLite", "工控机采集 Agent"]
FLOWS = [
 ("领取令牌(抢单池)", [
   (0, 1, "点「领取令牌」→ 绑定班次/工位/机器人/监控员", "sync", None),
   (1, 2, "POST /api/factory/market/claim", "sync", None),
   (2, 3, "转发(FACTORY_CORE_ORIGIN)", "sync", None),
   (3, 4, "读需求单状态 / 两池配额 / 并发持有 / 工位占用", "sync", None),
   (4, 3, "校验数据", "ret", None),
   (3, 4, "INSERT tokens(待开工, 45min 过期) + events", "sync", None),
   (3, 2, "201 {tokenId, recycleCountdown}", "ret", None),
   (2, 1, "201", "ret", None),
   (1, 0, "令牌入「我的采集令牌」", "ret", None),
   (3, 2, "409:抢单池已发完 / 并发超限 / 工位被占", "ret", None),
 ]),
 ("工位开工(令牌准入)", [
   (0, 5, "在工控机登录,出示令牌", "sync", None),
   (5, 3, "POST /station/session/start {tokenId}", "sync", None),
   (3, 4, "查令牌:存在?状态=待开工?分配令牌待接受→视为接受", "sync", None),
   (4, 3, "令牌行", "ret", None),
   (3, 4, "INSERT sessions(进行中);tokens→在采;events", "sync", None),
   (3, 5, "201 {sessionId}", "ret", None),
   (3, 5, "403 无令牌 / 409 令牌状态不对 → 拒绝开工", "ret", None),
 ]),
 ("落盘后摄取子流程(入库 + 规则预检)", [
   (5, 5, "采集完成 → 落盘包 EP-xxx/(meta.json, video.mp4, sensors/)", "self", None),
   (5, 3, "POST /episodes/ingest {sessionId, packageDir(仅 inbox 下包名)}", "sync", None),
   (3, 3, "校验 packageDir 白名单;Episode 号重复 → 409", "self", None),
   (3, 4, "SELECT 会话/令牌(事实源)", "sync", None),
   (4, 3, "令牌四项 + SOP 版本", "ret", None),
   (3, 3, "包内 meta 逐字段对账 → 冲突记 RC-06", "self", None),
   (3, 3, "规则预检:文件完整性 · 传感器 · ffprobe 时长/帧率 · ffmpeg blackdetect", "self", None),
   (3, 3, "双写 meta.json(含预检结果) → 逐文件 sha256", "self", None),
   (3, 4, "BEGIN;INSERT episodes / episode_files / precheck_results", "sync", "alt [全部通过]"),
   (3, 4, "COMMIT", "sync", "alt [全部通过]"),
   (3, 5, "201 {outcome: ACCEPTED, status: 预检通过}", "ret", "alt [全部通过]"),
   (3, 4, "BEGIN;INSERT episodes(隔离区) … + episode_quarantines", "sync", "alt [meta 冲突 / 预检失败]"),
   (3, 3, "rename 包 → quarantine/(失败则 ROLLBACK;提交失败挪回)", "self", "alt [meta 冲突 / 预检失败]"),
   (3, 4, "COMMIT", "sync", "alt [meta 冲突 / 预检失败]"),
   (3, 5, "201 {outcome: QUARANTINED, reasonCode: RC-0x}", "ret", "alt [meta 冲突 / 预检失败]"),
 ]),
 ("交付批次 + 对账回执", [
   (0, 3, "POST /delivery/batch {episodeIds?}", "sync", None),
   (3, 4, "取「预检通过」的 Episode 与逐文件 sha256", "sync", None),
   (3, 3, "写 outbox/B-xxx/manifest.json;Episode→待搬运", "self", None),
   (3, 0, "201 {batchId, bytes}", "ret", None),
   (0, 3, "POST /delivery/batch/:id/verify(模拟云端接收方)", "sync", None),
   (3, 3, "按 manifest 重算 sha256 逐文件对比", "self", None),
   (3, 4, "通过 → batches 通过/已确认;Episode→已上云 + 7 天清理倒计时", "sync", None),
   (3, 0, "{ok, mismatches[]}", "ret", None),
 ]),
]
X0, DX, HEAD_Y, STEP, TOP = 300, 330, 120, 76, 210
for k, (name, msgs) in enumerate(FLOWS, 1):
    nodes, edges = [], []
    H = TOP + len(msgs) * STEP + 90
    nodes.append({"id": "title", "kind": "text", "x": 40, "y": 30, "w": 1500, "h": 50, "lines": [f"时序图 {k} · {name}"], "fontSize": 30, "bold": True, "textColor": "#0b1220"})
    nodes.append({"id": "legend", "kind": "text", "x": 40, "y": 82, "w": 1700, "h": 30, "lines": ["实线实心箭头 = 同步调用;虚线细箭头 = 返回;折返 = 内部处理;竖条 = 激活(处理中);虚线框 alt[…] = 分支;时间自上而下"], "fontSize": 15, "textColor": "#48586a"})
    used = sorted({a for a, b, _, _, _ in msgs} | {b for a, b, _, _, _ in msgs})
    col = {li: c for c, li in enumerate(used)}
    for li in used:
        nodes.append({"id": f"L{li}", "kind": "lifeline", "shape": "lifeline", "x": X0 + col[li] * DX - 80, "y": HEAD_Y, "w": 160, "h": H - HEAD_Y - 30, "lines": [LL[li]], "fontSize": 15, "z": 1})
    # alt 分支框:同名 frag 连续的消息圈成一个虚线分组包
    frag_rows = {}
    for j, (a, b, text, kind, frag) in enumerate(msgs):
        if frag: frag_rows.setdefault(frag, []).append(j)
    for fi, (frag, rows) in enumerate(frag_rows.items()):
        y1 = TOP + min(rows) * STEP - 58; y2 = TOP + max(rows) * STEP + 34   # 顶部留出标题行,别压住第一条消息
        nodes.append({"id": f"frag{fi}", "kind": "package", "x": X0 - 120, "y": y1, "w": len(used) * DX + 60, "h": y2 - y1, "lines": [frag], "fontSize": 15, "z": 2, "stroke": "#a1691a", "textColor": "#a1691a"})
    # 激活条:同步消息的接收方,从该行起到下一条由它发出的返回为止
    for j, (a, b, text, kind, frag) in enumerate(msgs):
        if kind != "sync" or a == b: continue
        end = next((jj for jj in range(j + 1, len(msgs)) if msgs[jj][0] == b and msgs[jj][1] == a and msgs[jj][3] == "ret"), None)
        y1 = TOP + j * STEP - 8; y2 = TOP + (end if end is not None else j) * STEP + 12
        nodes.append({"id": f"act{j}", "kind": "activation", "x": X0 + col[b] * DX - 7, "y": y1, "w": 14, "h": max(24, y2 - y1), "z": 5, "fill": "#dfe7ee", "stroke": "#48586a"})
    for j, (a, b, text, kind, frag) in enumerate(msgs):
        y = TOP + j * STEP
        xa, xb = X0 + col[a] * DX, X0 + col[b] * DX
        A = f"m{j}a"; B = f"m{j}b"
        if a == b:   # 折返:最右一根向左折
            side = -1 if col[a] == len(used) - 1 else 1
            nodes.append({"id": A, "kind": "anchor", "x": xa - 5, "y": y - 5, "w": 10, "h": 10, "z": 20})
            nodes.append({"id": B, "kind": "anchor", "x": xa - 5, "y": y + 22, "w": 10, "h": 10, "z": 20})
            edges.append({"id": f"e{j}", "from": A, "to": B, "label": f"{j+1}. {text}", "color": "#1f6389", "width": 2, "arrow": "block", "router": "normal",
                          "vertices": [{"x": xa + side * 120, "y": y}, {"x": xa + side * 120, "y": y + 27}]})
            continue
        nodes.append({"id": A, "kind": "anchor", "x": xa - 5, "y": y - 5, "w": 10, "h": 10, "z": 20})
        nodes.append({"id": B, "kind": "anchor", "x": xb - 5, "y": y - 5, "w": 10, "h": 10, "z": 20})
        e = {"id": f"e{j}", "from": A, "to": B, "label": f"{j+1}. {text}", "color": "#1f6389" if kind == "sync" else "#526078", "width": 2 if kind == "sync" else 1.5,
             "arrow": "block" if kind == "sync" else "classic", "router": "normal"}
        if kind == "ret": e["dash"] = "dashed"
        edges.append(e)
    doc = {"meta": {"id": f"seq_{k}", "title": f"时序·{name}（09-02）", "date": "2026-09-02", "W": X0 + len(used) * DX + 200, "H": H, "fs": {"title": 22, "body": 15}}, "nodes": nodes, "edges": edges}
    out = os.path.join(ROOT, "data", f"seq_{k}.json"); json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); open(out, "a").write("\n")
    print(f"seq_{k}: {len(nodes)} 节点 {len(edges)} 消息  {name}")
