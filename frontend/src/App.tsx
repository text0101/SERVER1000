
import React, { useState, useEffect, useRef } from 'react';
import { usePasswordProtection } from './hooks/usePasswordProtection';
import InvoiceEditor from './components/InvoiceEditor';
import TallyLogs from './components/TallyLogs';
import Dashboard from './components/Dashboard';
import InvoiceUpload from './components/InvoiceUpload';
import ChatBot from './components/ChatBot';
import BankStatementManager from './components/BankStatementManager';
import ExcelImportManager from './components/ExcelImportManager';
import Navbar from './components/Navbar';
import InvalidFileModal from './components/InvalidFileModal';
import SettingsModal from './components/SettingsModal';
import AuthScreen from './components/AuthScreen';
import TokenLimitModal from './components/TokenLimitModal';
import { InvoiceData, LogEntry, AppView, ProcessedFile, Message } from './types';
import { ArrowRight, CheckCircle2, X, FileText, AlertTriangle, CloudUpload, LayoutDashboard } from 'lucide-react';
import { checkTallyConnection, fetchExistingLedgers, generateTallyXml, pushToTally, fetchOpenCompanies, getInvoiceLedgerRequirements } from './services/tallyService';
import BulkLedgerCreationModal from './components/BulkLedgerCreationModal';
import BulkProcessLoader from './components/BulkProcessLoader';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import { processDocumentWithAI, unlockPdf, getTokenUsage, TokenUsageData, updateNotifiedThreshold } from './services/backendService';
import { saveInvoiceToDB, saveLogToDB, deleteUploadFromDB, saveInvoiceRegistry, checkInvoiceExists, getInvoiceRegistry } from './services/dbService';
import { TALLY_API_URL, EMPTY_INVOICE, BACKEND_API_KEY } from './constants';
import { v4 as uuidv4 } from 'uuid';
import TallyDisconnectedModal from './components/TallyDisconnectedModal';
import ImportSummaryModal from './components/ImportSummaryModal';
import PasswordInputModal from './components/PasswordInputModal';
import { isPasswordRequiredError } from './utils/passwordDetection';


const App: React.FC = () => {
    // Auth State with Username
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userName, setUserName] = useState('');
    const [tokenData, setTokenData] = useState<TokenUsageData | null>(null);
    const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);

    // Chat State (Persists on Navigation, Clears on Refresh)


    const [chatMessages, setChatMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'model',
            text: 'Hello! I am your AutoTally Assistant. I specialize in Tally Prime XML, Indian GST laws, and accounting automation. How can I help you today?',
            timestamp: new Date()
        }
    ]);

    // Bulk Processing State
    const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');

    // Currently Active Invoice
    const [currentInvoice, setCurrentInvoice] = useState<InvoiceData | null>(null);
    const [currentFile, setCurrentFile] = useState<File | undefined>(undefined);
    const [activeTab, setActiveTab] = useState<'editor' | 'xml' | 'json'>('editor');

    // Redirect Logic
    const [pendingBankStatementFile, setPendingBankStatementFile] = useState<File | null>(null);
    const [pendingExcelFile, setPendingExcelFile] = useState<ProcessedFile | null>(null);
    const [mismatchedFileAlert, setMismatchedFileAlert] = useState<{ show: boolean, file: ProcessedFile | null }>({ show: false, file: null });

    const isCancelledRef = useRef(false);

    // Invalid File Alert
    const [invalidFileAlert, setInvalidFileAlert] = useState<{ show: boolean, fileName: string, reason: string }>({ show: false, fileName: '', reason: '' });

    // Settings Modal
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const [logs, setLogs] = useState<LogEntry[]>([]);

    const [isPushing, setIsPushing] = useState(false);
    const [shouldAutoTriggerUpload, setShouldAutoTriggerUpload] = useState(false);

    // Companies State for Invoice Editor
    const [companies, setCompanies] = useState<string[]>([]);
    const [loadingCompanies, setLoadingCompanies] = useState(false);

    // Bulk Push Ledger Confirmation State
    const [showBulkLedgerModal, setShowBulkLedgerModal] = useState(false);
    const [bulkProposedLedgers, setBulkProposedLedgers] = useState<string[]>([]);
    const [pendingBulkFiles, setPendingBulkFiles] = useState<ProcessedFile[]>([]);

    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; mode: 'single' | 'all'; id?: string; title: string; message: string; } | null>(null);

    // Bulk Processing State
    const [pendingBulkBatch, setPendingBulkBatch] = useState<{ ids: string[], total: number } | null>(null);

    // Import Summary State
    const [summaryModalOpen, setSummaryModalOpen] = useState(false);
    const [importSummary, setImportSummary] = useState<{ total: number, skipped: number, success: number, failed: number, errors?: string[] }>({ total: 0, skipped: 0, success: 0, failed: 0 });

    // Toast
    const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' | 'warning' }>({ show: false, message: '', type: 'success' });

    // Dark Mode
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme');
            return saved === 'dark';
        }
        return false;
    });

    // Tally Status
    const [tallyStatus, setTallyStatus] = useState<{ online: boolean; info: string; mode: 'full' | 'blind' | 'none'; activeCompany?: string }>({ online: false, info: 'Connecting...', mode: 'none' });
    const [showTallyDisconnectModal, setShowTallyDisconnectModal] = useState(false);

    // Password Handling - Unified for both Invoice and Bank Statement
    const {
        isOpen: showPasswordModal,
        passwordFile: pendingPasswordFile,
        passwordError,
        documentType: passwordDocumentType,
        requirePassword,
        closePasswordModal,
        setPasswordError,
        handlePasswordSubmit
    } = usePasswordProtection<ProcessedFile | File>();

    // Token Limit Modal
    const [showTokenLimitModal, setShowTokenLimitModal] = useState(false);

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [darkMode]);

    useEffect(() => {
        if (toast.show) {
            const timer = setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast.show]);

    useEffect(() => {
        if (isAuthenticated) {
            checkStatus();
        }
    }, [isAuthenticated]);

    // Auto-scroll to top when view changes
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentView]);

    // Sync currentInvoice
    useEffect(() => {
        if (currentFile) {
            const match = processedFiles.find(f => f.file === currentFile);
            if (match && match.data && match.data !== currentInvoice) {
                setCurrentInvoice(match.data);
            }
        }
    }, [processedFiles, currentFile, currentInvoice]);

    useEffect(() => {
        if (currentView === AppView.EDITOR && !currentInvoice && !currentFile && processedFiles.length > 0) {
            const latest = processedFiles.find(f => f.sourceType === 'OCR_INVOICE');
            if (latest) {
                setCurrentFile(latest.file);
                if (latest.data) {
                    setCurrentInvoice(latest.data);
                }
            }
        }
    }, [currentView, processedFiles, currentInvoice, currentFile]);

    useEffect(() => {
        if (currentView === AppView.BULK_PROCESSING && pendingBulkBatch) {
            const batchFiles = processedFiles.filter(f => pendingBulkBatch.ids.includes(f.id));
            const completed = batchFiles.filter(f => f.status !== 'Pending' && f.status !== 'Processing');

            if (completed.length === pendingBulkBatch.total && pendingBulkBatch.total > 0) {
                // All Done - Redirect to Editor with first file
                setTimeout(() => {
                    const first = batchFiles[0];
                    if (first) {
                        setCurrentFile(first.file);
                        setCurrentInvoice(first.data || null);
                        setCurrentView(AppView.EDITOR);
                    } else {
                        setCurrentView(AppView.DASHBOARD);
                    }
                    setPendingBulkBatch(null);
                }, 1500); // Small delay to see 100%
            }
        }
    }, [processedFiles, currentView, pendingBulkBatch]);

    const checkStatus = async () => {
        setTallyStatus({ online: false, info: 'Checking...', mode: 'none' });
        const status = await checkTallyConnection();
        setTallyStatus({
            online: status.online,
            info: status.info,
            mode: status.mode,
            activeCompany: status.activeCompany
        });
    };

    const loadCompanies = async () => {
        setLoadingCompanies(true);
        try {
            const list = await fetchOpenCompanies();
            setCompanies(list);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingCompanies(false);
        }
    };


    const handlePushLog = (status: 'Success' | 'Failed' | 'Processing', message: string, response?: string) => {
        const log: LogEntry = {
            id: uuidv4(),
            timestamp: new Date(),
            method: 'POST',
            endpoint: TALLY_API_URL,
            status: status,
            message: message,
            response: response
        };
        setLogs(prev => [log, ...prev]);
        saveLogToDB(log);
        if (status === 'Success') {
            setToast({ show: true, message: message, type: 'success' });
        }
    };

    const handleRegisterFile = (file: File, type: 'OCR_INVOICE' | 'BANK_STATEMENT' | 'EXCEL_IMPORT') => {
        const newEntry: ProcessedFile = {
            id: uuidv4(),
            file,
            fileName: file.name,
            sourceType: type,
            status: 'Processing',
            correctEntries: 0,
            incorrectEntries: 0,
            timeTaken: '0 min',
            uploadTimestamp: Date.now()
        };
        setProcessedFiles(prev => [newEntry, ...prev]);

        // CRITICAL FIX: Update the specific "pending/active" file state
        // This ensures that the components (BankStatementManager, ExcelImport) receive the new file as a prop
        // immediately after registration, preventing them from resetting to empty state.
        if (type === 'BANK_STATEMENT') {
            setPendingBankStatementFile(file);
        } else if (type === 'EXCEL_IMPORT') {
            setPendingExcelFile(newEntry);
        }

        return newEntry.id;
    };

    const handleUpdateFile = (id: string, updates: Partial<ProcessedFile>) => {
        setProcessedFiles(prev => prev.map(f => {
            if (f.id === id) {
                const updatedFile = { ...f, ...updates };

                // Auto-navigate to Dashboard ONLY for OCR_INVOICE processing
                // Prevent redirect for Bank Statements or Excel Imports so user can edit them
                if ((updates.status === 'Success' || updates.status === 'Failed') && f.sourceType === 'OCR_INVOICE') {
                    setTimeout(() => setCurrentView(AppView.DASHBOARD), 100);
                }

                return updatedFile;
            }
            return f;
        }));
    };

    const calculateEntryStats = (data: InvoiceData) => {
        let correct = 0;
        let incorrect = 0;
        data.lineItems.forEach(item => {
            if (item.amount !== 0) correct++; else incorrect++;
        });
        return { correct, incorrect };
    };

    const handleBulkUpload = async (files: File[]) => {
        const newEntries: ProcessedFile[] = files.map(file => ({
            id: uuidv4(),
            file,
            fileName: file.name,
            sourceType: 'OCR_INVOICE',
            status: 'Pending',
            correctEntries: 0,
            incorrectEntries: 0,
            timeTaken: '-',
            uploadTimestamp: Date.now()
        }));
        setProcessedFiles(prev => [...newEntries, ...prev]);
        isCancelledRef.current = false;

        // Check for Bulk
        if (files.length > 1) {
            const ids = newEntries.map(e => e.id);
            setPendingBulkBatch({ ids, total: ids.length });
            setCurrentView(AppView.BULK_PROCESSING);
        } else if (files.length === 1) {
            setCurrentFile(files[0]);
            setCurrentInvoice(null);
            setCurrentView(AppView.EDITOR);
        } else {
            setCurrentView(AppView.DASHBOARD);
        }

        for (const entry of newEntries) {
            if (isCancelledRef.current) break;

            // Process (async in background loop, but we do await strictly if we want sequential to avoid quota limits?)
            // processSingleFile is async. If we await, it is sequential.
            // This is safer for rate limits.
            await processSingleFile(entry);
        }
    };

    const processSingleFile = async (entry: ProcessedFile, retryCount = 0, password?: string) => {
        if (retryCount === 0 && !password) {
            setProcessedFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'Processing' } : f));
        }

        const start = Date.now();
        try {
            if (!isAuthenticated) {
                throw new Error("User not authenticated");
            }
            if (isCancelledRef.current) return;
            const result = await processDocumentWithAI(entry.file, BACKEND_API_KEY, password);
            if (isCancelledRef.current) return;

            // Handle Password Required
            if (isPasswordRequiredError(result)) {
                // Request password with callback for handling unlock
                requirePassword(
                    entry,
                    'Invoice',
                    async (pwd: string) => {
                        try {
                            // 1. Verify password by unlocking PDF
                            const decryptedB64 = await unlockPdf(entry.file, pwd);
                            if (!decryptedB64) {
                                throw new Error('Incorrect password');
                            }

                            // 2. Success - Close modal and process
                            setPasswordError('');
                            closePasswordModal();

                            // 3. Update UI
                            setProcessedFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'Processing' } : f));

                            // 4. Generate preview if possible
                            if (decryptedB64) {
                                try {
                                    const binStr = atob(decryptedB64);
                                    const len = binStr.length;
                                    const arr = new Uint8Array(len);
                                    for (let i = 0; i < len; i++) {
                                        arr[i] = binStr.charCodeAt(i);
                                    }
                                    const blob = new Blob([arr], { type: 'application/pdf' });
                                    const previewUrl = URL.createObjectURL(blob);
                                    setProcessedFiles(prev => prev.map(f =>
                                        f.id === entry.id ? { ...f, previewUrl, error: undefined } : f
                                    ));
                                } catch (e) {
                                    console.error("Preview generation failed", e);
                                }
                            }

                            // 5. Continue with AI processing
                            await processSingleFile(entry, 0, pwd);

                            // 6. Check for next password-protected file
                            setTimeout(() => {
                                const nextFile = processedFiles.find(f =>
                                    f.status === 'Pending' && f.error === 'Password Required'
                                );
                                if (nextFile) {
                                    // Will recursively trigger password flow
                                    processSingleFile(nextFile);
                                }
                            }, 100);
                        } catch (e) {
                            throw e; // Let the hook handle the error display
                        }
                    },
                    password ? 'Incorrect password. Please try again.' : ''
                );

                // Set status to Pending so it doesn't look failed
                setProcessedFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'Pending', error: 'Password Required' } : f));
                return;
            }


            if (!result.success || !result.invoice) {
                throw new Error(result.message || 'Failed to process document');
            }
            const data = result.invoice;

            // Decrypted PDF handling
            let previewUrl: string | undefined = undefined;
            if (result.decryptedPdf) {
                try {
                    const binStr = atob(result.decryptedPdf);
                    const len = binStr.length;
                    const arr = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        arr[i] = binStr.charCodeAt(i);
                    }
                    const blob = new Blob([arr], { type: 'application/pdf' });
                    previewUrl = URL.createObjectURL(blob);
                } catch (e) {
                    console.error("Failed to create blob from decrypted PDF", e);
                }
            }

            if (data.documentType === 'BANK_STATEMENT') {
                setProcessedFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'Mismatch', error: "Detected as Bank Statement" } : f));
                setMismatchedFileAlert({ show: true, file: { ...entry, status: 'Mismatch', data: data } });
                return;
            }

            const duration = ((Date.now() - start) / 1000 / 60).toFixed(2);
            const { correct, incorrect } = calculateEntryStats(data);

            setProcessedFiles(prev => prev.map(f => {
                if (f.id === entry.id) {
                    return {
                        ...f,
                        status: 'Ready',
                        error: undefined, // Clear any previous errors (like Password Required)
                        data: data,
                        previewUrl: previewUrl, // Save the preview URL
                        timeTaken: `${duration} min`,
                        correctEntries: correct,
                        incorrectEntries: incorrect
                    };
                }
                return f;
            }));

            saveInvoiceToDB(data, 'Ready', entry.id);
            // Removed auto-save to registry. Registry save happens only on final confirmation/push.
            setToast({ show: true, message: `${entry.fileName} processed successfully`, type: 'success' });

            // Refresh token usage after AI operation
            try {
                const usage = await getTokenUsage(BACKEND_API_KEY);
                if (usage) {
                    setTokenData(usage);
                }
            } catch (e) {
                console.error("Failed to refresh token data:", e);
            }

        } catch (error) {
            const duration = ((Date.now() - start) / 1000 / 60).toFixed(2);
            let errorMsg = error instanceof Error ? error.message : "Processing Failed";

            // Check for 429 - Token limit reached
            if (errorMsg.includes("Token limit") || errorMsg.includes("429")) {
                setShowTokenLimitModal(true);
                setProcessedFiles(prev => prev.map(f =>
                    f.id === entry.id ? { ...f, status: 'Failed', error: 'Token limit reached', timeTaken: `${duration} min` } : f
                ));
                return;
            }

            if (errorMsg.includes("The document has no pages")) {
                errorMsg = "Empty or Corrupted File";
                setInvalidFileAlert({ show: true, fileName: entry.fileName, reason: "File empty/corrupted." });
            }

            if (retryCount < 0 && !password) { // DISABLED RETRY: Single attempt only
                // Retry Logic
                console.log(`Retrying ${entry.fileName}... Attempt ${retryCount + 1}`);
                setTimeout(() => processSingleFile(entry, retryCount + 1), 2000);
                return;
            }

            setProcessedFiles(prev => prev.map(f => f.id === entry.id ? { ...f, status: 'Failed', error: errorMsg, timeTaken: `${duration} min` } : f));

            const failLog: LogEntry = {
                id: uuidv4(),
                timestamp: new Date(),
                method: 'POST',
                endpoint: 'GEMINI_API',
                status: 'Failed',
                message: `OCR Failed for ${entry.fileName}: ${errorMsg}`
            };
            setLogs(prev => [failLog, ...prev]);
            saveLogToDB(failLog);
        }
    };

    const handleSwitchToBankStatement = () => {
        const fileToMove = mismatchedFileAlert.file;
        if (fileToMove) {
            // Transform the entry instead of deleting it
            setProcessedFiles(prev => prev.map(f => {
                if (f.id === fileToMove.id) {
                    return {
                        ...f,
                        sourceType: 'BANK_STATEMENT',
                        status: 'Pending',
                        error: undefined,
                        bankData: undefined // Force re-process
                    };
                }
                return f;
            }));

            setPendingBankStatementFile(fileToMove.file);
            setCurrentView(AppView.BANK_STATEMENT);
            setMismatchedFileAlert({ show: false, file: null });
        }
    };

    const handleRedirectToInvoice = (file: File) => {
        setCurrentView(AppView.DASHBOARD);
        handleBulkUpload([file]);
    };

    const handleCancelBulkProcessing = () => {
        isCancelledRef.current = true;

        if (pendingBulkBatch) {
            const batchIds = pendingBulkBatch.ids;
            // Delete from DB
            batchIds.forEach(id => deleteUploadFromDB(id).catch(console.error));
            // Remove from State
            setProcessedFiles(prev => prev.filter(f => !batchIds.includes(f.id)));
        }

        setPendingBulkBatch(null);
        setCurrentView(AppView.DASHBOARD);
        setToast({ show: true, message: "Bulk upload cancelled and files removed.", type: 'warning' });
    };

    const handleRetryFailed = () => {
        const failed = processedFiles.filter(f => (f.status === 'Failed' || f.status === 'Mismatch') && f.sourceType === 'OCR_INVOICE');
        failed.forEach(f => processSingleFile(f));
    };

    const handleViewInvoice = (file: ProcessedFile) => {
        if (file.status === 'Mismatch') {
            setMismatchedFileAlert({ show: true, file });
            return;
        }

        // Bank Statement - navigate to view/edit
        if (file.sourceType === 'BANK_STATEMENT') {
            setCurrentView(AppView.BANK_STATEMENT);
            // Always set the file so it can be viewed, even if failed
            setPendingBankStatementFile(file.file);
            return;
        }

        // Excel Import - navigate and the file will be picked up by ExcelImportManager
        if (file.sourceType === 'EXCEL_IMPORT') {
            setCurrentView(AppView.EXCEL_IMPORT);
            setPendingExcelFile(file); // Store the clicked file
            return;
        }

        // Invoice - load data into editor
        if (file.data) {
            setCurrentInvoice(file.data);
            setCurrentFile(file.file);
            setCurrentView(AppView.EDITOR);
            setActiveTab('editor');
        }
    };

    const handleSaveInvoice = (data: InvoiceData, switchTab: boolean = true, silent: boolean = false) => {
        setCurrentInvoice(data);
        if (switchTab) setActiveTab('xml');
        else if (!silent) setToast({ show: true, message: "Invoice updated successfully", type: 'success' });

        if (currentFile) {
            const { correct, incorrect } = calculateEntryStats(data);
            const fileEntry = processedFiles.find(f => f.file === currentFile);

            setProcessedFiles(prev => prev.map(f => f.file === currentFile ? { ...f, data, correctEntries: correct, incorrectEntries: incorrect } : f));

            if (fileEntry) saveInvoiceToDB(data, fileEntry.status, fileEntry.id);
        }

        if (data.invoiceNumber && !silent) {
            // Check for duplicates purely for UI warning in editor (non-blocking)
            checkInvoiceExists(data.invoiceNumber).then(exists => {
                if (exists) {
                    setToast({ show: true, message: `Warning: Invoice ${data.invoiceNumber} is already registered.`, type: 'warning' });
                }
            });
        }
    };

    const handleNavigateInvoice = (direction: 'next' | 'prev') => {
        const currentIndex = processedFiles.findIndex(f => f.file === currentFile);
        if (currentIndex === -1) return;
        const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
        if (newIndex >= 0 && newIndex < processedFiles.length) {
            const nextFile = processedFiles[newIndex];
            if (nextFile.sourceType === 'OCR_INVOICE' && nextFile.data) handleViewInvoice(nextFile);
        }
    };

    const performDeleteFile = (fileId?: string) => {
        const targetFileEntry = fileId ? processedFiles.find(f => f.id === fileId) : (currentFile ? processedFiles.find(f => f.file === currentFile) : undefined);

        // Even if no entry found, we must clear the VIEW state if we are in that view
        if (!targetFileEntry) {
            if (currentView === AppView.BANK_STATEMENT) setPendingBankStatementFile(null);
            if (currentView === AppView.EXCEL_IMPORT) setPendingExcelFile(null);

            // If we have an ID but not found in list, we might still want to trigger UI refresh or just return
            // But if we are here via a manual delete click on the View, we generally want to Clear the View.
            return;
        }

        // 1. Delete from DB
        deleteUploadFromDB(targetFileEntry.id).catch(console.error);

        // 2. Find index of target file
        const currentIndex = processedFiles.findIndex(f => f.id === targetFileEntry.id);

        // 3. Remove target from list locally
        const updatedFiles = processedFiles.filter(f => f.id !== targetFileEntry.id);

        // 4. Find nearest neighbor of type OCR_INVOICE
        let nextInvoice: ProcessedFile | undefined;

        // Look ahead
        for (let i = currentIndex + 1; i < processedFiles.length; i++) {
            if (processedFiles[i].sourceType === 'OCR_INVOICE') {
                nextInvoice = processedFiles[i];
                break;
            }
        }

        // If not found ahead, look behind
        if (!nextInvoice) {
            for (let i = currentIndex - 1; i >= 0; i--) {
                if (processedFiles[i].sourceType === 'OCR_INVOICE') {
                    nextInvoice = processedFiles[i];
                    break;
                }
            }
        }

        // 5. Update State
        setProcessedFiles(updatedFiles);

        // Clear pending states if they matched the deleted file
        if (pendingBankStatementFile && (targetFileEntry.file === pendingBankStatementFile || targetFileEntry.id === (pendingBankStatementFile as any).id || (currentView === AppView.BANK_STATEMENT && targetFileEntry.sourceType === 'BANK_STATEMENT'))) {
            setPendingBankStatementFile(null);
        }
        if (pendingExcelFile && (targetFileEntry.file === pendingExcelFile.file || targetFileEntry.id === pendingExcelFile.id)) setPendingExcelFile(null);

        if (currentView === AppView.BANK_STATEMENT && targetFileEntry.sourceType === 'BANK_STATEMENT') {
            // Stay in bank statement view but reset
            setPendingBankStatementFile(null);
            // Force refresh by setting View again or just let state update handle it
            // We set explicitly to ensure UI clears
            return;
        }

        if (nextInvoice && updatedFiles.some(f => f.id === nextInvoice?.id)) {
            // Wait a tick or just update current
            // Since handleViewInvoice relies on processedFiles state (which is stale in this closure),
            // We manually do what handleViewInvoice does:
            setCurrentFile(nextInvoice.file);
            if (nextInvoice.data) setCurrentInvoice(nextInvoice.data);
            // handleViewInvoice(nextInvoice); // This might use old state if it uses processedFiles.find
        } else {
            // No other invoices found
            setCurrentFile(undefined);
            setCurrentInvoice(null);
            if (currentView !== AppView.BANK_STATEMENT && currentView !== AppView.EXCEL_IMPORT) {
                setCurrentView(AppView.EDITOR);
            }
        }
    };

    const performDeleteAllFiles = () => {
        // if (!window.confirm("Are you sure you want to delete ALL files? This cannot be undone.")) return; // Moved to modal

        // Delete all from DB
        processedFiles.forEach(f => deleteUploadFromDB(f.id).catch(console.error));

        setProcessedFiles([]);
        setCurrentFile(undefined);
        setCurrentInvoice(null);
        setPendingBankStatementFile(null);
        setPendingExcelFile(null);
        setToast({ show: true, message: "All files deleted", type: 'success' });
    };

    // Wrappers for Confirmation
    const handleDeleteFile = (fileId?: string) => {
        setDeleteConfirm({
            show: true,
            mode: 'single',
            id: fileId,
            title: "Delete File?",
            message: "This will permanently remove the file and its data. Are you sure?"
        });
    };

    const handleDeleteAllFiles = () => {
        setDeleteConfirm({
            show: true,
            mode: 'all',
            title: "Delete All Files?",
            message: "WARNING: This will permanently delete ALL uploaded files and data. This action cannot be undone."
        });
    };

    const handleConfirmDelete = () => {
        if (!deleteConfirm) return;
        if (deleteConfirm.mode === 'single') {
            performDeleteFile(deleteConfirm.id);
        } else {
            performDeleteAllFiles();
        }
        setDeleteConfirm(null);
    };

    const handleCancelScan = () => {
        isCancelledRef.current = true;
        // Mark current processing file as Failed (Cancelled) to stop the spinner
        if (currentFile) {
            setProcessedFiles(prev => prev.map(f => f.file === currentFile ? { ...f, status: 'Failed', error: 'Processing Cancelled' } : f));
        }
    };

    const handleAddFile = () => {
        // Navigate to upload view to add more files and auto-trigger picker
        setShouldAutoTriggerUpload(true);
        setCurrentView(AppView.UPLOAD);
    };

    const handleAddFilesFromEditor = (files: File[]) => {
        if (files.length === 0) return;

        // Use existing bulk upload logic
        handleBulkUpload(files);

        // Set context to the first new file immediately
        setCurrentFile(files[0]);
        setCurrentInvoice(null);
    };




    const handlePushToTally = async (invoiceData?: InvoiceData) => {
        const targetInvoice = invoiceData || currentInvoice;
        if (!targetInvoice) return;
        const fileEntry = processedFiles.find(f => f.file === currentFile);
        await performPush(targetInvoice, fileEntry?.id);
    };

    const validateInvoiceForPush = (invoice: InvoiceData): string | null => {
        if (!invoice.invoiceNumber || !invoice.invoiceNumber.trim()) return "Invoice Number is missing.";
        if (!invoice.invoiceDate || !invoice.invoiceDate.trim()) return "Invoice Date is missing.";

        const isSales = invoice.voucherType === 'Sales';
        // Fuzzy Match Helper
        const target = invoice.targetCompany ? invoice.targetCompany.trim().toLowerCase() : '';

        if (isSales) {
            if (!invoice.buyerName || !invoice.buyerName.trim()) return "Buyer Name (Party) is missing.";
            if (target) {
                const supplier = invoice.supplierName ? invoice.supplierName.trim().toLowerCase() : '';
                const match = target.includes(supplier) || supplier.includes(target);
                if (!match) {
                    return `Sales Mismatch: Your Company (${invoice.targetCompany}) must be the Supplier (found: ${invoice.supplierName}).`;
                }
            }
        } else {
            // Purchase
            if (!invoice.supplierName || !invoice.supplierName.trim()) return "Supplier Name (Party) is missing.";
            if (target) {
                const buyer = invoice.buyerName ? invoice.buyerName.trim().toLowerCase() : '';
                const match = target.includes(buyer) || buyer.includes(target);
                if (!match) {
                    return `Purchase Mismatch: Your Company (${invoice.targetCompany}) must be the Buyer (found: ${invoice.buyerName}).`;
                }
            }
        }
        return null;
    };

    const performPush = async (invoice: InvoiceData, fileId?: string, skippedLedgers: string[] = []) => {
        console.log("DEBUG: performPush called", { invoice, fileId, skippedLedgers });
        // 0. Strict Validation
        const validationError = validateInvoiceForPush(invoice);
        if (validationError) {
            console.log("DEBUG: Validation Failed (App.tsx)", validationError);
            setToast({ show: true, message: validationError, type: 'error' });
            if (fileId) {
                setProcessedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'Failed', error: validationError } : f));
            }
            return;
        }

        // 1. Duplicate Check
        if (invoice.invoiceNumber) {
            const exists = await checkInvoiceExists(invoice.invoiceNumber);
            if (exists) {
                console.log("DEBUG: Invoice Duplicated");
                // Show Summary Modal instead of Toast
                setImportSummary({ total: 1, skipped: 1, success: 0, failed: 0 });
                setSummaryModalOpen(true);

                // Still log internally but silent
                const msg = `Skipped: Invoice ${invoice.invoiceNumber} already exists.`;
                const log: LogEntry = {
                    id: uuidv4(), timestamp: new Date(), method: 'POST', endpoint: TALLY_API_URL,
                    status: 'Failed', message: 'Duplicate Skipped', response: msg
                };
                setLogs(prev => [log, ...prev]);
                saveLogToDB(log);

                if (fileId) {
                    setProcessedFiles(prev => prev.map(f => {
                        if (f.id === fileId) {
                            // If already success, don't revert to Failed. 
                            // This prevents "Success" -> "Failed" if user clicks push again.
                            if (f.status === 'Success') return f;
                            return { ...f, status: 'Failed', error: 'Duplicate Invoice Number' };
                        }
                        return f;
                    }));
                }
                return;
            }
        }

        // Pre-check Connection
        const status = await checkTallyConnection();
        console.log("DEBUG: Tally Connection Status", status);
        if (!status.online) {
            setShowTallyDisconnectModal(true);
            return;
        }

        setIsPushing(true);
        console.log("DEBUG: setIsPushing(true)");
        const newLogId = uuidv4();
        const pendingLog: LogEntry = {
            id: newLogId,
            timestamp: new Date(),
            method: 'POST',
            endpoint: TALLY_API_URL,
            status: 'Pending',
            message: `Pushing Invoice ${invoice.invoiceNumber}...`
        };
        setLogs(prev => [pendingLog, ...prev]);

        try {
            const existingLedgers = await fetchExistingLedgers(invoice.targetCompany);
            // Merge skipped ledgers so they are treated as "Existing" (i.e., Do Not Create)
            skippedLedgers.forEach(l => existingLedgers.add(l));

            const xml = generateTallyXml(invoice, existingLedgers, userName);
            const result = await pushToTally(xml);

            // Update Log
            const updatedLog: LogEntry = {
                ...pendingLog,
                status: result.success ? 'Success' : 'Failed',
                message: result.success ? `Imported ${invoice.invoiceNumber}` : `Failed: ${invoice.invoiceNumber}`,
                response: result.message
            };

            setLogs(prev => prev.map(l => l.id === newLogId ? updatedLog : l));
            saveLogToDB(updatedLog);

            // Update File Status & DB
            if (fileId) {
                const newStatus = result.success ? 'Success' : 'Failed';
                setProcessedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: newStatus } : f));
                saveInvoiceToDB(invoice, newStatus, fileId);
            }

            if (result.success && invoice.invoiceNumber) {
                saveInvoiceRegistry(invoice.invoiceNumber, 'OCR');
            }

            // Show Summary Modal
            setImportSummary({
                total: 1,
                skipped: 0,
                success: result.success ? 1 : 0,
                failed: result.success ? 0 : 1,
                errors: result.success ? [] : [result.message]
            });
            setSummaryModalOpen(true);

        } catch (error: any) {
            // Show Failure in Modal
            setImportSummary({
                total: 1,
                skipped: 0,
                success: 0,
                failed: 1,
                errors: [error.message || 'Unknown error occurred']
            });
            setSummaryModalOpen(true);
        } finally {
            setIsPushing(false);
        }
    };

    const handleEditorPush = async (data: InvoiceData, skippedLedgers: string[] = []) => {
        handleSaveInvoice(data, false, true); // Silent save: No toasts
        // Find the file ID for the current file to update status
        const fileEntry = processedFiles.find(f => f.file === currentFile);
        await performPush(data, fileEntry?.id, skippedLedgers);
    };

    const performBulkPush = async (files: ProcessedFile[], skippedLedgers: string[]) => {
        setIsPushing(true);
        let skipped = 0;
        let success = 0;
        let failed = 0;

        // Fetch Registry once
        const allRegistry = await getInvoiceRegistry();
        const existingNumbers = new Set(allRegistry.map(r => r.invoiceNumber.toLowerCase()));

        const errors: string[] = [];
        const skippedLedgersSet = new Set(skippedLedgers);

        for (const file of files) {
            if (isCancelledRef.current) break; // Check for cancellation

            if (file.data && file.data.invoiceNumber) {
                // Check duplicate
                if (existingNumbers.has(file.data.invoiceNumber.toLowerCase())) {
                    skipped++;
                    setProcessedFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Failed', error: 'Duplicate Invoice' } : f));
                    continue;
                }

                try {
                    // Push
                    const existingLedgers = await fetchExistingLedgers(file.data.targetCompany);
                    // Merge skipped ledgers to suppress creation logic in generateTallyXml
                    skippedLedgers.forEach(l => existingLedgers.add(l));

                    const xml = generateTallyXml(file.data, existingLedgers, userName);
                    const result = await pushToTally(xml);

                    if (result.success) {
                        success++;
                        setProcessedFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Success' } : f));
                        saveInvoiceToDB(file.data, 'Success', file.id);
                        saveInvoiceRegistry(file.data.invoiceNumber, 'OCR');
                        existingNumbers.add(file.data.invoiceNumber.toLowerCase()); // Prevent internal duplicates
                    } else {
                        failed++;
                        errors.push(`${file.data.invoiceNumber}: ${result.message}`);
                        setProcessedFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Failed', error: result.message } : f));
                        saveInvoiceToDB(file.data, 'Failed', file.id);
                    }
                } catch (e: any) {
                    failed++;
                    errors.push(`${file.data.invoiceNumber}: ${e.message}`);
                    setProcessedFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Failed', error: e.message } : f));
                }
            } else {
                failed++; // Missing data/invoice number
                errors.push('Missing Invoice Number or Data');
            }
        }

        setIsPushing(false);
        setImportSummary({
            total: files.length,
            skipped,
            success,
            failed,
            errors
        });
        setSummaryModalOpen(true);
    };

    const handleBulkPushToTally = async () => {
        const readyFiles = processedFiles.filter(f => (f.status === 'Ready') && f.data && f.sourceType === 'OCR_INVOICE');
        if (readyFiles.length === 0) return;

        // Pre-check Connection
        const status = await checkTallyConnection();
        if (!status.online) {
            setShowTallyDisconnectModal(true);
            return;
        }

        setIsPushing(true); // Show loading while analyzing

        // 1. Analyze Missing Ledgers across ALL files
        const uniqueMissingLedgers = new Set<string>();

        // Cache fetched company ledgers to avoid re-fetching for same company
        const companyLedgersCache: Record<string, Set<string>> = {};

        for (const file of readyFiles) {
            if (!file.data) continue;
            const company = file.data.targetCompany || ''; // Default if empty?

            let existing = companyLedgersCache[company];
            if (!existing) {
                try {
                    existing = await fetchExistingLedgers(company);
                    companyLedgersCache[company] = existing;
                } catch (e) {
                    console.error(`Failed to fetch ledgers for ${company}`, e);
                    // Assume empty if fail? Or stop?
                    // Continue, will likely fail later or try create all.
                    existing = new Set();
                }
            }

            const missingInFile = getInvoiceLedgerRequirements(file.data, existing);
            missingInFile.forEach(m => uniqueMissingLedgers.add(m));
        }

        setIsPushing(false); // Stop loading to show modal (if needed) or proceed

        if (uniqueMissingLedgers.size > 0) {
            setBulkProposedLedgers(Array.from(uniqueMissingLedgers));
            setPendingBulkFiles(readyFiles);
            setShowBulkLedgerModal(true);
        } else {
            performBulkPush(readyFiles, []);
        }
    };

    // Single Push from Dashboard
    const handleSinglePush = async (file: ProcessedFile) => {
        if (!file.data || file.sourceType !== 'OCR_INVOICE') return;

        // Pre-check Connection
        const status = await checkTallyConnection();
        if (!status.online) {
            setShowTallyDisconnectModal(true);
            return;
        }

        setIsPushing(true);
        // Check for missing ledgers
        const company = file.data.targetCompany || '';
        let existing = new Set<string>(); // default empty
        try {
            existing = await fetchExistingLedgers(company);
        } catch (e) {
            console.error(`Failed to fetch ledgers for ${company}`, e);
        }

        const missingInFile = getInvoiceLedgerRequirements(file.data, existing);

        setIsPushing(false);

        if (missingInFile.length > 0) {
            // For single file, we can just use the bulk modal logic or a specific one.
            // Let's reuse bulk modal for simplicity as it takes a list of ledgers
            setBulkProposedLedgers(Array.from(missingInFile));
            setPendingBulkFiles([file]); // Just one file in pending
            setShowBulkLedgerModal(true);
        } else {
            // Direct Push
            // performPush takes (invoice, fileId, skippedLedgers)
            await performPush(file.data, file.id, []);
        }
    };

    const handleConfirmBulkPush = (skippedLedgers: string[]) => {
        setShowBulkLedgerModal(false);
        performBulkPush(pendingBulkFiles, skippedLedgers);
    };


    const handleDownload = (file: ProcessedFile) => {
        const dataToDownload = file.data || file.bankData || file.excelData;

        if (!dataToDownload) {
            // Fallback: Download metadata if no structured data exists
            const metadata = {
                fileName: file.fileName,
                status: file.status,
                error: file.error || undefined,
                uploadTimestamp: new Date(file.uploadTimestamp).toISOString()
            };
            const reportText = JSON.stringify(metadata, null, 2);
            const blob = new Blob([reportText], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${file.fileName.split('.')[0]}_metadata.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return;
        }

        const reportText = JSON.stringify(dataToDownload, null, 2);
        const blob = new Blob([reportText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${file.fileName.split('.')[0]}_data.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownloadAll = () => {
        if (filteredFiles.length === 0) {
            setToast({ show: true, message: "No files to download", type: 'warning' });
            return;
        }

        const reportData = filteredFiles.map(f => ({
            fileName: f.fileName,
            status: f.status,
            sourceType: f.sourceType,
            data: f.data || f.bankData || f.excelData || { error: "No structured data available" },
            metadata: {
                error: f.error,
                timeTaken: f.timeTaken,
                uploadTime: new Date(f.uploadTimestamp).toISOString()
            }
        }));

        const reportText = JSON.stringify(reportData, null, 2);
        const blob = new Blob([reportText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `autotally_export_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setToast({ show: true, message: `Exported ${filteredFiles.length} files`, type: 'success' });
    };

    // Fetch token usage from backend
    const fetchTokenData = async () => {
        try {
            const usage = await getTokenUsage(BACKEND_API_KEY);
            if (usage) {
                setTokenData(usage);

                // Check for threshold notifications
                const thresholds = [25, 50, 75, 100];
                const currentThreshold = thresholds.filter(t => usage.percentage >= t).pop() || 0;

                if (currentThreshold > usage.last_notified_threshold) {
                    // Show notification
                    const messages: Record<number, { msg: string; type: 'success' | 'warning' | 'error' }> = {
                        25: { msg: `You've used 25% of your monthly tokens (${usage.used}/${usage.limit})`, type: 'success' },
                        50: { msg: `You've used 50% of your monthly tokens (${usage.used}/${usage.limit})`, type: 'warning' },
                        75: { msg: `Warning: 75% of monthly tokens used (${usage.used}/${usage.limit})`, type: 'warning' },
                        100: { msg: `Token limit reached! (${usage.used}/${usage.limit})`, type: 'error' }
                    };

                    if (messages[currentThreshold]) {
                        setToast({ show: true, message: messages[currentThreshold].msg, type: messages[currentThreshold].type });
                        // Update backend to prevent duplicate notifications
                        await updateNotifiedThreshold(BACKEND_API_KEY, currentThreshold);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching token usage:', error);
        }
    };

    // Restore useEffect for auth username load which I messed up in previous chunk because I replaced it with `...`
    useEffect(() => {
        if (isAuthenticated) {
            checkStatus();
            const user = localStorage.getItem('autotally_username');
            if (user) setUserName(user);
            fetchTokenData();
        }
    }, [isAuthenticated]);


    const handleLock = () => {
        setIsAuthenticated(false);
    };

    const filteredFiles = processedFiles.filter(f => {
        const term = searchTerm.toLowerCase().trim();
        let matchesSearch = f.fileName.toLowerCase().includes(term);

        // Search inside structured data if filename doesn't match
        if (!matchesSearch) {
            if (f.data) {
                matchesSearch = (
                    (f.data.invoiceNumber || '').toLowerCase().includes(term) ||
                    (f.data.supplierName || '').toLowerCase().includes(term) ||
                    (f.data.buyerName || '').toLowerCase().includes(term)
                );
            } else if (f.bankData) {
                matchesSearch = (
                    (f.bankData.bankName || '').toLowerCase().includes(term) ||
                    (f.bankData.accountNumber || '').toLowerCase().includes(term)
                );
            }
        }

        let matchesFilter = false;
        if (filterStatus === 'All') matchesFilter = true;
        else if (['Success', 'Ready', 'Failed', 'Processing'].includes(filterStatus)) matchesFilter = f.status === filterStatus;
        else {
            if (filterStatus === 'Invoices') matchesFilter = f.sourceType === 'OCR_INVOICE';
            if (filterStatus === 'Bank' || filterStatus === 'Bank Statement') matchesFilter = f.sourceType === 'BANK_STATEMENT';
            if (filterStatus === 'Excel') matchesFilter = f.sourceType === 'EXCEL_IMPORT';

            if (filterStatus === 'Sales') matchesFilter = f.sourceType === 'OCR_INVOICE' && f.data?.voucherType === 'Sales';
            if (filterStatus === 'Purchase') matchesFilter = f.sourceType === 'OCR_INVOICE' && f.data?.voucherType === 'Purchase';
        }
        return matchesSearch && matchesFilter;
    });

    const currentIndex = processedFiles.findIndex(f => f.file === currentFile);
    const totalInvoices = processedFiles.filter(f => f.sourceType === 'OCR_INVOICE').length;

    const renderContent = () => {
        if (currentView === AppView.DASHBOARD) return (
            <Dashboard
                files={filteredFiles}
                onNavigateToUpload={() => setCurrentView(AppView.UPLOAD)}
                onRetry={handleRetryFailed}
                onView={handleViewInvoice}
                onPushSuccess={handleBulkPushToTally}
                isPushing={isPushing}
                onDownload={handleDownload}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                filterStatus={filterStatus}
                onFilterChange={setFilterStatus}
                onDownloadAll={handleDownloadAll}
                onDelete={handleDeleteFile}
                onDeleteAll={handleDeleteAllFiles}
                onPush={handleSinglePush}
            />
        );
        if (currentView === AppView.UPLOAD) return (
            <InvoiceUpload
                autoTrigger={shouldAutoTriggerUpload}
                onAutoTriggered={() => setShouldAutoTriggerUpload(false)}
                onFilesSelected={(files) => handleBulkUpload(files)}
                onWarning={(msg) => setToast({ show: true, message: msg, type: 'warning' })}
                onRestoreDraft={(data) => {
                    handleSaveInvoice(data, false); setActiveTab('editor'); setCurrentView(AppView.EDITOR);
                    setToast({ show: true, message: "Draft restored", type: 'success' });
                }}
            />
        );
        if (currentView === AppView.EDITOR) {
            // Logic Fix: Ensure we show Editor if currentFile is present, even if processing
            if (!currentFile) return (
                <div className="flex flex-col h-full items-center justify-center p-8 animate-fade-in">
                    <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
                        {/* Header Section */}
                        <div className="mb-12 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-600/20 rounded-2xl flex items-center justify-center mb-6 border border-indigo-200 dark:border-indigo-500/30">
                                <FileText className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">No Invoices Uploaded</h1>
                            <p className="text-slate-500 dark:text-slate-400 text-lg max-w-xl leading-relaxed">
                                Extract, verify, and synchronize your tax documents with Tally Prime.
                                Start by selecting an existing invoice or uploading a new one.
                            </p>
                        </div>

                        {/* Action Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">

                            {/* Card 1: Process New */}
                            <button
                                onClick={() => setCurrentView(AppView.UPLOAD)}
                                className="group flex flex-col p-8 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500/50 rounded-3xl transition-all duration-300 text-left relative overflow-hidden hover:shadow-2xl hover:shadow-indigo-500/10"
                            >
                                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                    <CloudUpload className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 uppercase tracking-wide text-sm">PROCESS NEW</h3>
                                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                                    Upload PDFs or images for AI OCR extraction.
                                </p>
                                <div className="absolute top-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
                                    <ArrowRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                </div>
                            </button>

                            {/* Card 2: Go to Dashboard */}
                            <button
                                onClick={() => setCurrentView(AppView.DASHBOARD)}
                                className="group flex flex-col p-8 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500/50 rounded-3xl transition-all duration-300 text-left relative overflow-hidden hover:shadow-2xl hover:shadow-emerald-500/10"
                            >
                                <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                    <LayoutDashboard className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 uppercase tracking-wide text-sm">GO TO DASHBOARD</h3>
                                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                                    View all processed and pending documents.
                                </p>
                                <div className="absolute top-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
                                    <ArrowRight className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                            </button>

                        </div>

                    </div>
                </div>
            );

            const fileEntry = processedFiles.find(f => f.file === currentFile);
            // If no fileEntry (rare race condition) or status is processing, we are Scanning
            const isProcessing = !fileEntry || fileEntry.status === 'Processing' || fileEntry.status === 'Pending';

            const displayData = currentInvoice || (fileEntry?.data) || EMPTY_INVOICE;

            return (
                <div className="h-full flex flex-col">
                    <div className="flex-1 overflow-hidden">
                        <InvoiceEditor
                            data={displayData}
                            file={currentFile}
                            previewUrl={fileEntry?.previewUrl}
                            isLocked={fileEntry?.error === 'Password Required'}
                            onSave={handleSaveInvoice}
                            onPush={handleEditorPush}
                            onDelete={handleDeleteFile}
                            onDeleteAll={handleDeleteAllFiles}
                            onAddFile={handleAddFile}
                            onAddFiles={handleAddFilesFromEditor}
                            isPushing={isPushing}
                            isScanning={isProcessing}
                            currentIndex={currentIndex} totalCount={totalInvoices}
                            onNext={() => handleNavigateInvoice('next')} onPrev={() => handleNavigateInvoice('prev')}
                            hasNext={currentIndex < processedFiles.length - 1} hasPrev={currentIndex > 0}
                            onCancelScan={handleCancelScan}
                            companies={companies}
                            loadCompanies={loadCompanies}
                            loadingCompanies={loadingCompanies}
                            onPushAll={handleBulkPushToTally}
                            userName={userName}
                        />
                    </div>
                </div>
            );
        }
        if (currentView === AppView.BANK_STATEMENT) {
            const bankFileEntry = processedFiles.find(f => f.file === pendingBankStatementFile) || processedFiles.find(f => f.sourceType === 'BANK_STATEMENT');
            return (
                <BankStatementManager
                    key={pendingBankStatementFile ? pendingBankStatementFile.name : 'bank-empty'}
                    onPushLog={handlePushLog}
                    externalFile={pendingBankStatementFile}
                    externalData={bankFileEntry?.bankData || null}
                    externalStatus={bankFileEntry?.status}
                    onRedirectToInvoice={handleRedirectToInvoice}
                    onRegisterFile={(f) => handleRegisterFile(f, 'BANK_STATEMENT')}
                    onUpdateFile={handleUpdateFile}
                    onDelete={(id) => handleDeleteFile(id || bankFileEntry?.id)}
                    onBack={() => setCurrentView(AppView.DASHBOARD)}
                    userName={userName}
                    onRequestPassword={requirePassword}
                />
            );
        }
        if (currentView === AppView.EXCEL_IMPORT) {
            // Use the pending Excel file or find one with data
            const excelFile = pendingExcelFile || processedFiles.find(f => f.sourceType === 'EXCEL_IMPORT' && f.excelData);
            return (
                <ExcelImportManager
                    onPushLog={handlePushLog}
                    onRegisterFile={(f) => handleRegisterFile(f, 'EXCEL_IMPORT')}
                    onUpdateFile={handleUpdateFile}
                    externalFile={excelFile?.file || null}
                    externalFileId={excelFile?.id || null}
                    externalMappedData={excelFile?.excelData || null}
                    externalMapping={excelFile?.excelMapping || null}
                    onDelete={() => excelFile ? handleDeleteFile(excelFile.id) : undefined}
                    userName={userName}
                />
            );
        }
        if (currentView === AppView.BULK_PROCESSING) {
            if (!pendingBulkBatch) return null;
            const batchFiles = processedFiles.filter(f => pendingBulkBatch.ids.includes(f.id));
            const completedCount = batchFiles.filter(f => f.status !== 'Pending' && f.status !== 'Processing').length;
            const current = batchFiles.find(f => f.status === 'Processing') || batchFiles.find(f => f.status === 'Pending') || batchFiles[batchFiles.length - 1];

            return (
                <BulkProcessLoader
                    total={pendingBulkBatch.total}
                    processed={completedCount}
                    currentFileName={current?.fileName || 'Finalizing...'}
                    onCancel={handleCancelBulkProcessing}
                />
            );
        }
        if (currentView === AppView.CHAT) return (
            <ChatBot
                messages={chatMessages}
                onUpdateMessages={setChatMessages}
            />
        );
        if (currentView === AppView.LOGS) return <TallyLogs logs={logs} />;
        return null;
    };

    // Auth Guard
    if (!isAuthenticated) {
        return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />;
    }

    return (
        <div className={`flex flex-col h-screen overflow-hidden transition-colors duration-200 ${darkMode ? 'dark bg-slate-900' : 'bg-slate-50'}`}
            style={{
                transform: 'scale(0.9)',
                transformOrigin: 'top left',
                width: '111.12vw',
                height: '111.12vh'
            }}
        >
            {isSettingsOpen && (
                <SettingsModal
                    onClose={() => setIsSettingsOpen(false)}
                    darkMode={darkMode}
                    toggleDarkMode={() => setDarkMode(!darkMode)}
                />
            )}
            {showTallyDisconnectModal && (
                <TallyDisconnectedModal onClose={() => setShowTallyDisconnectModal(false)} />
            )}
            <ImportSummaryModal
                isOpen={summaryModalOpen}
                onClose={() => setSummaryModalOpen(false)}
                summary={importSummary}
            />
            {invalidFileAlert.show && <InvalidFileModal isOpen={invalidFileAlert.show} fileName={invalidFileAlert.fileName} reason={invalidFileAlert.reason} onClose={() => setInvalidFileAlert({ show: false, fileName: '', reason: '' })} />}
            <BulkLedgerCreationModal
                isOpen={showBulkLedgerModal}
                onClose={() => setShowBulkLedgerModal(false)}
                proposedLedgers={bulkProposedLedgers}
                onConfirm={handleConfirmBulkPush}
            />
            {deleteConfirm && (
                <DeleteConfirmationModal
                    isOpen={deleteConfirm.show}
                    onClose={() => setDeleteConfirm(null)}
                    onConfirm={handleConfirmDelete}
                    title={deleteConfirm.title}
                    message={deleteConfirm.message}
                    isDeleteAll={deleteConfirm.mode === 'all'}
                />
            )}
            <InvalidFileModal
                isOpen={mismatchedFileAlert.show}
                type="mismatch"
                fileName={mismatchedFileAlert.file?.fileName || 'Document'}
                reason=""
                onClose={() => {
                    if (mismatchedFileAlert.file) {
                        setProcessedFiles(prev => prev.filter(f => f.id !== mismatchedFileAlert.file?.id));
                    }
                    setMismatchedFileAlert({ show: false, file: null });
                }}
                onConfirm={handleSwitchToBankStatement}
                currentSection="Invoice"
                detectedType="Bank Statement"
                targetSectionName="Bank Statement processor"
            />

            <Navbar
                currentView={currentView}
                onChangeView={(view) => {
                    if (view === AppView.EDITOR && pendingBulkBatch) {
                        setCurrentView(AppView.BULK_PROCESSING);
                    } else {
                        setCurrentView(view);
                    }
                }}
                darkMode={darkMode} toggleDarkMode={() => setDarkMode(!darkMode)}
                tallyStatus={tallyStatus} onCheckStatus={checkStatus} searchTerm={searchTerm} onSearchChange={setSearchTerm} onOpenSettings={() => setIsSettingsOpen(true)}
                onLock={handleLock}
                userName={userName}
                tokenData={tokenData}
                onRefreshTokenData={fetchTokenData}
            />
            {/* Main Content Area */}
            <main className="flex-1 overflow-auto relative p-6">
                {/* Global View Transition Wrapper */}
                <div key={currentView} className="w-full h-full animate-fade-in relative">
                    {renderContent()}
                </div>
            </main>
            {/* Unified Password Modal - Used by both Invoice and Bank Statement */}
            <PasswordInputModal
                isOpen={showPasswordModal}
                fileName={pendingPasswordFile ? ('fileName' in pendingPasswordFile ? pendingPasswordFile.fileName : pendingPasswordFile.name) : 'Document'}
                error={passwordError}
                documentType={passwordDocumentType}
                onSubmit={handlePasswordSubmit}
                onCancel={() => {
                    closePasswordModal();
                    setPasswordError('');
                }}
            />

            {/* Token Limit Modal */}
            <TokenLimitModal
                isOpen={showTokenLimitModal}
                onClose={() => setShowTokenLimitModal(false)}
                onOpenSettings={() => {
                    setShowTokenLimitModal(false);
                    alert('Please open Settings from the navbar (top right) to upgrade your plan or reset token usage.');
                }}
                plan={tokenData?.plan || 'Bronze'}
                used={tokenData?.used || 0}
                limit={tokenData?.limit || 1000}
            />

            {toast.show && (
                <div className={`fixed bottom-6 right-6 z-[100] animate-fade-in bg-white dark:bg-slate-800 border-l-4 shadow-xl rounded-lg p-4 flex items-center gap-3 pr-8 min-w-[300px]
                        ${toast.type === 'success' ? 'border-green-500' : toast.type === 'error' ? 'border-red-500' : 'border-orange-500'}`}>
                    {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                    {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                    {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-orange-500" />}
                    <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                            {toast.type === 'success' ? 'Success' : toast.type === 'error' ? 'Error' : 'Warning'}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{toast.message}</p>
                    </div>
                    <button onClick={() => setToast(prev => ({ ...prev, show: false }))} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}

        </div>
    );
};

export default App;
