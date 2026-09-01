/* 主应用:文件加载/保存(10s 自动) + 画布(X6 引擎) + 弹窗编辑 + JSON 面板。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createFlowEngine } from './graph.js';
import Sidebar from './Sidebar.jsx';
import Modal from './Modal.jsx';

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
  const [modal, setModal] = useState(null);   // {type:'node'|'edge', cell, draft:{}}
  const modalRef = useRef(null);
  modalRef.current = modal;

  const refreshJSON = useCallback(() => {
    if (docRef.current) setJsonText(JSON.stringify(docRef.current, null, 1));
  }, []);

  /* ---------- 变更提交:即时进 localStorage,10 秒一次推服务器 ---------- */
  const commitTimer = useRef(null);
  const commit = useCallback(() => {
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      const eng = engineRef.current;
      if (!eng) return;
      docRef.current = eng.serialize();
      localStorage.setItem('jfe:' + curRef.current, JSON.stringify(docRef.current));
      dirtyRef.current = true;
      setStatus('已改(本地,待自动保存)');
      refreshJSON();
    }, 120);
  }, [refreshJSON]);

  const pushServer = useCallback(silent => {
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
    // 后台定时器会被浏览器节流:切后台/关页时立即兜底保存
    const onVis = () => {
      if (document.hidden && dirtyRef.current && docRef.current) {
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
      onNodeDblclick: node => {
        const d = node.getData() || {};
        const s = node.getSize();
        setModal({ type: 'node', cell: node, draft: {
          text: (d.lines || []).join('\n'),
          w: Math.round(s.width), h: Math.round(s.height) } });
      },
      onEdgeDblclick: edge => {
        const d = edge.getData() || {};
        let label = '';
        for (const l of (edge.getLabels() || [])) {
          const t = l.attrs && l.attrs.label && l.attrs.label.text;
          if (t) { label = t; break; }
        }
        setModal({ type: 'edge', cell: edge,
          draft: { label, dashed: !!d.dashed } });
      },
      onKeyToggleSidebar: () => setCollapsed(v => !v),
    });
    engineRef.current = eng;
    window.__jfe = { graph: () => eng.graph, doc: () => docRef.current };
    load(curRef.current);
    fetch('api/list?t=' + Date.now())
      .then(r => { if (!r.ok) throw 0; return r.json(); })
      .then(setFiles)
      .catch(() => {});
    return () => eng.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(id) {
    curRef.current = id;
    setCur(id);
    const eng = engineRef.current;
    const draft = localStorage.getItem('jfe:' + id);
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

  /* ---------- 弹窗提交 ---------- */
  function modalOk() {
    const m = modalRef.current;
    if (!m) return;
    const eng = engineRef.current;
    if (m.type === 'node') {
      const lines = m.draft.text.split('\n').map(x => x.trim()).filter(Boolean);
      if (lines.length)
        eng.applyNodeEdit(m.cell, { lines, w: +m.draft.w, h: +m.draft.h });
    } else {
      eng.applyEdgeEdit(m.cell, { label: m.draft.label.trim(), dashed: m.draft.dashed });
    }
    setModal(null);
  }

  /* ---------- 侧栏动作 ---------- */
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
      localStorage.removeItem('jfe:' + curRef.current);
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
      localStorage.setItem('jfe:' + curRef.current, JSON.stringify(d));
      engineRef.current.buildFrom(d);
      commit();
    }).catch(e => alert('导入失败: ' + e.message));
    ev.target.value = '';
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
      <div className="canvas" ref={canvasRef} />
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
      {modal && modal.type === 'node' && (
        <Modal title="编辑节点" onOk={modalOk} onCancel={() => setModal(null)}>
          <label className="fld">文本(每行一条,自动扩容包住文字)
            <textarea autoFocus rows={8} value={modal.draft.text}
              onChange={e => upd({ text: e.target.value })} />
          </label>
          <div className="fld-row">
            <label className="fld">宽
              <input type="number" value={modal.draft.w}
                onChange={e => upd({ w: e.target.value })} />
            </label>
            <label className="fld">高
              <input type="number" value={modal.draft.h}
                onChange={e => upd({ h: e.target.value })} />
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
          <label className="fld fld-check">
            <input type="checkbox" checked={modal.draft.dashed}
              onChange={e => upd({ dashed: e.target.checked })} />
            虚线
          </label>
        </Modal>
      )}
      <input ref={fileInputRef} type="file" accept=".json"
        style={{ display: 'none' }} onChange={onImportFile} />
    </div>
  );
}
