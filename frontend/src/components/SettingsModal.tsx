
import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Shield, Trash2, Monitor, RefreshCw, CheckCircle2, AlertTriangle, Server, Network, FileText, ChevronDown, ChevronUp, Search, Clock, Award, Medal, Crown } from 'lucide-react';
import { getInvoiceRegistry, InvoiceRegistryEntry, clearInvoiceRegistry } from '../services/dbService';
import { removePin } from '../services/authService';
import { TALLY_API_URL, BACKEND_API_URL, BACKEND_API_KEY } from '../constants';
import { getTokenUsage, resetTokens, setPlan, TokenUsageData } from '../services/backendService';


interface SettingsModalProps {
    onClose: () => void;
    darkMode: boolean;
    toggleDarkMode: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, darkMode, toggleDarkMode }) => {
    const [confirmReset, setConfirmReset] = useState(false);
    const [confirmDeleteInvoices, setConfirmDeleteInvoices] = useState(false);

    // URL States
    const [tallyUrl, setTallyUrl] = useState('');
    const [backendUrl, setBackendUrl] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

    // History State
    const [invoiceHistory, setInvoiceHistory] = useState<InvoiceRegistryEntry[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [searchHistory, setSearchHistory] = useState('');

    // Token Management State
    const [tokenData, setTokenData] = useState<TokenUsageData | null>(null);
    const [resetTokensConfirm, setResetTokensConfirm] = useState(false);

    useEffect(() => {
        // Initialize with current values
        setTallyUrl(localStorage.getItem('tally_api_url') || TALLY_API_URL);
        setBackendUrl(localStorage.getItem('backend_api_url') || BACKEND_API_URL);

        // Load History
        const loadHistory = async () => {
            const history = await getInvoiceRegistry();
            // Sort by timestamp desc
            history.sort((a, b) => b.timestamp - a.timestamp);
            setInvoiceHistory(history);
        };
        loadHistory();

        // Load Token Data
        const loadTokenData = async () => {
            const usage = await getTokenUsage(BACKEND_API_KEY);
            if (usage) {
                setTokenData(usage);
            }
        };
        loadTokenData();
    }, []);

    const handleSaveUrls = () => {
        if (tallyUrl) localStorage.setItem('tally_api_url', tallyUrl);
        if (backendUrl) localStorage.setItem('backend_api_url', backendUrl);

        setSaveStatus('saved');
        setTimeout(() => {
            setSaveStatus('idle');
            window.location.reload(); // Reload to apply changes
        }, 1500);
    };

    const handleResetPin = () => {
        removePin();
        window.location.reload(); // Reload to force re-auth setup
    };

    const handleClearData = () => {
        if (confirmReset) {
            localStorage.clear();
            window.location.reload();
        } else {
            setConfirmReset(true);
        }
    };

    const handleDeleteInvoices = async () => {
        if (confirmDeleteInvoices) {
            await clearInvoiceRegistry();
            setInvoiceHistory([]);
            setConfirmDeleteInvoices(false);
        } else {
            setConfirmDeleteInvoices(true);
        }
    };

    const handleResetTokens = async () => {
        if (resetTokensConfirm) {
            const success = await resetTokens(BACKEND_API_KEY);
            if (success) {
                const usage = await getTokenUsage(BACKEND_API_KEY);
                if (usage) {
                    setTokenData(usage);
                }
                setResetTokensConfirm(false);
            }
        } else {
            setResetTokensConfirm(true);
        }
    };

    const handleChangePlan = async (plan: 'Bronze' | 'Gold' | 'Platinum') => {
        const success = await setPlan(BACKEND_API_KEY, plan);
        if (success) {
            const usage = await getTokenUsage(BACKEND_API_KEY);
            if (usage) {
                setTokenData(usage);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Monitor className="w-5 h-5 text-indigo-500" />
                        Website Settings
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-8 overflow-y-auto">

                    {/* Network Configuration */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Network Configuration</h4>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                    <Network className="w-3.5 h-3.5" /> Tally Prime URL
                                </label>
                                <input
                                    type="text"
                                    value={tallyUrl}
                                    onChange={(e) => setTallyUrl(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="http://127.0.0.1:9000"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                    <Server className="w-3.5 h-3.5" /> Backend API URL
                                </label>
                                <input
                                    type="text"
                                    value={backendUrl}
                                    onChange={(e) => setBackendUrl(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="https://your-backend.onrender.com"
                                />
                            </div>
                            <button
                                onClick={handleSaveUrls}
                                className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${saveStatus === 'saved'
                                    ? 'bg-green-600 text-white'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}
                            >
                                {saveStatus === 'saved' ? <CheckCircle2 className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                                {saveStatus === 'saved' ? 'Saved & Reloading...' : 'Save Network Settings'}
                            </button>
                        </div>
                    </div>

                    {/* Appearance Section */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Appearance</h4>
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${darkMode ? 'bg-indigo-900/30 text-indigo-400' : 'bg-amber-100 text-amber-600'}`}>
                                    {darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Dark Mode</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{darkMode ? 'Active' : 'Inactive'}</p>
                                </div>
                            </div>
                            <button
                                onClick={toggleDarkMode}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${darkMode ? 'bg-indigo-600' : 'bg-slate-200'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>

                    {/* Security Section */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Security</h4>
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                                    <Shield className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Security PIN</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Protect access to this device</p>
                                </div>
                            </div>
                            <button
                                onClick={handleResetPin}
                                className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                            >
                                <RefreshCw className="w-3 h-3" /> Reset
                            </button>
                        </div>
                    </div>

                    {/* Token Management */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Token Management</h4>
                        
                        {/* Current Plan Display */}
                        {tokenData && (
                            <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        {tokenData.plan === 'Bronze' && <Medal className="w-5 h-5 text-amber-600" />}
                                        {tokenData.plan === 'Gold' && <Award className="w-5 h-5 text-yellow-500" />}
                                        {tokenData.plan === 'Platinum' && <Crown className="w-5 h-5 text-purple-500" />}
                                        <span className="font-bold text-slate-700 dark:text-slate-200">{tokenData.plan}</span>
                                    </div>
                                    <span className="text-xs text-slate-500">{tokenData.used} / {tokenData.limit}</span>
                                </div>
                                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                    <div 
                                        className={`h-2 rounded-full transition-all ${tokenData.percentage >= 75 ? 'bg-red-500' : tokenData.percentage >= 50 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${Math.min(tokenData.percentage, 100)}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Change Plan */}
                        <div className="mb-4">
                            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 block">Change Plan</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['Bronze', 'Gold', 'Platinum'] as const).map((plan) => {
                                    const limits = { Bronze: 50000, Gold: 100000, Platinum: 200000 };
                                    const Icon = plan === 'Bronze' ? Medal : plan === 'Gold' ? Award : Crown;
                                    const isActive = tokenData?.plan === plan;
                                    return (
                                        <button
                                            key={plan}
                                            onClick={() => handleChangePlan(plan)}
                                            className={`p-3 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                                                isActive
                                                    ? 'bg-indigo-600 text-white border-2 border-indigo-500'
                                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                                            }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span>{plan}</span>
                                            <span className="text-[10px] opacity-70">{(limits[plan] / 1000).toLocaleString()}K tokens</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Reset Tokens */}
                        <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-100 dark:border-orange-900/30">
                            <div className="flex items-start gap-3 mb-3">
                                <RefreshCw className="w-5 h-5 text-orange-500 mt-0.5" />
                                <div>
                                    <p className="font-bold text-orange-800 dark:text-orange-400 text-sm">Reset Token Usage</p>
                                    <p className="text-xs text-orange-600 dark:text-orange-300 mt-1">
                                        Reset your current token count to 0. Your plan will remain unchanged.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleResetTokens}
                                className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                                    resetTokensConfirm
                                        ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-md'
                                        : 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                                }`}
                            >
                                <RefreshCw className="w-4 h-4" />
                                {resetTokensConfirm ? 'Click again to confirm' : 'Reset Token Usage'}
                            </button>
                        </div>
                    </div>

                    {/* Data Section */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Data Management</h4>

                        {/* Invoice History Dropdown */}
                        <div className="mb-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <button
                                onClick={() => setShowHistory(!showHistory)}
                                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                        <Clock className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Processed Invoice History</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{invoiceHistory.length} entries found</p>
                                    </div>
                                </div>
                                {showHistory ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                            </button>

                            {showHistory && (
                                <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/50">
                                    {/* Search */}
                                    <div className="relative mb-3">
                                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search invoice number..."
                                            value={searchHistory}
                                            onChange={(e) => setSearchHistory(e.target.value)}
                                            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    {/* List */}
                                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                        {invoiceHistory.length === 0 ? (
                                            <div className="text-center py-8 text-slate-500 text-sm">No history available</div>
                                        ) : (
                                            invoiceHistory
                                                .filter(item => item.invoiceNumber.toLowerCase().includes(searchHistory.toLowerCase()))
                                                .map((item, index) => (
                                                    <div key={`${item.invoiceNumber}-${index}`} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`text-xs font-bold px-2 py-1 rounded-md uppercase ${item.source === 'OCR' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'}`}>
                                                                {item.source}
                                                            </div>
                                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.invoiceNumber}</span>
                                                        </div>
                                                        <span className="text-xs text-slate-400">
                                                            {new Date(item.timestamp).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                ))
                                        )}
                                        {invoiceHistory.filter(item => item.invoiceNumber.toLowerCase().includes(searchHistory.toLowerCase())).length === 0 && invoiceHistory.length > 0 && (
                                            <div className="text-center py-4 text-slate-500 text-xs">No matches found</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mb-4">
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Invoice Registry</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Clear processed invoice history</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleDeleteInvoices}
                                    className={`px-3 py-1.5 text-xs font-bold transition-all rounded-lg flex items-center gap-1 ${confirmDeleteInvoices
                                            ? 'bg-red-600 text-white'
                                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                                        }`}
                                >
                                    <RefreshCw className="w-3 h-3" />
                                    {confirmDeleteInvoices ? 'Confirm' : 'Clear History'}
                                </button>
                            </div>
                        </div>

                        <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                            <div className="flex items-start gap-3 mb-4">
                                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                                <div>
                                    <p className="font-bold text-red-800 dark:text-red-400 text-sm">Clear Application Data</p>
                                    <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                                        This will remove all local logs, saved drafts, and reset your PIN. This action cannot be undone.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleClearData}
                                className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${confirmReset
                                    ? 'bg-red-600 text-white hover:bg-red-700 shadow-md'
                                    : 'bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20'
                                    }`}
                            >
                                <Trash2 className="w-4 h-4" />
                                {confirmReset ? 'Click again to confirm' : 'Clear All Data'}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
