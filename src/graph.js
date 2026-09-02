/* X6 引擎胶水层。编辑器壳黑白;图内元素颜色/形状全是可改属性(默认圆角矩形)。
 * 对外暴露纯函数接口,UI 层(React)不直接碰 X6。 */
import { Graph } from '@antv/x6';
import { History } from '@antv/x6-plugin-history';
import { Selection } from '@antv/x6-plugin-selection';
import { Keyboard } from '@antv/x6-plugin-keyboard';
import { Snapline } from '@antv/x6-plugin-snapline';
import { Transform } from '@antv/x6-plugin-transform';
import { Export } from '@antv/x6-plugin-export';
import { Dnd } from '@antv/x6-plugin-dnd';

const BLACK = '#000000';
const WHITE = '#ffffff';

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

// 各类元素的默认外观(未显式设置属性时)
const KIND_DEFAULTS = {
  pill: { fill: '#246bfd', stroke: '', text: WHITE },
  text: { fill: 'none', stroke: '', text: '#172033' },
  band: { fill: '#f0f3fa', stroke: '', text: '#172033' },
  decision: { fill: '#fff5cc', stroke: '#c8952d', text: '#5c4408' },
  fail: { fill: '#fdecec', stroke: '#c74444', text: '#c74444' },
  step: { fill: WHITE, stroke: '#cbd3e1', text: '#172033' },
  // 用例图元素
  actor: { fill: WHITE, stroke: '#172033', text: '#172033' },        // 火柴人(真人角色)
  usecase: { fill: WHITE, stroke: '#48586a', text: '#172033' },      // 椭圆
  boundary: { fill: '#fbfcfd', stroke: '#c7d1d9', text: '#17212d' }, // 系统边界(标题左上)
  package: { fill: 'none', stroke: '#9aa4ae', text: '#48586a' },     // 分组包(虚线,标题左上)
  // 类图 / 时序图元素
  classbox: { fill: WHITE, stroke: '#48586a', text: '#17212d' },
  lifeline: { fill: WHITE, stroke: '#17212d', text: '#17212d' },
  activation: { fill: '#dfe7ee', stroke: '#48586a', text: '#17212d' },   // 激活条(细长矩形)
  anchor: { fill: 'none', stroke: '', text: '#17212d' },                 // 消息锚点:透明小方块,只用来挂线
};

/* 火柴人:一条 path 按 refD 随节点尺寸缩放;文字挂在节点下方 */
import { Graph as _G } from '@antv/x6';
if (!_G.registerNode.__ucActor) {
  _G.registerNode('uc-actor', {
    inherit: 'rect',
    markup: [
      { tagName: 'rect', selector: 'hit' },
      { tagName: 'circle', selector: 'head' },
      { tagName: 'path', selector: 'figure' },
      { tagName: 'text', selector: 'label' },
    ],
    attrs: {
      hit: { refWidth: '100%', refHeight: '100%', fill: 'transparent', stroke: 'none' },
      // 头用独立 circle(refD 缩放圆弧时两段会画到同一侧,头闭不上);身体是一条路径按节点尺寸缩放
      head: { refCx: '50%', refCy: '15%', refR: 0.14, fill: 'none', stroke: '#172033', strokeWidth: 2 },
      // refD 是把「路径自身的包围盒」拉伸到节点大小,所以路径里要带上整个 40×52 设计框的两个角(0.01 长的隐形小段),
      // 否则身体会被拉到占满整个节点、和头重叠
      figure: { refD: 'M0 0 h0.01 M40 52 h-0.01 M20 15 V34 M6 22 H34 M20 34 L8 50 M20 34 L32 50',
        fill: 'none', stroke: '#172033', strokeWidth: 2, strokeLinecap: 'butt', strokeLinejoin: 'round' },
      label: { refX: '50%', refY: '100%', refY2: 6, textAnchor: 'middle', textVerticalAnchor: 'top', fontSize: 13 },
    },
  }, true);
  // 类框:顶部标题带 + 左对齐属性行(UML 类图/实体)
  _G.registerNode('uc-class', {
    inherit: 'rect',
    markup: [
      { tagName: 'rect', selector: 'body' },
      { tagName: 'rect', selector: 'head' },
      { tagName: 'text', selector: 'title' },
      { tagName: 'text', selector: 'attrs' },
    ],
    attrs: {
      body: { refWidth: '100%', refHeight: '100%', fill: '#fff', stroke: '#48586a', strokeWidth: 1.5 },
      head: { refWidth: '100%', height: 40, fill: '#edf1f4', stroke: '#48586a', strokeWidth: 1.5 },
      title: { refX: 12, refY: 20, textAnchor: 'start', textVerticalAnchor: 'middle', fontWeight: 700, fontSize: 17, fill: '#17212d' },
      attrs: { refX: 12, refY: 52, textAnchor: 'start', textVerticalAnchor: 'top', fontSize: 15, fill: '#17212d', lineHeight: 24 },
    },
  }, true);
  // 生命线:顶部方框 + 贯穿全高的虚线(时序图)
  _G.registerNode('uc-lifeline', {
    inherit: 'rect',
    markup: [
      { tagName: 'path', selector: 'line' },
      { tagName: 'rect', selector: 'head' },
      { tagName: 'text', selector: 'label' },
    ],
    attrs: {
      line: { refD: 'M 0.5 0 V 1', stroke: '#48586a', strokeWidth: 1.5, strokeDasharray: '6 5', fill: 'none' },
      head: { refWidth: '100%', height: 48, fill: '#fff', stroke: '#17212d', strokeWidth: 1.5, rx: 4 },
      label: { refX: '50%', refY: 24, textAnchor: 'middle', textVerticalAnchor: 'middle', fontSize: 16, fontWeight: 600, fill: '#17212d' },
    },
  }, true);
  _G.registerNode.__ucActor = true;
}

export function createFlowEngine(container, cb) {
  // cb: { onChange, onNodeDblclick, onEdgeDblclick, onNodeContextMenu,
  //       onEdgeContextMenu, onKeyToggleSidebar, onLinkDone }
  let meta = { W: 1600, H: 900, fs: { title: 16, body: 13 } };
  let loading = false;
  let linkFrom = null;   // 连线模式:待连的源节点 id

  const graph = new Graph({
    container,
    autoResize: true,
    background: { color: WHITE },
    panning: { enabled: true, eventTypes: ['leftMouseDown', 'mouseWheel'] },
    mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'], factor: 1.08,
      zoomAtMousePosition: true, minScale: 0.02, maxScale: 10 },
    connecting: {
      router: { name: 'orth' },
      connector: { name: 'normal' },
      snap: false,   // 不吸附:任意边缘落线,预览线跟指针走
      allowBlank: false, allowEdge: false, allowNode: true, allowMulti: true, allowPort: false,
      highlight: true, connectionPoint: 'boundary',
      // 任意边缘起线:元素本体就是 magnet,但只有按在「边缘带」(离轮廓 ≤ 10 屏幕像素)才算起线,按在内部照旧是拖动元素
      validateMagnet({ e, cell }) {
        if (!cell || !cell.isNode()) return false;
        const p = graph.clientToLocal(e.clientX, e.clientY);
        const hit = nearBoundary(cell, p);
        if (window.__jfeDebug) console.log('[jfe] validateMagnet', cell.id, JSON.stringify(p), 'hit=', hit);
        if (hit) linkStart = { cell: cell.id, frac: boundaryFrac(cell, p) };
        return !!hit;
      },
      createEdge() {
        const st = newEdgeStyle;
        return graph.createEdge({ zIndex: 5, router: { name: 'orth' },
          attrs: edgeAttrs(st.dash, st.color, undefined, st.arrow),
          labels: st.label ? [mkLabel(st.label, st.color)] : [],
          data: { dash: st.dash, arrow: st.arrow, color: st.color, router: 'orth' } });
      },
      validateConnection({ targetCell }) {
        return !!targetCell && targetCell.isNode() &&
          connectable((targetCell.getData() || {}).kind);
      },
    },
  });
  graph.use(new History({ enabled: true }));
  graph.use(new Selection({ enabled: true, multiple: true, movable: true,
    rubberband: true, modifiers: ['shift'] }));
  graph.use(new Keyboard({ enabled: true }));
  graph.use(new Snapline({ enabled: true }));
  // 选中即可拖角改大小:orthogonal:false → 只留四个角点(不出四条边中点)
  graph.use(new Transform({
    resizing: { enabled: true, orthogonal: false, preserveAspectRatio: false,
      minWidth: 24, minHeight: 20, autoScroll: true },
    rotating: false,
  }));
  graph.use(new Export());
  const dnd = new Dnd({ target: graph, scaled: false,
    getDropNode: node => node.clone({ keepId: false }) });

  function sw() { return meta.W > 3000 ? 3.5 : 2; }
  /* ---------- 任意边缘连线 ---------- */
  let linkStart = null;    // 起线时按下的位置(元素 id + 相对边界的比例坐标)
  const EDGE_BAND_PX = 10; // 屏幕像素:离轮廓多近算「按在边上」
  function nearBoundary(node, p) {
    const b = node.getBBox(); if (!b.width || !b.height) return false;
    const band = EDGE_BAND_PX / Math.max(0.02, graph.zoom());
    const d = node.getData() || {}; const sh = d.shape || shapeOf(d);
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    if (sh === 'ellipse') {        // 归一化径向距离 ≈ 1 即在轮廓上
      const nx = (p.x - cx) / (b.width / 2), ny = (p.y - cy) / (b.height / 2);
      const r = Math.hypot(nx, ny); const tol = band / Math.min(b.width, b.height) * 2;
      return Math.abs(r - 1) <= tol;
    }
    if (sh === 'diamond') {        // 菱形:|dx|/a + |dy|/b ≈ 1
      const nx = Math.abs(p.x - cx) / (b.width / 2), ny = Math.abs(p.y - cy) / (b.height / 2);
      const tol = band / Math.min(b.width, b.height) * 2;
      return Math.abs(nx + ny - 1) <= tol;
    }
    const inX = p.x >= b.x - band && p.x <= b.x + b.width + band;
    const inY = p.y >= b.y - band && p.y <= b.y + b.height + band;
    const nearV = Math.min(Math.abs(p.x - b.x), Math.abs(p.x - (b.x + b.width))) <= band;
    const nearH = Math.min(Math.abs(p.y - b.y), Math.abs(p.y - (b.y + b.height))) <= band;
    return inX && inY && (nearV || nearH);
  }
  /* 把点投到元素轮廓上,返回相对包围盒的比例坐标(0~1);随元素缩放/移动仍贴在同一相对位置 */
  function boundaryFrac(node, p) {
    const b = node.getBBox(); const d = node.getData() || {}; const sh = d.shape || shapeOf(d);
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    let fx, fy;
    if (sh === 'ellipse' || sh === 'diamond') {
      const ang = Math.atan2((p.y - cy) / (b.height / 2), (p.x - cx) / (b.width / 2));
      if (sh === 'ellipse') { fx = 0.5 + Math.cos(ang) / 2; fy = 0.5 + Math.sin(ang) / 2; }
      else { const c = Math.cos(ang), sn = Math.sin(ang); const k = 1 / (Math.abs(c) + Math.abs(sn)); fx = 0.5 + c * k / 2; fy = 0.5 + sn * k / 2; }
    } else {
      const dl = Math.abs(p.x - b.x), dr = Math.abs(p.x - (b.x + b.width)), dt = Math.abs(p.y - b.y), db = Math.abs(p.y - (b.y + b.height));
      const m = Math.min(dl, dr, dt, db);
      fx = Math.min(1, Math.max(0, (p.x - b.x) / b.width)); fy = Math.min(1, Math.max(0, (p.y - b.y) / b.height));
      if (m === dl) fx = 0; else if (m === dr) fx = 1; else if (m === dt) fy = 0; else fy = 1;
    }
    return { x: Math.round(fx * 1000) / 1000, y: Math.round(fy * 1000) / 1000 };
  }
  const terminal = (cellId, frac) => frac
    ? { cell: cellId, anchor: { name: 'topLeft', args: { dx: `${frac.x * 100}%`, dy: `${frac.y * 100}%` } }, connectionPoint: { name: 'anchor' } }
    : { cell: cellId };
  const fracOf = (t) => {   // 从终端配置里读回比例坐标
    const a = t && t.anchor && t.anchor.args; if (!a || a.dx === undefined) return undefined;
    const f = (v) => typeof v === 'string' && v.endsWith('%') ? parseFloat(v) / 100 : undefined;
    const x = f(a.dx), y = f(a.dy); return x === undefined ? undefined : { x, y };
  };
  const PORT_FRAC = { pl: { x: 0, y: 0.5 }, pr: { x: 1, y: 0.5 }, pt: { x: 0.5, y: 0 }, pb: { x: 0.5, y: 1 } };   // 老数据的四个端口 → 比例锚点
  function scale() { return meta.W > 3000 ? 1.6 : 1; }
  function connectable(k) { return !['band', 'pill', 'text', 'boundary', 'package'].includes(k); }
  const NO_AUTOSIZE = ['boundary', 'package', 'actor', 'band', 'classbox', 'lifeline', 'anchor', 'activation'];
  function zOf(kind) {   // 默认层级(未显式设置 z 时):容器类在底下,元素在上面
    return kind === 'band' ? 1 : kind === 'boundary' ? 2 : kind === 'package' ? 3 : kind === 'pill' ? 2 : kind === 'text' ? 3 : 10;
  }
  function zOfNode(n) {
    return n.z !== undefined && n.z !== null && n.z !== '' ? +n.z : zOf(n.kind);
  }
  const DASH = { solid: null, dashed: '8 6', dotted: '2 6' };
  function dashOf(v) {            // 线型归一:兼容旧字段 dashed:true
    if (v === true) return 'dashed';
    return (typeof v === 'string' && DASH[v] !== undefined) ? v : 'solid';
  }
  function routerOf(v) { return v === 'normal' ? 'normal' : v === 'manhattan' ? 'manhattan' : 'orth'; }   // manhattan=避障(绕开路上的节点)
  const ARROW = ['block', 'classic', 'hollow', 'none'];
  function arrowOf(v) { return ARROW.includes(v) ? v : 'block'; }
  function marker(kind, w, c) {
    if (kind === 'none') return null;
    if (kind === 'hollow') return { name: 'path', d: 'M 0 0 L 14 -8 L 14 8 z', fill: WHITE, stroke: c, strokeWidth: 1.5, offsetX: -1 };   // 泛化:空心三角
    if (kind === 'classic') return { name: 'classic', size: 7 + w * 2 };
    return { name: 'block', size: 6 + w * 2 };
  }
  function edgeAttrs(dash, color, width, arrow) {
    const c = color || '#526078';
    const w = width || sw();
    const st = dashOf(dash);
    return { line: {
      stroke: c, strokeWidth: w, sourceMarker: null,
      strokeDasharray: DASH[st],
      strokeLinecap: st === 'dotted' ? 'round' : 'butt',
      targetMarker: marker(arrowOf(arrow), w, c),
    } };
  }
  // 新连线默认样式:侧栏「关系预设」改它(关联/包含/扩展/泛化),端口拉线与右键连线都吃
  let newEdgeStyle = { dash: 'solid', arrow: 'block', label: '', color: undefined };
  function setNewEdgeStyle(st) { newEdgeStyle = { ...newEdgeStyle, ...st }; }
  function mkLabel(text, color, position = 0.5) {
    return { position, attrs: {
      label: { text, fill: color || '#526078', fontSize: meta.fs.body },
      body: { fill: WHITE, fillOpacity: 0.96, stroke: 'none' },
    } };
  }
  // 一条线可以带多个标签(类图两端基数:{text:'1',position:0.12},{text:'0..*',position:0.88});单标签 label 仍然可用
  function labelsOf(e, color) {
    const out = [];
    if (e.label) out.push(mkLabel(e.label, color));
    for (const l of (Array.isArray(e.labels) ? e.labels : [])) if (l && l.text) out.push(mkLabel(l.text, color, l.position ?? 0.5));
    return out;
  }

  /* ---------- 节点外观(形状/颜色全为属性) ---------- */
  function shapeOf(n) {
    if (n.shape) return n.shape;
    return ({ decision: 'diamond', usecase: 'ellipse', actor: 'actor', classbox: 'classbox', lifeline: 'lifeline', anchor: 'rect', activation: 'rect' })[n.kind] || 'rounded';
  }
  // 形状归到 X6 的四类壳:rect / polygon / ellipse / uc-actor;换壳要原位重建
  function shellOf(sh) { return ({ diamond: 'polygon', ellipse: 'ellipse', actor: 'uc-actor', classbox: 'uc-class', lifeline: 'uc-lifeline' })[sh] || 'rect'; }
  function defaultRx() { return Math.round(8 * scale()) + 6; }
  function nodeBody(n) {
    const kind = n.kind || 'step';
    const dfl = KIND_DEFAULTS[kind] || KIND_DEFAULTS.step;
    const body = {
      fill: n.fill || dfl.fill,
      stroke: n.stroke || dfl.stroke || 'none',
      strokeWidth: kind === 'band' || kind === 'pill' ? 1 : sw(),
    };
    const sh = shapeOf(n);
    if (sh !== 'diamond' && sh !== 'ellipse' && sh !== 'actor') {
      const rx = sh === 'rect' ? 0 : (n.rx !== undefined ? n.rx : defaultRx());
      body.rx = rx; body.ry = rx;
    }
    if (kind === 'package') body.strokeDasharray = '6 4';
    if (kind === 'boundary' || kind === 'package') body.strokeWidth = 1.4 * scale();
    return body;
  }
  function nodeLabel(n) {
    const kind = n.kind || 'step';
    const dfl = KIND_DEFAULTS[kind] || KIND_DEFAULTS.step;
    const label = {
      text: (n.lines || []).join('\n'),
      fill: n.textColor || dfl.text,
      fontSize: n.fontSize || meta.fs.body,
      fontWeight: n.bold ? 600 : 400,
      textWrap: { width: -16, height: '80%', breakWord: true, ellipsis: false },
    };
    if (kind === 'boundary' || kind === 'package') {   // 容器类:标题贴左上角,不居中
      Object.assign(label, { refX: 14, refY: 10, textAnchor: 'start', textVerticalAnchor: 'top', fontWeight: 600, textWrap: { width: -28, height: 40, breakWord: true, ellipsis: false } });
    }
    if (shapeOf(n) === 'ellipse') label.textWrap = { width: '68%', height: '70%', breakWord: true, ellipsis: false };
    if (kind === 'actor') Object.assign(label, { refX: '50%', refY: '100%', refY2: 6, textAnchor: 'middle', textVerticalAnchor: 'top', textWrap: { width: 140, height: 60, breakWord: true, ellipsis: false } });
    return label;
  }
  function portConf() {
    const r = Math.round(6 * scale()) + 2;
    const g = pos => ({ position: pos,
      attrs: { rect: { magnet: true, stroke: BLACK, fill: WHITE,
        strokeWidth: 1.5, width: r * 2, height: r * 2, x: -r, y: -r } } });
    return {
      groups: { l: g('left'), r: g('right'), t: g('top'), b: g('bottom') },
      items: [{ group: 'l', id: 'pl' }, { group: 'r', id: 'pr' },
              { group: 't', id: 'pt' }, { group: 'b', id: 'pb' }],
    };
  }
  function nodeConfig(n) {
    const sh = shapeOf(n);
    const lines = n.lines || [];
    const mag = connectable(n.kind || 'step');
    const attrs = sh === 'actor'
      ? { hit: { magnet: mag }, figure: { stroke: n.stroke || KIND_DEFAULTS.actor.stroke, strokeWidth: 2 * scale() }, head: { stroke: n.stroke || KIND_DEFAULTS.actor.stroke, strokeWidth: 2 * scale() }, label: nodeLabel(n) }
      : sh === 'classbox'
      ? { body: { magnet: mag, fill: n.fill || WHITE, stroke: n.stroke || '#48586a' }, head: { fill: n.bodyColor || '#edf1f4', stroke: n.stroke || '#48586a' },
          title: { text: lines[0] || '', fontSize: (n.fontSize || meta.fs.body) + 2 }, attrs: { text: lines.slice(1).join('\n'), fontSize: n.fontSize || meta.fs.body } }
      : sh === 'lifeline'
      ? { head: { magnet: mag, fill: n.fill || WHITE, stroke: n.stroke || '#17212d' }, line: { stroke: n.stroke || '#48586a' }, label: { text: lines.join('\n'), fontSize: n.fontSize || meta.fs.body } }
      : n.kind === 'anchor'
      ? { body: { magnet: true, fill: 'transparent', stroke: 'none' }, label: { text: '' } }
      : { body: { magnet: mag, ...(sh === 'diamond' ? { ...nodeBody(n), refPoints: '0,10 10,0 20,10 10,20' } : nodeBody(n)) }, label: nodeLabel(n) };
    return clean({
      id: n.id,
      shape: shellOf(sh),
      x: n.x, y: n.y, width: n.w, height: n.h,
      zIndex: zOfNode(n),
      attrs,
      data: { kind: n.kind || 'step', shape: sh, lines: n.lines || [],
        z: n.z, fontSize: n.fontSize, bold: n.bold, vertical: n.vertical, rx: n.rx,
        fill: n.fill, stroke: n.stroke, textColor: n.textColor,
        bodyColor: n.bodyColor,
        spec: n.spec },   // 用例规约(编号/触发/前置/主流程/异常/优先级/状态):图上不铺开,双击看、右侧面板看
      // 四个端口废弃:任意边缘都能连(本体即 magnet,起线与否由 validateMagnet 按边缘带判定)
    });
  }
  function nodeToJSON(node) {
    const d = node.getData() || {};
    const p = node.getPosition(), s = node.getSize();
    return clean({ id: node.id, kind: d.kind, shape: d.shape, z: d.z,
      x: Math.round(p.x), y: Math.round(p.y),
      w: Math.round(s.width), h: Math.round(s.height),
      fill: d.fill, stroke: d.stroke, textColor: d.textColor,
      bodyColor: d.bodyColor, lines: d.lines, fontSize: d.fontSize,
      bold: d.bold, vertical: d.vertical, rx: d.rx,
      spec: d.spec && Object.keys(d.spec).length ? d.spec : undefined });
  }

  /* ---------- 构建/序列化 ---------- */
  function buildFrom(doc) {
    loading = true;
    meta = doc.meta;
    linkFrom = null;
    graph.disableHistory();
    graph.clearCells();
    for (const n of doc.nodes) graph.addNode(nodeConfig(n));
    for (const e of doc.edges) {
      const dash = dashOf(e.dash !== undefined ? e.dash : e.dashed);
      const router = routerOf(e.router);
      graph.addEdge({
        id: e.id,
        zIndex: (e.z !== undefined && e.z !== null && e.z !== '') ? +e.z : 5,
        source: terminal(e.from, e.fromAnchor || PORT_FRAC[e.fromPort]),
        target: terminal(e.to, e.toAnchor || PORT_FRAC[e.toPort]),
        vertices: e.vertices || [],
        router: { name: router },
        attrs: edgeAttrs(dash, e.color, e.width, e.arrow),
        labels: labelsOf(e, e.color),
        data: { dash, color: e.color, width: e.width, router, arrow: arrowOf(e.arrow), extraLabels: Array.isArray(e.labels) ? e.labels : undefined },
      });
    }
    graph.enableHistory();
    graph.cleanHistory();
    loading = false;
    fit();
    setTimeout(fit, 150);
  }
  function serialize() {
    const nodes = [], edges = [];
    for (const c of graph.getCells()) {
      if (c.isNode()) nodes.push(nodeToJSON(c));
      else if (c.isEdge()) {
        const d = c.getData() || {};
        let label = ''; const extra = [];
        for (const l of (c.getLabels() || [])) {
          const t = l.attrs && l.attrs.label && l.attrs.label.text;
          if (!t) continue;
          const pos = typeof l.position === 'number' ? l.position : (l.position && l.position.distance);
          if (!label && (pos === undefined || pos === 0.5)) label = t; else extra.push({ text: t, position: pos ?? 0.5 });
        }
        const z = c.getZIndex();
        edges.push(clean({ id: c.id,
          from: c.getSourceCellId(), to: c.getTargetCellId(),
          fromAnchor: fracOf(c.getSource()), toAnchor: fracOf(c.getTarget()),
          color: d.color, width: d.width, label, labels: extra.length ? extra : undefined,
          dash: dashOf(d.dash !== undefined ? d.dash : d.dashed) === 'solid'
            ? undefined : dashOf(d.dash !== undefined ? d.dash : d.dashed),
          router: routerOf(d.router) === 'orth' ? undefined : routerOf(d.router),
          arrow: arrowOf(d.arrow) === 'block' ? undefined : arrowOf(d.arrow),
          z: (z !== undefined && z !== null && z !== 5) ? z : undefined,
          vertices: (c.getVertices() || []).map(v =>
            ({ x: Math.round(v.x), y: Math.round(v.y) })) }));
      }
    }
    return { meta, nodes, edges };
  }

  /* ---------- 自动扩容(图必须包着字) ---------- */
  let _meas = null;
  function measure(lines, width, fontSize) {
    if (!_meas) {
      _meas = document.createElement('div');
      _meas.style.cssText = 'position:absolute;left:-99999px;top:0;' +
        'visibility:hidden;line-height:1.4;white-space:pre-wrap;' +
        'overflow-wrap:anywhere;word-break:break-word;' +
        'font-family:"PingFang SC","Hiragino Sans GB",sans-serif;';
      document.body.appendChild(_meas);
    }
    _meas.style.width = Math.max(20, width) + 'px';
    _meas.style.fontSize = fontSize + 'px';
    _meas.textContent = lines.join('\n');
    return _meas.getBoundingClientRect().height;
  }
  function autoSize(node) {
    const d = node.getData() || {};
    if (NO_AUTOSIZE.includes(d.kind)) return;   // 容器/角色/类框/生命线/锚点不按文字撑大
    const s = node.getSize();
    if (d.baseW === undefined) { d.baseW = s.width; d.baseH = s.height; }
    const fsz = d.fontSize || meta.fs.body;
    const isD = (d.shape || '') === 'diamond';
    const isE = (d.shape || '') === 'ellipse';
    const MAXW = meta.W * 0.42;
    let w = Math.max(s.width, d.baseW), needH = 0;
    for (let i = 0; i < 10; i++) {
      const availW = isD ? w * 0.55 : isE ? w * 0.68 : w - 24;
      const textH = measure(d.lines || [], availW, fsz);
      needH = isD ? textH / 0.55 : isE ? textH / 0.7 : textH + 24;
      if (needH <= Math.max(d.baseH, w * 0.85) || w >= MAXW) break;
      w = Math.min(MAXW, Math.round(w * 1.4));
    }
    const nh = Math.max(d.baseH, Math.ceil(needH), s.height);
    const p = node.getPosition();
    const cx = p.x + s.width / 2, cy = p.y + s.height / 2;
    node.prop({ position: { x: Math.round(cx - w / 2), y: Math.round(cy - nh / 2) },
      size: { width: w, height: nh } });
  }

  /* ---------- 连线工具:屏幕恒定尺寸 ---------- */
  function edgeTools(edge) {
    const z = Math.max(0.02, graph.zoom());
    const vr = Math.min(160, Math.max(10, Math.round(12 / z)));
    const ar = vr * 1.4;
    edge.removeTools();
    edge.addTools([
      { name: 'vertices', args: { addable: true, removable: true, snapRadius: vr,
        attrs: { r: vr, fill: WHITE, stroke: BLACK,
          'stroke-width': Math.max(1.5, vr / 5), cursor: 'move' } } },
      { name: 'segments', args: { threshold: 40,
        attrs: { width: vr * 2, height: vr * 0.9, fill: WHITE, stroke: BLACK } } },
      { name: 'source-arrowhead', args: { attrs: {
        d: `M -${ar} -${ar * 0.75} ${ar} 0 -${ar} ${ar * 0.75} Z`, fill: BLACK } } },
      { name: 'target-arrowhead', args: { attrs: {
        d: `M -${ar} -${ar * 0.75} ${ar} 0 -${ar} ${ar * 0.75} Z`, fill: BLACK } } },
    ]);
  }

  /* ---------- 事件 ---------- */
  const emitChange = () => { if (!loading) cb.onChange(); };
  graph.on('cell:changed', emitChange);
  graph.on('cell:added', emitChange);
  graph.on('cell:removed', emitChange);
  graph.on('node:resized', ({ node }) => {
    const s2 = node.getSize();
    const d = node.getData() || {};
    node.setData({ ...d, baseW: Math.round(s2.width), baseH: Math.round(s2.height) },
      { deep: false });
  });
  graph.on('edge:selected', ({ edge }) => edgeTools(edge));
  graph.on('edge:unselected', ({ edge }) => edge.removeTools());
  let scaleTimer = null;
  graph.on('scale', () => {
    clearTimeout(scaleTimer);
    scaleTimer = setTimeout(() => {
      graph.getSelectedCells().forEach(c => { if (c.isEdge()) edgeTools(c); });
    }, 120);
  });
  /* 控制点:按图坐标插入到最近的折线段上 / 删除第 idx 个 */
  function addEdgeVertex(edge, x, y) {
    const vs = (edge.getVertices() || []).slice();
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
  }
  function removeEdgeVertex(edge, idx) {
    const vs = (edge.getVertices() || []).slice();
    if (idx < 0 || idx >= vs.length) return;
    vs.splice(idx, 1);
    edge.setVertices(vs);
  }
  // 连线:右键出菜单(UI 层渲染);命中已有控制点时菜单多一项「删除控制点」
  graph.on('edge:contextmenu', ({ edge, e, x, y }) => {
    e.preventDefault();
    const vs = edge.getVertices() || [];
    const z = graph.zoom();
    const hitIdx = vs.findIndex(v => Math.hypot(v.x - x, v.y - y) * z <= 14);
    cb.onEdgeContextMenu(edge, { x: e.clientX, y: e.clientY },
      { gx: x, gy: y, hitIdx });
  });
  // 节点:右键出菜单(UI 层渲染)
  graph.on('node:contextmenu', ({ node, e }) => {
    e.preventDefault();
    cb.onNodeContextMenu(node, { x: e.clientX, y: e.clientY });
  });
  graph.on('blank:contextmenu', ({ e }) => e.preventDefault());
  /* 松手落点由我们自己定:X6 在同一元素上换落点时不发 edge:connected,所以监听 window mouseup 兜底。
     dragging = { edge, type: 'source'|'target', isNew } 在拖箭头柄 / 新线出现时记下。 */
  let dragging = null;
  graph.on('edge:mousedown', ({ e, edge }) => {
    const p = graph.clientToLocal(e.clientX, e.clientY);
    const r = 24 / Math.max(0.02, graph.zoom());
    const sp = edge.getSourcePoint(), tp = edge.getTargetPoint();
    if (sp && Math.hypot(p.x - sp.x, p.y - sp.y) <= r) dragging = { edge, type: 'source' };
    else if (tp && Math.hypot(p.x - tp.x, p.y - tp.y) <= r) dragging = { edge, type: 'target' };
  });
  graph.on('edge:added', ({ edge }) => {
    if (loading) return;
    if (linkStart && !edge.getTargetCellId()) {          // 从边缘拖出来的新线:起点锚在按下的那一点
      edge.setSource(terminal(linkStart.cell, linkStart.frac));
      dragging = { edge, type: 'target', isNew: true };
    }
  });
  function nodeAt(p, px = EDGE_BAND_PX, excludeId = null) {   // 指针下的可连元素:先找包围盒真包含的,再找 px 像素内最近的
    const band = px / Math.max(0.02, graph.zoom());
    const cands = graph.getNodes().filter((n) => n.id !== excludeId && connectable((n.getData() || {}).kind));
    const inside = cands.filter((n) => { const b = n.getBBox(); return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height; });
    if (inside.length) return inside.sort((a, b) => (b.getZIndex() || 0) - (a.getZIndex() || 0))[0];
    const near = cands.map((n) => { const b = n.getBBox(); const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.width)); const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.height)); return { n, d: Math.hypot(dx, dy) }; })
      .filter((x) => x.d <= band).sort((a, b) => a.d - b.d);
    return near.length ? near[0].n : null;
  }
  /* 拖动中的「吸附」:指针离任何元素轮廓 ≤ SNAP_PX 就把线端吸到轮廓上离指针最近的那一点(不是四个中点);离远了跟指针走 */
  const SNAP_PX = 18;
  const onWinMove = (e) => {
    const d = dragging; if (!d || !d.edge || !graph.getCellById(d.edge.id)) return;
    const p = graph.clientToLocal(e.clientX, e.clientY);
    const other = d.type === 'source' ? d.edge.getTargetCellId() : d.edge.getSourceCellId();
    const node = nodeAt(p, SNAP_PX, other);
    const t = node ? terminal(node.id, boundaryFrac(node, p)) : { x: p.x, y: p.y };
    if (window.__jfeDebug) console.log('[jfe] winmove', d.type, JSON.stringify(p), 'snap=', node && node.id);
    if (d.type === 'source') d.edge.setSource(t); else d.edge.setTarget(t);
  };
  window.addEventListener('mousemove', onWinMove);
  const onWinUp = (e) => {
    const d = dragging; dragging = null; linkStart = null;
    if (!d || !d.edge || !graph.getCellById(d.edge.id)) { if (window.__jfeDebug) console.log('[jfe] winup: no dragging', !!d); return; }
    const p = graph.clientToLocal(e.clientX, e.clientY);
    const other0 = d.type === 'source' ? d.edge.getTargetCellId() : d.edge.getSourceCellId();
    const node = nodeAt(p, SNAP_PX, other0);
    if (window.__jfeDebug) console.log('[jfe] winup', d.type, d.isNew ? 'new' : 'old', 'at', JSON.stringify(p), 'node=', node && node.id);
    if (!node) return;                                    // 没落在元素上:新线由 X6 自己删,旧线保持原样
    const other = d.type === 'source' ? d.edge.getTargetCellId() : d.edge.getSourceCellId();
    if (other === node.id) return;                        // 不允许自环
    const t = terminal(node.id, boundaryFrac(node, p));
    if (d.type === 'source') d.edge.setSource(t); else d.edge.setTarget(t);
    graph.select(d.edge);
  };
  window.addEventListener('mouseup', onWinUp);
  // 连上(新线或拖箭头柄重接):把落点投到轮廓上,记成相对锚点,这样刷新/缩放后还贴在同一处
  graph.on('edge:connected', ({ e, edge, isNew, type, currentCell }) => {
    if (window.__jfeDebug) console.log('[jfe] edge:connected', type, isNew, currentCell && currentCell.id);
    if (!edge || !currentCell || !currentCell.isNode()) return;
    const p = graph.clientToLocal(e.clientX, e.clientY);
    const frac = boundaryFrac(currentCell, p);
    if (type === 'source') edge.setSource(terminal(currentCell.id, frac));
    else edge.setTarget(terminal(currentCell.id, frac));
    if (isNew && linkStart && edge.getSourceCellId() === linkStart.cell) edge.setSource(terminal(linkStart.cell, linkStart.frac));
    linkStart = null;
  });
  // 鼠标靠近轮廓时给个十字光标,提示「这里能起线」
  graph.on('node:mousemove', ({ e, node, view }) => {
    if (!connectable((node.getData() || {}).kind)) return;
    const p = graph.clientToLocal(e.clientX, e.clientY);
    view.container.style.cursor = nearBoundary(node, p) ? 'crosshair' : 'move';
  });
  graph.on('node:mouseleave', ({ view }) => { view.container.style.cursor = ''; });
  // 连线模式:点目标节点完成;点空白/Esc 取消
  graph.on('node:click', ({ node }) => {
    if (!linkFrom) return;
    if (node.id !== linkFrom && connectable((node.getData() || {}).kind)) {
      graph.addEdge({
        zIndex: 5,
        source: { cell: linkFrom }, target: { cell: node.id },
        router: { name: 'orth' },   // 正交路由自动挑上下左右最优锚边
        attrs: edgeAttrs(newEdgeStyle.dash, newEdgeStyle.color, undefined, newEdgeStyle.arrow),
        labels: newEdgeStyle.label ? [mkLabel(newEdgeStyle.label, newEdgeStyle.color)] : [],
        data: { dash: newEdgeStyle.dash, arrow: newEdgeStyle.arrow, color: newEdgeStyle.color, router: 'orth' },
      });
    }
    linkFrom = null;
    cb.onLinkDone();
  });
  graph.on('blank:click', () => {
    if (linkFrom) { linkFrom = null; cb.onLinkDone(); }
  });
  graph.on('node:dblclick', ({ node }) => cb.onNodeDblclick(node));
  graph.on('node:selected', ({ node }) => cb.onNodeSelected && cb.onNodeSelected(node));
  graph.on('node:unselected', () => cb.onNodeSelected && cb.onNodeSelected(null));
  graph.on('blank:click', () => cb.onNodeSelected && cb.onNodeSelected(null));
  graph.on('edge:dblclick', ({ edge }) => cb.onEdgeDblclick(edge));
  graph.bindKey(['meta+z', 'ctrl+z'], () => { graph.undo(); return false; });
  graph.bindKey(['meta+shift+z', 'ctrl+shift+z', 'ctrl+y'],
    () => { graph.redo(); return false; });
  graph.bindKey(['backspace', 'del'], () => {
    graph.removeCells(graph.getSelectedCells());
    return false;
  });
  graph.bindKey('esc', () => {
    if (linkFrom) { linkFrom = null; cb.onLinkDone(); }
    return false;
  });
  graph.bindKey(['meta+b', 'ctrl+b'], () => { cb.onKeyToggleSidebar(); return false; });

  /* 空格 = 纯拖动画布(按住期间不会选中/拖动元素) */
  const panOverlay = document.createElement('div');
  panOverlay.className = 'pan-overlay';
  panOverlay.style.display = 'none';
  container.style.position = 'relative';
  container.appendChild(panOverlay);
  let panDrag = null;
  const typingNow = () => {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' || el.isContentEditable);
  };
  const onSpaceDown = e => {
    if (e.code !== 'Space' || typingNow() || e.repeat) return;
    e.preventDefault();
    panOverlay.style.display = 'block';
  };
  const onSpaceUp = e => {
    if (e.code !== 'Space') return;
    panOverlay.style.display = 'none';
    panDrag = null;
  };
  panOverlay.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    panDrag = { x: e.clientX, y: e.clientY };
    panOverlay.classList.add('grabbing');
  });
  window.addEventListener('mousemove', e => {
    if (!panDrag) return;
    graph.translateBy(e.clientX - panDrag.x, e.clientY - panDrag.y);
    panDrag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mouseup', () => {
    panDrag = null;
    panOverlay.classList.remove('grabbing');
  });
  document.addEventListener('keydown', onSpaceDown);
  document.addEventListener('keyup', onSpaceUp);

  /* ---------- 对外 API ---------- */
  let fitTries = 0;
  function fit() {
    // 两种情况 zoomToFit 会钳到 minScale(0.01)看起来一片空白:
    // ① 容器还没排好版(0 尺寸);② 页面/iframe 尚不可见(hidden 标签页、懒加载 iframe),SVG 没排版,内容 bbox 为 0。
    // 都用守卫重试;并在页面重新可见 / iframe 滚进视口时再 fit 一次。
    const bad = !container.clientWidth || !container.clientHeight;
    if (!bad) graph.zoomToFit({ padding: 24, maxScale: 1.5 });
    if ((bad || graph.zoom() <= 0.02) && fitTries < 40) {
      fitTries += 1;
      setTimeout(fit, 120);
      return;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { fitTries = 0; fit(); }
  });
  if (typeof IntersectionObserver !== 'undefined') {
    let seen = false;
    new IntersectionObserver(entries => {
      if (!seen && entries.some(e => e.isIntersecting)) { seen = true; fitTries = 0; fit(); }
    }).observe(container);
  }
  function paletteNode(kind) {
    const k = scale();
    const SIZE = { decision: [210, 100], actor: [70, 90], usecase: [200, 76], boundary: [520, 360], package: [360, 240], band: [420, 160], pill: [120, 60],
      classbox: [260, 150], lifeline: [160, 520], activation: [14, 120], anchor: [10, 10] };
    const [w0, h0] = SIZE[kind] || [210, 80];
    const LABEL = { decision: '新判定?', fail: '新异常', text: '双击编辑文字', actor: '角色', usecase: '新用例', boundary: '«system» 边界', package: '分组', band: '', pill: '标签',
      classbox: '实体名', lifeline: '参与者', activation: '', anchor: '' };
    if (kind === 'classbox') { const k2 = scale(); const n2 = { kind, w: 260 * k2, h: 150 * k2, x: 0, y: 0, lines: ['实体名', 'id PK', 'name', 'status'] }; return graph.createNode(nodeConfig(n2)); }
    const n = { kind, w: w0 * k, h: h0 * k, x: 0, y: 0,
      lines: LABEL[kind] !== undefined ? (LABEL[kind] ? [LABEL[kind]] : []) : ['新步骤'],
      fontSize: kind === 'text' ? meta.fs.title : undefined };
    return graph.createNode(nodeConfig(n));
  }
  /* 弹窗提交:一切属性可改。形状类别变了(rect/polygon)就原位重建并保留连线。 */
  function applyNodeEdit(node, draft) {
    const d = node.getData() || {};
    const next = { ...d,
      lines: draft.lines,
      shape: draft.shape,
      spec: draft.spec !== undefined ? draft.spec : d.spec,
      z: draft.z === '' || draft.z === undefined ? undefined : +draft.z,
      rx: draft.rx === '' || draft.rx === undefined ? undefined : +draft.rx,
      fill: draft.fill || undefined,
      stroke: draft.stroke || undefined,
      textColor: draft.textColor || undefined,
      fontSize: draft.fontSize ? +draft.fontSize : undefined,
      bold: !!draft.bold,
    };
    const sizeTouched = draft.w && draft.h &&
      (Math.round(+draft.w) !== Math.round(node.getSize().width) ||
       Math.round(+draft.h) !== Math.round(node.getSize().height));
    const wasPolygon = (d.shape === 'diamond');
    const willPolygon = (next.shape === 'diamond');
    const shellChanged = shellOf(next.shape) !== shellOf(d.shape || shapeOf(d));
    if (shellChanged) {
      // X6 的 shape 不能原位切换:摘下相关连线→删旧建新(同 id)→接回连线
      const p = node.getPosition(), s = node.getSize();
      const edges = (graph.getConnectedEdges(node) || []).map(eg => ({
        id: eg.id,
        source: eg.getSource(), target: eg.getTarget(),
        vertices: eg.getVertices(), labels: eg.getLabels(),
        data: eg.getData(), attrs: eg.getAttrs(),
      }));
      graph.removeCell(node);
      const json = { ...next, id: node.id,
        x: Math.round(p.x), y: Math.round(p.y),
        w: Math.round(sizeTouched ? +draft.w : s.width),
        h: Math.round(sizeTouched ? +draft.h : s.height) };
      const nn = graph.addNode(nodeConfig(json));
      for (const eg of edges)
        graph.addEdge({ ...eg, zIndex: 5, router: eg.router || { name: 'orth' } });
      autoSize(nn);
      return;
    }
    node.setData(next, { deep: false });
    node.setZIndex(zOfNode(next));
    if (sizeTouched) {
      const dd = node.getData();
      dd.baseW = Math.round(+draft.w); dd.baseH = Math.round(+draft.h);
      node.resize(Math.round(+draft.w), Math.round(+draft.h));
    }
    if (next.shape === 'actor') { node.setAttrs({ figure: { stroke: next.stroke || KIND_DEFAULTS.actor.stroke }, head: { stroke: next.stroke || KIND_DEFAULTS.actor.stroke }, label: nodeLabel(next) }); autoSize(node); return; }
    if (next.shape === 'classbox') { node.setAttrs({ title: { text: next.lines[0] || '' }, attrs: { text: next.lines.slice(1).join('\n') }, body: { fill: next.fill || WHITE, stroke: next.stroke || '#48586a' } }); return; }
    if (next.shape === 'lifeline') { node.setAttrs({ label: { text: next.lines.join('\n') } }); return; }
    const body = willPolygon
      ? { ...nodeBody(next), refPoints: '0,10 10,0 20,10 10,20' }
      : nodeBody(next);
    node.setAttrs({ body, label: nodeLabel(next) });
    autoSize(node);
  }
  function applyEdgeEdit(edge, draft) {
    const d = edge.getData() || {};
    const color = draft.color || undefined;
    const width = draft.width ? +draft.width : undefined;
    const dash = dashOf(draft.dash);
    const router = routerOf(draft.router);
    const arrow = arrowOf(draft.arrow !== undefined ? draft.arrow : d.arrow);
    edge.setData({ ...d, dash, dashed: undefined, color, width, router, arrow },
      { deep: false });
    edge.setAttrs(edgeAttrs(dash, color, width, arrow));
    const keep = (edge.getLabels() || []).filter((l) => { const p = typeof l.position === 'number' ? l.position : (l.position && l.position.distance); return p !== undefined && p !== 0.5; });
    edge.setLabels([...(draft.label ? [mkLabel(draft.label, color)] : []), ...keep]);
    edge.setRouter({ name: router });
    if (draft.z !== undefined && draft.z !== '') edge.setZIndex(+draft.z);
  }
  return {
    graph,
    buildFrom, serialize, fit,
    startDnd: (kind, e) => dnd.start(paletteNode(kind), e),
    serializeNow: serialize,
    applyNodeEdit, applyEdgeEdit,
    addEdgeVertex, removeEdgeVertex,
    setNewEdgeStyle,
    startLinkFrom: node => { linkFrom = node.id; },
    removeCell: cell => graph.removeCells([cell]),
    undo: () => graph.undo(), redo: () => graph.redo(),
    removeSelected: () => graph.removeCells(graph.getSelectedCells()),
    exportSVG: name => graph.exportSVG(name, { copyStyles: true }),
    resize: () => graph.resize(),
    dispose: () => { window.removeEventListener('mouseup', onWinUp); window.removeEventListener('mousemove', onWinMove); graph.dispose(); },
  };
}
