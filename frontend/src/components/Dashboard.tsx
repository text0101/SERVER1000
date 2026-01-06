
import React, { useState, useRef, useEffect } from 'react';
import {
  BarChart2,
  CheckSquare,
  AlertTriangle,
  FileText,
  Eye,
  Download,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  UploadCloud,
  Send,
  Landmark,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  AlertCircle,
  Check,
  Trash2
} from 'lucide-react';
import { ProcessedFile } from '../types';

interface DashboardProps {
  files: ProcessedFile[];
  onNavigateToUpload: () => void;
  onView: (file: ProcessedFile) => void;
  onRetry: () => void;
  onPushSuccess: () => void;
  isPushing: boolean;
  onDownload: (file: ProcessedFile) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filterStatus: string;
  onFilterChange: (status: string) => void;
  onDownloadAll: () => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onPush: (file: ProcessedFile) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  files,
  onNavigateToUpload,
  onView,
  onRetry,
  onPushSuccess,
  isPushing,
  onDownload,
  searchTerm,
  onSearchChange,
  filterStatus,
  onFilterChange,
  onDownloadAll,
  onDelete,
  onDeleteAll,
  onPush
}) => {
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ================= VALIDATION LOGIC =================
  const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  const isValidGSTIN = (gstin?: string) => {
    if (!gstin) return false;
    return GSTIN_REGEX.test(gstin.trim());
  };

  const isValidDate = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && dateStr.trim() !== '';
  };

  const calculateFileIssues = (file: ProcessedFile): number => {
    // 1. If not OCR Invoice, fallback to existing incorrectEntries
    if (file.sourceType !== 'OCR_INVOICE' || !file.data) {
      return file.incorrectEntries || 0;
    }

    let issues = 0;
    const data = file.data;

    // 2. Header Validations
    // GSTIN Check
    const gstinToCheck = data.voucherType === 'Sales' ? data.buyerGstin : data.supplierGstin;
    if (!gstinToCheck || !isValidGSTIN(gstinToCheck)) {
      issues++;
    } else {
      // Double check just in case buyer/supplier logic is mixed, 
      // usually we check the COUNTER PARTY's GSTIN. 
      // Assuming currentInvoice logic sets buyerGstin/supplierGstin correctly.
    }

    // Date Check
    if (!data.invoiceDate || !isValidDate(data.invoiceDate)) {
      issues++;
    }

    // Invoice Number Check
    if (!data.invoiceNumber || data.invoiceNumber.trim() === '') {
      issues++;
    }

    // Party Name Check (Buyer for Sales, Supplier for Purchase)
    if (data.voucherType === 'Sales') {
      if (!data.buyerName || data.buyerName.trim() === '') issues++;
    } else {
      if (!data.supplierName || data.supplierName.trim() === '') issues++;
    }

    // Note: User explicitly requested to IGNORE 0-amount items for issue counting in dashboard.
    // So logic here purely counts Header-level validity issues.

    return issues;
  };

  // Computed Statistics
  const totalFiles = files.length;
  const successFiles = files.filter(f => f.status === 'Success').length;
  // Dynamic Failed Files count: any file with >0 issues is considered "At Risk" or "Failed" effectively for the card
  // But let's keep status check for "Failed" status, but "Mismatches" card uses the calc.
  const failedFiles = files.filter(f => f.status === 'Failed' || f.status === 'Mismatch').length;
  const totalCorrect = files.reduce((acc, curr) => acc + (curr.correctEntries || 0), 0);

  // USE NEW LOGIC for Total Mismatches
  const totalIncorrect = files.reduce((acc, curr) => acc + calculateFileIssues(curr), 0);

  const readyCount = files.filter(f => f.status === 'Ready').length;
  const isPushDisabled = isPushing || readyCount === 0;

  const filterOptions = [
    'All', 'Success', 'Ready', 'Failed', 'Processing',
    'Sales', 'Purchase', 'Excel', 'Bank Statement'
  ];

  const getSourceLabel = (type: string) => {
    if (type === 'INVOICE_IMPORT') return 'INVOICE IMPORT';
    return type.replace('_', ' ');
  };

  return (
    <div className="flex flex-col h-full gap-8 overflow-y-auto scrollbar-hide animate-fade-in relative transition-colors">

      {/* Top Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">System Overview</h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Monitoring your intelligent accounting pipeline</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <button
            onClick={onNavigateToUpload}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black transition-all shadow-lg shadow-indigo-600/20 active:scale-95 whitespace-nowrap"
          >
            <UploadCloud className="w-5 h-5" />
            Upload New
          </button>

          <button
            onClick={onPushSuccess}
            disabled={isPushDisabled}
            className={`
                flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-black transition-all active:scale-95 border-2 whitespace-nowrap
                ${!isPushDisabled
                ? 'bg-emerald-600 dark:bg-emerald-600 border-emerald-600 dark:border-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20'
                : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-500 cursor-not-allowed opacity-90'}
                `}
          >
            {isPushing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Push All ({readyCount})
          </button>
        </div>
      </div>

      {/* High-Fidelity Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6">
        {[
          { icon: BarChart2, label: 'Invoices', val: totalFiles, color: 'text-blue-600', darkColor: 'dark:text-blue-400', bg: 'bg-blue-50', border: 'border-blue-200', darkBorder: 'dark:border-blue-900/50', sub: 'Total Uploaded' },
          { icon: CheckCircle2, label: 'Success', val: successFiles, color: 'text-emerald-600', darkColor: 'dark:text-emerald-400', bg: 'bg-emerald-50', border: 'border-emerald-200', darkBorder: 'dark:border-emerald-900/50', sub: 'Imported Clear' },
          { icon: AlertCircle, label: 'Failed', val: failedFiles, color: 'text-red-600', darkColor: 'dark:text-red-400', bg: 'bg-red-50', border: 'border-red-200', darkBorder: 'dark:border-red-900/50', sub: 'Action Required' },
          { icon: CheckSquare, label: 'Matches', val: totalCorrect, color: 'text-indigo-600', darkColor: 'dark:text-indigo-400', bg: 'bg-indigo-50', border: 'border-indigo-200', darkBorder: 'dark:border-indigo-900/50', sub: 'Correct Entries' },
          { icon: AlertTriangle, label: 'Mismatches', val: totalIncorrect, color: 'text-orange-600', darkColor: 'dark:text-orange-400', bg: 'bg-orange-50', border: 'border-orange-200', darkBorder: 'dark:border-orange-900/50', sub: 'Entry Flags' }
        ].map((card, i) => (
          <div key={i} className={`relative group p-6 rounded-[28px] border-2 shadow-md transition-all hover:shadow-xl hover:-translate-y-1 overflow-hidden ${card.bg} dark:bg-slate-900 ${card.border} ${card.darkBorder}`}>
            <div className={`absolute -right-4 -bottom-4 p-4 opacity-[0.12] dark:opacity-[0.08] transition-transform duration-700 group-hover:scale-125 group-hover:rotate-12 ${card.color} ${card.darkColor}`}>
              <card.icon className="w-24 h-24" />
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center ${card.color} ${card.darkColor} shadow-sm border border-white dark:border-slate-700`}>
                  <card.icon className="w-6 h-6" />
                </div>
                <span className={`text-5xl font-black tracking-tighter ${card.color} ${card.darkColor}`}>
                  {card.val.toString().padStart(2, '0')}
                </span>
              </div>
              <div className="mt-8">
                <p className="text-[11px] font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-[0.05em] leading-none mb-1">
                  {card.label}
                </p>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight opacity-80">
                  {card.sub}
                </p>
              </div>
            </div>
            <div className="absolute top-0 left-0 right-0 h-px bg-white/40 dark:bg-white/5 pointer-events-none"></div>
          </div>
        ))}
      </div>

      {/* Table Container */}
      <div className="bg-white dark:bg-transparent border border-slate-300 dark:border-slate-800 rounded-[32px] shadow-sm flex flex-col overflow-hidden min-h-[500px] transition-colors">

        {/* Table Header Section */}
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-slate-50/50 dark:bg-slate-950/20">
          <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Active Transactions</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Real-time accounting stream</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Ref no, supplier, date..."
                className="pl-12 pr-6 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-900 dark:text-white w-full lg:w-72 shadow-inner transition-all"
              />
            </div>

            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                className={`p-3 border rounded-2xl transition-all shadow-sm active:scale-95 relative ${filterStatus !== 'All'
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <Filter className="w-5 h-5" />
                {filterStatus !== 'All' && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
                )}
              </button>

              {isFilterDropdownOpen && (
                <div className="absolute right-0 top-full mt-3 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-[60] animate-fade-in">
                  <div className="py-2 max-h-[200px] overflow-y-auto">
                    {filterOptions.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          onFilterChange(opt);
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-5 py-3 text-sm font-bold transition-all text-left group
                            ${filterStatus === opt
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                          }`}
                      >
                        <span>{opt}</span>
                        {filterStatus === opt && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={onDeleteAll}
              className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-all shadow-sm active:scale-95"
              title="Delete All Files"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={onDownloadAll}
              className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm active:scale-95"
              title="Download All Visible"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto scrollbar-hide">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-[10px] text-slate-500 dark:text-slate-600 font-extrabold uppercase tracking-widest bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
              <tr>
                <th className="px-8 py-5">Origin / File</th>
                <th className="px-8 py-5 text-center">Preview</th>
                <th className="px-8 py-5">Current Status</th>
                <th className="px-8 py-5 text-center">Correct</th>
                <th className="px-8 py-5 text-center">Issues</th>
                <th className="px-8 py-5">Remarks</th>
                <th className="px-8 py-5">Latency</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {files.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-8 py-32 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-20 h-20 bg-slate-50 dark:bg-slate-950 rounded-[28px] border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-800 shadow-inner">
                        <FileText className="w-10 h-10 opacity-50" />
                      </div>
                      <p className="font-bold tracking-tight">No matching documents found.</p>
                      <button
                        onClick={() => onFilterChange('All')}
                        className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest underline underline-offset-4"
                      >
                        Clear all filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                files.map((file) => (
                  <tr key={file.id} className="group hover:bg-slate-50 dark:hover:bg-indigo-600/5 transition-all">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all group-hover:scale-105 shadow-sm ${file.sourceType === 'EXCEL_IMPORT' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-500' :
                          file.sourceType === 'BANK_STATEMENT' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-500' :
                            'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-500'
                          }`}>
                          {file.sourceType === 'EXCEL_IMPORT' ? <FileSpreadsheet className="w-5 h-5" /> :
                            file.sourceType === 'BANK_STATEMENT' ? <Landmark className="w-5 h-5" /> :
                              <FileText className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-black text-slate-800 dark:text-white text-sm tracking-tight">{file.fileName}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-0.5">{getSourceLabel(file.sourceType)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <button
                        onClick={() => onView(file)}
                        className="p-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-indigo-500 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:text-white hover:border-indigo-600 transition-all shadow-sm active:scale-90"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`
                            px-4 py-2 rounded-xl text-[10px] font-black tracking-widest inline-flex items-center gap-2 shadow-sm border transition-colors
                            ${file.status === 'Success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : ''}
                            ${file.status === 'Ready' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' : ''}
                            ${(file.status === 'Failed' || file.status === 'Mismatch') ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' : ''}
                            ${(file.status === 'Processing' || file.status === 'Pending') ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' : ''}
                        `}>
                        {(file.status === 'Processing' || file.status === 'Pending') && <RefreshCw className="w-3 h-3 animate-spin" />}
                        {file.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center text-lg font-bold text-slate-600 dark:text-slate-600 font-mono tracking-tight">
                      {file.correctEntries.toString().padStart(2, '0')}
                    </td>
                    <td className="px-8 py-6 text-center text-lg font-bold text-slate-600 dark:text-slate-600 font-mono tracking-tight">
                      {calculateFileIssues(file).toString().padStart(2, '0')}
                    </td>
                    <td className="px-8 py-6 text-slate-500 dark:text-slate-500 font-bold text-xs truncate max-w-[150px]">
                      {file.error || '-'}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-tighter">
                        <Clock className="w-3.5 h-3.5" />
                        {file.timeTaken || 'n/a'}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right flex justify-end gap-2">
                      <button
                        onClick={() => onDelete(file.id)}
                        className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-all active:scale-95 shadow-sm"
                        title="Delete File"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      {file.status === 'Ready' && file.sourceType === 'OCR_INVOICE' && (
                        <button
                          onClick={() => onPush(file)}
                          className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:scale-105 transition-all active:scale-95 shadow-sm"
                          title="Push to Tally"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => onDownload(file)}
                        className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all active:scale-95 shadow-sm"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Stats Row */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-transparent flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-8 flex-wrap">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aggregate Count:</p>
              <span className="text-sm font-black text-slate-700 dark:text-white">{totalFiles}</span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Filter:</p>
              <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">{filterStatus}</span>
            </div>
          </div>

          <button
            onClick={onRetry}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-black shadow-sm border border-slate-200 dark:border-slate-700 transition-all active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Failures
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
