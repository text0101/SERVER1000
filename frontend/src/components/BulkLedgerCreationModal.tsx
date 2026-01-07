
import React, { useState, useEffect } from 'react';
import { X, CheckSquare, Square, Plus, AlertTriangle } from 'lucide-react';

interface BulkLedgerCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    proposedLedgers: string[];
    onConfirm: (skippedLedgers: string[]) => void;
    title?: string;
}

const BulkLedgerCreationModal: React.FC<BulkLedgerCreationModalProps> = ({ isOpen, onClose, proposedLedgers, onConfirm, title = "New Ledgers Detected" }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // Initialize with all selected by default
    useEffect(() => {
        if (isOpen) {
            setSelected(new Set(proposedLedgers));
        }
    }, [isOpen, proposedLedgers]);

    const toggleLedger = (ledger: string) => {
        const newSet = new Set(selected);
        if (newSet.has(ledger)) {
            newSet.delete(ledger);
        } else {
            newSet.add(ledger);
        }
        setSelected(newSet);
    };

    const toggleAll = () => {
        if (selected.size === proposedLedgers.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(proposedLedgers));
        }
    };

    const handleConfirm = () => {
        // We need to identify which ledgers were SKIPPED (unselected)
        const skipped = proposedLedgers.filter(L => !selected.has(L));
        onConfirm(skipped);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[85vh]">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-start gap-4">
                    <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            The following ledgers are missing in Tally. Select the ones you want to <strong>create automatically</strong>.
                            Unselected ledgers will be skipped (which may cause Tally errors).
                        </p>
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2">
                    <div className="flex justify-between items-center px-4 py-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{selected.size} Selected</span>
                        <button onClick={toggleAll} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                            {selected.size === proposedLedgers.length ? <><Square className="w-3 h-3" /> Deselect All</> : <><CheckSquare className="w-3 h-3" /> Select All</>}
                        </button>
                    </div>
                    <div className="space-y-1">
                        {proposedLedgers.map(ledger => (
                            <div 
                                key={ledger} 
                                onClick={() => toggleLedger(ledger)}
                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border select-none
                                    ${selected.has(ledger) 
                                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' 
                                        : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                            >
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors
                                    ${selected.has(ledger) 
                                        ? 'bg-indigo-600 border-indigo-600 text-white' 
                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'}`}
                                >
                                    {selected.has(ledger) && <Plus className="w-3.5 h-3.5" />}
                                </div>
                                <span className={`text-sm font-medium ${selected.has(ledger) ? 'text-indigo-900 dark:text-indigo-100' : 'text-slate-600 dark:text-slate-400'}`}>
                                    {ledger}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl flex gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleConfirm}
                        className="flex-[2] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Create {selected.size} Ledgers & Push
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkLedgerCreationModal;
