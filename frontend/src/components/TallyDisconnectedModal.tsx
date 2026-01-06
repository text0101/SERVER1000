import React, { useState } from 'react';
import { WifiOff, X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { checkTallyConnection } from '../services/tallyService';

interface TallyDisconnectedModalProps {
    onClose: () => void;
}

const TallyDisconnectedModal: React.FC<TallyDisconnectedModalProps> = ({ onClose }) => {
    const [isChecking, setIsChecking] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    const handleRetry = async () => {
        setIsChecking(true);
        try {
            const status = await checkTallyConnection();
            if (status.online) {
                setIsConnected(true);
                setTimeout(() => {
                    onClose();
                }, 1000);
            }
        } catch (error) {
            // stay disconnected
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-2xl border-2 border-orange-400 max-w-md w-full text-center relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-orange-500 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {isConnected ? (
                    <div className="animate-fade-in">
                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Connected!</h3>
                        <p className="text-slate-600 dark:text-slate-300 text-sm mt-2 mb-6">You can now proceed with pushing data.</p>
                    </div>
                ) : (
                    <>
                        <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/20 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                            <WifiOff className="w-8 h-8" />
                        </div>

                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Connect to Tally First</h3>

                        <p className="text-slate-600 dark:text-slate-300 text-sm mt-2 mb-6 leading-relaxed">
                            Tally Prime is disconnected or unreachable. Please open Tally and ensure the company is loaded before pushing entries.
                        </p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleRetry}
                                disabled={isChecking}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                                {isChecking ? 'Checking...' : 'Check Connection'}
                            </button>

                            <button
                                onClick={onClose}
                                className="w-full py-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-semibold"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Troubleshooting</p>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 space-y-1">
                                <p>1. Ensure Tally Prime is running.</p>
                                <p>2. Verify port 9000 is enabled in Tally configuration.</p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default TallyDisconnectedModal;
