/* X6 引擎胶水层:黑白矩形主题。
 * 继承 X6 全量编辑能力;对外暴露纯函数接口,UI 层(React)不直接碰 X6。 */
import { Graph } from '@antv/x6';
import { History } from '@antv/x6-plugin-history';
import { Selection } from '@antv/x6-plugin-selection';
import { Keyboard } from '@antv/x6-plugin-keyboard';
import { Snapline } from '@antv/x6-plugin-snapline';
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

export function createFlowEngine(container, cb) {
  // cb: { onChange(), onNodeDblclick(node), onEdgeDblclick(edge), onKeyToggleSidebar() }
  let meta = { W: 1600, H: 900, fs: { title: 16, body: 13 } };
  let loading = false;

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
  graph.use(new Export());
  const dnd = new Dnd({ target: graph, scaled: false,
    getDropNode: node => node.clone({ keepId: false }) });

  function sw() { return meta.W > 3000 ? 3.5 : 2; }
  function connectable(k) { return !['band', 'pill', 'text'].includes(k); }
  function zOf(kind) {
    return kind === 'band' ? 1 : kind === 'pill' ? 2 : kind === 'text' ? 3 : 10;
  }
  function edgeAttrs(dashed) {
    return { line: {
      stroke: BLACK, strokeWidth: sw(), sourceMarker: null,
      strokeDasharray: dashed ? '8 6' : null,
      targetMarker: { name: 'block', size: 6 + sw() * 2 },
    } };
  }
  function mkLabel(text) {
    return { position: 0.5, attrs: {
      label: { text, fill: BLACK, fontSize: meta.fs.body },
      body: { fill: WHITE, fillOpacity: 0.96, stroke: 'none' },
    } };
  }
  function nodeBody(n) {
    const kind = n.kind || 'step';
    if (kind === 'pill') return { fill: BLACK, stroke: BLACK, strokeWidth: 1 };
    if (kind === 'text') return { fill: 'none', stroke: 'none' };
    if (kind === 'band') return { fill: WHITE, stroke: BLACK, strokeWidth: 1 };
    return { fill: WHITE, stroke: BLACK, strokeWidth: sw() };
  }
  function nodeLabel(n) {
    const kind = n.kind || 'step';
    return {
      text: (n.lines || []).join('\n'),
      fill: kind === 'pill' ? WHITE : BLACK,
      fontSize: n.fontSize || meta.fs.body,
      fontWeight: n.bold ? 600 : 400,
      textWrap: { width: -16, height: '80%', breakWord: true, ellipsis: false },
    };
  }
  function portConf() {
    const r = meta.W > 3000 ? 10 : 6;
    const g = pos => ({ position: pos,
      attrs: { rect: { magnet: true, stroke: BLACK, fill: WHITE,
        strokeWidth: 1.5, width: r * 2, height: r * 2,
        x: -r, y: -r } } });
    return {
      groups: { l: g('left'), r: g('right'), t: g('top'), b: g('bottom') },
      items: [{ group: 'l', id: 'pl' }, { group: 'r', id: 'pr' },
              { group: 't', id: 'pt' }, { group: 'b', id: 'pb' }],
    };
  }
  function nodeConfig(n) {
    return clean({
      id: n.id, shape: 'rect',
      x: n.x, y: n.y, width: n.w, height: n.h,
      zIndex: zOf(n.kind),
      attrs: { body: nodeBody(n), label: nodeLabel(n) },
      data: { kind: n.kind || 'step', lines: n.lines || [],
        fontSize: n.fontSize, bold: n.bold, vertical: n.vertical, rx: n.rx,
        fill: n.fill, stroke: n.stroke, textColor: n.textColor,
        bodyColor: n.bodyColor },   // 原色彩字段随 data 透传,JSON 往返不丢
      ports: connectable(n.kind || 'step') ? portConf() : undefined,
    });
  }
  function refreshNodeView(node) {
    const d = node.getData() || {};
    node.setAttrs({ body: nodeBody(d), label: nodeLabel(d) });
  }

  /* ---------- 构建/序列化 ---------- */
  function buildFrom(doc) {
    loading = true;
    meta = doc.meta;
    graph.disableHistory();
    graph.clearCells();
    for (const n of doc.nodes) graph.addNode(nodeConfig(n));
    for (const e of doc.edges) {
      graph.addEdge({
        id: e.id, zIndex: 5,
        source: { cell: e.from }, target: { cell: e.to },
        vertices: e.vertices || [],
        router: { name: 'orth' },
        attrs: edgeAttrs(!!e.dashed),
        labels: e.label ? [mkLabel(e.label)] : [],
        data: { dashed: !!e.dashed, color: e.color },
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
        let label = '';
        for (const l of (c.getLabels() || [])) {
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
    const MAXW = meta.W * 0.42;
    let w = Math.max(s.width, d.baseW), needH = 0;
    for (let i = 0; i < 10; i++) {
      needH = measure(d.lines || [], w - 24, fsz) + 24;
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
        d: `M -${ar} -${ar * 0.75} ${ar} 0 -${ar} ${ar * 0.75} Z`,
        fill: BLACK } } },
      { name: 'target-arrowhead', args: { attrs: {
        d: `M -${ar} -${ar * 0.75} ${ar} 0 -${ar} ${ar * 0.75} Z`,
        fill: BLACK } } },
    ]);
  }

  /* ---------- 事件 ---------- */
  const emitChange = () => { if (!loading) cb.onChange(); };
  graph.on('cell:changed', emitChange);
  graph.on('cell:added', emitChange);
  graph.on('cell:removed', emitChange);
  graph.on('edge:selected', ({ edge }) => edgeTools(edge));
  graph.on('edge:unselected', ({ edge }) => edge.removeTools());
  let scaleTimer = null;
  graph.on('scale', () => {
    clearTimeout(scaleTimer);
    scaleTimer = setTimeout(() => {
      graph.getSelectedCells().forEach(c => { if (c.isEdge()) edgeTools(c); });
    }, 120);
  });
  graph.on('edge:contextmenu', ({ edge, e, x, y }) => {
    e.preventDefault();
    const vs = (edge.getVertices() || []).slice();
    const scale = graph.zoom();
    const hitIdx = vs.findIndex(v => Math.hypot(v.x - x, v.y - y) * scale <= 14);
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
  graph.on('node:dblclick', ({ node }) => cb.onNodeDblclick(node));
  graph.on('edge:dblclick', ({ edge }) => cb.onEdgeDblclick(edge));
  graph.bindKey(['meta+z', 'ctrl+z'], () => { graph.undo(); return false; });
  graph.bindKey(['meta+shift+z', 'ctrl+shift+z', 'ctrl+y'],
    () => { graph.redo(); return false; });
  graph.bindKey(['backspace', 'del'], () => {
    graph.removeCells(graph.getSelectedCells());
    return false;
  });
  graph.bindKey(['meta+b', 'ctrl+b'], () => { cb.onKeyToggleSidebar(); return false; });

  /* ---------- 对外 API ---------- */
  function fit() { graph.zoomToFit({ padding: 24, maxScale: 1.5 }); }
  function paletteNode(kind) {
    const k = meta.W > 3000 ? 1.6 : 1;
    const w = 210 * k, h = 80 * k;
    const n = { kind, w, h,
      lines: [kind === 'decision' ? '新判定?' : kind === 'fail' ? '新异常'
              : kind === 'text' ? '双击编辑文字' : '新步骤'],
      fontSize: kind === 'text' ? meta.fs.title : undefined };
    return graph.createNode(nodeConfig({ ...n, x: 0, y: 0 }));
  }
  function applyNodeEdit(node, { lines, w, h }) {
    const d = node.getData() || {};
    const sizeTouched = w && h &&
      (Math.round(w) !== Math.round(node.getSize().width) ||
       Math.round(h) !== Math.round(node.getSize().height));
    node.setData({ ...d, lines }, { deep: false });
    if (sizeTouched) {
      const dd = node.getData();
      dd.baseW = Math.round(w); dd.baseH = Math.round(h);
      node.resize(Math.round(w), Math.round(h));
    }
    refreshNodeView(node);
    autoSize(node);
    refreshNodeView(node);
  }
  function applyEdgeEdit(edge, { label, dashed }) {
    const d = edge.getData() || {};
    edge.setData({ ...d, dashed: !!dashed }, { deep: false });
    edge.setAttrs(edgeAttrs(!!dashed));
    edge.setLabels(label ? [mkLabel(label)] : []);
  }
  return {
    graph,
    buildFrom, serialize, fit,
    startDnd: (kind, e) => dnd.start(paletteNode(kind), e),
    applyNodeEdit, applyEdgeEdit,
    undo: () => graph.undo(), redo: () => graph.redo(),
    removeSelected: () => graph.removeCells(graph.getSelectedCells()),
    exportSVG: name => graph.exportSVG(name, { copyStyles: true }),
    dispose: () => graph.dispose(),
  };
}
