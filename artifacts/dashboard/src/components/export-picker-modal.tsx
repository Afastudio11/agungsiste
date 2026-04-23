import { useState } from "react";
import { Download, X, Loader2, FileText } from "@/lib/icons";
import { exportExcel, exportParticipantsPDF, type BulkPdfParticipant } from "@/lib/exportUtils";

export type ExportCol<T = any> = {
  key: string;
  label: string;
  section: string;
  getValue: (row: T, index?: number) => any;
};

type Props<T> = {
  open: boolean;
  onClose: () => void;
  cols: ExportCol<T>[];
  defaultKeys: string[];
  sections: string[];
  rows: T[];
  filename: string;
  pdfMapper?: (row: T) => BulkPdfParticipant;
  pdfFilenameLabel?: string;
  baseUrl?: string;
  title?: string;
};

const BASE_URL = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";

export function ExportPickerModal<T>({
  open,
  onClose,
  cols,
  defaultKeys,
  sections,
  rows,
  filename,
  pdfMapper,
  pdfFilenameLabel,
  baseUrl,
  title = "Pilih Kolom Export",
}: Props<T>) {
  const [keys, setKeys] = useState<Set<string>>(new Set(defaultKeys));
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);

  if (!open) return null;

  const toggleKey = (k: string, on: boolean) => {
    setKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });
  };

  const doExcel = () => {
    const selected = cols.filter((c) => keys.has(c.key));
    if (selected.length === 0 || rows.length === 0) return;
    const headers = selected.map((c) => c.label);
    const out = [headers, ...rows.map((r, i) => selected.map((c) => c.getValue(r, i)))];
    exportExcel(out, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    onClose();
  };

  const doPdf = async () => {
    if (!pdfMapper || rows.length === 0 || pdfProgress) return;
    const list = rows.map(pdfMapper);
    setPdfProgress({ current: 0, total: list.length });
    try {
      await exportParticipantsPDF(
        list,
        baseUrl ?? BASE_URL,
        (current) => setPdfProgress({ current, total: list.length }),
        pdfFilenameLabel ?? filename,
      );
    } finally {
      setPdfProgress(null);
      onClose();
    }
  };

  return (
    <>
      {pdfProgress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full text-center">
            <div className="mb-4 flex justify-center">
              <div className="h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center">
                <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
              </div>
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">Membuat PDF...</h3>
            <p className="text-sm text-slate-500 mb-5">
              Memuat foto KTP {pdfProgress.current} dari {pdfProgress.total}
            </p>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${pdfProgress.total > 0 ? Math.round((pdfProgress.current / pdfProgress.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              {pdfProgress.total > 0 ? Math.round((pdfProgress.current / pdfProgress.total) * 100) : 0}% — Jangan tutup jendela ini
            </p>
          </div>
        </div>
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
          <div className="px-6 pt-6 pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {keys.size} dari {cols.length} kolom dipilih &bull; {rows.length.toLocaleString("id-ID")} baris data
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setKeys(new Set(cols.map((c) => c.key)))}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >Pilih Semua</button>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => setKeys(new Set())}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
              >Hapus Semua</button>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => setKeys(new Set(defaultKeys))}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
              >Reset Default</button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
            {sections.map((section) => {
              const sectionCols = cols.filter((c) => c.section === section);
              if (sectionCols.length === 0) return null;
              const allChecked = sectionCols.every((c) => keys.has(c.key));
              return (
                <div key={section}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{section}</span>
                    <button
                      onClick={() => {
                        setKeys((prev) => {
                          const next = new Set(prev);
                          if (allChecked) sectionCols.forEach((c) => next.delete(c.key));
                          else sectionCols.forEach((c) => next.add(c.key));
                          return next;
                        });
                      }}
                      className="text-[10px] font-semibold text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      {allChecked ? "Batal Semua" : "Pilih Semua"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {sectionCols.map((col) => {
                      const checked = keys.has(col.key);
                      return (
                        <label
                          key={col.key}
                          className={`flex items-center gap-2.5 cursor-pointer rounded-xl px-3 py-2.5 border transition-all select-none ${
                            checked
                              ? "bg-emerald-50 border-emerald-200"
                              : "bg-slate-50 border-slate-100 hover:bg-slate-100"
                          }`}
                        >
                          <div className={`flex-shrink-0 h-4 w-4 rounded flex items-center justify-center border-2 transition-all ${
                            checked ? "bg-emerald-500 border-emerald-500" : "bg-white border-slate-300"
                          }`}>
                            {checked && (
                              <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className={`text-[12px] font-medium ${checked ? "text-emerald-800" : "text-slate-600"}`}>
                            {col.label}
                          </span>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={(e) => toggleKey(col.key, e.target.checked)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 justify-end bg-slate-50/60 flex-wrap">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-semibold text-slate-500 hover:bg-slate-200 transition-colors"
            >
              Batal
            </button>
            {pdfMapper && (
              <button
                disabled={rows.length === 0 || !!pdfProgress}
                onClick={doPdf}
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-full text-sm font-bold shadow-sm transition-colors active:scale-95"
              >
                <FileText className="h-4 w-4" />
                Export PDF (foto KTP)
              </button>
            )}
            <button
              disabled={keys.size === 0 || rows.length === 0}
              onClick={doExcel}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-full text-sm font-bold shadow-sm transition-colors active:scale-95"
            >
              <Download className="h-4 w-4" />
              Export Excel ({keys.size} kolom)
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
