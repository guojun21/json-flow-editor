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

const PALETTE = [
  { kind: 'step', name: '步骤' },
  { kind: 'decision', name: '判定' },
  { kind: 'fail', name: '异常' },
  { kind: 'text', name: '文字' },
  { kind: 'band', name: '色块' },
  { kind: 'pill', name: '标签块' },
];

export default function Sidebar({ files, cur, status, collapsed,
  onOpenFile, onDragElement }) {
  return (
    <div className={'sidebar' + (collapsed ? ' collapsed' : '')}>
      <div className="sidebar-scroll">
        <Section title="文件">
          {files.map(f => (
            <div key={f.id}
              className={'file-row' + (f.id === cur ? ' active' : '')}
              onClick={() => onOpenFile(f.id)}>
              <span className="fico">▣</span>
              <span className="fname">{f.title || f.id}</span>
              <span className="fmeta">{f.id}.json</span>
            </div>
          ))}
        </Section>
        <Section title="元素" tip="拖到画布">
          <div className="palette">
            {PALETTE.map(p => (
              <div key={p.kind} className="pal-item"
                onMouseDown={e => onDragElement(p.kind, e)}>
                <div className={'pal-icon pal-' + p.kind}>
                  {p.kind === 'text' ? '文' : ''}
                </div>
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <div className="sidebar-foot">
        <div className="status">{status}</div>
      </div>
    </div>
  );
}
