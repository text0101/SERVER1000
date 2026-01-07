import React, { useState, useEffect } from 'react';
import { ShieldAlert, Search } from 'lucide-react';
import { findLedgerByTypeAndPercent } from '../services/tallyService';

// Generic Interface for Items to Map
// key: unique identifier (e.g. rate number 18, or name string "Amazon")
// label: display text (e.g. "18% GST Items" or "Amazon")
// type: 'rate' | 'name' - determines finding logic
export interface MappingItem {
    key: string | number;
    label: string;
    type: 'rate' | 'name'; 
}

interface LedgerMappingModalProps {
    isOpen: boolean;
    title: string;
    voucherType: 'Purchase' | 'Sales' | 'Payment' | 'Receipt' | 'Contra'; // Expanded for Bank
    itemsToMap: MappingItem[];
    mappings: Record<string, string>; // key -> ledgerName
    tallyLedgers: string[];
    onConfirm: (mappings: Record<string, string>, createdLedgers: string[]) => void;
    onCancel: () => void;
}

const LedgerMappingModal: React.FC<LedgerMappingModalProps> = ({
    isOpen, title, voucherType, itemsToMap, mappings, tallyLedgers, onConfirm, onCancel
}) => {
    const [localMappings, setLocalMappings] = useState<Record<string, string>>({ ...mappings });
    const [createList, setCreateList] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState<Record<string, string>>({});

    // Initialize with auto-suggestions if not set
    useEffect(() => {
        if (!isOpen) return;
        const newMappings = { ...localMappings };
        let hasChanges = false;

        itemsToMap.forEach(item => {
            const k = item.key.toString();
            if (!newMappings[k]) {
                let suggestion: string | null = null;
                
                if (item.type === 'rate') {
                   suggestion = findLedgerByTypeAndPercent(tallyLedgers, voucherType as 'Purchase' | 'Sales', Number(item.key));
                } else {
                    // For names (Bank), try exact match or simple contains
                    // This is a basic fuzzy match
                    const lowerKey = item.label.toLowerCase();
                    suggestion = tallyLedgers.find(l => l.toLowerCase() === lowerKey || l.toLowerCase().includes(lowerKey)) || null;
                }

                if (suggestion) {
                    newMappings[k] = suggestion;
                    hasChanges = true;
                }
            }
        });
        if (hasChanges) setLocalMappings(newMappings);
    }, [isOpen, itemsToMap, tallyLedgers, voucherType]);

    if (!isOpen) return null;

    const handleSelect = (key: string, ledger: string) => {
        setLocalMappings(prev => ({ ...prev, [key]: ledger }));
        setCreateList(prev => {
            const next = new Set(prev);
            next.delete(ledger);
            return next;
        });
    };

    const handleCreate = (key: string, itemType: 'rate' | 'name') => {
        let name = '';
        if (itemType === 'rate') {
             // Strict Naming Rule: VoucherType + Space + Rate + %
             name = `${voucherType} ${key}%`;
        } else {
            // For bank names, use the key itself as the suggested ledger name?
            // Or maybe "Suspense - Key"? Let's just use the key for now.
             name = key.toString();
        }
        
        setLocalMappings(prev => ({ ...prev, [key]: name }));
        setCreateList(prev => new Set(prev).add(name));
    };

    const isComplete = itemsToMap.every(item => !!localMappings[item.key.toString()]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                    <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
                        <ShieldAlert className="w-6 h-6 text-indigo-600" />
                        {title}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        We need to know which General Ledger to use for these items.
                    </p>
                </div>
                
                <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                    {itemsToMap.map(item => {
                        const k = item.key.toString();
                        const current = localMappings[k] || '';
                        const isCreating = createList.has(current);
                        
                        // Filter ledgers better
                        const filtered = tallyLedgers.filter(l => {
                            const matchTerm = (searchTerm[k] || '').toLowerCase();
                            const matchesSearch = l.toLowerCase().includes(matchTerm);
                            
                            // For Rates: Filter by Voucher Type to keep list clean
                            if (item.type === 'rate' && (voucherType === 'Purchase' || voucherType === 'Sales')) {
                                return matchesSearch && l.toLowerCase().includes(voucherType.toLowerCase());
                            }
                            return matchesSearch;
                        }).slice(0, 50);

                        return (
                            <div key={k} className="bg-slate-50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="font-bold text-slate-700 dark:text-slate-200 text-lg">{item.label}</span>
                                    {current && (
                                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isCreating ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                            {isCreating ? 'Will Create New' : 'Mapped to Tally'}
                                        </span>
                                    )}
                                </div>
                                
                                <div className="relative group">
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input 
                                                type="text"
                                                placeholder="Search Tally Ledgers..."
                                                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 font-medium text-slate-700 dark:text-white"
                                                value={current || searchTerm[k] || ''}
                                                onChange={(e) => {
                                                    setSearchTerm(prev => ({ ...prev, [k]: e.target.value }));
                                                    if (current) setLocalMappings(prev => ({ ...prev, [k]: '' })); // Clear selection on edit
                                                }}
                                            />
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        </div>
                                        {(!current || isCreating) && (
                                           <button 
                                                onClick={() => handleCreate(k, item.type)}
                                                className="px-4 py-2 bg-emerald-50 text-emerald-600 font-bold text-xs rounded-xl hover:bg-emerald-100 border border-emerald-200 transition-colors"
                                           >
                                                Create New
                                           </button>
                                        )}
                                    </div>

                                    {/* Dropdown Results */}
                                    {!current && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-10 max-h-40 overflow-y-auto">
                                            {filtered.length === 0 ? (
                                                <div className="p-3 text-xs text-slate-400 text-center">No matching ledgers found</div>
                                            ) : (
                                                filtered.map(l => (
                                                    <button
                                                        key={l}
                                                        onClick={() => handleSelect(k, l)}
                                                        className="w-full text-left px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors"
                                                    >
                                                        {l}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end gap-3">
                    <button onClick={onCancel} className="px-6 py-2.5 font-bold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                    <button 
                        onClick={() => onConfirm(localMappings, Array.from(createList))}
                        disabled={!isComplete}
                        className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                    >
                        Confirm & Push
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LedgerMappingModal;
