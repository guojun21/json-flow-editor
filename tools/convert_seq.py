#!/usr/bin/env python3
"""时序图(排产采集一期四条主链路):生命线 + 消息。每条流程一个文件 seq_1..seq_4。
消息 = 两个锚点(透明小方块,挂在各自生命线的同一高度)之间的连线;同步=实线实心箭头,返回=虚线细箭头。"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LL = ["数采员 / 组长", "前端", "后端", "数据库", "工控机采集 Agent"]   # 方案层参与者,不写技术选型(后端/数据库的实现另立选型文档)
FLOWS = [
 ("领取令牌(抢单池)", [
   (0, 1, "点「领取令牌」→ 绑定班次/工位/机器人/监控员", "sync", None),
   (1, 2, "请求领取令牌(抢单池)", "sync", None),
   (2, 3, "读需求单状态 / 两池配额 / 并发持有 / 工位占用", "sync", None),
   (3, 2, "校验数据", "ret", None),
   (2, 3, "写入令牌(待开工, 45 分钟未开工回收) + 事件", "sync", "alt [校验通过]"),
   (3, 2, "ok", "ret", "alt [校验通过]"),
   (2, 1, "成功 {令牌号, 回收倒计时}", "ret", "alt [校验通过]"),
   (1, 0, "令牌入「我的采集令牌」", "sync", "alt [校验通过]"),
   (2, 1, "失败 {原因: 抢单池已发完 / 并发超限 / 工位被占}", "ret", "else [校验不通过]"),
   (1, 0, "提示失败原因,令牌不入列表", "sync", "else [校验不通过]"),
 ]),
 ("工位开工(令牌准入)", [
   (0, 4, "在工控机登录,出示令牌", "sync", None),
   (4, 2, "请求开工 {令牌号}", "sync", None),
   (2, 3, "查令牌:存在?状态=待开工?分配令牌待接受→视为接受", "sync", None),
   (3, 2, "令牌记录(状态 + 绑定四项)", "ret", None),
   (2, 3, "写入会话(进行中);令牌→在采;事件", "sync", "alt [令牌有效]"),
   (3, 2, "ok", "ret", "alt [令牌有效]"),
   (2, 4, "成功 {会话号}", "ret", "alt [令牌有效]"),
   (4, 0, "进入采集界面(会话计时开始)", "sync", "alt [令牌有效]"),
   (2, 4, "拒绝开工 {原因: 无令牌 / 令牌状态不对}", "ret", "else [令牌无效]"),
   (4, 0, "提示拒绝原因", "sync", "else [令牌无效]"),
 ]),
 ("落盘后摄取子流程(入库 + 规则预检)", [
   (4, 4, "采集完成 → 落盘包 EP-xxx/(元数据, 视频, 传感器)", "self", None),
   (4, 2, "上报落盘包 {会话号, 包名(仅 inbox 下)}", "sync", None),
   (2, 2, "校验包名白名单;Episode 号重复 → 拒绝", "self", None),
   (2, 3, "读会话/令牌(事实源)", "sync", None),
   (3, 2, "令牌四项 + SOP 版本", "ret", None),
   (2, 2, "包内元数据逐字段对账 → 冲突记 RC-06", "self", None),
   (2, 2, "规则预检:文件完整性 · 传感器 · 时长/帧率 · 黑屏检测", "self", None),
   (2, 2, "双写元数据(含预检结果) → 逐文件校验和", "self", None),
   (2, 3, "开启事务;写入 Episode / 文件清单 / 预检结果", "sync", "alt [全部通过]"),
   (2, 3, "提交", "sync", "alt [全部通过]"),
   (3, 2, "ok", "ret", "alt [全部通过]"),
   (2, 4, "已接收 {状态: 预检通过}", "ret", "alt [全部通过]"),
   (2, 3, "开启事务;写入 Episode(隔离区) + 隔离记录", "sync", "else [元数据冲突 / 预检失败]"),
   (2, 2, "包挪入隔离区(失败则回滚;提交失败挪回)", "self", "else [元数据冲突 / 预检失败]"),
   (2, 3, "提交", "sync", "else [元数据冲突 / 预检失败]"),
   (3, 2, "ok", "ret", "else [元数据冲突 / 预检失败]"),
   (2, 4, "已隔离 {原因码: RC-0x}", "ret", "else [元数据冲突 / 预检失败]"),
 ]),
 ("交付批次 + 对账回执", [
   (0, 2, "请求封批 {Episode 列表(可选)}", "sync", None),
   (2, 3, "取「预检通过」的 Episode 与逐文件校验和", "sync", None),
   (3, 2, "Episode 清单 + 校验和", "ret", None),
   (2, 2, "写出批次清单(manifest);Episode→待搬运", "self", None),
   (2, 0, "成功 {批次号, 字节数}", "ret", None),
   (0, 2, "请求对账 {批次号}(云端接收方回传)", "sync", None),
   (2, 2, "按批次清单重算校验和逐文件对比", "self", None),
   (2, 3, "批次→通过/已确认;Episode→已上云 + 7 天清理倒计时", "sync", "alt [逐文件一致]"),
   (3, 2, "ok", "ret", "alt [逐文件一致]"),
   (2, 0, "{ok: true, 不一致: []}", "ret", "alt [逐文件一致]"),
   (2, 3, "批次→不一致;Episode 保持待搬运(可重打包)", "sync", "else [有不一致]"),
   (3, 2, "ok", "ret", "else [有不一致]"),
   (2, 0, "{ok: false, 不一致: [文件路径…]}", "ret", "else [有不一致]"),
 ]),
]
X0, HEAD_Y, STEP, TOP, DX_MIN = 300, 120, 84, 200, 300
def tw(t):   # 估算文字像素宽(15px 字号):中日韩 15,西文 7.5
    return sum(15 if ord(c) > 255 else 7.5 for c in t)
def wrap(t, maxw=440):   # 折返消息太长就在分隔符处折成两行,别横穿到下一根生命线
    if tw(t) <= maxw: return t
    best = None
    for i, c in enumerate(t):
        if c in ";,;,·→ " and abs(tw(t[:i]) - tw(t) / 2) < (abs(tw(t[:best]) - tw(t) / 2) if best is not None else 1e9): best = i
    if best is None: return t
    return t[:best + 1].rstrip() + "\n" + t[best + 1:].lstrip()
for k, (name, msgs) in enumerate(FLOWS, 1):
    nodes, edges = [], []
    used = sorted({a for a, b, _, _, _ in msgs} | {b for a, b, _, _, _ in msgs})
    col = {li: c for c, li in enumerate(used)}
    # 列距按最长标签算:跨列消息的标签放在离发送方最近的一跨里,所以只要一跨放得下;折返消息需要 折返宽 120 + 标签宽 + 40
    labels = [wrap(f"{j+1}. {text}", 440 if a == b else 420) for j, (a, b, text, kind, frag) in enumerate(msgs)]
    need = DX_MIN
    for j, (a, b, text, kind, frag) in enumerate(msgs):
        w = max(tw(line) for line in labels[j].split("\n"))
        if a == b: need = max(need, 70 + w + 40) if col[a] != len(used) - 1 else need
        else: need = max(need, w + 60)
    DX = int(need)
    # alt/else 分块:frag 以 alt 开头 = 块的第一个操作数,else 开头 = 同一块的后续操作数;块与块之间、操作数之间各留 36 空档
    blocks = []   # [{rows:[...], ops:[(label, first_row)]}]
    prev = None
    for j, (a, b, text, kind, frag) in enumerate(msgs):
        if frag is None: prev = None; continue
        if frag.startswith("alt") and (prev is None or not blocks or blocks[-1]["ops"][-1][0] != frag):
            if prev is None or frag != prev: blocks.append({"rows": [], "ops": []})
        if not blocks or (prev is None): blocks.append({"rows": [], "ops": []}) if not blocks else None
        blk = blocks[-1]
        if not blk["ops"] or blk["ops"][-1][0] != frag: blk["ops"].append((frag, j))
        blk["rows"].append(j); prev = frag
    rowY, y = [], TOP
    op_starts = {op[1] for blk in blocks for op in blk["ops"]}
    block_ends = {blk["rows"][-1] for blk in blocks}
    for j in range(len(msgs)):
        if j in op_starts and j > 0: y += 76
        if j - 1 in block_ends: y += 40
        rowY.append(y); y += STEP
    H = y + 80
    nodes.append({"id": "title", "kind": "text", "x": 40, "y": 30, "w": 1500, "h": 50, "lines": [f"时序图 {k} · {name}"], "fontSize": 30, "bold": True, "textColor": "#0b1220"})
    nodes.append({"id": "legend", "kind": "text", "x": 40, "y": 82, "w": 1700, "h": 30, "lines": ["实线实心箭头 = 同步调用;虚线细箭头 = 返回;折返 = 内部处理;竖条 = 激活(处理中);虚线框 = 互斥分支(上半成功 / 下半失败);时间自上而下"], "fontSize": 16, "textColor": "#48586a"})
    for li in used:
        nodes.append({"id": f"L{li}", "kind": "lifeline", "shape": "lifeline", "x": X0 + col[li] * DX - 80, "y": HEAD_Y, "w": 160, "h": H - HEAD_Y - 30, "lines": [LL[li]], "fontSize": 15, "z": 1})
    BX, BW = X0 - 120, (len(used) - 1) * DX + 240
    for bi, blk in enumerate(blocks):
        y1 = rowY[blk["rows"][0]] - 74; y2 = rowY[blk["rows"][-1]] + 40
        nodes.append({"id": f"frag{bi}", "kind": "package", "x": BX, "y": y1, "w": BW, "h": y2 - y1, "lines": [blk["ops"][0][0]], "fontSize": 15, "z": 2, "stroke": "#a1691a", "textColor": "#a1691a"})
        for oi, (lab, r0) in enumerate(blk["ops"][1:], 1):   # else 操作数:整框宽的虚线分隔 + 条件标签
            yd = rowY[r0] - 62
            nodes.append({"id": f"div{bi}_{oi}a", "kind": "anchor", "x": BX - 5, "y": yd - 5, "w": 10, "h": 10, "z": 20})
            nodes.append({"id": f"div{bi}_{oi}b", "kind": "anchor", "x": BX + BW - 5, "y": yd - 5, "w": 10, "h": 10, "z": 20})
            edges.append({"id": f"div{bi}_{oi}", "from": f"div{bi}_{oi}a", "to": f"div{bi}_{oi}b", "color": "#a1691a", "width": 1.5, "arrow": "none", "dash": "dashed", "router": "normal"})
            nodes.append({"id": f"divlab{bi}_{oi}", "kind": "text", "x": BX + 8, "y": yd + 3, "w": tw(lab) + 24, "h": 24, "lines": [lab], "fontSize": 15, "bold": True, "textColor": "#a1691a"})   # 宽度贴文字,居中≈左对齐,不压生命线
    # 激活条:同步消息的接收方,从该行起到「最后一条」由它发回给发送方的返回为止(分支里每个操作数都有返回,条要盖到最后一个)
    for j, (a, b, text, kind, frag) in enumerate(msgs):
        if kind != "sync" or a == b: continue
        ends = [jj for jj in range(j + 1, len(msgs)) if msgs[jj][0] == b and msgs[jj][1] == a and msgs[jj][3] == "ret"]
        nxt = next((jj for jj in range(j + 1, len(msgs)) if msgs[jj][0] == a and msgs[jj][1] == b and msgs[jj][3] == "sync"), len(msgs))
        ends = [e for e in ends if e < nxt] or ends[:1]          # 同一对参与者再次调用之前的返回才算这次的
        end = ends[0] if ends else j
        blk = next((bk for bk in blocks if end in bk["rows"]), None)
        if blk: end = max([e for e in ends if e in blk["rows"]] or [end])   # 返回在分支里:条盖到同一分支框内最后一次返回
        y1 = rowY[j] - 8; y2 = rowY[end] + 12
        nodes.append({"id": f"act{j}", "kind": "activation", "x": X0 + col[b] * DX - 7, "y": y1, "w": 14, "h": max(24, y2 - y1), "z": 5, "fill": "#dfe7ee", "stroke": "#48586a"})
    for j, (a, b, text, kind, frag) in enumerate(msgs):
        y = rowY[j]
        xa, xb = X0 + col[a] * DX, X0 + col[b] * DX
        A = f"m{j}a"; B = f"m{j}b"
        lab = labels[j]; lw = max(tw(line) for line in lab.split("\n")); nline = lab.count("\n") + 1
        if a == b:   # 折返:最右一根向左折;标签放在折返框右侧(最右一根则放左侧),不压生命线
            side = 1
            nodes.append({"id": A, "kind": "anchor", "x": xa - 5, "y": y - 5, "w": 10, "h": 10, "z": 20})
            nodes.append({"id": B, "kind": "anchor", "x": xa - 5, "y": y + 22, "w": 10, "h": 10, "z": 20})
            edges.append({"id": f"e{j}", "from": A, "to": B, "labels": [{"text": lab, "position": {"distance": 0.5, "offset": {"x": side * (lw / 2 + 14), "y": 0}}}], "color": "#1f6389", "width": 2, "arrow": "block", "router": "normal",
                          "vertices": [{"x": xa + side * 70, "y": y}, {"x": xa + side * 70, "y": y + 27}]})
            continue
        nodes.append({"id": A, "kind": "anchor", "x": xa - 5, "y": y - 5, "w": 10, "h": 10, "z": 20})
        nodes.append({"id": B, "kind": "anchor", "x": xb - 5, "y": y - 5, "w": 10, "h": 10, "z": 20})
        span = abs(col[a] - col[b])
        e = {"id": f"e{j}", "from": A, "to": B, "labels": [{"text": lab, "position": {"distance": 0.5 / span, "offset": {"x": 0, "y": -13 * nline}}}], "color": "#1f6389" if kind == "sync" else "#526078", "width": 2 if kind == "sync" else 1.5,
             "arrow": "block" if kind == "sync" else "classic", "router": "normal"}   # 标签浮在线上方、放在离发送方最近的一跨里,不横跨别的生命线
        if kind == "ret": e["dash"] = "dashed"
        edges.append(e)
    doc = {"meta": {"id": f"seq_{k}", "title": f"时序·{name}（09-02）", "date": "2026-09-02", "order": 30 + k, "W": X0 + (len(used) - 1) * DX + 300 + (380 if any(a == b and col[a] == len(used) - 1 for a, b, _, _, _ in msgs) else 0), "H": H, "fs": {"title": 22, "body": 16}}, "nodes": nodes, "edges": edges}
    out = os.path.join(ROOT, "data", f"seq_{k}.json"); json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); open(out, "a").write("\n")
    print(f"seq_{k}: {len(nodes)} 节点 {len(edges)} 消息  {name}")
