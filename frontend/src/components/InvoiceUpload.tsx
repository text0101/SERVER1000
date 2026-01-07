
import React, { useCallback, useState, useRef } from 'react';
import { UploadCloud, Zap, History, FileUp, FileText, CheckCircle, ShieldCheck, ArrowRight, ArrowLeft, Loader2, Landmark, Sparkles, LayoutDashboard, Activity } from 'lucide-react';
import { InvoiceData } from '../types';

// Interface update
interface InvoiceUploadProps {
  onFilesSelected: (files: File[]) => void;
  onRestoreDraft?: (data: InvoiceData) => void;
  onNavigateToDashboard?: () => void;
  onNavigateToLogs?: () => void;
  isProcessing?: boolean;
  autoTrigger?: boolean;
  onAutoTriggered?: () => void;
  onWarning?: (message: string) => void;
}

const InvoiceUpload: React.FC<InvoiceUploadProps> = ({
  onFilesSelected,
  onRestoreDraft,
  onNavigateToDashboard,
  onNavigateToLogs,
  isProcessing = false,
  autoTrigger = false,
  onAutoTriggered,
  onWarning
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-trigger file dialog on mount if requested (with small delay to ensure mount)
  React.useEffect(() => {
    if (autoTrigger && fileInputRef.current) {
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
        if (onAutoTriggered) onAutoTriggered();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoTrigger, onAutoTriggered]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 50) {
        const msg = "Batch limit exceeded. Only the first 50 files will be processed to ensure stability.";
        if (onWarning) onWarning(msg); else alert(msg);
        onFilesSelected(files.slice(0, 50));
      } else {
        onFilesSelected(files);
      }
    }
  }, [onFilesSelected, onWarning]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      if (files.length > 50) {
        const msg = "Batch limit exceeded. Only the first 50 files will be processed to ensure stability.";
        if (onWarning) onWarning(msg); else alert(msg);
        onFilesSelected(files.slice(0, 50));
      } else {
        onFilesSelected(files);
      }
    }
  };

  const handleRestoreDraft = () => {
    try {
      const saved = localStorage.getItem('autotally_autosave');
      if (saved && onRestoreDraft) {
        const data = JSON.parse(saved);
        onRestoreDraft(data);
      }
    } catch (e) {
      console.error("Failed to restore draft", e);
    }
  };

  const hasSavedDraft = typeof window !== 'undefined' && !!localStorage.getItem('autotally_autosave');

  if (isProcessing) {
    return (
      <div className="flex flex-col h-full gap-6 animate-fade-in relative">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex justify-between items-center transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shadow-inner">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Processing Pipeline</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Extracting data using Gemini 2.5 Multi-modal AI</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-800 rounded-[32px] border border-slate-200 dark:border-slate-700 p-12 relative overflow-hidden shadow-sm">
          <div className="relative mb-12">
            <div className="w-32 h-32 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center">
              <Sparkles className="w-16 h-16 text-indigo-500 animate-pulse" />
            </div>
            <div className="absolute inset-0 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          </div>

          <div className="text-center space-y-4 max-w-md">
            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Analyzing Documents</h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
              Please wait while our AI identifies ledgers, GSTINs, and line items. You'll be redirected to the editor automatically.
            </p>

            <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-8">
              <div className="bg-indigo-600 h-full w-1/3 animate-progress-indeterminate"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full min-h-0 gap-4 animate-fade-in relative overflow-y-auto p-1 transition-all duration-200"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <div
        className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex justify-between items-center transition-colors shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {onNavigateToDashboard && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigateToDashboard(); }}
              className="p-1.5 -ml-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shadow-inner">
            <FileUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Invoice</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Auto-extract GST details, items & dates from document</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasSavedDraft && (
            <button
              onClick={(e) => { e.stopPropagation(); handleRestoreDraft(); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"
            >
              <History className="w-3.5 h-3.5" /> Restore Draft
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            disabled={isProcessing}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-bold shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 text-sm"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {isProcessing ? 'Processing...' : 'Process Invoices'}
          </button>
        </div>
      </div>

      <div
        className={`
          flex-1 flex flex-col items-center justify-center rounded-[24px] border-4 border-dashed transition-all duration-300 p-6 relative overflow-hidden shadow-sm min-h-[300px] group
          ${isDragOver
            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 scale-[0.99] ring-4 ring-blue-500/20'
            : 'border-slate-200 dark:border-slate-700 bg-blue-50/30 dark:bg-blue-900/10 hover:bg-white dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-500'}
          `}
      >
        <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-4 shadow-inner transition-transform duration-500 group-hover:scale-110">
          <UploadCloud className="w-10 h-10" />
        </div>

        <div className="text-center space-y-3 max-w-md">
          <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Drop Invoices Here</h3>
          <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed text-sm">
            Support Bulk upload of PDF, JPG, and PNG formats.</p>

          <div className="pt-2 flex flex-col items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-black text-base shadow-xl shadow-blue-600/20 transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-2"
            >
              Select Documents
              <ArrowRight className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.jpg,.png" onChange={handleFileInput} />

            {hasSavedDraft && (
              <button
                onClick={(e) => { e.stopPropagation(); handleRestoreDraft(); }}
                className="flex items-center gap-2 px-4 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg text-xs font-bold transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                Restore unsaved draft
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        {[
          { icon: Zap, label: 'Instant OCR', desc: 'Auto-identify party, GSTIN and line items.', color: 'text-blue-500' },
          { icon: Landmark, label: 'Tally Ready', desc: 'Direct XML generation for Tally Prime.', color: 'text-emerald-500' },
          { icon: ShieldCheck, label: 'Secure Processing', desc: 'Documents processed securely.', color: 'text-amber-500' }
        ].map((feat, i) => (
          <div key={i} className="flex items-start gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
            <div className={`w-8 h-8 bg-slate-50 dark:bg-slate-900 rounded-lg flex items-center justify-center shadow-inner border border-slate-100 dark:border-slate-700 ${feat.color}`}>
              <feat.icon className="w-4 h-4 fill-current opacity-20" />
              <feat.icon className="w-4 h-4 absolute" />
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase text-slate-800 dark:text-white tracking-wider">{feat.label}</h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 leading-relaxed">{feat.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InvoiceUpload;
