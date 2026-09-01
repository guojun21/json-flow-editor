/* 参数弹窗:黑白矩形,确认/取消。⌘Enter 确认,Esc 取消。 */
import { useEffect, useRef } from 'react';

export default function Modal({ title, children, onOk, onCancel }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.stopPropagation(); onOk(); }
    };
    const el = ref.current;
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [onOk, onCancel]);
  return (
    <div className="modal-mask" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" ref={ref}>
        <div className="modal-title">{title}</div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn btn-solid" onClick={onOk}>确认</button>
        </div>
      </div>
    </div>
  );
}
