/* Excel 文档视图:Univer 社区版电子表格 + xlsx 往返(MIT 转换器)。
 * 文档本体就是 data/<id>.xlsx;每次单元格/样式变更 800ms 后整本导出回存(POST /api/save-xlsx)。 */
import React, { useEffect, useRef } from 'react';
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import zhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import * as LX from '@mertdeveci55/univer-import-export';

const LuckyExcel = LX.LuckyExcel || LX.default || LX;

export default function SheetView({ id, onStatus }) {
  const hostRef = useRef(null);
  useEffect(() => {
    let disposed = false, timer = null, loaded = false, saving = false, pending = false;
    const { univerAPI } = createUniver({
      locale: LocaleType.ZH_CN,
      locales: { [LocaleType.ZH_CN]: mergeLocales(zhCN) },
      presets: [UniverSheetsCorePreset({ container: hostRef.current })],
    });
    window.__univerAPI = univerAPI;   // 调试/自测钩子
    const stamp = () => new Date().toTimeString().slice(0, 8);
    const save = () => {
      if (disposed || !loaded) return;
      if (saving) { pending = true; return; }
      const wb = univerAPI.getActiveWorkbook(); if (!wb) return;
      saving = true;
      try {
        LuckyExcel.transformUniverToExcel({
          snapshot: wb.save(), fileName: id + '.xlsx', getBuffer: true,
          success: (buf) => {
            fetch('api/save-xlsx?id=' + id, { method: 'POST', body: buf })
              .then(r => onStatus(r.ok ? '已存 ' + stamp() : '保存失败 ' + r.status))
              .catch(() => onStatus('保存失败(网络)'))
              .finally(() => { saving = false; if (pending) { pending = false; save(); } });
          },
          error: (e) => { saving = false; onStatus('导出失败'); console.error('[jfe] xlsx export', e); },
        });
      } catch (e) { saving = false; onStatus('导出异常'); console.error('[jfe] xlsx export', e); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(save, 800); };
    fetch('data/' + id + '.xlsx?t=' + Date.now())
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then(buf => new Promise((res, rej) => LuckyExcel.transformExcelToUniver(new File([buf], id + '.xlsx'), (snapshot) => res(snapshot), rej)))
      .then(snapshot => {
        if (disposed) return;
        if (!snapshot || !snapshot.sheets) throw new Error('empty snapshot');
        univerAPI.createWorkbook(snapshot);
        loaded = true; onStatus('Excel 已加载');
        // 任何落到工作簿上的变更(值/样式/合并/列宽…)都是 mutation;导入本身已经完成,之后的才算用户改动
        univerAPI.addEvent(univerAPI.Event.CommandExecuted, (e) => {
          if (!loaded || disposed) return;
          const cid = (e && e.id) || ''; const type = e && e.type;
          if (type === 2 && /^sheet\.mutation\./.test(cid) && !/selection|scroll|zoom|active|focus|render|viewport|editor/i.test(cid)) schedule();
        });
      })
      .catch(err => { console.error('[jfe] xlsx load', err); onStatus('Excel 加载失败'); });
    return () => { disposed = true; clearTimeout(timer); try { univerAPI.dispose(); } catch {} };
  }, [id]);
  return <div className="sheet-host" ref={hostRef} />;
}
