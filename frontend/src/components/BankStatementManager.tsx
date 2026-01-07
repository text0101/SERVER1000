// frontend/src/components/BankStatementManager.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UploadCloud, FileText, ArrowLeft, ArrowRight, Loader2, Trash2, Landmark, Save, History, Zap, ShieldCheck, CheckCircle } from 'lucide-react';
import { BankStatementData, BankTransaction, ProcessedFile } from '../types';
import { processBankStatementPDF, processBankStatement, unlockPdf } from '../services/backendService';
import { BACKEND_API_KEY } from '../constants';
import { generateBankStatementXml, pushToTally, fetchExistingLedgers, fetchOpenCompanies, checkTallyConnection } from '../services/tallyService';
import { v4 as uuidv4 } from 'uuid';
import TallyDisconnectedModal from './TallyDisconnectedModal';
import InvalidFileModal from './InvalidFileModal';
import { isPasswordRequiredError } from '../utils/passwordDetection';

interface BankStatementManagerProps {
  onPushLog: (status: 'Success' | 'Failed' | 'Processing', message: string, response?: string) => void;
  externalFile?: File | null;
  externalData?: BankStatementData | null; // Pre-loaded data from dashboard
  externalStatus?: string; // Status from dashboard
  onRedirectToInvoice?: (file: File) => void;
  onRegisterFile?: (file: File) => string;
  userName?: string;
  onUpdateFile?: (id: string, updates: Partial<ProcessedFile>) => void;
  onDelete?: (id?: string) => void;
  onBack?: () => void;
  // Unified password request callback - provided by App.tsx
  onRequestPassword?: (
    file: File,
    documentType: 'Invoice' | 'Bank Statement',
    onUnlock: (password: string) => Promise<void>,
    errorMessage?: string
  ) => void;
}

const BankStatementManager: React.FC<BankStatementManagerProps> = ({
  onPushLog, externalFile, externalData, externalStatus, onRedirectToInvoice, onRegisterFile, onUpdateFile, onDelete, onBack, userName, onRequestPassword
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [data, setData] = useState<BankStatementData>({ bankName: "HDFC Bank", accountNumber: undefined, transactions: [] });
  const [step, setStep] = useState<1 | 2>(1);
  const [isPushing, setIsPushing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showInvoiceAlert, setShowInvoiceAlert] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const processedFileRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Password file state (for tracking pending password file locally)
  const [pendingPasswordFile, setPendingPasswordFile] = useState<File | null>(null);

  // Drag and Drop State
  const [isDragOver, setIsDragOver] = useState(false);

  // Company and Ledger state
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [availableLedgers, setAvailableLedgers] = useState<string[]>([]);

  useEffect(() => {
    if (pageScrollRef.current && data.transactions.length > 0) {
      pageScrollRef.current.scrollTop = pageScrollRef.current.scrollHeight;
    }
  }, [data.transactions]);

  useEffect(() => {
    const saved = localStorage.getItem('autotally_bank_draft');
    setHasDraft(!!saved);
  }, []);

  // Fetch companies and ledgers on mount
  useEffect(() => {
    const loadCompaniesAndLedgers = async () => {
      try {
        const companyList = await fetchOpenCompanies();
        setCompanies(companyList);
        if (companyList.length > 0) {
          setSelectedCompany(companyList[0]);
          const ledgers = await fetchExistingLedgers(companyList[0]);
          setAvailableLedgers(Array.from(ledgers));
        }
      } catch (error) {
        console.error('Failed to load companies/ledgers:', error);
      }
    };
    loadCompaniesAndLedgers();
  }, []);

  // Reload ledgers when company changes
  useEffect(() => {
    if (selectedCompany) {
      fetchExistingLedgers(selectedCompany).then(ledgers => {
        setAvailableLedgers(Array.from(ledgers));
      });
    }
  }, [selectedCompany]);

  useEffect(() => {
    // Only set file state if we have a new file
    if (externalFile && externalFile.name !== processedFileRef.current) {
      setFile(externalFile);

      const hasData = externalData && externalData.transactions.length > 0;
      const isProcessingExternal = externalStatus === 'Processing';
      const isFailed = externalStatus === 'Failed';
      const isSuccess = externalStatus === 'Success' || externalStatus === 'Ready';

      if (hasData || isSuccess) {
        processedFileRef.current = externalFile.name;
        setStep(2);
        setIsProcessing(false);
      } else if (isProcessingExternal) {
        // Ghost processing typically
        processedFileRef.current = externalFile.name;
        setIsProcessing(true);
        setStep(1);
      } else if (isFailed) {
        processedFileRef.current = externalFile.name;
        setIsProcessing(false);
        setStep(1);
      } else {
        // New file or Pending
        setStep(1);

        // CRITICAL FIX: Only reset processing if this is a DIFFERENT file.
        // If we are already processing this file locally (isProcessing=true), 
        // receiving "Pending" status from parent shouldn't stop us.
        const isSameFile = file && file.name === externalFile.name;
        if (!isSameFile) {
          setIsProcessing(false);
        }
        // Do NOT set processedFileRef.current so auto-processing starts (if not already running)
      }
    } else if (!externalFile) {
      // Reset if external file is cleared (e.g. Cancelled)
      setFile(null);
      setFileId(null);
      setStep(1);
      processedFileRef.current = null;
      setIsProcessing(false);
    }
  }, [externalFile, externalData, externalStatus]);

  // Process file automatically when it is set (and not processed yet)
  // BUT skip if we're waiting for password input
  useEffect(() => {
    if (file && file.name !== processedFileRef.current && !isProcessing && !pendingPasswordFile) {
      handleProcessFile();
    }
  }, [file, pendingPasswordFile]);

  useEffect(() => {
    if (externalData && externalData.transactions.length > 0) {
      // Apply same cleaning logic
      let cleanBank = externalData.bankName || 'Unknown Bank';
      // Always remove Ltd/Limited first
      cleanBank = cleanBank.replace(/\s*Ltd\.?$/i, '').replace(/\s*Limited$/i, '').trim();

      let cleanAcct = externalData.accountNumber;

      if (!cleanAcct && cleanBank) {
        const match = cleanBank.match(/^(.*?)[-\s]+(\d{4,})$/);
        if (match) {
          cleanBank = match[1].replace(/\s*Ltd\.?$/i, '').replace(/\s*Limited$/i, '').trim();
          cleanAcct = match[2];
        }
      }

      setData({
        ...externalData,
        bankName: cleanBank,
        accountNumber: cleanAcct
      });
      setStep(2); // Skip to transaction table
      setIsProcessing(false);
    } else if (externalData === null && !externalFile && step === 2) {
      // Reset if data is cleared externally (e.g. deleted)
      setData({
        id: '',
        bankName: '',
        transactions: [],
        gstin: '',
        ifsc: ''
      });
      setStep(1);
      setFile(null);
    }
  }, [externalData, externalFile, step]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isProcessing) return; // Prevent dropping while processing
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  }, [isProcessing]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleProcessFile = async (password?: string, fileOverride?: File) => {
    const uploadedFile = fileOverride || file;

    // Safety check: if we have a password (retry) but no file, return
    if (!uploadedFile) {
      return;
    }

    // Prevent concurrent processing unless we are retrying with password
    if (isProcessing && !password) return;

    // Create new AbortController for this processing session
    abortControllerRef.current = new AbortController();

    let currentFileId: string | null = null;

    // Only register on first attempt (no password provided)
    if (!password) {
      if (onRegisterFile) {
        currentFileId = onRegisterFile(uploadedFile);
        setFileId(currentFileId);
      }
    } else {
      // If retrying, clear pending password file
      setPendingPasswordFile(null);
    }

    const activeFileId = currentFileId || fileId;

    setIsProcessing(true);
    setShowInvoiceAlert(false);
    const start = Date.now();

    try {
      // Use page-by-page processing for PDFs to handle large files
      // If password provided, pass it
      // Check if file is PDF (by type or extension which is safer)
      const isPdf = uploadedFile.type === 'application/pdf' || uploadedFile.name.toLowerCase().endsWith('.pdf');

      // Use page-by-page processing for PDFs to handle large files
      // If password provided, pass it
      // Pass abort signal to allow cancellation
      const result = isPdf
        ? await processBankStatementPDF(uploadedFile, BACKEND_API_KEY, password, abortControllerRef.current?.signal)
        : await processBankStatement(uploadedFile, BACKEND_API_KEY, abortControllerRef.current?.signal);

      if (result.status === 429) {
        onPushLog('Failed', 'Quota Exceeded', 'AI quota exceeded. Please wait or upgrade plan.');
        if (onUpdateFile && activeFileId) {
          onUpdateFile(activeFileId, { status: 'Failed', error: 'AI Quota Exceeded' });
        }
        return;
      }

      // Password-protected check
      console.log("🔒 Password Required check: ", result.status, result.message);
      if (isPasswordRequiredError(result)) {
        console.log("✅ Requesting password via callback...");

        // If we already tried a password and failed, it's incorrect
        const isRetry = !!password;

        // Track the file locally
        setPendingPasswordFile(uploadedFile);

        // Request password via the unified modal in App.tsx
        if (onRequestPassword) {
          onRequestPassword(
            uploadedFile,
            'Bank Statement',
            async (pwd: string) => {
              try {
                // 1. Verify password by unlocking PDF
                const decryptedPdf = await unlockPdf(uploadedFile, pwd);
                if (!decryptedPdf) {
                  throw new Error('Incorrect password');
                }

                // 2. Success - continue processing with password
                setPendingPasswordFile(null);
                await handleProcessFile(pwd, uploadedFile);
              } catch (e) {
                throw e; // Let the hook handle the error display
              }
            },
            isRetry ? 'Incorrect password. Please try again.' : ''
          );
        }

        processedFileRef.current = null;
        setIsProcessing(false);

        // Update file status to show it's waiting for password
        if (onUpdateFile && activeFileId) {
          onUpdateFile(activeFileId, { status: 'Pending', error: 'Password Required' });
        }
        return;
      }

      if (!result.success) {
        throw new Error(result.message || "Processing failed");
      }

      // DEBUG: Log the result to check documentType
      console.log('🔍 Bank Statement Processing Result:', result);
      console.log('📋 Document Type:', result.documentType);

      if (result.documentType === 'INVOICE') {
        console.log('✅ INVOICE DETECTED! Showing mismatch alert...');
        setShowInvoiceAlert(true);
        // Mark as processed so we don't loop, even though it's the "wrong" type
        processedFileRef.current = uploadedFile.name;
        // Do NOT call onUpdateFile with failure yet, waiting for user decision
        setIsProcessing(false);
        return;
      }

      // Check if transactions exist safely
      const rawTransactions = result.transactions || [];

      setStep(2);

      // Auto-fix bank name/account number if merged
      let cleanBankName = result.bankName || 'Unknown Bank';
      // Always remove Ltd/Limited first
      cleanBankName = cleanBankName.replace(/\s*Ltd\.?$/i, '').replace(/\s*Limited$/i, '').trim();

      let cleanAcctNum = result.accountNumber;

      if (!cleanAcctNum && cleanBankName) {
        // Try to capture trailing digits as account number
        const match = cleanBankName.match(/^(.*?)[-\s]+(\d{4,})$/);
        if (match) {
          cleanBankName = match[1].replace(/\s*Ltd\.?$/i, '').replace(/\s*Limited$/i, '').trim();
          cleanAcctNum = match[2];
        }
      }

      const newData: BankStatementData = {
        id: activeFileId || undefined,
        documentType: 'BANK_STATEMENT',
        bankName: cleanBankName,
        accountNumber: cleanAcctNum,
        // gstin: result.gstin, // Not available in result yet
        // ifsc: result.ifsc,
        transactions: rawTransactions.map(t => ({
          ...t,
          id: uuidv4(),
          contraLedger: (() => {
            const guessed = guessLedgerFromDescription(t.description);
            // If our rule explicitly found 'Suspense A/c' AND the description contains transfer keywords, enforce it over AI
            // This fixes the issue where AI says "Internal Bank Transfer" but user wants "Suspense A/c"
            const descLower = t.description.toLowerCase();
            if (descLower.includes('ib:') || descLower.includes('fund trf') || descLower.includes('internal') || descLower.includes('sweep') || descLower.includes('trf')) {
              return 'Suspense A/c';
            }
            return t.contraLedger || guessed;
          })(),
          voucherType: (t.withdrawal > 0 ? 'Payment' : 'Receipt') as 'Payment' | 'Receipt' | 'Contra'
        }))
      };
      setData(newData);

      // Success! Mark as processed.
      processedFileRef.current = uploadedFile.name;

      const duration = ((Date.now() - start) / 1000 / 60).toFixed(1);
      const correctCount = newData.transactions.filter(t => t.contraLedger !== 'Suspense A/c').length;
      const expectedFields = newData.transactions.length; // Approximate

      onPushLog('Success', 'Bank Statement Analyzed', `Found ${newData.transactions.length} transactions.`);

      if (onUpdateFile && activeFileId) {
        onUpdateFile(activeFileId, {
          status: 'Success',
          bankData: newData,
          correctEntries: correctCount,
          incorrectEntries: Math.max(0, expectedFields - correctCount),
          timeTaken: `${duration} min`
        });
      }
    } catch (error: any) {
      // Check if this was an abort/cancellation
      if (error?.name === 'AbortError' || error?.message?.includes('cancel')) {
        console.log('Processing cancelled by user');
        setIsProcessing(false);
        return; // Don't log as failure if user cancelled
      }

      const detail =
        error?.message ||
        error?.response?.detail ||
        (typeof error === "string" ? error : JSON.stringify(error));

      // Final failure - NO RETRIES
      console.error(`❌ Processing failed: ${detail}`);
      onPushLog('Failed', 'Bank Statement Processing Failed', detail);
      processedFileRef.current = uploadedFile.name; // Stop any further processing

      if (onUpdateFile && activeFileId) {
        onUpdateFile(activeFileId, {
          status: 'Failed',
          error: detail
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // handlePasswordSubmit removed - now handled by onRequestPassword callback in App.tsx

  const handleCancelProcessing = () => {
    // Abort the ongoing API call
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset state
    setIsProcessing(false);
    setShowInvoiceAlert(false);
    processedFileRef.current = null;

    // Call onDelete to remove from dashboard
    if (onDelete) {
      onDelete(fileId || data.id || undefined);
    }

    // Clear file
    setFile(null);
    setFileId(null);
    setStep(1);

    // Clear pending password file
    setPendingPasswordFile(null);
  };

  const handleClearAlert = () => {
    setFile(null);
    setStep(1);
    setShowInvoiceAlert(false);
  };

  const handleRedirect = () => {
    if (file) {
      onRedirectToInvoice?.(file);
      setFile(null);
      setStep(1);
      setShowInvoiceAlert(false);
    }
  };

  const handleSaveDraft = () => {
    localStorage.setItem('autotally_bank_draft', JSON.stringify(data));
    onPushLog('Success', 'Draft Saved', 'Bank statement draft saved locally.');
    setHasDraft(true);
  };

  const handleRestoreDraft = () => {
    try {
      const saved = localStorage.getItem('autotally_bank_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        setData(parsed);
        setStep(2);
        onPushLog('Success', 'Draft Restored', 'Loaded draft from storage.');
      }
    } catch (e) { console.error(e); }
  };

  const clearDraft = () => {
    localStorage.removeItem('autotally_bank_draft');
    setHasDraft(false);
  };

  const guessLedgerFromDescription = (desc: string): string => {
    const lower = desc.toLowerCase();
    // Personal / Staff Welfare
    if (lower.includes('swiggy') || lower.includes('zomato') || lower.includes('mcdonalds') || lower.includes('pizza') || lower.includes('restaurant') || lower.includes('food')) return 'Staff Welfare';
    if (lower.includes('blinkit') || lower.includes('zepto') || lower.includes('bigbasket.com') || lower.includes('instamart')) return 'Office Expenses';

    // Travel
    if (lower.includes('uber') || lower.includes('ola') || lower.includes('fuel') || lower.includes('petrol') || lower.includes('pump') || lower.includes('hpcl') || lower.includes('bpcl') || lower.includes('shell')) return 'Travelling Expenses';

    // Office / Utilities
    if (lower.includes('amazon') || lower.includes('flipkart') || lower.includes('myntra')) return 'Office Expenses';
    if (lower.includes('airtel') || lower.includes('jio') || lower.includes('vi') || lower.includes('bsnl') || lower.includes('internet') || lower.includes('broadband') || lower.includes('act ')) return 'Telephone & Internet';
    if (lower.includes('electricity') || lower.includes('power') || lower.includes('bescom') || lower.includes('tata power') || lower.includes('adani power')) return 'Electricity Charges';
    if (lower.includes('rent') || lower.includes('tolet')) return 'Rent';

    // Bank
    if (lower.includes('interest')) return 'Bank Interest';
    if (lower.includes('charges') || lower.includes('fee') || lower.includes('min bal') || lower.includes('sms') || lower.includes('consolidated')) return 'Bank Charges';

    // UPI / Transfers - Map to Suspense by default for safety
    if (lower.includes('upi') || lower.includes('imps') || lower.includes('neft') || lower.includes('rtgs')) {
      // Try to find specific vendor names here if needed, otherwise Suspense
      return 'Suspense A/c';
    }

    // Salary
    if (lower.includes('salary') || lower.includes('payroll')) return 'Salary Payable';

    // Internal Transfers
    if (lower.includes('ib:') || lower.includes('fund trf') || lower.includes('internal') || lower.includes('sweep') || lower.includes('trf') || lower.includes('self') || lower.includes('cntr')) return 'Suspense A/c';

    // Default: Return empty if no rule matches (let AI or User decide)
    return '';
  };

  const handleTransactionChange = (id: string, field: keyof BankTransaction, value: string | number) => {
    setData(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => {
        if (t.id !== id) return t;
        const updated = { ...t, [field]: value } as BankTransaction;
        if (field === 'description' && typeof value === 'string') {
          const currentLedger = t.contraLedger;
          if (!currentLedger || currentLedger === 'Suspense A/c' || currentLedger === 'UPI Suspense') {
            const guessed = guessLedgerFromDescription(value);
            if (guessed !== 'Suspense A/c') updated.contraLedger = guessed;
          }
        }
        return updated;
      })
    }));
  };

  const removeTransaction = (id: string) => {
    setData(prev => ({ ...prev, transactions: prev.transactions.filter(t => t.id !== id) }));
  };

  const addTransaction = () => {
    setData(prev => ({
      ...prev,
      transactions: [
        ...prev.transactions,
        {
          id: uuidv4(),
          date: new Date().toISOString().slice(0, 10),
          description: 'New Transaction',
          withdrawal: 0,
          deposit: 0,
          voucherType: 'Payment',
          contraLedger: 'Suspense A/c'
        }
      ]
    }));
  };

  // Tally Disconnect Modal
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  const handlePushToTally = async () => {
    const status = await checkTallyConnection();
    if (!status.online) {
      setShowDisconnectModal(true);
      return;
    }

    setIsPushing(true);
    try {
      const existingLedgers = await fetchExistingLedgers();
      const displayName = data.accountNumber ? `${data.bankName}-${data.accountNumber.replace(/\D/g, '').slice(-4)}` : data.bankName;
      const xml = generateBankStatementXml(data, displayName, selectedCompany, {});
      const result = await pushToTally(xml);
      if (result.success) {
        onPushLog('Success', `Bank Statement (${displayName}) Pushed`, `${data.transactions.length} vouchers generated. Missing ledgers auto-created.`);
        if (onUpdateFile && fileId) onUpdateFile(fileId, { status: 'Success' });
      } else {
        onPushLog('Failed', 'Bank Statement Push Failed', result.message);
        if (onUpdateFile && fileId) onUpdateFile(fileId, { status: 'Failed', error: result.message });
      }
    } catch (e) {
      onPushLog('Failed', 'Network Error', e instanceof Error ? e.message : 'Unknown');
      if (onUpdateFile && fileId) onUpdateFile(fileId, { status: 'Failed', error: 'Network Error' });
    } finally {
      setIsPushing(false);
    }
  };

  const inputClass = "w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-tally-500 outline-none";

  return (
    <div
      ref={pageScrollRef}
      className={`flex flex-col h-full min-h-0 gap-6 animate-fade-in relative overflow-hidden p-1 transition-all duration-200 ${isDragOver ? 'bg-indigo-50/30 dark:bg-indigo-900/10 ring-2 ring-indigo-500 ring-inset rounded-xl' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <InvalidFileModal
        isOpen={showInvoiceAlert}
        type="mismatch"
        fileName={file?.name || 'Document'}
        reason=""
        onClose={() => setShowInvoiceAlert(false)}
        onConfirm={handleRedirect}
        currentSection="Bank Statement"
        detectedType="Invoice"
        targetSectionName="Invoice processor"
      />

      {showDisconnectModal && <TallyDisconnectedModal onClose={() => setShowDisconnectModal(false)} />}

      <div
        className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex justify-between items-center shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {(step === 2 || onBack) && (
            <button
              onClick={() => {
                // If we have external data (viewing mode), back should go to dashboard
                // Otherwise, if we are in step 2 (just uploaded), go back to step 1
                if (step === 2 && !externalData) {
                  setStep(1);
                } else if (onBack) {
                  onBack();
                }
              }}
              className="p-1.5 -ml-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg transition-colors"
              title={step === 2 && !externalData ? "Back to Upload" : "Back to Dashboard"}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Landmark className="w-5 h-5 text-indigo-600" /> Bank Statement
            </h2>
            <p className="text-xs text-slate-500">Extract PDF statements to Payment/Receipt vouchers</p>
          </div>
        </div>

        {step === 2 && (
          <div className="flex items-center gap-2">
            <button onClick={handleSaveDraft} className="flex items-center gap-1 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-medium transition-colors" title="Save progress locally">
              <Save className="w-3.5 h-3.5" /> Save Draft
            </button>
            <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shadow-sm border bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-900/50">
              + Add New File
            </button>
            {onDelete && (
              <button
                onClick={() => onDelete(fileId || data.id || undefined)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shadow-sm border bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Entry
              </button>
            )}
            <button onClick={handlePushToTally} disabled={isPushing} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg font-medium flex items-center gap-1.5 shadow-md disabled:opacity-70 disabled:cursor-not-allowed text-xs">
              {isPushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {isPushing ? 'Updating Tally...' : 'Push to Tally'}
            </button>
          </div>
        )}
      </div>

      {step === 1 ? (
        <div className="flex-1 flex flex-col min-h-0 gap-4 animate-fade-in relative p-1 overflow-y-auto scrollbar-hide">
          <div
            onClick={(e) => { e.stopPropagation(); if (!isProcessing) fileInputRef.current?.click(); }}
            className={`
              flex-1 flex flex-col items-center justify-center rounded-[24px] border-4 border-dashed transition-all duration-300 p-6 relative overflow-hidden shadow-sm min-h-[300px] group
              ${isProcessing ? 'cursor-default' : 'cursor-pointer'}
              ${isDragOver ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10 scale-[0.99] ring-4 ring-indigo-500/20' : 'border-slate-200 dark:border-slate-700 bg-indigo-50/30 dark:bg-indigo-900/10 hover:bg-white dark:hover:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500'}
            `}
          >
            {isProcessing ? (
              <div className="text-center space-y-4 max-w-md animate-fade-in w-full px-8">
                <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-4 relative overflow-hidden">
                  <div className="absolute inset-0 border-4 border-indigo-100 dark:border-indigo-900/30 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-t-indigo-600 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                  <Landmark className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-pulse relative z-10" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Analyzing Statement...</h3>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 animate-progress-indeterminate rounded-full"></div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Extracting dates, descriptions, and amounts from your document.</p>
                {onDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCancelProcessing(); }}
                    className="mt-4 px-4 py-1.5 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-xs font-semibold shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-red-500 dark:hover:text-red-400 transition-colors inline-flex items-center gap-1.5"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center space-y-3 max-w-md">
                <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mb-4 shadow-inner mx-auto transition-transform duration-500 group-hover:scale-110">
                  <UploadCloud className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Drop Bank Statement Here</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  Support PDF, JPG, and PNG formats.
                </p>

                <div className="pt-2 flex flex-col items-center gap-3">
                  {isProcessing ? (
                    <div className="text-center space-y-2">
                      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Processing {file?.name}...</p>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold text-base shadow-xl shadow-indigo-600/20 transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-2"
                      >
                        Select Document
                        <ArrowRight className="w-4 h-4" />
                      </button>

                    </>
                  )}

                  {hasDraft && !file && !isProcessing && (
                    <button
                      onClick={handleRestoreDraft}
                      className="flex items-center gap-2 px-4 py-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg text-xs font-bold transition-colors"
                    >
                      <History className="w-3.5 h-3.5" />
                      Restore unsaved draft
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
            {[
              { icon: Zap, label: 'Smart Categorization', desc: 'AI guesses ledgers from descriptions.', color: 'text-indigo-500' },
              { icon: CheckCircle, label: 'Auto-Balancing', desc: 'Ensures Debits equal Credits.', color: 'text-emerald-500' },
              { icon: ShieldCheck, label: 'Secure Parsing', desc: 'Local processing for maximum privacy.', color: 'text-amber-500' }
            ].map((feat, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                <div className={`w-8 h-8 bg-slate-50 dark:bg-slate-900 rounded-lg flex items-center justify-center shadow-inner border border-slate-100 dark:border-slate-700 ${feat.color}`}>
                  <feat.icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase text-slate-800 dark:text-white tracking-wider">{feat.label}</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/50 shrink-0">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Your Tally Bank Ledger Name</label>
              <input
                type="text"
                value={data.accountNumber ? `${data.bankName} - ${data.accountNumber.replace(/\D/g, '').slice(-4)}` : data.bankName}
                onChange={(e) => {
                  const val = e.target.value;
                  // Parse the combined format "Bank Name - XXXX"
                  const dashIndex = val.lastIndexOf('-');
                  if (dashIndex > 0) {
                    const bankName = val.substring(0, dashIndex).trim();
                    const acctNum = val.substring(dashIndex + 1).replace(/\D/g, '').slice(-4);
                    setData({ ...data, bankName, accountNumber: acctNum || undefined });
                  } else {
                    setData({ ...data, bankName: val, accountNumber: undefined });
                  }
                }}
                className="inline-block px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold"
                placeholder="e.g. Kotak Mahindra Bank-8694"
                list="tally-ledgers"
              />
              <p className="text-[10px] text-slate-400 mt-1">If this ledger doesn't exist, it will be auto-created in 'Bank Accounts'.</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{data.transactions.length} Transactions</p>
              <p className="text-xs text-slate-500">Review & Map Ledgers below</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3 w-32">Date</th>
                  <th className="px-4 py-3 min-w-[200px]">Description (Narration)</th>
                  <th className="px-4 py-3 w-28">Type</th>
                  <th className="px-4 py-3 w-28 text-right">Debit</th>
                  <th className="px-4 py-3 w-28 text-right">Credit</th>
                  <th className="px-4 py-3 w-48">Contra Ledger (Expense/Party)</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {(data.transactions || []).map((txn) => (
                  <tr key={txn.id} className="group hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="p-2">
                      <input type="text" value={txn.date} onChange={(e) => handleTransactionChange(txn.id, 'date', e.target.value)} className={inputClass} />
                    </td>
                    <td className="p-2">
                      <input type="text" value={txn.description} onChange={(e) => handleTransactionChange(txn.id, 'description', e.target.value)} className={inputClass} />
                    </td>
                    <td className="p-2">
                      <select value={txn.voucherType} onChange={(e) => handleTransactionChange(txn.id, 'voucherType', e.target.value)} className={inputClass}>
                        <option value="Payment">Payment</option>
                        <option value="Receipt">Receipt</option>
                        <option value="Contra">Contra</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input type="number" value={txn.withdrawal} onChange={(e) => handleTransactionChange(txn.id, 'withdrawal', parseFloat(e.target.value) || 0)} className={`${inputClass} text-right ${txn.withdrawal > 0 ? 'font-bold !text-red-600 dark:!text-red-400' : '!text-slate-400'}`} />
                    </td>
                    <td className="p-2">
                      <input type="number" value={txn.deposit} onChange={(e) => handleTransactionChange(txn.id, 'deposit', parseFloat(e.target.value) || 0)} className={`${inputClass} text-right ${txn.deposit > 0 ? 'font-bold !text-green-600 dark:!text-green-400' : '!text-slate-400'}`} />
                    </td>
                    <td className="p-2">
                      <input type="text" value={txn.contraLedger} onChange={(e) => handleTransactionChange(txn.id, 'contraLedger', e.target.value)} className={`${inputClass} ${(txn.contraLedger === 'Suspense A/c' || txn.contraLedger === 'UPI Suspense') ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20' : ''}`} placeholder="Tally Ledger Name" list="tally-ledgers" />
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => removeTransaction(txn.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
            <button onClick={addTransaction} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">+ Add Empty Row</button>
            <div className="flex gap-4 text-sm font-bold text-slate-700 dark:text-slate-300">
              <span>Total Withdrawals: <span className="text-red-600">₹{Number(data.transactions.reduce((sum, t) => sum + (Number(t.withdrawal) || 0), 0)).toFixed(2)}</span></span>
              <span>Total Deposits: <span className="text-green-600">₹{Number(data.transactions.reduce((sum, t) => sum + (Number(t.deposit) || 0), 0)).toFixed(2)}</span></span>
            </div>
          </div>
        </div>
      )
      }
      <datalist id="tally-ledgers">
        {availableLedgers.map((ledger) => (
          <option key={ledger} value={ledger} />
        ))}
      </datalist>
      <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleFileUpload} />

      {/* Password Modal is now handled by App.tsx via onRequestPassword callback */}
    </div>
  );
};

export default BankStatementManager;
