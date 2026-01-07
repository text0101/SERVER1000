import React, { useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface ToastProps {
    show: boolean;
    message: string;
    type?: 'success' | 'error' | 'warning' | 'info';
    onClose: () => void;
    duration?: number;
}

const Toast: React.FC<ToastProps> = ({ show, message, type = 'info', onClose, duration = 3000 }) => {
    useEffect(() => {
        if (show) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [show, duration, onClose]);

    if (!show) return null;

    const styles = {
        success: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
        error: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800',
        warning: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
        info: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800'
    };

    const icons = {
        success: <CheckCircle className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />,
        error: <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />,
        warning: <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400" />,
        info: <Info className="w-5 h-5 text-blue-500 dark:text-blue-400" />
    };

    return (
        <div className={`fixed bottom-6 right-6 z-[1000] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg animate-fade-in-up transition-all ${styles[type]}`}>
            {icons[type]}
            <p className="text-sm font-medium pr-2">{message}</p>
            <button onClick={onClose} className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors">
                <X className="w-4 h-4 opacity-50 hover:opacity-100 dark:opacity-70 dark:hover:opacity-100" />
            </button>
        </div>
    );
};

export default Toast;
