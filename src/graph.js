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
};

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
      snap: { radius: 40 },
      allowBlank: false, allowEdge: false, allowNode: true, allowMulti: true,
      highlight: true, connectionPoint: 'boundary',
      createEdge() {
        return graph.createEdge({ zIndex: 5,
          attrs: edgeAttrs(false), data: {} });
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
  function scale() { return meta.W > 3000 ? 1.6 : 1; }
  function connectable(k) { return !['band', 'pill', 'text'].includes(k); }
  function zOf(kind) {   // 默认层级(未显式设置 z 时)
    return kind === 'band' ? 1 : kind === 'pill' ? 2 : kind === 'text' ? 3 : 10;
  }
  function zOfNode(n) {
    return n.z !== undefined && n.z !== null && n.z !== '' ? +n.z : zOf(n.kind);
  }
  const DASH = { solid: null, dashed: '8 6', dotted: '2 6' };
  function dashOf(v) {            // 线型归一:兼容旧字段 dashed:true
    if (v === true) return 'dashed';
    return (typeof v === 'string' && DASH[v] !== undefined) ? v : 'solid';
  }
  function routerOf(v) { return v === 'normal' ? 'normal' : 'orth'; }
  function edgeAttrs(dash, color, width) {
    const c = color || '#526078';
    const w = width || sw();
    const st = dashOf(dash);
    return { line: {
      stroke: c, strokeWidth: w, sourceMarker: null,
      strokeDasharray: DASH[st],
      strokeLinecap: st === 'dotted' ? 'round' : 'butt',
      targetMarker: { name: 'block', size: 6 + w * 2 },
    } };
  }
  function mkLabel(text, color) {
    return { position: 0.5, attrs: {
      label: { text, fill: color || '#526078', fontSize: meta.fs.body },
      body: { fill: WHITE, fillOpacity: 0.96, stroke: 'none' },
    } };
  }

  /* ---------- 节点外观(形状/颜色全为属性) ---------- */
  function shapeOf(n) {
    return n.shape || ((n.kind === 'decision') ? 'diamond' : 'rounded');
  }
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
    if (sh !== 'diamond') {
      const rx = sh === 'rect' ? 0 : (n.rx !== undefined ? n.rx : defaultRx());
      body.rx = rx; body.ry = rx;
    }
    return body;
  }
  function nodeLabel(n) {
    const kind = n.kind || 'step';
    const dfl = KIND_DEFAULTS[kind] || KIND_DEFAULTS.step;
    return {
      text: (n.lines || []).join('\n'),
      fill: n.textColor || dfl.text,
      fontSize: n.fontSize || meta.fs.body,
      fontWeight: n.bold ? 600 : 400,
      textWrap: { width: -16, height: '80%', breakWord: true, ellipsis: false },
    };
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
    return clean({
      id: n.id,
      shape: sh === 'diamond' ? 'polygon' : 'rect',
      x: n.x, y: n.y, width: n.w, height: n.h,
      zIndex: zOfNode(n),
      attrs: {
        body: sh === 'diamond'
          ? { ...nodeBody(n), refPoints: '0,10 10,0 20,10 10,20' }
          : nodeBody(n),
        label: nodeLabel(n),
      },
      data: { kind: n.kind || 'step', shape: sh, lines: n.lines || [],
        z: n.z, fontSize: n.fontSize, bold: n.bold, vertical: n.vertical, rx: n.rx,
        fill: n.fill, stroke: n.stroke, textColor: n.textColor,
        bodyColor: n.bodyColor },
      ports: connectable(n.kind || 'step') ? portConf() : undefined,
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
      bold: d.bold, vertical: d.vertical, rx: d.rx });
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
        source: { cell: e.from }, target: { cell: e.to },
        vertices: e.vertices || [],
        router: { name: router },
        attrs: edgeAttrs(dash, e.color, e.width),
        labels: e.label ? [mkLabel(e.label, e.color)] : [],
        data: { dash, color: e.color, width: e.width, router },
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
        let label = '';
        for (const l of (c.getLabels() || [])) {
          const t = l.attrs && l.attrs.label && l.attrs.label.text;
          if (t) { label = t; break; }
        }
        const z = c.getZIndex();
        edges.push(clean({ id: c.id,
          from: c.getSourceCellId(), to: c.getTargetCellId(),
          color: d.color, width: d.width, label,
          dash: dashOf(d.dash !== undefined ? d.dash : d.dashed) === 'solid'
            ? undefined : dashOf(d.dash !== undefined ? d.dash : d.dashed),
          router: routerOf(d.router) === 'normal' ? 'normal' : undefined,
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
    const s = node.getSize();
    if (d.baseW === undefined) { d.baseW = s.width; d.baseH = s.height; }
    const fsz = d.fontSize || meta.fs.body;
    const isD = (d.shape || '') === 'diamond';
    const MAXW = meta.W * 0.42;
    let w = Math.max(s.width, d.baseW), needH = 0;
    for (let i = 0; i < 10; i++) {
      const availW = isD ? w * 0.55 : w - 24;
      const textH = measure(d.lines || [], availW, fsz);
      needH = isD ? textH / 0.55 : textH + 24;
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
  // 连线模式:点目标节点完成;点空白/Esc 取消
  graph.on('node:click', ({ node }) => {
    if (!linkFrom) return;
    if (node.id !== linkFrom && connectable((node.getData() || {}).kind)) {
      graph.addEdge({
        zIndex: 5,
        source: { cell: linkFrom }, target: { cell: node.id },
        router: { name: 'orth' },   // 正交路由自动挑上下左右最优锚边
        attrs: edgeAttrs(false), data: {},
      });
    }
    linkFrom = null;
    cb.onLinkDone();
  });
  graph.on('blank:click', () => {
    if (linkFrom) { linkFrom = null; cb.onLinkDone(); }
  });
  graph.on('node:dblclick', ({ node }) => cb.onNodeDblclick(node));
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
    // 容器还没排好版(0 尺寸)时 zoomToFit 会钳到极小,守卫重试
    if ((!container.clientWidth || !container.clientHeight) && fitTries < 15) {
      fitTries += 1;
      setTimeout(fit, 200);
      return;
    }
    fitTries = 0;
    graph.zoomToFit({ padding: 24, maxScale: 1.5 });
    if (graph.zoom() <= 0.011) setTimeout(() =>
      graph.zoomToFit({ padding: 24, maxScale: 1.5 }), 400);
  }
  function paletteNode(kind) {
    const k = scale();
    const n = { kind, w: 210 * k, h: kind === 'decision' ? 100 * k : 80 * k,
      x: 0, y: 0,
      lines: [kind === 'decision' ? '新判定?' : kind === 'fail' ? '新异常'
              : kind === 'text' ? '双击编辑文字' : '新步骤'],
      fontSize: kind === 'text' ? meta.fs.title : undefined };
    return graph.createNode(nodeConfig(n));
  }
  /* 弹窗提交:一切属性可改。形状类别变了(rect/polygon)就原位重建并保留连线。 */
  function applyNodeEdit(node, draft) {
    const d = node.getData() || {};
    const next = { ...d,
      lines: draft.lines,
      shape: draft.shape,
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
    if (wasPolygon !== willPolygon) {
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
        graph.addEdge({ ...eg, zIndex: 5, router: { name: 'orth' } });
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
    edge.setData({ ...d, dash, dashed: undefined, color, width, router },
      { deep: false });
    edge.setAttrs(edgeAttrs(dash, color, width));
    edge.setLabels(draft.label ? [mkLabel(draft.label, color)] : []);
    edge.setRouter({ name: router });
    if (draft.z !== undefined && draft.z !== '') edge.setZIndex(+draft.z);
  }
  return {
    graph,
    buildFrom, serialize, fit,
    startDnd: (kind, e) => dnd.start(paletteNode(kind), e),
    applyNodeEdit, applyEdgeEdit,
    addEdgeVertex, removeEdgeVertex,
    startLinkFrom: node => { linkFrom = node.id; },
    removeCell: cell => graph.removeCells([cell]),
    undo: () => graph.undo(), redo: () => graph.redo(),
    removeSelected: () => graph.removeCells(graph.getSelectedCells()),
    exportSVG: name => graph.exportSVG(name, { copyStyles: true }),
    dispose: () => graph.dispose(),
  };
}
