/* VS Code 式左侧栏:文件浏览器(可折叠) + 元素面板(拖到画布) + 底部操作。黑白。 */
import { useState } from 'react';

function Section({ title, tip, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sec">
      <div className="sec-head" onClick={() => setOpen(!open)}>
        <span className="tri">{open ? '▾' : '▸'}</span>{title}
        {tip && <span className="sec-tip">{tip}</span>}
      </div>
      {open && <div className="sec-body">{children}</div>}
    </div>
  );
}

/* 元素面板按图类型分页签;每个页签一套元素,用例图页签还带「关系预设」(决定新连线的样式) */
const TABS = [
  { id: 'flow', name: '流程图', palette: [
    { kind: 'step', name: '步骤' }, { kind: 'decision', name: '判定' }, { kind: 'fail', name: '异常' },
    { kind: 'text', name: '文字' }, { kind: 'band', name: '色块' }, { kind: 'pill', name: '标签块' },
  ] },
  { id: 'usecase', name: '用例图', palette: [
    { kind: 'actor', name: '角色' }, { kind: 'usecase', name: '用例' }, { kind: 'boundary', name: '系统边界' },
    { kind: 'package', name: '分组包' }, { kind: 'text', name: '文字' }, { kind: 'pill', name: '标签块' },
  ], relations: [
    { id: 'assoc', name: '关联', style: { dash: 'solid', arrow: 'none', label: '' } },
    { id: 'include', name: '包含', style: { dash: 'dashed', arrow: 'classic', label: '«include»' } },
    { id: 'extend', name: '扩展', style: { dash: 'dashed', arrow: 'classic', label: '«extend»' } },
    { id: 'general', name: '泛化', style: { dash: 'solid', arrow: 'hollow', label: '' } },
    { id: 'flow', name: '流程箭头', style: { dash: 'solid', arrow: 'block', label: '' } },
  ] },
  { id: 'class', name: '类图', palette: [
    { kind: 'classbox', name: '实体/类' }, { kind: 'package', name: '分组包' }, { kind: 'text', name: '文字' },
  ], relations: [
    { id: 'one2n', name: '一对多 1—n', style: { dash: 'solid', arrow: 'none', label: '1 — n' } },
    { id: 'one2one', name: '一对一 1—1', style: { dash: 'solid', arrow: 'none', label: '1 — 1' } },
    { id: 'inherit', name: '继承', style: { dash: 'solid', arrow: 'hollow', label: '' } },
    { id: 'depend', name: '依赖', style: { dash: 'dashed', arrow: 'classic', label: '' } },
  ] },
  { id: 'seq', name: '时序图', palette: [
    { kind: 'lifeline', name: '生命线' }, { kind: 'activation', name: '激活条' }, { kind: 'anchor', name: '消息锚点' }, { kind: 'text', name: '文字' },
  ], relations: [
    { id: 'sync', name: '同步消息 →', style: { dash: 'solid', arrow: 'block', label: '' } },
    { id: 'ret', name: '返回 ⇠', style: { dash: 'dashed', arrow: 'classic', label: '' } },
    { id: 'async', name: '异步消息', style: { dash: 'solid', arrow: 'classic', label: '' } },
  ] },
];

export default function Sidebar({ files, cur, collapsed,
  onOpenFile, onDragElement, onRelationPreset }) {
  const [tab, setTab] = useState('flow');
  const [rel, setRel] = useState('flow');
  const cur_tab = TABS.find(t => t.id === tab) || TABS[0];
  const pickRel = r => { setRel(r.id); onRelationPreset && onRelationPreset(r.style); };
  return (
    <div className={'sidebar' + (collapsed ? ' collapsed' : '')}>
      <div className="sidebar-scroll">
        <Section title="文件">
          {files.map(f => (
            <div key={f.id}
              className={'file-row' + (f.id === cur ? ' active' : '')}
              onClick={() => onOpenFile(f.id)}>
              <span className="fname">{f.title || f.id}</span>
              <span className="fmeta">{f.id}.json</span>
            </div>
          ))}
        </Section>
        <Section title="元素" tip="拖到画布">
          <div className="tabs">
            {TABS.map(t => (
              <div key={t.id} className={'tab' + (t.id === tab ? ' active' : '')} onClick={() => setTab(t.id)}>{t.name}</div>
            ))}
          </div>
          <div className="palette">
            {cur_tab.palette.map(p => (
              <div key={p.kind} className="pal-item"
                onMouseDown={e => onDragElement(p.kind, e)}>
                <div className={'pal-icon pal-' + p.kind}>
                  {p.kind === 'text' ? '文' : p.kind === 'actor' ? (
                    <svg viewBox="0 0 40 52" width="26" height="34"><circle cx="20" cy="8" r="6" fill="none" stroke="#fff" strokeWidth="2.5"/><path d="M20 14v16M6 20h28M20 30l-12 16M20 30l12 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  ) : ''}
                </div>
                <span>{p.name}</span>
              </div>
            ))}
          </div>
          {cur_tab.relations && (
            <div className="relations">
              <div className="rel-title">关系预设 <span className="sec-tip">决定新连线样式</span></div>
              {cur_tab.relations.map(r => (
                <div key={r.id} className={'rel' + (r.id === rel ? ' active' : '')} onClick={() => pickRel(r)}>
                  <span className={'rel-line rel-' + r.id} /><span>{r.name}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

    </div>
  );
}
