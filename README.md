# json-flow-editor

**一个 JSON 完整表达一张流程图；渲染吃 JSON，一切编辑实时写回 JSON。**

**React + AntV X6**。画布引擎 [AntV X6](https://github.com/antvis/X6)（MIT）全量继承其成熟编辑能力，UI 为 React 18，esbuild 打包，**构建产物已入库**——部署侧不需要 node。

设计规范：**只有黑白两色，所有元素一律矩形**；参数编辑一律弹窗（确认/取消）。

## 起步

```bash
python3 server.py 4244       # 静态托管 + POST /api/save 写回 data/*.json
# 打开 http://localhost:4244

# 改前端源码后重新打包(仅开发机需要 node):
npm install && npm run build   # src/*.jsx → dist/app.js
```

纯静态托管（GitHub Pages 等）也能跑：编辑存浏览器 localStorage，用「导出JSON」取数据，只是「保存到服务器」不可用。

## 编辑能力（全量继承 X6）

| 操作 | 手势 |
|---|---|
| 改文字 | **双击**节点/连线标签，就地编辑；**几千字长文自动扩容，图必包住字** |
| 移动 | 拖拽节点，连线自动跟随正交重排 |
| **线的控制点** | 选中线出现控制点；**右键线上任意处 = 在该处加控制点**；右键控制点 = 删除；控制点可拖 |
| 重接连线 | 拖线两端的箭头柄放到另一个节点 |
| 拉新线 | 悬停节点出四个端口，从端口拖到目标节点 |
| **缩放** | **⌘/Ctrl + 滚轮 = 放大镜式缩放**（围绕指针）；触控板捏合同理 |
| 平移 | 裸滚轮 / 拖空白处 |
| 多选 | Shift + 框选；拖动一起走 |
| 撤销/重做 | ⌘Z / ⇧⌘Z |
| 删除 | 选中后 Delete（删节点连带其连线） |
| 新增 | 工具栏 +步骤 / +判定 / +异常 / +文字 |
| 对齐 | 拖动时自动对齐线（snapline） |

## JSON 数据模型（唯一数据源）

`data/<图>.json`，一个文件 = 一张图的全部：

```jsonc
{
 "meta":  { "id": "final", "title": "…", "W": 4400, "H": 3320,
            "fs": { "title": 30, "body": 25 } },
 "nodes": [ { "id": "A1", "kind": "step|decision|fail|band|pill|text",
              "x": 260, "y": 430, "w": 680, "h": 205,
              "fill": "#ffffff", "stroke": "#cbd3e1",
              "textColor": "#172033", "bodyColor": "#526078",
              "lines": ["标题行", "正文行…"] } ],
 "edges": [ { "id": "e0", "from": "A1", "to": "D1", "color": "#526078",
              "label": "否", "dashed": true,
              "vertices": [ { "x": 1500, "y": 700 } ] } ]
}
```

同步链路：`X6 模型 → serialize() → 规范 JSON → localStorage(即时) + 每 10 秒自动 POST /api/save(切后台/关页 sendBeacon 兜底) + 实时 JSON 面板`。撤销/删除/重接/控制点一切变更都会体现在 JSON 里；「JSON面板」可实时看、可复制；导入 JSON 即整图替换。

## 预置图

数采工厂两张全流程图（像素级矢量重绘管线产出的语义数据）：

- `data/final.json` —— 终版五阶段（08-31 会中版，63 节点/40 边）
- `data/optimized.json` —— 优化版五阶段（09-01 版，54 节点/38 边，每框带主责/协同）
- `data/swimlane.json` —— 早版六泳道（08-27 版，47 节点/24 边）

## 部署与自愈（容器化）

```bash
./deploy.sh      # 一键:同步代码到 108 → docker compose up -d --build → 双向健康检查
```

108 上跑的是容器 `json-flow-editor`（compose 服务同名）：

- **自愈靠 `restart: unless-stopped`**，不再用 crontab 看门狗。宿主侧 `kill -9` 掉主进程，docker 立刻重开一个（实测 `RestartCount` 从 0 变 1，服务秒回 200）；机器重启也会自己起来。
- **数据在宿主盘**：`./data` 以 volume 挂进 `/app/data`，UI 里 `/api/save` 写的 JSON 不随镜像重建蒸发。
- **容器以宿主用户身份跑**（`user: "1003:1003"`），挂载卷里新写的文件归 `guruicheng`，不会给后续 rsync 添堵。
- **基础镜像 `python:3.11-alpine`**：108 没有 registry 出网，只能用它本地已有的 tag；服务本身零依赖（纯标准库）。
- 日志走 json-file，单文件 10MB × 3 轮转。

> `docker kill` / `docker stop` 属于「显式停止」，restart 策略故意不管——验证自愈要从宿主侧 kill 主进程，别用 docker kill 自证。

## 结构

```
index.html                       # 壳(加载 dist/)
src/                             # React 源码(App/Sidebar/Modal/graph 引擎胶水/黑白样式)
dist/                            # esbuild 产物(已入库,部署零依赖)
server.py                        # 静态托管 + /api/list + /api/save 落盘
Dockerfile  docker-compose.yml   # 容器化运行时(自愈=restart 策略, data/ 挂宿主盘)
deploy.sh                        # 一键部署到 108(rsync + compose up --build + 健康检查)
data/                            # 规范 JSON(唯一数据源)
tools/convert.py  convert_opt.py # 旧格式→规范 JSON / 优化版流程图生成器
tools/stamp.py                   # 构建后给 dist 资源打内容指纹(防浏览器缓存旧版)
```

## License

MIT（vendor 内 AntV X6 及插件版权归其项目所有，MIT）。
