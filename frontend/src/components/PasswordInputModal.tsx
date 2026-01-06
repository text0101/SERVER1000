import React, { useState, useEffect } from 'react';
import { Lock, X, ArrowRight, AlertCircle, FileText } from 'lucide-react';

interface PasswordInputModalProps {
    fileName: string;
    isOpen: boolean;
    onSubmit: (password: string) => void;
    onCancel: () => void;
    error?: string;
    documentType: 'Invoice' | 'Bank Statement';
}

const PasswordInputModal: React.FC<PasswordInputModalProps> = ({
    fileName,
    isOpen,
    onSubmit,
    onCancel,
    error,
    documentType
}) => {
    const [password, setPassword] = useState('');

    // Reset password when modal opens/closes or error changes
    useEffect(() => {
        if (isOpen) {
            setPassword('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password) {
            onSubmit(password);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in p-4">
            <div
                className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Lock className="w-5 h-5 text-indigo-500" />
                        Password Required
                    </h3>
                    <button
                        onClick={onCancel}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="bg-indigo-50/50 dark:bg-indigo-900/10 px-6 py-3 border-b border-indigo-100 dark:border-indigo-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">
                        Document Type: {documentType}
                    </span>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-6">
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                            This PDF file is password protected.
                                 Please enter the password.
                        </p>

                        <div className="mb-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">File:</span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={fileName}>{fileName}</span>
                        </div>

                        {error && (
                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm text-red-800 dark:text-red-300 font-bold">Incorrect password</p>
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">Please try again.</p>
                                </div>
                            </div>
                        )}

                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                            Document Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            placeholder="Enter password..."
                            autoFocus
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!password}
                            className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                        >
                            Unlock & Continue
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PasswordInputModal;
