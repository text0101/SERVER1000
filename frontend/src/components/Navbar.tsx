
import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutGrid,
  UploadCloud,
  FileText,
  Activity,
  MessageSquare,
  Sun,
  Moon,
  WifiOff,
  RotateCw,
  Search,
  Settings,
  Lock,
  Calculator,
  ChevronDown,
  Database,
  Loader2,
  CheckCircle,
  Wifi
} from 'lucide-react';
import { AppView } from '../types';
import AccountingCalculator from './AccountingCalculator';
import ProfileDropdown from './ProfileDropdown';
import { syncMastersFromAllCompanies } from '../services/tallyService';
import { TokenUsageData } from '../services/backendService';

interface NavbarProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  tallyStatus: { online: boolean; info: string; mode: 'full' | 'blind' | 'none'; activeCompany?: string };
  onCheckStatus: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onOpenSettings: () => void;
  onLock: () => void;
  userName?: string;
  tokenData?: TokenUsageData | null;
  onRefreshTokenData?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onChangeView,
  darkMode,
  toggleDarkMode,
  tallyStatus,
  onCheckStatus,
  searchTerm,
  onSearchChange,
  onOpenSettings,
  onLock,
  userName = '',
  tokenData = null,
  onRefreshTokenData = () => { }
}) => {
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [isUploadsOpen, setIsUploadsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const uploadsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (uploadsRef.current && !uploadsRef.current.contains(event.target as Node)) {
        setIsUploadsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSyncMasters = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncSuccess(false);
    try {
      await syncMastersFromAllCompanies();
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (e) {
      console.error("Manual sync failed", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await onCheckStatus();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const navItems = [
    { id: AppView.DASHBOARD, label: 'Dashboard', icon: LayoutGrid },
    { id: AppView.EDITOR, label: 'Editor', icon: FileText },
    { id: AppView.CHAT, label: 'AI Chat', icon: MessageSquare },
  ];

  const uploadOptions = [
    { id: AppView.UPLOAD, label: 'Invoice Import' },
    { id: AppView.EXCEL_IMPORT, label: 'Excel Import' },
    { id: AppView.BANK_STATEMENT, label: 'Bank Statement' },
  ];

  const renderNavItem = (item: typeof navItems[0]) => (
    <button
      key={item.id}
      onClick={() => onChangeView(item.id)}
      className={`
        flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all duration-200 text-sm font-bold whitespace-nowrap
        ${currentView === item.id
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}
      `}
    >
      <item.icon className="w-4 h-4" />
      {item.label}
    </button>
  );

  return (
    <div className="flex flex-col w-full bg-[#0f172a] text-slate-300 transition-colors duration-200 shrink-0 border-b border-slate-800/80">
      {/* Top Row: Branding and System Utilities */}
      <div className="min-h-[3.5rem] px-6 py-2 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">AutoTally Ai</h1>
        </div>

        {/* System Utilities */}
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={toggleDarkMode} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white" title="Toggle Theme">
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <ProfileDropdown
            userName={userName}
            tokenData={tokenData}
            onRefreshTokenData={onRefreshTokenData}
          />

          <button onClick={onOpenSettings} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white" title="Settings">
            <Settings className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-slate-700/50 mx-2"></div>

          <button onClick={onLock} className="p-2 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors text-slate-400 border border-slate-700/50" title="Lock Session">
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Navigation, Large Search Bar, and Connectivity Area */}
      <div className="min-h-[3.5rem] px-6 py-2 flex items-center justify-between gap-4 bg-slate-900/40 border-t border-slate-800/30">

        {/* Nav Items Group */}
        <div className="flex items-center gap-2 shrink-0">
          {renderNavItem(navItems[0])}
          <div className="relative" ref={uploadsRef}>
            <button
              onClick={() => setIsUploadsOpen(!isUploadsOpen)}
              className={`
                flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all duration-200 text-sm font-bold whitespace-nowrap
                ${uploadOptions.some(opt => opt.id === currentView)
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}
              `}
            >
              <UploadCloud className="w-4 h-4" />
              Uploads
              <ChevronDown className={`w-3 h-3 transition-transform ${isUploadsOpen ? 'rotate-180' : ''}`} />
            </button>
            {isUploadsOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl z-[100] py-2 overflow-hidden animate-fade-in">
                {uploadOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onChangeView(opt.id);
                      setIsUploadsOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {navItems.slice(1).map(renderNavItem)}
        </div>

        {/* Dynamic Status & Connectivity Utilities */}
        <div className="flex items-center gap-3 shrink-0 flex-1 justify-end">

          {/* Sync Masters - Expanded */}
          <button
            onClick={handleSyncMasters}
            disabled={isSyncing || !tallyStatus.online}
            className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all ${syncSuccess
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
              : 'border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/10 text-slate-400 hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
            title="Sync Masters"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : syncSuccess ? <CheckCircle className="w-4 h-4" /> : <Database className="w-4 h-4" />}
            <span className="text-[10px] font-black uppercase tracking-widest hidden xl:inline">
              {isSyncing ? 'Syncing...' : syncSuccess ? 'Synced' : 'Sync Masters'}
            </span>
          </button>

          {/* Connection Indicator - Reverted */}
          <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all ${tallyStatus.online ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/40 bg-red-900/10 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]'}`}>
            {tallyStatus.online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span className="text-[10px] font-black uppercase tracking-widest hidden xl:inline">{tallyStatus.online ? 'Connected' : 'Disconnected'}</span>
            <div className={`w-2 h-2 rounded-full ${tallyStatus.online ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse'}`}></div>
          </div>

          {/* Reconnect Icon */}
          <button
            onClick={handleManualRefresh}
            className={`p-2 bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white ${isRefreshing ? 'opacity-50 cursor-wait' : ''}`}
            title="Reconnect / Refresh Status"
            disabled={isRefreshing}
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <div className="h-8 w-px bg-slate-800/80 mx-2 hidden lg:block"></div>

          {/* Secondary Links */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => onChangeView(AppView.LOGS)}
              className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-colors ${currentView === AppView.LOGS ? 'text-indigo-400' : 'text-slate-600 hover:text-slate-200'}`}
            >
              <Activity className="w-4 h-4" />
              Logs
            </button>
            <button
              onClick={() => setIsCalcOpen(!isCalcOpen)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600 hover:text-slate-200 transition-colors"
            >
              <Calculator className="w-4 h-4" />
              Tax Calc
            </button>
          </div>
        </div>
      </div>

      {isCalcOpen && <AccountingCalculator onClose={() => setIsCalcOpen(false)} />}
    </div>
  );
};

export default Navbar;
