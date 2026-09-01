/* 主应用:文件加载/保存(10s 自动+兜底) + 画布(X6) + 弹窗改一切属性 + 右键菜单 + JSON 面板。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createFlowEngine } from './graph.js';
import Sidebar from './Sidebar.jsx';
import Modal from './Modal.jsx';

const DRAFT_V = 'jfe:v2:';   // 改版即失效旧草稿(黑白版草稿丢了颜色)

const FALLBACK_FILES = [
  { id: 'final', title: '终版五阶段' },
  { id: 'swimlane', title: '早版六泳道' },
];

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const docRef = useRef(null);
  const curRef = useRef('final');
  const dirtyRef = useRef(false);
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState(FALLBACK_FILES);
  const [cur, setCur] = useState('final');
  const [status, setStatus] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [showJSON, setShowJSON] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [modal, setModal] = useState(null);     // {type, cell, draft}
  const [ctxMenu, setCtxMenu] = useState(null); // {x,y,kind,cell,gx,gy,hitIdx}
  const [linking, setLinking] = useState(false);
  const modalRef = useRef(null);
  modalRef.current = modal;

  const refreshJSON = useCallback(() => {
    if (docRef.current) setJsonText(JSON.stringify(docRef.current, null, 1));
  }, []);

  const commitTimer = useRef(null);
  const commit = useCallback(() => {
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      const eng = engineRef.current;
      if (!eng) return;
      docRef.current = eng.serialize();
      localStorage.setItem(DRAFT_V + curRef.current, JSON.stringify(docRef.current));
      dirtyRef.current = true;
      setStatus('已改(本地,待自动保存)');
      refreshJSON();
    }, 120);
  }, [refreshJSON]);

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
      onEdgeDblclick: openEdgeModal,
      onNodeContextMenu: (node, pos) =>
        setCtxMenu({ ...pos, kind: 'node', cell: node }),
      onEdgeContextMenu: (edge, pos, info) =>
        setCtxMenu({ ...pos, ...info, kind: 'edge', cell: edge }),
      onLinkDone: () => setLinking(false),
      onKeyToggleSidebar: () => setCollapsed(v => !v),
    });
    engineRef.current = eng;
    window.__jfe = { graph: () => eng.graph, doc: () => docRef.current,
      autosave: v => { autosaveRef.current = v !== false; return autosaveRef.current; } };
    Object.keys(localStorage).filter(k => k.startsWith('jfe:') && !k.startsWith(DRAFT_V))
      .forEach(k => localStorage.removeItem(k));   // 清理上一代草稿
    load(curRef.current);
    fetch('api/list?t=' + Date.now())
      .then(r => { if (!r.ok) throw 0; return r.json(); })
      .then(setFiles)
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
    } });
  }
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
      router: d.router === 'normal' ? 'normal' : 'orth',
      z: edge.getZIndex() ?? 5,
    } });
  }

  function load(id) {
    curRef.current = id;
    setCur(id);
    const eng = engineRef.current;
    const draft = localStorage.getItem(DRAFT_V + id);
    if (draft) {
      docRef.current = JSON.parse(draft);
      eng.buildFrom(docRef.current);
      setStatus('本地草稿');
      refreshJSON();
      return;
    }
    fetch('data/' + id + '.json?t=' + Date.now())
      .then(r => r.json())
      .then(d => {
        docRef.current = d;
        eng.buildFrom(d);
        setStatus('已加载');
        refreshJSON();
      })
      .catch(() => setStatus('数据加载失败'));
  }

  function modalOk() {
    const m = modalRef.current;
    if (!m) return;
    const eng = engineRef.current;
    if (m.type === 'node') {
      const lines = m.draft.text.split('\n').map(x => x.trim()).filter(Boolean);
      if (lines.length) eng.applyNodeEdit(m.cell, { ...m.draft, lines });
    } else {
      eng.applyEdgeEdit(m.cell, { ...m.draft, label: m.draft.label.trim() });
    }
    setModal(null);
  }

  function onAction(act) {
    const eng = engineRef.current;
    if (act === 'fit') eng.fit();
    else if (act === 'json') { setShowJSON(v => !v); refreshJSON(); }
    else if (act === 'export') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(
        [JSON.stringify(docRef.current, null, 1)], { type: 'application/json' }));
      a.download = curRef.current + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (act === 'import') fileInputRef.current.click();
    else if (act === 'svg') eng.exportSVG(curRef.current + '-flow.svg');
    else if (act === 'reset') {
      if (!confirm('丢弃本图全部修改,重置为服务器上的版本?')) return;
      localStorage.removeItem(DRAFT_V + curRef.current);
      load(curRef.current);
    }
  }
  function onImportFile(ev) {
    const f = ev.target.files[0];
    if (!f) return;
    f.text().then(txt => {
      const d = JSON.parse(txt);
      if (!d.meta || !d.nodes || !d.edges) throw new Error('缺 meta/nodes/edges');
      docRef.current = d;
      localStorage.setItem(DRAFT_V + curRef.current, JSON.stringify(d));
      engineRef.current.buildFrom(d);
      commit();
    }).catch(e => alert('导入失败: ' + e.message));
    ev.target.value = '';
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

  return (
    <div className={'app' + (collapsed ? ' side-collapsed' : '')}>
      <Sidebar files={files} cur={cur} status={status} collapsed={collapsed}
        onOpenFile={id => { if (id !== cur) load(id); }}
        onDragElement={(kind, e) => engineRef.current.startDnd(kind, e.nativeEvent || e)}
        onAction={onAction} />
      <div className="sidebar-toggle" title="收起/展开侧栏 (⌘B)"
        onClick={() => setCollapsed(v => !v)}>{collapsed ? '⟩' : '⟨'}</div>
      <div className={'canvas' + (linking ? ' linking' : '')} ref={canvasRef} />
      {showJSON && (
        <div className="json-panel">
          <div className="jp-head">实时 JSON(编辑即更新)
            <button className="btn btn-ghost btn-xs" onClick={() =>
              navigator.clipboard.writeText(jsonText).then(() => setStatus('JSON 已复制'))}>
              复制</button>
          </div>
          <pre className="jp-view">{jsonText}</pre>
        </div>
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
            <label className="fld">走线
              <select value={modal.draft.router}
                onChange={e => upd({ router: e.target.value })}>
                <option value="orth">正交折线(默认)</option>
                <option value="normal">直连</option>
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
      <input ref={fileInputRef} type="file" accept=".json"
        style={{ display: 'none' }} onChange={onImportFile} />
    </div>
  );
}
