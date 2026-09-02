/* 主应用:文件加载/保存(10s 自动+兜底) + 画布(X6) + 弹窗改一切属性 + 右键菜单 + JSON 面板。 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createFlowEngine } from './graph.js';
import Sidebar from './Sidebar.jsx';
import '../node_modules/@univerjs/preset-sheets-core/lib/index.css';   // Univer 样式随主包;脚本按需加载
const SheetView = lazy(() => import('./SheetView.jsx'));
import Modal from './Modal.jsx';

const DRAFT_V = 'jfe:v2:';   // 改版即失效旧草稿(黑白版草稿丢了颜色)

const FALLBACK_FILES = [          // 兜底列表也按新→旧
  { id: 'optimized', title: '优化版五阶段' },
  { id: 'final', title: '终版五阶段' },
  { id: 'swimlane', title: '早版六泳道' },
];

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const docRef = useRef(null);
  // URL 参数:?file=<id> 打开指定图;?embed=1 嵌入模式(给方案/文档 iframe 用:侧栏收起,不露编辑器壳)
  const params = new URLSearchParams(location.search);
  const embed = params.get('embed') === '1';
  // 打开哪张图:URL ?file= > 这台终端上次看的(localStorage) > 列表里最新的一张。每台终端各记各的。
  const okId = v => /^[a-z0-9_-]{1,40}$/.test(v || '');
  const urlFile = okId(params.get('file')) ? params.get('file') : null;
  const remembered = (() => { try { const v = localStorage.getItem('jfe:lastFile'); return okId(v) ? v : null; } catch { return null; } })();
  const initFile = urlFile || remembered || 'final';
  const explicitFile = !!urlFile;
  const curRef = useRef(initFile);
  const dirtyRef = useRef(false);

  const [files, setFiles] = useState(FALLBACK_FILES);
  const [cur, setCur] = useState(initFile);
  const [status, setStatus] = useState('');
  const [sheet, setSheet] = useState(null);      // 当前打开的是 Excel 文档(xlsx)时 = 文件 id
  const sheetRef = useRef(null);
  const [collapsed, setCollapsed] = useState(embed);
  const [sideW, setSideW] = useState(() => {
    const v = +localStorage.getItem('jfe:sidew');
    return v >= 160 && v <= 640 ? v : 224;
  });
  const [modal, setModal] = useState(null);     // {type, cell, draft}
  const [ctxMenu, setCtxMenu] = useState(null); // {x,y,kind,cell,gx,gy,hitIdx}
  const [linking, setLinking] = useState(false);
  const [selected, setSelected] = useState(null);   // 选中的节点(右侧面板显示用例规约)
  const [, forceTick] = useState(0);
  const modalRef = useRef(null);
  modalRef.current = modal;

  const commitTimer = useRef(null);
  const commit = useCallback(() => {
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      const eng = engineRef.current;
      if (!eng) return;
      docRef.current = eng.serialize();
      if (sheetRef.current) return;   // Excel 文档不走图草稿
      localStorage.setItem(DRAFT_V + curRef.current, JSON.stringify({ savedAt: Date.now(), doc: docRef.current }));
      dirtyRef.current = true;
      setStatus('已改(本地,待自动保存)');
    }, 120);
  }, []);

  const autosaveRef = useRef(true);   // 自动化测试可用 __jfe.autosave(false) 关掉,防止把测试涂改写进 data/
  const pushServer = useCallback(silent => {
    if (!autosaveRef.current) { setStatus('自动保存已关(测试模式)'); return Promise.resolve(); }
    return fetch('api/save', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: curRef.current, data: docRef.current }) })
      .then(r => { if (!r.ok) throw 0; setStatus('已保存到服务器 ✓'); })
      .catch(() => {
        if (!silent) alert('保存失败:当前不是可写服务。JSON 在浏览器本地,可导出。');
        setStatus('仅本地(服务器不可写)');
      });
  }, []);

  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current && docRef.current) {
        dirtyRef.current = false;
        pushServer(true);
      }
    };
    const t = setInterval(flush, 10000);   // 前台:10 秒一次自动保存
    const onVis = () => {                  // 后台节流兜底:切后台/关页立即保存
      if (document.hidden && dirtyRef.current && docRef.current && autosaveRef.current) {
        dirtyRef.current = false;
        navigator.sendBeacon('api/save', new Blob(
          [JSON.stringify({ id: curRef.current, data: docRef.current })],
          { type: 'application/json' }));
        setStatus('已保存到服务器 ✓');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onVis);
    };
  }, [pushServer]);

  /* ---------- 引擎 ---------- */
  useEffect(() => {
    const eng = createFlowEngine(canvasRef.current, {
      onChange: commit,
      onNodeDblclick: openNodeModal,
      onNodeSelected: node => setSelected(node),
      onViewChange: v => { try { localStorage.setItem('jfe:view:' + curRef.current, JSON.stringify(v)); } catch {} },
      onEdgeDblclick: openEdgeModal,
      onNodeContextMenu: (node, pos) =>
        setCtxMenu({ ...pos, kind: 'node', cell: node }),
      onEdgeContextMenu: (edge, pos, info) =>
        setCtxMenu({ ...pos, ...info, kind: 'edge', cell: edge }),
      onLinkDone: () => setLinking(false),
      onKeyToggleSidebar: () => setCollapsed(v => !v),
    });
    engineRef.current = eng;
    window.__jfe = { graph: () => eng.graph, doc: () => docRef.current, serialize: () => eng.serializeNow(),
      autosave: v => { autosaveRef.current = v !== false; return autosaveRef.current; } };
    // 只清理旧版的「jfe:<图 id>」草稿。不要用宽泛的 jfe: 前缀，
    // 否则会误删当前版本的 lastFile、view:<id> 和 sidew，刷新后终端记忆全部丢失。
    Object.keys(localStorage)
      .filter(k => /^jfe:[a-z0-9_-]{1,40}$/.test(k) && !k.startsWith(DRAFT_V)
        && k !== 'jfe:lastFile' && k !== 'jfe:sidew')
      .forEach(k => localStorage.removeItem(k));
    load(curRef.current);
    fetch('api/list?t=' + Date.now())
      .then(r => { if (!r.ok) throw 0; return r.json(); })
      .then(list => {
        setFiles(list);
        // 没在 URL 里指定文件时:记忆的文件已不存在,或根本没记忆(首次访问) → 打开列表最新的一张
        if (!explicitFile && list.length && !list.some(f => f.id === curRef.current)) load(list[0].id);
        else if (!explicitFile && !remembered && list.length && list[0].id !== curRef.current) load(list[0].id);
      })
      .catch(() => {});
    const closeMenu = () => setCtxMenu(null);
    window.addEventListener('mousedown', closeMenu);
    return () => { window.removeEventListener('mousedown', closeMenu); eng.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNodeModal(node) {
    const d = node.getData() || {};
    const a = node.getAttrs() || {};
    const s = node.getSize();
    setModal({ type: 'node', cell: node, draft: {
      text: (d.lines || []).join('\n'),
      shape: d.shape || 'rounded',
      w: Math.round(s.width), h: Math.round(s.height),
      rx: d.rx !== undefined ? d.rx : '',
      z: d.z !== undefined ? d.z : (node.getZIndex() ?? ''),
      fill: (a.body && a.body.fill && a.body.fill !== 'none') ? a.body.fill : '#ffffff',
      stroke: (a.body && a.body.stroke && a.body.stroke !== 'none') ? a.body.stroke : '#000000',
      textColor: (a.label && a.label.fill) || '#000000',
      fontSize: (a.label && a.label.fontSize) || 13,
      bold: !!d.bold,
      spec: d.spec ? { ...d.spec } : (d.kind === 'usecase' ? { id: '', co: '', trigger: '', pre: '', flow: '', alt: '', priority: 'P0' } : undefined),
      kind: d.kind,
    } });
  }
  const STATUS_COLOR = { done: ['#e3f1ec', '#1e755d'], part: ['#f8eedc', '#a1691a'], todo: ['#ffffff', '#48586a'], out: ['#eef0f2', '#9aa4ae'] };
  function openEdgeModal(edge) {
    const d = edge.getData() || {};
    const a = edge.getAttrs() || {};
    let label = '';
    for (const l of (edge.getLabels() || [])) {
      const t = l.attrs && l.attrs.label && l.attrs.label.text;
      if (t) { label = t; break; }
    }
    const dash = d.dash || (d.dashed ? 'dashed' : 'solid');
    setModal({ type: 'edge', cell: edge, draft: {
      label,
      color: d.color || (a.line && a.line.stroke) || '#526078',
      width: d.width || (a.line && a.line.strokeWidth) || 2,
      dash,
      arrow: d.arrow || 'block',
      router: d.router === 'normal' || d.router === 'manhattan' ? d.router : 'orth',
      z: edge.getZIndex() ?? 5,
    } });
  }

  const savedView = id => { try { const v = JSON.parse(localStorage.getItem('jfe:view:' + id) || 'null'); return v && v.zoom ? v : null; } catch { return null; } };
  function load(id) {
    curRef.current = id;
    setCur(id);
    try { localStorage.setItem('jfe:lastFile', id); } catch {}
    if (!embed) { const u = new URL(location.href); u.searchParams.set('file', id); history.replaceState(null, '', u); }   // 刷新也回到这张图
    const eng = engineRef.current;
    const view = savedView(id);
    const build = d => { eng.buildFrom(d, { keepView: !!view }); if (view) eng.setView(view); };
    sheetRef.current = null; setSheet(null);
    let draft = null;
    try { const p = JSON.parse(localStorage.getItem(DRAFT_V + id)); draft = p && p.doc ? p : (p && p.nodes ? { savedAt: 0, doc: p } : null); } catch { draft = null; }
    fetch('data/' + id + '.json?t=' + Date.now())
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json().then(d => ({ d, lm: Date.parse(r.headers.get('Last-Modified') || '') || 0 })); })
      .then(({ d, lm }) => {
        // 本地草稿只在比服务器文件新的时候才用;服务器文件更新过(重新生成 / 别的终端改过)就丢掉旧草稿,别把旧稿倒灌回服务器
        if (draft && draft.savedAt > lm) { docRef.current = draft.doc; build(draft.doc); setStatus('本地草稿'); return; }
        if (draft) localStorage.removeItem(DRAFT_V + id);
        docRef.current = d; build(d); setStatus('已加载');
      })
      .catch(err => {
        if (String(err && err.message) === '404') { sheetRef.current = id; setSheet(id); setStatus('Excel'); return; }   // 没有 .json 的是 Excel 文档
        if (draft) { docRef.current = draft.doc; build(draft.doc); setStatus('本地草稿(离线)'); return; }
        setStatus('数据加载失败');
      });
  }

  function modalOk() {
    const m = modalRef.current;
    if (!m) return;
    const eng = engineRef.current;
    if (m.type === 'node') {
      const lines = m.draft.text.split('\n').map(x => x.trim()).filter(Boolean);
      const draft = { ...m.draft };
      if (lines.length) eng.applyNodeEdit(m.cell, { ...draft, lines });
      forceTick(t => t + 1);
    } else {
      eng.applyEdgeEdit(m.cell, { ...m.draft, label: m.draft.label.trim() });
    }
    setModal(null);
  }

  /* 右键菜单动作(节点与连线共用一套) */
  function menuAct(act) {
    const m = ctxMenu;
    setCtxMenu(null);
    if (!m) return;
    const eng = engineRef.current;
    if (act === 'link') {
      eng.startLinkFrom(m.cell);
      setLinking(true);
      setStatus('连线模式:点击目标元素(Esc 取消)');
    } else if (act === 'edit') {
      if (m.kind === 'edge') openEdgeModal(m.cell); else openNodeModal(m.cell);
    } else if (act === 'del') eng.removeCell(m.cell);
    else if (act === 'vtx-add') eng.addEdgeVertex(m.cell, m.gx, m.gy);
    else if (act === 'vtx-del') eng.removeEdgeVertex(m.cell, m.hitIdx);
  }

  const upd = patch => setModal(m => ({ ...m, draft: { ...m.draft, ...patch } }));

  /* 侧栏右缘拖拽改宽度(160~640,记在 localStorage;画布同步重算尺寸) */
  const [dragging, setDragging] = useState(false);
  function startSideDrag(ev) {
    ev.preventDefault();
    setDragging(true);
    const move = e => {
      const w = Math.max(160, Math.min(640, e.clientX));
      setSideW(w);
      if (engineRef.current) engineRef.current.resize();
    };
    const up = e => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setDragging(false);
      const w = Math.max(160, Math.min(640, e.clientX));
      setSideW(w);                     // 松手时把状态和存盘值对齐(夹紧后可能与最后一次 move 不同)
      localStorage.setItem('jfe:sidew', String(w));
      if (engineRef.current) engineRef.current.resize();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  return (
    <div className={'app' + (collapsed ? ' side-collapsed' : '') + (dragging ? ' resizing' : '') + (embed ? ' embed' : '')}
      style={{ '--side-w': sideW + 'px' }}>
      <Sidebar files={files} cur={cur} collapsed={collapsed}
        onOpenFile={id => { if (id !== cur) load(id); }}
        onDragElement={(kind, e) => engineRef.current.startDnd(kind, e.nativeEvent || e)}
        onRelationPreset={st => { engineRef.current.setNewEdgeStyle(st); setStatus('新连线样式:' + (st.label || (st.arrow === 'none' ? '关联' : st.arrow === 'hollow' ? '泛化' : '流程箭头'))); }} />
      <div className={'side-resizer' + (dragging ? ' dragging' : '')}
        title="左右拖动改变侧栏宽度(双击复位)" onMouseDown={startSideDrag}
        onDoubleClick={() => { setSideW(224); localStorage.setItem('jfe:sidew', '224');
          if (engineRef.current) engineRef.current.resize(); }} />
      <div className="sidebar-toggle" title="收起/展开侧栏 (⌘B)"
        onClick={() => setCollapsed(v => !v)}>{collapsed ? '⟩' : '⟨'}</div>
      <div className="canvas-wrap">
        <div className={'canvas' + (linking ? ' linking' : '')} ref={canvasRef} />
        {sheet && <Suspense fallback={<div className="sheet-host sheet-loading">正在加载 Excel 组件…</div>}><SheetView id={sheet} onStatus={setStatus} /></Suspense>}
      </div>
      {selected && (selected.getData() || {}).spec && (
        <aside className="detail" onMouseDown={e => e.stopPropagation()}>
          {(() => { const d = selected.getData() || {}; const sp = d.spec || {}; const ST = { done: '已实现', part: '部分', todo: '待做', out: '不入一期' }; return (
            <>
              <div className="detail-head">
                <div className="detail-kicker">{sp.id || '用例'} · {sp.priority || ''}</div>
                <div className="detail-title">{(d.lines || [])[0]}</div>
              </div>
              {[['co', '协同角色'], ['trigger', '触发'], ['pre', '前置条件'], ['flow', '主流程'], ['alt', '异常 / 分支']].map(([k, name]) => (
                <div className="detail-row" key={k}><div className="detail-k">{name}</div><div className="detail-v">{sp[k] || '—'}</div></div>
              ))}
              <button className="btn" onClick={() => openNodeModal(selected)}>编辑规约…</button>
            </>
          ); })()}
        </aside>
      )}
      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={e => e.stopPropagation()}>
          {ctxMenu.kind === 'node' ? (
            <>
              <div className="ctx-item" onClick={() => menuAct('link')}>连线 →</div>
              <div className="ctx-item" onClick={() => menuAct('edit')}>修改属性…</div>
              <div className="ctx-sep" />
              <div className="ctx-item" onClick={() => menuAct('del')}>删除</div>
            </>
          ) : (
            <>
              {ctxMenu.hitIdx >= 0
                ? <div className="ctx-item" onClick={() => menuAct('vtx-del')}>
                    删除此控制点</div>
                : <div className="ctx-item" onClick={() => menuAct('vtx-add')}>
                    在此加控制点</div>}
              <div className="ctx-item" onClick={() => menuAct('edit')}>修改属性…</div>
              <div className="ctx-sep" />
              <div className="ctx-item" onClick={() => menuAct('del')}>删除连线</div>
            </>
          )}
        </div>
      )}
      {modal && modal.type === 'node' && (
        <Modal title="编辑节点" onOk={modalOk} onCancel={() => setModal(null)}>
          <label className="fld">文本(每行一条;长文自动扩容包住文字)
            <textarea autoFocus rows={6} value={modal.draft.text}
              onChange={e => upd({ text: e.target.value })} />
          </label>
          <div className="fld-row">
            <label className="fld">形状
              <select value={modal.draft.shape}
                onChange={e => upd({ shape: e.target.value })}>
                <option value="rounded">圆角矩形(默认)</option>
                <option value="rect">直角矩形</option>
                <option value="diamond">菱形</option>
                <option value="ellipse">椭圆(用例)</option>
                <option value="actor">火柴人(角色)</option>
              </select>
            </label>
            <label className="fld">圆角
              <input type="number" placeholder="默认" value={modal.draft.rx}
                disabled={modal.draft.shape === 'diamond'}
                onChange={e => upd({ rx: e.target.value })} />
            </label>
          </div>
          <div className="fld-row">
            <label className="fld">宽
              <input type="number" value={modal.draft.w}
                onChange={e => upd({ w: e.target.value })} />
            </label>
            <label className="fld">高
              <input type="number" value={modal.draft.h}
                onChange={e => upd({ h: e.target.value })} />
            </label>
            <label className="fld">字号
              <input type="number" value={modal.draft.fontSize}
                onChange={e => upd({ fontSize: e.target.value })} />
            </label>
            <label className="fld">层级
              <input type="number" value={modal.draft.z}
                onChange={e => upd({ z: e.target.value })} />
            </label>
          </div>
          {modal.draft.spec && (
            <div className="spec-fields">
              <div className="spec-title">用例规约（图上不铺开，选中节点在右侧看）</div>
              <div className="fld-row">
                <label className="fld">编号
                  <input value={modal.draft.spec.id || ''} onChange={e => upd({ spec: { ...modal.draft.spec, id: e.target.value } })} />
                </label>
                <label className="fld">优先级
                  <select value={modal.draft.spec.priority || 'P0'} onChange={e => upd({ spec: { ...modal.draft.spec, priority: e.target.value } })}>
                    <option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option>
                  </select>
                </label>
              </div>
              {[['co', '协同角色'], ['trigger', '触发'], ['pre', '前置条件'], ['flow', '主流程'], ['alt', '异常 / 分支']].map(([k, name]) => (
                <label className="fld" key={k}>{name}
                  <textarea rows={2} value={modal.draft.spec[k] || ''} onChange={e => upd({ spec: { ...modal.draft.spec, [k]: e.target.value } })} />
                </label>
              ))}
            </div>
          )}
          <div className="fld-row">
            <label className="fld">填充色
              <input type="color" value={modal.draft.fill}
                onChange={e => upd({ fill: e.target.value })} />
            </label>
            <label className="fld">边框色
              <input type="color" value={modal.draft.stroke}
                onChange={e => upd({ stroke: e.target.value })} />
            </label>
            <label className="fld">文字色
              <input type="color" value={modal.draft.textColor}
                onChange={e => upd({ textColor: e.target.value })} />
            </label>
            <label className="fld fld-check">
              <input type="checkbox" checked={modal.draft.bold}
                onChange={e => upd({ bold: e.target.checked })} />
              加粗
            </label>
          </div>
        </Modal>
      )}
      {modal && modal.type === 'edge' && (
        <Modal title="编辑连线" onOk={modalOk} onCancel={() => setModal(null)}>
          <label className="fld">标签
            <input autoFocus value={modal.draft.label}
              onChange={e => upd({ label: e.target.value })} />
          </label>
          <div className="fld-row">
            <label className="fld">线型
              <select value={modal.draft.dash}
                onChange={e => upd({ dash: e.target.value })}>
                <option value="solid">实线</option>
                <option value="dashed">虚线</option>
                <option value="dotted">点线</option>
              </select>
            </label>
            <label className="fld">箭头
              <select value={modal.draft.arrow}
                onChange={e => upd({ arrow: e.target.value })}>
                <option value="block">实心(流程)</option>
                <option value="classic">细箭头(包含/扩展)</option>
                <option value="hollow">空心三角(泛化)</option>
                <option value="none">无箭头(关联)</option>
              </select>
            </label>
            <label className="fld">走线
              <select value={modal.draft.router}
                onChange={e => upd({ router: e.target.value })}>
                <option value="orth">正交折线(默认)</option>
                <option value="normal">直连</option>
                <option value="manhattan">避障折线(绕开挡路的元素)</option>
              </select>
            </label>
          </div>
          <div className="fld-row">
            <label className="fld">颜色
              <input type="color" value={modal.draft.color}
                onChange={e => upd({ color: e.target.value })} />
            </label>
            <label className="fld">粗细
              <input type="number" step="0.5" value={modal.draft.width}
                onChange={e => upd({ width: e.target.value })} />
            </label>
            <label className="fld">层级
              <input type="number" value={modal.draft.z}
                onChange={e => upd({ z: e.target.value })} />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
