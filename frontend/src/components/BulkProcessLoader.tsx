import React from 'react';
import { Loader2, Zap, XCircle } from 'lucide-react';

interface BulkProcessLoaderProps {
    processed: number;
    total: number;
    currentFileName: string;
    onCancel: () => void;
}

const BulkProcessLoader: React.FC<BulkProcessLoaderProps> = ({ processed, total, currentFileName, onCancel }) => {
    const percentage = Math.round((processed / total) * 100) || 0;

    return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-slate-50 dark:bg-slate-950 animate-fade-in relative overflow-hidden rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-30">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 blur-[100px] rounded-full animate-pulse-slow"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/20 blur-[100px] rounded-full animate-pulse-slow delay-75"></div>
            </div>

            <div className="relative z-10 flex flex-col items-center max-w-md w-full px-6 text-center">
                <div className="mb-8 relative">
                    {/* Spinner Ring */}
                    <div className="w-32 h-32 rounded-full border-8 border-slate-200 dark:border-slate-800"></div>
                    {/* Active Spinner */}
                    <div className="absolute top-0 left-0 w-32 h-32 rounded-full border-8 border-indigo-600 border-t-white dark:border-indigo-400 dark:border-t-slate-900 animate-spin"></div>
                    {/* Percentage */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-3xl font-black text-indigo-700 dark:text-indigo-400">{percentage}%</span>
                    </div>
                </div>

                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">Processing Invoices</h2>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs mb-6">
                    <Zap className="w-4 h-4 text-emerald-500" />
                    <span>AI Model Active</span>
                </div>

                <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl mb-8">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Current Activity</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200 truncate mb-4">
                        {currentFileName || "Initializing..."}
                    </p>

                    {/* Progress Bar */}
                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                        <div
                            className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300 ease-out"
                            style={{ width: `${percentage}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between items-center mt-2 text-xs font-bold text-slate-500">
                        <span>{processed} Completed</span>
                        <span>{total} Total</span>
                    </div>
                </div>

                <p className="text-xs text-slate-400 font-medium mb-8">Please wait while we extract data from your documents...</p>

                <button
                    onClick={onCancel}
                    className="flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-slate-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-slate-200 dark:border-slate-700 rounded-xl transition-all font-bold text-sm shadow-sm hover:shadow-md"
                >
                    <XCircle className="w-5 h-5" />
                    Cancel Processing
                </button>
            </div>
        </div>
    );
};

export default BulkProcessLoader;
