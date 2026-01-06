import React from 'react';
import { X, CheckCircle2, AlertTriangle, FileText, Ban } from 'lucide-react';

interface ImportSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    summary: {
        total: number;
        skipped: number;
        success: number;
        failed: number;
        errors?: string[];
    };
}

const ImportSummaryModal: React.FC<ImportSummaryModalProps> = ({ isOpen, onClose, summary }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">

                {/* Header */}
                <div className="p-6 pb-0 flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <FileText className="w-6 h-6 text-indigo-500" />
                            Import Summary
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Here's the result of your Entries import to Tally.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-slate-100 dark:bg-slate-700 p-1 rounded-full"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">

                    {/* Total processed */}
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Total Entries Processed</span>
                        <span className="text-lg font-bold text-slate-800 dark:text-white">{summary.total}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">

                        {/* Skipped */}
                        <div className="flex items-center p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl">
                            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400 mr-3">
                                <Ban className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-amber-500 uppercase tracking-wide">Duplicate Entries Found</p>
                                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{summary.skipped}</p>
                            </div>
                        </div>

                        {/* Success */}
                        <div className="flex items-center p-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl">
                            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400 mr-3">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide">Successfully Pushed</p>
                                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{summary.success}</p>
                            </div>
                        </div>

                        {/* Failed */}
                        {summary.failed > 0 && (
                            <div className="flex flex-col gap-2 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-3">
                                <div className="flex items-center">
                                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 mr-3">
                                        <AlertTriangle className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-red-500 uppercase tracking-wide">Failed</p>
                                        <p className="text-lg font-bold text-red-700 dark:text-red-400">{summary.failed}</p>
                                    </div>
                                </div>
                                {summary.errors && summary.errors.length > 0 && (
                                    <div className="mt-2 pl-2 border-l-2 border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-300 space-y-1 max-h-32 overflow-y-auto">
                                        {summary.errors.map((err, idx) => (
                                            <p key={idx}>• {err}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-lg hover:opacity-90 transition-opacity"
                    >
                        Done
                    </button>
                </div>

            </div>
        </div>
    );
};

export default ImportSummaryModal;
