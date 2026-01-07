import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ValidationModalProps {
    message: string;
    onClose: () => void;
}

const ValidationModal: React.FC<ValidationModalProps> = ({ message, onClose }) => {
    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-2xl border-2 border-red-500 max-w-sm w-full text-center relative animate-scale-in">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-slate-400 hover:text-red-500 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="w-14 h-14 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8" />
                </div>

                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Required Fields Missing</h3>

                <p className="text-slate-600 dark:text-slate-300 text-sm mb-6 leading-relaxed">
                    {message}
                </p>

                <button
                    onClick={onClose}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-md transition-colors"
                >
                    Okay, I'll select them
                </button>
            </div>
        </div>
    );
};

export default ValidationModal;
