/* JSON Flow Editor —— 一个 JSON 完整表达一张图;渲染吃 JSON,一切编辑实时写回 JSON。
 * 画布引擎:AntV X6(全量继承其编辑能力:拖拽/控制点/端点重接/框选/对齐线/撤销/缩放/导出)。
 * 数据流:graph(X6 模型) --serialize--> doc(规范 JSON) --> localStorage + /api/save + JSON 面板。 */
(function () {
'use strict';
const { Graph, Shape } = window.X6;
const TABS = [
  { id: 'final', name: '终版五阶段' },
  { id: 'swimlane', name: '早版六泳道' },
];
let tab = 'final';
let doc = null;          // 规范 JSON(唯一数据源镜像)
let graph = null;
let loading = false;
let editingNode = null;

const $ = id => document.getElementById(id);
const statusEl = $('status');
function status(t, ok) {
  statusEl.textContent = t;
  statusEl.style.color = ok === false ? '#e0a05a' : '#8fd18f';
}
function clean(o) {
  const r = {};
  for (const k in o) {
    const v = o[k];
    if (v === undefined || v === null || v === '' || v === false ||
        (Array.isArray(v) && !v.length)) continue;
    r[k] = v;
  }
  return r;
}

/* ---------- HTML 节点形状 ---------- */
Shape.HTML.register({
  shape: 'jfe-node',
  effect: ['data'],
  html(cell) {
    const d = cell.getData() || {};
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;position:relative;';
    let host = wrap;
    if (d.kind === 'decision') {
      // 菱形:外层裁边色,内层裁填充色,伪造描边
      wrap.className = 'jfe-node kind-decision';
      wrap.style.background = d.stroke || '#c8952d';
      const inner = document.createElement('div');
      inner.className = 'kind-decision';
      inner.style.cssText = 'position:absolute;inset:3px;' +
        'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);' +
        'background:' + (d.fill || '#fff5cc') + ';';
      wrap.appendChild(inner);
      host = document.createElement('div');
      host.style.cssText = 'position:absolute;inset:0;display:flex;' +
        'flex-direction:column;justify-content:center;align-items:center;' +
        'text-align:center;line-height:1.45;padding:0 18%;';
      host.className = 'jfe-text-host';
      wrap.appendChild(host);
    } else {
      wrap.className = 'jfe-node kind-' + (d.kind || 'step');
      wrap.classList.add('jfe-text-host');
      wrap.style.background = d.fill || 'transparent';
      if (d.stroke) {
        wrap.style.borderColor = d.stroke;
        wrap.style.borderWidth = (d.sw || 3) + 'px';
      } else wrap.style.border = 'none';
      if (d.rx) wrap.style.borderRadius = d.rx + 'px';
    }
    (d.lines || []).forEach((t, i) => {
      const p = document.createElement('div');
      p.className = 'ln' + (d.vertical ? ' jfe-vtext' : '');
      p.textContent = t;
      const isTitle = i === 0 && !['text', 'pill', 'band'].includes(d.kind);
      p.style.fontSize = (d.fontSize || (isTitle ? d.fsT : d.fsB)) + 'px';
      p.style.fontWeight = (isTitle || d.bold) ? '600' : '400';
      p.style.color = (i === 0 ? (d.textColor || '#172033') : (d.bodyColor || '#526078'));
      host.appendChild(p);
    });
    return wrap;
  },
});

/* ---------- 建图 ---------- */
function edgeAttrs(color, w, dashed) {
  return { line: {
    stroke: color, strokeWidth: w, sourceMarker: null,
    strokeDasharray: dashed ? '8 6' : null,
    targetMarker: { name: 'block', size: 6 + w * 2 },
  } };
}
function mkLabel(text, color, fs) {
  return { position: 0.5, attrs: {
    label: { text, fill: color, fontSize: fs },
    body: { fill: '#f6f8fc', fillOpacity: 0.94, stroke: 'none' },
  } };
}
function connectableKind(k) { return !['band', 'pill', 'text'].includes(k); }
function sw() { return doc.meta.W > 3000 ? 3.5 : 2; }
function fsB() { return doc.meta.fs.body; }

function makeGraph() {
  if (graph) { graph.dispose(); graph = null; }
  graph = new Graph({
    container: $('canvas'),
    autoResize: true,
    background: { color: '#f6f8fc' },
    panning: { enabled: true, eventTypes: ['leftMouseDown', 'mouseWheel'] },
    mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'], factor: 1.08,
      zoomAtMousePosition: true, minScale: 0.02, maxScale: 10 },
    connecting: {
      router: { name: 'orth' },
      connector: { name: 'rounded', args: { radius: 2 } },
      snap: { radius: 40 },
      allowBlank: false, allowEdge: false, allowNode: true, allowMulti: true,
      highlight: true, connectionPoint: 'boundary',
      createEdge() {
        return graph.createEdge({ zIndex: 5,
          attrs: edgeAttrs('#526078', sw(), false),
          data: { color: '#526078' } });
      },
      validateConnection({ targetCell }) {
        return !!targetCell && targetCell.isNode() &&
          connectableKind((targetCell.getData() || {}).kind);
      },
    },
  });
  graph.use(new window.X6PluginHistory.History({ enabled: true }));
  graph.use(new window.X6PluginSelection.Selection({ enabled: true,
    multiple: true, movable: true, rubberband: true, modifiers: ['shift'] }));
  graph.use(new window.X6PluginKeyboard.Keyboard({ enabled: true }));
  graph.use(new window.X6PluginSnapline.Snapline({ enabled: true }));
  graph.use(new window.X6PluginExport.Export());
  wireEvents();
}

function portConf(r) {
  const g = pos => ({ position: pos,
    attrs: { circle: { r, magnet: true, stroke: '#3d68d8',
      fill: '#ffffff', strokeWidth: 2 } } });
  return {
    groups: { l: g('left'), r: g('right'), t: g('top'), b: g('bottom') },
    items: [{ group: 'l', id: 'pl' }, { group: 'r', id: 'pr' },
            { group: 't', id: 'pt' }, { group: 'b', id: 'pb' }],
  };
}

function zOf(kind) {
  return kind === 'band' ? 1 : kind === 'pill' ? 2 : kind === 'text' ? 3 : 10;
}

function rebuild() {
  loading = true;
  makeGraph();
  graph.disableHistory();
  const fs = doc.meta.fs;
  const pr = doc.meta.W > 3000 ? 10 : 6;
  for (const n of doc.nodes) {
    graph.addNode(clean({
      id: n.id, shape: 'jfe-node',
      x: n.x, y: n.y, width: n.w, height: n.h,
      zIndex: zOf(n.kind),
      data: { kind: n.kind || 'step', fill: n.fill, stroke: n.stroke,
        textColor: n.textColor, bodyColor: n.bodyColor,
        lines: n.lines || [], fontSize: n.fontSize, bold: n.bold,
        vertical: n.vertical, rx: n.rx, fsT: fs.title, fsB: fs.body, sw: sw() },
      ports: connectableKind(n.kind || 'step') ? portConf(pr) : undefined,
    }));
  }
  for (const e of doc.edges) {
    graph.addEdge({
      id: e.id, zIndex: 5,
      source: { cell: e.from }, target: { cell: e.to },
      vertices: e.vertices || [],
      router: { name: 'orth' },
      connector: { name: 'rounded', args: { radius: 2 } },
      attrs: edgeAttrs(e.color || '#526078', e.width || sw(), !!e.dashed),
      labels: e.label ? [mkLabel(e.label, e.color || '#526078', fs.body)] : [],
      data: { color: e.color || '#526078', dashed: !!e.dashed },
    });
  }
  graph.enableHistory();
  loading = false;
  fit();
  setTimeout(fit, 150);   // autoResize 完成后再适配一次(容器初始 0 尺寸时首次 fit 会钳到极小)
  refreshJSON();
}

/* ---------- graph → doc(实时反射) ---------- */
function serialize() {
  const nodes = [], edges = [];
  for (const c of graph.getCells()) {
    if (c.isNode()) {
      const d = c.getData() || {};
      const p = c.getPosition(), s = c.getSize();
      nodes.push(clean({ id: c.id, kind: d.kind,
        x: Math.round(p.x), y: Math.round(p.y),
        w: Math.round(s.width), h: Math.round(s.height),
        fill: d.fill, stroke: d.stroke, textColor: d.textColor,
        bodyColor: d.bodyColor, lines: d.lines, fontSize: d.fontSize,
        bold: d.bold, vertical: d.vertical, rx: d.rx }));
    } else if (c.isEdge()) {
      const d = c.getData() || {};
      const ls = c.getLabels() || [];
      let label = '';
      for (const l of ls) {
        const t = l.attrs && l.attrs.label && l.attrs.label.text;
        if (t) { label = t; break; }
      }
      edges.push(clean({ id: c.id,
        from: c.getSourceCellId(), to: c.getTargetCellId(),
        color: d.color, label, dashed: d.dashed,
        vertices: (c.getVertices() || []).map(v =>
          ({ x: Math.round(v.x), y: Math.round(v.y) })) }));
    }
  }
  return { meta: doc.meta, nodes, edges };
}
let commitTimer = null, pushTimer = null;
function commit() {
  if (loading) return;
  clearTimeout(commitTimer);
  commitTimer = setTimeout(() => {
    doc = serialize();
    localStorage.setItem('jfe:' + tab, JSON.stringify(doc));
    refreshJSON();
    status('已改(本地)');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushServer(true), 1500);
  }, 120);
}
function refreshJSON() {
  if (!$('json-panel').classList.contains('hidden'))
    $('json-view').textContent = JSON.stringify(doc, null, 1);
}
function pushServer(silent) {
  return fetch('api/save', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: tab, data: doc }) })
    .then(r => { if (!r.ok) throw 0; status('已保存到服务器 ✓'); })
    .catch(() => { if (!silent) alert('保存失败:当前不是可写服务(静态托管?)。JSON 已存浏览器本地,可用「导出JSON」。');
      status('仅本地(服务器不可写)', false); });
}

/* ---------- 事件 ---------- */
function wireEvents() {
  graph.on('cell:changed', commit);
  graph.on('cell:added', commit);
  graph.on('cell:removed', commit);

  // 连线选中 → 全套工具:控制点(可增删)/分段/两端箭头柄(拖拽重接)
  graph.on('edge:selected', ({ edge }) => {
    edge.addTools([
      { name: 'vertices', args: { addable: true, removable: true, snapRadius: 8 } },
      { name: 'segments' },
      { name: 'source-arrowhead' },
      { name: 'target-arrowhead' },
    ]);
  });
  graph.on('edge:unselected', ({ edge }) => edge.removeTools());

  // 右键线上任意处 → 在该位置加控制点;右键已有控制点(≤12px) → 删除它
  graph.on('edge:contextmenu', ({ edge, e, x, y }) => {
    e.preventDefault();
    const vs = (edge.getVertices() || []).slice();
    const scale = graph.zoom();
    const hitIdx = vs.findIndex(v =>
      Math.hypot(v.x - x, v.y - y) * scale <= 12);
    if (hitIdx >= 0) {
      vs.splice(hitIdx, 1);
      edge.setVertices(vs);
      return;
    }
    const chain = [edge.getSourcePoint(), ...vs, edge.getTargetPoint()];
    let best = 0, bd = Infinity;
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i], b = chain[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y;
      const L2 = vx * vx + vy * vy || 1e-9;
      let t = ((x - a.x) * vx + (y - a.y) * vy) / L2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (a.x + vx * t), y - (a.y + vy * t));
      if (d < bd) { bd = d; best = i; }
    }
    vs.splice(best, 0, { x: Math.round(x), y: Math.round(y) });
    edge.setVertices(vs);
    graph.select(edge);
  });
  graph.on('blank:contextmenu', ({ e }) => e.preventDefault());
  graph.on('node:contextmenu', ({ e }) => e.preventDefault());

  // 双击连线 → 就地编辑标签(X6 内置 edge-editor)
  graph.on('edge:dblclick', ({ edge, e }) => {
    edge.addTools({ name: 'edge-editor', args: { event: e } });
  });
  // edge-editor 落的新标签补上颜色样式
  graph.on('edge:change:labels', ({ edge }) => {
    if (loading || edge.__restyling) return;
    const d = edge.getData() || {};
    const ls = edge.getLabels() || [];
    let dirty = false;
    const fixed = ls.map(l => {
      const a = (l.attrs && l.attrs.label) || {};
      if (a.fill !== (d.color || '#526078')) { dirty = true; }
      return { ...l, attrs: { ...(l.attrs || {}),
        label: { ...a, fill: d.color || '#526078', fontSize: fsB() },
        body: { fill: '#f6f8fc', fillOpacity: 0.94, stroke: 'none' } } };
    });
    if (dirty) {
      edge.__restyling = true;
      edge.setLabels(fixed);
      edge.__restyling = false;
    }
  });

  // 双击节点 → 就地编辑文字(提交后自动扩容包住文字)
  graph.on('node:dblclick', ({ node }) => beginEdit(node));

  // 键盘
  graph.bindKey(['meta+z', 'ctrl+z'], () => { graph.undo(); return false; });
  graph.bindKey(['meta+shift+z', 'ctrl+shift+z', 'ctrl+y'], () => { graph.redo(); return false; });
  graph.bindKey(['backspace', 'del'], () => {
    if (editingNode) return;
    graph.removeCells(graph.getSelectedCells());
    return false;
  });
}

/* ---------- 文本编辑 + 自动扩容 ---------- */
let _meas = null;
function measureBlock(lines, width, d) {
  if (!_meas) {
    _meas = document.createElement('div');
    _meas.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;' +
      'line-height:1.45;font-family:"PingFang SC","Hiragino Sans GB",sans-serif;';
    document.body.appendChild(_meas);
  }
  _meas.style.width = Math.max(20, width) + 'px';
  _meas.textContent = '';
  lines.forEach((t, i) => {
    const p = document.createElement('div');
    p.textContent = t;
    const isTitle = i === 0 && !['text', 'pill'].includes(d.kind);
    p.style.fontSize = (d.fontSize || (isTitle ? d.fsT : d.fsB)) + 'px';
    p.style.fontWeight = (isTitle || d.bold) ? '600' : '400';
    p.style.overflowWrap = 'anywhere';
    p.style.wordBreak = 'break-word';
    _meas.appendChild(p);
  });
  return _meas.getBoundingClientRect().height;
}
function autoSize(node, lines) {
  const d = node.getData() || {};
  const s = node.getSize();
  if (d.baseW === undefined) {
    d.baseW = s.width; d.baseH = s.height;
  }
  const isD = d.kind === 'decision';
  const MAXW = doc.meta.W * 0.42;
  let w = d.baseW, needH = 0;
  for (let i = 0; i < 10; i++) {
    const availW = isD ? w * 0.55 : w - 30;
    const textH = measureBlock(lines, availW, d);
    needH = isD ? textH / 0.55 : textH + 28;
    if (needH <= Math.max(d.baseH, w * 0.85) || w >= MAXW) break;
    w = Math.min(MAXW, Math.round(w * 1.4));
  }
  const nw = w, nh = Math.max(d.baseH, Math.ceil(needH));
  const p = node.getPosition();
  const cx = p.x + s.width / 2, cy = p.y + s.height / 2;
  node.prop({ position: { x: Math.round(cx - nw / 2), y: Math.round(cy - nh / 2) },
    size: { width: nw, height: nh } });
}
function beginEdit(node) {
  const d = node.getData() || {};
  if (!d.lines) return;
  const view = graph.findViewByCell(node);
  if (!view) return;
  const div = view.container.querySelector('.jfe-text-host');
  if (!div || editingNode) return;
  editingNode = node;
  const snap = d.lines.slice();
  div.classList.add('editing');
  div.contentEditable = 'plaintext-only';
  div.textContent = d.lines.join('\n');
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflowWrap = 'anywhere';
  div.focus();
  const range = document.createRange();
  range.selectNodeContents(div);
  const selx = window.getSelection();
  selx.removeAllRanges(); selx.addRange(range);
  const done = ok => {
    div.removeEventListener('blur', onBlur);
    editingNode = null;
    if (ok) {
      const lines = div.textContent.split('\n').map(x => x.trim()).filter(Boolean);
      if (lines.length && JSON.stringify(lines) !== JSON.stringify(snap)) {
        node.setData({ ...d, lines }, { deep: false });
        autoSize(node, lines);
        return;   // cell:changed → commit
      }
    }
    node.setData({ ...d }, { deep: false });   // 触发重渲染还原
  };
  const onBlur = () => done(true);
  div.addEventListener('blur', onBlur);
  div.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if (ev.key === 'Escape') done(false);
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) div.blur();
  });
  div.addEventListener('mousedown', ev => ev.stopPropagation());
}

/* ---------- 工具栏 ---------- */
function fit() { graph.zoomToFit({ padding: 24, maxScale: 1.5 }); }
function addNode(kind) {
  const area = graph.getGraphArea();
  const cx = area.x + area.width / 2, cy = area.y + area.height / 2;
  const sc = doc.meta.W > 3000 ? 1.6 : 1;
  const w = 210 * sc, h = (kind === 'decision' ? 100 : 80) * sc;
  const style = kind === 'decision'
    ? { fill: '#fff5cc', stroke: '#c8952d', textColor: '#5c4408', bodyColor: '#7a6a3a' }
    : kind === 'fail'
      ? { fill: '#fdecec', stroke: '#c74444', textColor: '#c74444', bodyColor: '#c74444' }
      : kind === 'text'
        ? { textColor: '#172033' }
        : { fill: '#ffffff', stroke: '#cbd3e1', textColor: '#172033', bodyColor: '#526078' };
  graph.addNode(clean({
    shape: 'jfe-node',
    x: Math.round(cx - w / 2), y: Math.round(cy - h / 2),
    width: w, height: h, zIndex: zOf(kind),
    data: { kind, ...style,
      lines: [kind === 'decision' ? '新判定?' : kind === 'fail' ? '新异常'
              : kind === 'text' ? '双击编辑文字' : '新步骤',
              ...(kind === 'text' ? [] : ['双击编辑'])],
      fontSize: kind === 'text' ? doc.meta.fs.title : undefined,
      fsT: doc.meta.fs.title, fsB: doc.meta.fs.body, sw: sw() },
    ports: connectableKind(kind) ? portConf(doc.meta.W > 3000 ? 10 : 6) : undefined,
  }));
}
function download(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
$('btn-undo').onclick = () => graph.undo();
$('btn-redo').onclick = () => graph.redo();
$('btn-add-step').onclick = () => addNode('step');
$('btn-add-decision').onclick = () => addNode('decision');
$('btn-add-fail').onclick = () => addNode('fail');
$('btn-add-text').onclick = () => addNode('text');
$('btn-del').onclick = () => graph.removeCells(graph.getSelectedCells());
$('btn-fit').onclick = fit;
$('btn-json').onclick = () => {
  $('json-panel').classList.toggle('hidden');
  refreshJSON();
};
$('btn-json-copy').onclick = () =>
  navigator.clipboard.writeText(JSON.stringify(doc, null, 1)).then(() => status('JSON 已复制'));
$('btn-save').onclick = () => pushServer(false);
$('btn-reset').onclick = () => {
  if (!confirm('丢弃本图全部修改,重置为服务器上的版本?')) return;
  localStorage.removeItem('jfe:' + tab);
  load(tab);
};
$('btn-export').onclick = () =>
  download(tab + '.json', JSON.stringify(doc, null, 1), 'application/json');
$('btn-import').onclick = () => $('file-import').click();
$('file-import').addEventListener('change', ev => {
  const f = ev.target.files[0];
  if (!f) return;
  f.text().then(txt => {
    const d = JSON.parse(txt);
    if (!d.meta || !d.nodes || !d.edges) throw new Error('bad json');
    doc = d;
    localStorage.setItem('jfe:' + tab, JSON.stringify(doc));
    rebuild();
  }).catch(e => alert('导入失败: ' + e.message));
  ev.target.value = '';
});
$('btn-svg').onclick = () => graph.exportSVG(tab + '-flow.svg', { copyStyles: true });

/* ---------- tab 与加载 ---------- */
function load(id) {
  tab = id;
  document.querySelectorAll('.tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === id));
  const draft = localStorage.getItem('jfe:' + id);
  if (draft) {
    doc = JSON.parse(draft);
    rebuild();
    status('本地草稿');
    return;
  }
  fetch('data/' + id + '.json?t=' + Date.now())
    .then(r => r.json())
    .then(d => { doc = d; rebuild(); status('已加载'); })
    .catch(() => status('数据加载失败', false));
}
const tabsEl = $('tabs');
for (const t of TABS) {
  const b = document.createElement('button');
  b.className = 'tab';
  b.dataset.tab = t.id;
  b.textContent = t.name;
  b.onclick = () => load(t.id);
  tabsEl.appendChild(b);
}
load('final');
window.__jfe = { graph: () => graph, doc: () => doc };   // 调试/自动化测试钩子
})();
