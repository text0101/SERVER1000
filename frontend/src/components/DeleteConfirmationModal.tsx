import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message?: string;
    isDeleteAll?: boolean;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Deletion",
    message = "Are you sure you want to delete this?",
    isDeleteAll = false
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
            <div
                className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-sm w-full relative overflow-hidden animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`absolute top-0 left-0 right-0 h-1.5 ${isDeleteAll ? 'bg-red-600' : 'bg-orange-500'}`}></div>

                <div className="flex flex-col items-center text-center mt-2">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${isDeleteAll ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600'}`}>
                        {isDeleteAll ? <Trash2 className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
                    </div>

                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">{title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                        {message}
                    </p>

                    <div className="flex gap-3 w-full">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm transition-colors"
                            autoFocus
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => { onConfirm(); onClose(); }}
                            className={`flex-1 py-3 text-white rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${isDeleteAll ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-500/20'}`}
                        >
                            {isDeleteAll ? 'Yes, Delete All' : 'Delete'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeleteConfirmationModal;
