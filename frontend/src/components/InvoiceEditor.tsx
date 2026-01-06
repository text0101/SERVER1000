import React, { useEffect, useState, useMemo, useRef } from 'react';
import { InvoiceData, LineItem } from '../types';
import { Plus, Trash2, Save, RefreshCw, FileText, FilePlus, ExternalLink, ArrowRight, Loader2, ChevronLeft, ChevronRight, FileDown, Check, AlertTriangle, ShieldAlert, User, Building, ChevronDown, ZoomIn, ZoomOut, RotateCw, RotateCcw, Lock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { fetchOpenCompanies, fetchExistingLedgers, fetchCompanyDetails } from '../services/tallyService';

interface InvoiceEditorProps {
    data: InvoiceData;
    file?: File;
    previewUrl?: string; // Decrypted URL override
    isLocked?: boolean; // New prop to hide preview if locked
    onSave: (data: InvoiceData, switchTab?: boolean) => void;
    onPush: (data: InvoiceData) => void;
    onDelete?: () => void;
    onDeleteAll?: () => void;
    onAddFile?: () => void;
    // New prop for canceling AI scan
    onCancelScan?: () => void;
    onAddFiles?: (files: File[]) => void;
    isPushing: boolean;
    isScanning?: boolean;
    currentIndex?: number;
    totalCount?: number;
    onNext?: () => void;
    onPrev?: () => void;
    hasNext?: boolean;
    hasPrev?: boolean;
    companies: string[];
    loadCompanies: () => void;
    loadingCompanies: boolean;
    onPushAll?: () => void;
    userName?: string;
}

/**
 * Monetary Rounding Rules (Strictly Followed):
 * - If decimal < 0.50 → Round DOWN to nearest whole number
 * - If decimal >= 0.50 → Round UP to next whole number
 * Examples: 100.40 → 100, 100.50 → 101, 999.49 → 999, 999.99 → 1000
 */
const monetaryRound = (value: number): number => {
    const integerPart = Math.floor(value);
    const decimalPart = value - integerPart;
    return decimalPart >= 0.50 ? integerPart + 1 : integerPart;
};

// Standard 2-decimal rounding for intermediate calculations
const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

const InvoiceEditor: React.FC<InvoiceEditorProps> = ({
    data,
    file,
    previewUrl,
    isLocked = false,
    onSave,
    onPush,
    onDelete,
    onDeleteAll,
    onAddFile,
    onCancelScan,
    onAddFiles,
    isPushing,
    isScanning = false,
    currentIndex = 0,
    totalCount = 0,
    onNext,
    onPrev,
    hasNext = false,
    hasPrev = false,
    companies,
    loadCompanies,
    loadingCompanies,
    onPushAll,
    userName
}) => {
    const [formData, setFormData] = useState<InvoiceData>(() => ({
        ...data,
        voucherType: data.voucherType || 'Purchase',
        lineItems: data.lineItems.map((item) => ({
            ...item,
            id: item.id && item.id.length > 10 ? item.id : uuidv4()
        }))
    }));
    const [totals, setTotals] = useState({ taxable: 0, tax: 0, cgst: 0, sgst: 0, igst: 0, roundOff: 0, grand: 0 });
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [draftSaved, setDraftSaved] = useState(false);

    // PDF Controls
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);

    // Ledger Fetching State
    const [ledgers, setLedgers] = useState<string[]>([]);
    const [loadingLedgers, setLoadingLedgers] = useState(false);

    // Dropdown UI State
    const [activeDropdown, setActiveDropdown] = useState<'supplier' | 'buyer' | null>(null);
    const [showDeleteDropdown, setShowDeleteDropdown] = useState(false);
    const [showPushDropdown, setShowPushDropdown] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);

    // Internal File Input
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            if (onAddFiles) {
                onAddFiles(Array.from(e.target.files));
            } else if (onAddFile) {
                onAddFile();
            }
        }
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Only sync from data prop when the actual invoice changes (different invoice number)
    // This prevents losing edits including deleted line items
    const [lastSyncedInvoice, setLastSyncedInvoice] = useState<string>(data.invoiceNumber || '');

    useEffect(() => {
        // Only sync if the invoice number changed (switching invoices)
        // or if this is the first load (lastSyncedInvoice is empty and data has content)
        if (data.invoiceNumber !== lastSyncedInvoice || (!lastSyncedInvoice && data.lineItems.length > 0)) {
            // Deep clone the data to avoid shared references
            // Ensure every line item has a unique ID to prevent editing issues
            const clonedData: InvoiceData = {
                ...data,
                lineItems: data.lineItems.map((item) => ({
                    ...item,
                    // Generate a unique ID if missing or too short
                    id: item.id && item.id.length > 10 ? item.id : uuidv4()
                }))
            };
            setFormData(clonedData);
            setLastSyncedInvoice(data.invoiceNumber || '');
        }
    }, [data, lastSyncedInvoice]);

    useEffect(() => {
        if (previewUrl) {
            setFileUrl(previewUrl);
            return;
        }
        if (file) {
            const url = URL.createObjectURL(file);
            setFileUrl(url);
            return () => URL.revokeObjectURL(url);
        }
        setFileUrl(null);
    }, [file, previewUrl]);

    useEffect(() => {
        loadCompanies();
    }, []);

    // Auto-select first company if none selected (Fix for Validation Error)
    useEffect(() => {
        if (companies.length > 0 && !formData.targetCompany) {
            handleChange('targetCompany', companies[0]);
        }
    }, [companies, formData.targetCompany]); // Only run when companies load or targetCompany is empty

    // Fetch ledgers whenever targetCompany changes
    useEffect(() => {
        fetchLedgers();
    }, [formData.targetCompany]);

    // Effect to pre-fill company details - REMOVED to allow validation of extracted data
    // We do NOT want to overwrite the extracted Buyer/Supplier name with the Target Company name automatically.
    // This ensures that if the invoice belongs to a different company, the mismatch is detected.
    /*
    useEffect(() => {
        const prefillCompanyData = async () => {
            // ... (removed)
        };
        if (!isScanning) {
            prefillCompanyData();
        }
    }, [formData.targetCompany, formData.voucherType, isScanning]);
    */

    const fetchLedgers = async () => {
        setLoadingLedgers(true);
        try {
            const ledgerSet = await fetchExistingLedgers(formData.targetCompany);
            setLedgers(Array.from(ledgerSet).sort());
        } catch (e) {
            console.error("Failed to load ledgers", e);
        } finally {
            setLoadingLedgers(false);
        }
    };

    // Validation Logic
    const validationErrors = useMemo(() => {
        const errors: { field: string; message: string; id?: string }[] = [];

        // GSTIN Regex
        const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

        if (formData.supplierGstin && !gstinRegex.test(formData.supplierGstin)) {
            errors.push({ field: 'supplierGstin', message: 'Invalid Supplier GSTIN Format' });
        }
        if (formData.buyerGstin && !gstinRegex.test(formData.buyerGstin)) {
            errors.push({ field: 'buyerGstin', message: 'Invalid Buyer GSTIN Format' });
        }

        // Date Validation
        const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
        if (formData.invoiceDate) {
            if (!dateRegex.test(formData.invoiceDate)) {
                errors.push({ field: 'invoiceDate', message: 'Date must be DD-MM-YYYY' });
            } else {
                const [d, m, y] = formData.invoiceDate.split('-').map(Number);
                const dateObj = new Date(y, m - 1, d);
                if (dateObj.getFullYear() !== y || dateObj.getMonth() !== m - 1 || dateObj.getDate() !== d) {
                    errors.push({ field: 'invoiceDate', message: 'Invalid calendar date' });
                }
            }
        }

        // Company Name Mapping Validation (Fuzzy Match)
        // Purchase -> User (Target Company) is Buyer
        // Sales -> User (Target Company) is Supplier
        // Logic: Check if one contains the other to handle "ABC Pvt Ltd" vs "ABC"
        const target = formData.targetCompany?.trim().toLowerCase();
        if (target) {
            if (formData.voucherType === 'Purchase') {
                const buyer = formData.buyerName?.trim().toLowerCase();
                if (buyer) {
                    // Check if target is inside buyer OR buyer is inside target
                    const match = target.includes(buyer) || buyer.includes(target);
                    if (!match) {
                        errors.push({ field: 'companyMap', message: `Purchase Voucher: Company '${formData.targetCompany}' should match Buyer Name.` });
                    }
                }
            } else if (formData.voucherType === 'Sales') {
                const supplier = formData.supplierName?.trim().toLowerCase();
                if (supplier) {
                    // Check if target is inside supplier OR supplier is inside target
                    const match = target.includes(supplier) || supplier.includes(target);
                    if (!match) {
                        errors.push({ field: 'companyMap', message: `Sales Voucher: Company '${formData.targetCompany}' should match Supplier Name.` });
                    }
                }
            }
        }

        // Line Item Consistency Check
        formData.lineItems.forEach(item => {
            const calculated = round(item.quantity * item.rate);
            const declared = Number(item.amount);
            if (item.rate > 0 && Math.abs(calculated - declared) > 1.0) {
                errors.push({
                    field: 'lineItemMath',
                    id: item.id,
                    message: `Math Mismatch: ${item.description.slice(0, 15)}... (Qty * Rate = ${calculated}, but Amount is ${declared})`
                });
            }
        });

        return errors;
    }, [formData]);

    // Determine if this is an interstate transaction:
    // 1. Based on GSTIN state codes (traditional method)
    // 2. OR if any line item has isIGST=true (fallback when GSTIN is missing but invoice has IGST)
    const useInterState = useMemo(() => {
        const supplierState = formData.supplierGstin ? formData.supplierGstin.trim().substring(0, 2) : '';
        const buyerState = formData.buyerGstin ? formData.buyerGstin.trim().substring(0, 2) : '';

        // If both GSTINs exist and states differ, it's interstate
        if (supplierState && buyerState && supplierState !== buyerState) {
            return true;
        }

        // Fallback: If any line item is explicitly marked as IGST, use IGST
        const hasIGSTItems = formData.lineItems.some(item => item.isIGST === true);
        if (hasIGSTItems) {
            return true;
        }

        return false;
    }, [formData.supplierGstin, formData.buyerGstin, formData.lineItems]);

    // Calculate totals
    useEffect(() => {
        let totalTaxable = 0;
        let totalTax = 0;
        let totalCGST = 0;
        let totalSGST = 0;
        let totalIGST = 0;

        formData.lineItems.forEach(item => {
            const amount = Number(item.amount) || 0;
            totalTaxable += amount;

            const gst = Number(item.gstRate) || 0;
            const lineTax = amount * gst / 100; // NO ROUND
            totalTax += lineTax;

            if (gst > 0) {
                // Use per-item isIGST flag if set, otherwise use the global useInterState
                const itemIsInterState = item.isIGST !== undefined ? item.isIGST : useInterState;

                if (itemIsInterState) {
                    totalIGST += lineTax;
                } else {
                    const half = lineTax / 2;
                    totalCGST += half;
                    totalSGST += half;
                }
            }
        });

        const actualGrand = totalTaxable + totalTax;
        const roundedGrand = monetaryRound(actualGrand); // Use consistent 0.50 threshold rounding
        const roundOff = +(roundedGrand - actualGrand).toFixed(2);


        setTotals({
            taxable: totalTaxable,
            tax: totalTax,
            cgst: totalCGST,
            sgst: totalSGST,
            igst: totalIGST,
            roundOff,
            grand: roundedGrand
        });

        setFormData(prev => ({
            ...prev,
            roundOff,
            grandTotal: roundedGrand
        }));

    }, [formData.lineItems, useInterState]);

    const handleChange = (field: keyof InvoiceData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Specialized Handler for Voucher Type (Swap Logic - RETAINED)
    const handleVoucherTypeChange = (newType: 'Sales' | 'Purchase') => {
        setFormData(prev => {
            if (prev.voucherType === newType) return prev;

            // Simple Swap: Supplier <-> Buyer
            return {
                ...prev,
                voucherType: newType,
                supplierName: prev.buyerName,
                supplierGstin: prev.buyerGstin,
                buyerName: prev.supplierName,
                buyerGstin: prev.supplierGstin
            };
        });
    };

    const handleLineItemChange = (id: string, field: keyof LineItem, value: string | number | boolean) => {
        setFormData(prev => ({
            ...prev,
            lineItems: prev.lineItems.map(item => {
                if (item.id !== id) return item;
                const updated = { ...item, [field]: value };
                if (field === 'quantity' || field === 'rate') {
                    const rawAmount = Number(updated.quantity) * Number(updated.rate);
                    updated.amount = rawAmount; // keep full precision
                }
                return updated;
            })
        }));
    };

    const addLineItem = () => {
        setFormData(prev => ({
            ...prev,
            lineItems: [...prev.lineItems, {
                id: uuidv4(),
                description: '',
                hsn: '',
                quantity: 1,
                rate: 0,
                amount: 0,
                gstRate: 18,
                unit: 'Nos',
                isIGST: useInterState // Inherit from current interstate detection
            }]
        }));
    };

    const removeLineItem = (id: string) => {
        setFormData(prev => ({
            ...prev,
            lineItems: prev.lineItems.filter(item => item.id !== id)
        }));
    };

    const handleSave = () => { onSave(formData, false); };
    const handleSaveDraft = () => {
        localStorage.setItem('autotally_autosave', JSON.stringify(formData));
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
    };
    const handleSaveAndNext = () => { onSave(formData, false); if (onNext) onNext(); };
    const handlePush = () => { onPush(formData); };
    const hasError = (field: string, id?: string) => {
        return validationErrors.some(e => e.field === field && (id ? e.id === id : true));
    };

    const getBaseInputClass = (isError: boolean) => `
    w-full px-3 py-2 border rounded-lg text-sm outline-none shadow-sm transition-colors
    ${isError
            ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-slate-900 dark:text-white focus:border-red-500 focus:ring-1 focus:ring-red-500'
            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-tally-500 placeholder-slate-400 dark:placeholder-slate-500'
        }
  `;

    const getTableInputClass = (isError: boolean) => `
    w-full px-2 py-1.5 border rounded outline-none text-sm shadow-sm transition-colors
    ${isError
            ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-slate-900 dark:text-white focus:border-red-500'
            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-tally-500 placeholder-slate-400 dark:placeholder-slate-500'
        }
  `;

    // --- DROPDOWN RENDERER ---
    const renderDropdown = (type: 'supplier' | 'buyer', value: string, onChange: (val: string) => void) => {
        if (activeDropdown !== type) return null;

        // Filter ledgers
        const filtered = ledgers.filter(l => l.toLowerCase().includes(value.toLowerCase()));

        // If no match, show message or nothing? Showing nothing if list is empty or no matches seems cleaner, 
        // but showing "No ledgers found" helps debugging.
        if (filtered.length === 0) {
            return (
                <div className="absolute z-[110] left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-3 text-xs text-slate-500 dark:text-slate-400 text-center animate-fade-in">
                    No matching ledgers found in Tally.
                </div>
            );
        }

        return (
            <div className="absolute z-[110] left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-fade-in">
                {filtered.map((ledger, idx) => (
                    <button
                        key={idx}
                        type="button"
                        className="w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 last:border-0 transition-colors focus:bg-indigo-50 focus:outline-none"
                        onClick={() => {
                            onChange(ledger);
                            setActiveDropdown(null);
                        }}
                    >
                        {ledger}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="flex flex-col xl:flex-row h-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden animate-fade-in transition-colors duration-200">

            {/* LEFT PANE: File Preview */}
            <div className="xl:w-5/12 border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/50 flex flex-col h-[400px] xl:h-auto shrink-0">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between text-sm bg-white dark:bg-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Original File Preview
                    </div>
                    {fileUrl && (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-slate-200 dark:bg-slate-700 rounded-lg p-1">
                                <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded text-slate-600 dark:text-slate-300" title="Zoom Out"><ZoomOut className="w-3.5 h-3.5" /></button>
                                <span className="text-[10px] font-mono px-2 min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
                                <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded text-slate-600 dark:text-slate-300" title="Zoom In"><ZoomIn className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="flex items-center bg-slate-200 dark:bg-slate-700 rounded-lg p-1">
                                <button onClick={() => setRotation(r => r - 90)} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded text-slate-600 dark:text-slate-300" title="Rotate Left"><RotateCcw className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setRotation(r => r + 90)} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded text-slate-600 dark:text-slate-300" title="Rotate Right"><RotateCw className="w-3.5 h-3.5" /></button>
                            </div>
                            <a href={fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-xs text-blue-600 dark:text-blue-400 font-medium transition-colors">
                                <ExternalLink className="w-3 h-3" /> Open
                            </a>
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-hidden bg-slate-200 dark:bg-slate-950 flex items-center justify-center relative">
                    {/* Locked Placeholder */}
                    {isLocked ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center animate-fade-in">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-inner">
                                <Lock className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Preview Locked</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-[200px] mt-2">
                                Enter password in the popup to unlock this document.
                            </p>
                        </div>
                    ) : fileUrl ? (
                        file?.type === 'application/pdf' ? (
                            <div className="w-full h-full overflow-auto scrollbar-hide flex items-center justify-center bg-slate-800/5">
                                <object
                                    key={fileUrl}
                                    data={`${fileUrl}#toolbar=0&navpanes=0`}
                                    type="application/pdf"
                                    className="transition-transform duration-200 ease-out origin-center"
                                    style={{
                                        width: `${100 * zoom}%`,
                                        height: `${100 * zoom}%`,
                                        transform: `rotate(${rotation}deg)`
                                    }}
                                >
                                    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 p-4">
                                        <p>Preview not available inline.</p>
                                        <a href={fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">Click here to view PDF</a>
                                    </div>
                                </object>
                            </div>
                        ) : (
                            <div className="p-4 overflow-auto scrollbar-hide w-full h-full flex items-center justify-center bg-slate-800/5">
                                <img
                                    src={fileUrl}
                                    alt="Invoice"
                                    className="max-w-none transition-transform duration-200 ease-out rounded shadow-sm border border-slate-300 dark:border-slate-700"
                                    style={{
                                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                                        maxWidth: zoom === 1 ? '100%' : 'none'
                                    }}
                                />
                            </div>
                        )
                    ) : (
                        <div className="text-slate-400 text-center text-sm"><p>No preview available.</p></div>
                    )}
                </div>
            </div>

            {/* RIGHT PANE: Editor Form */}
            <div className="flex-1 flex flex-col h-full relative min-w-0">

                {isScanning && (
                    <div className="absolute inset-0 z-[100] bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in cursor-wait">
                        <div className="relative w-24 h-32 bg-white dark:bg-slate-800 rounded-lg border-2 border-slate-300 dark:border-slate-600 shadow-xl mb-6 overflow-hidden">
                            {/* Mock lines */}
                            <div className="space-y-2 p-3">
                                <div className="h-2 w-3/4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                                <div className="h-2 w-1/2 bg-slate-200 dark:bg-slate-700 rounded"></div>
                                <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded"></div>
                                <div className="h-2 w-5/6 bg-slate-200 dark:bg-slate-700 rounded"></div>
                                <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded"></div>
                            </div>
                            {/* Scanning Beam */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] animate-scan"></div>
                        </div>

                        <h3 className="text-xl font-bold text-slate-800 dark:text-white animate-pulse">Analyzing Invoice...</h3>

                        {file && (
                            <div className="mt-2 flex items-center gap-2 px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-full">
                                <FileText className="w-3 h-3 text-slate-500" />
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{file.name}</span>
                            </div>
                        )}

                        <p className="text-slate-500 dark:text-slate-400 mt-3 text-sm text-center max-w-xs px-4">
                            Extracting Invoice Details, GSTIN, and Line Items.
                        </p>

                        {onCancelScan && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onCancelScan(); }}
                                className="mt-6 px-5 py-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-sm font-semibold shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-2"
                            >
                                Cancel Process
                            </button>
                        )}
                    </div>
                )}

                {/* Toolbar */}
                <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap justify-between items-center bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-[60] shrink-0 gap-3">
                    <div className="flex items-center gap-2">
                        <div className="flex bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm p-0.5">
                            <button onClick={() => { onSave(formData, false); if (onPrev) onPrev(); }} disabled={!hasPrev || isScanning} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                            <span className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 border-l border-r border-slate-200 dark:border-slate-700 min-w-[100px] text-center">Invoice {currentIndex + 1} of {totalCount}</span>
                            <button onClick={() => { onSave(formData, false); if (onNext) onNext(); }} disabled={!hasNext || isScanning} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => {
                                if (onAddFiles) {
                                    fileInputRef.current?.click();
                                } else if (onAddFile) {
                                    onAddFile();
                                }
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shadow-sm border bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-900/50"
                            disabled={isScanning}
                        >
                            <FilePlus className="w-3.5 h-3.5" /> Add New File
                        </button>
                        {onDelete && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowDeleteDropdown(prev => !prev)}
                                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shadow-sm border bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/50"
                                    disabled={isScanning}
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete <ChevronDown className="w-3 h-3 ml-0.5" />
                                </button>
                                {showDeleteDropdown && (
                                    <div className="absolute top-full text-left right-0 mt-1 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-[100] animate-fade-in flex flex-col py-1">
                                        <button
                                            onClick={() => { setShowDeleteDropdown(false); onDelete(); }}
                                            className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 text-left w-full flex items-center gap-2"
                                        >
                                            Delete Current
                                        </button>
                                        {onDeleteAll && (
                                            <button
                                                onClick={() => { setShowDeleteDropdown(false); onDeleteAll(); }}
                                                className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 text-left w-full flex items-center gap-2 border-t border-slate-100 dark:border-slate-700/50"
                                            >
                                                Delete All
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        <button onClick={handleSaveDraft} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shadow-sm border ${draftSaved ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                            {draftSaved ? <Check className="w-3.5 h-3.5" /> : <FileDown className="w-3.5 h-3.5" />} {draftSaved ? 'Saved' : 'Save Draft'}
                        </button>
                        <div className="relative">
                            <button
                                onClick={() => setShowPushDropdown(prev => !prev)}
                                disabled={isPushing || isScanning}
                                className={`flex items-center gap-2 px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors shadow-sm border-2 border-transparent ${isPushing || isScanning ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 border-slate-300 dark:border-slate-600' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10'}`}
                            >
                                {isPushing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />} {isPushing ? 'Pushing...' : 'Push to Tally'} <ChevronDown className="w-3 h-3 ml-0.5" />
                            </button>
                            {showPushDropdown && (
                                <div className="absolute top-full text-left right-0 mt-1 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-[100] animate-fade-in flex flex-col py-1">
                                    <button
                                        onClick={() => { setShowPushDropdown(false); handlePush(); }}
                                        className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400 text-left w-full flex items-center gap-2"
                                    >
                                        Push Current
                                    </button>
                                    {onPushAll && (
                                        <button
                                            onClick={() => { setShowPushDropdown(false); onPushAll(); }}
                                            className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400 text-left w-full flex items-center gap-2 border-t border-slate-100 dark:border-slate-700/50"
                                        >
                                            Push All
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        {hasNext ? (
                            <button onClick={handleSaveAndNext} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors shadow-sm" disabled={isScanning}><Save className="w-3.5 h-3.5" /> Save & Next</button>
                        ) : (
                            <button onClick={handleSave} className="flex items-center gap-2 px-3 py-1.5 bg-tally-600 hover:bg-tally-700 text-white text-xs font-medium rounded-lg transition-colors shadow-sm" disabled={isScanning}><Save className="w-3.5 h-3.5" /> Update Invoice</button>
                        )}
                    </div>
                </div>

                {validationErrors.length > 0 && !isScanning && (
                    <div className="mx-6 mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg flex items-start gap-3 animate-fade-in shadow-sm">
                        <ShieldAlert className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h4 className="text-sm font-bold text-orange-800 dark:text-orange-300 flex items-center justify-between">AI Validation Insights <span className="text-[10px] bg-orange-100 dark:bg-orange-800 px-2 py-0.5 rounded-full">{validationErrors.length} Issues</span></h4>
                            <ul className="list-disc list-inside text-xs text-orange-700 dark:text-orange-400 mt-1 space-y-0.5">
                                {validationErrors.slice(0, 3).map((err, i) => <li key={i}>{err.message}</li>)}
                                {validationErrors.length > 3 && <li>And {validationErrors.length - 3} more issues...</li>}
                            </ul>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-auto p-6 scrollbar-hide">
                    {/* Header Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-10">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Voucher Type</label>
                                <select value={formData.voucherType} onChange={(e) => handleVoucherTypeChange(e.target.value as 'Sales' | 'Purchase')} className={getBaseInputClass(false)}>
                                    <option value="Sales">Sales</option>
                                    <option value="Purchase">Purchase</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1 flex items-center gap-2"><Building className="w-3 h-3" /> Target Company</label>
                                <div className="flex gap-1">
                                    <select value={formData.targetCompany || ''} onChange={(e) => handleChange('targetCompany', e.target.value)} className={`${getBaseInputClass(false)} flex-1 cursor-pointer`}>
                                        <option value="">Select Company...</option>
                                        {companies.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <button onClick={loadCompanies} disabled={loadingCompanies} className="p-2 text-slate-500 dark:text-slate-400 hover:text-tally-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded border border-slate-300 dark:border-slate-600 transition-colors" title="Refresh Company List">
                                        <RefreshCw className={`w-4 h-4 ${loadingCompanies ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Invoice Number</label>
                                <input type="text" value={formData.invoiceNumber} onChange={(e) => handleChange('invoiceNumber', e.target.value)} className={getBaseInputClass(false)} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Invoice Date {hasError('invoiceDate') && <span className="text-red-500 ml-1 text-[10px]">(Invalid)</span>}</label>
                                <input type="text" placeholder="DD-MM-YYYY" value={formData.invoiceDate} onChange={(e) => handleChange('invoiceDate', e.target.value)} className={getBaseInputClass(hasError('invoiceDate'))} />
                            </div>
                        </div>

                        {/* Supplier Details */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-1">
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><User className="w-4 h-4 text-tally-500" /> Supplier Details</h4>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Name</label>
                                <div className="relative" ref={activeDropdown === 'supplier' ? dropdownRef : null}>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={formData.supplierName}
                                            onChange={(e) => { handleChange('supplierName', e.target.value); setActiveDropdown('supplier'); }}
                                            onFocus={() => setActiveDropdown('supplier')}
                                            className={`${getBaseInputClass(false)} pr-8`}
                                            placeholder="Type or select..."
                                            autoComplete="off"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setActiveDropdown(activeDropdown === 'supplier' ? null : 'supplier')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 p-1"
                                        >
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {renderDropdown('supplier', formData.supplierName, (val) => handleChange('supplierName', val))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">GSTIN</label>
                                <input type="text" value={formData.supplierGstin} onChange={(e) => handleChange('supplierGstin', e.target.value)} className={getBaseInputClass(hasError('supplierGstin'))} />
                            </div>
                        </div>

                        {/* Buyer Details */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-1">
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><User className="w-4 h-4 text-tally-500" /> Buyer Details</h4>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Name</label>
                                <div className="relative" ref={activeDropdown === 'buyer' ? dropdownRef : null}>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={formData.buyerName}
                                            onChange={(e) => { handleChange('buyerName', e.target.value); setActiveDropdown('buyer'); }}
                                            onFocus={() => setActiveDropdown('buyer')}
                                            className={`${getBaseInputClass(false)} pr-8`}
                                            placeholder="Type or select..."
                                            autoComplete="off"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setActiveDropdown(activeDropdown === 'buyer' ? null : 'buyer')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 p-1"
                                        >
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {renderDropdown('buyer', formData.buyerName, (val) => handleChange('buyerName', val))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">GSTIN</label>
                                <input type="text" value={formData.buyerGstin} onChange={(e) => handleChange('buyerGstin', e.target.value)} className={getBaseInputClass(hasError('buyerGstin'))} />
                            </div>
                        </div>
                    </div>

                    {/* Line Items */}
                    <div className="mb-10">
                        <div className="flex justify-between items-center mb-6">
                            <h4 className="font-black text-lg text-slate-900 dark:text-white tracking-tight">Line Items</h4>
                            <div className="flex items-center gap-4">
                                <button onClick={addLineItem} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all">
                                    <Plus className="w-4 h-4" /> Add Item
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
                            <table className="w-full text-sm text-left border-collapse min-w-[1000px]">
                                <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest text-[10px] border-b border-slate-200 dark:border-slate-700 sticky top-0 z-[10]">
                                    <tr>
                                        <th className="px-6 py-4 min-w-[250px] bg-slate-50 dark:bg-slate-800">Description</th>
                                        <th className="px-4 py-4 w-24 bg-slate-50 dark:bg-slate-800">Qty</th>
                                        <th className="px-4 py-4 w-32 bg-slate-50 dark:bg-slate-800">Unit</th>
                                        <th className="px-4 py-4 min-w-[120px] bg-slate-50 dark:bg-slate-800">Rate</th>
                                        <th className="px-4 py-4 min-w-[140px] bg-slate-50 dark:bg-slate-800">Taxable</th>
                                        <th className="px-4 py-4 w-28 text-center bg-slate-50 dark:bg-slate-800">{useInterState ? 'IGST' : 'GST'} %</th>
                                        <th className="px-4 py-4 w-16 text-center bg-slate-50 dark:bg-slate-800" title="Inter-state (IGST)">IGST?</th>
                                        <th className="px-4 py-4 w-12 bg-slate-50 dark:bg-slate-800"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {formData.lineItems.map((item) => (
                                        <tr key={item.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                                            <td className="px-4 py-3 relative">
                                                {hasError('lineItemMath', item.id) && (
                                                    <div className="absolute top-1 right-1 text-red-500" title="Math mismatch">
                                                        <AlertTriangle className="w-3 h-3" />
                                                    </div>
                                                )}
                                                <input type="text" value={item.description} onChange={(e) => handleLineItemChange(item.id, 'description', e.target.value)} className={getTableInputClass(false)} placeholder="Product Name" />
                                            </td>
                                            <td className="px-2 py-3"><input type="number" value={item.quantity} onChange={(e) => handleLineItemChange(item.id, 'quantity', Number(e.target.value))} className={getTableInputClass(false)} /></td>
                                            <td className="px-2 py-3">
                                                <input list={`unit-options-${item.id}`} type="text" value={item.unit || 'Nos'} onChange={(e) => handleLineItemChange(item.id, 'unit', e.target.value)} className={getTableInputClass(false)} placeholder="Unit" />
                                                <datalist id={`unit-options-${item.id}`}><option value="Nos" /><option value="Kgs" /><option value="Pcs" /><option value="Box" /><option value="Mtr" /><option value="Ltr" /><option value="Set" /><option value="Bag" /><option value="Doz" /></datalist>
                                            </td>
                                            <td className="px-2 py-3"><input type="number" value={item.rate} onChange={(e) => handleLineItemChange(item.id, 'rate', Number(e.target.value))} className={getTableInputClass(false)} /></td>
                                            <td className="px-2 py-3 font-mono font-medium"><input type="number" value={item.amount} onChange={(e) => handleLineItemChange(item.id, 'amount', Number(e.target.value))} className={getTableInputClass(hasError('lineItemMath', item.id))} /></td>
                                            <td className="px-2 py-3">
                                                <select value={item.gstRate} onChange={(e) => handleLineItemChange(item.id, 'gstRate', Number(e.target.value))} className={`${getTableInputClass(false)} text-center font-bold text-indigo-600 dark:text-indigo-400`}>
                                                    <option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option>
                                                </select>
                                            </td>
                                            <td className="px-2 py-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={item.isIGST ?? useInterState}
                                                    onChange={(e) => handleLineItemChange(item.id, 'isIGST', e.target.checked)}
                                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                                    title="Check for IGST (Interstate), uncheck for CGST+SGST (Intrastate)"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-center"><button onClick={() => removeLineItem(item.id)} className="text-slate-300 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Totals Summary */}
                    <div className="flex justify-end">
                        <div className="w-full max-w-md space-y-4 bg-slate-50 dark:bg-slate-900/50 p-8 rounded-[32px] border border-slate-200 dark:border-slate-700 shadow-inner">
                            <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-400"><span>Taxable Summary</span><span>Value</span></div>
                            <div className="h-px bg-slate-200 dark:bg-slate-700/50"></div>
                            <div className="flex justify-between text-sm font-bold text-slate-600 dark:text-slate-300"><span>Total Taxable</span><span>₹{totals.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                            {totals.igst > 0 ? (
                                <div className="flex justify-between text-sm font-bold text-slate-600 dark:text-slate-300"><span>IGST</span><span>₹{totals.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                            ) : (
                                <>
                                    {totals.cgst > 0 && <div className="flex justify-between text-sm font-bold text-slate-600 dark:text-slate-300"><span>CGST</span><span>₹{totals.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>}
                                    {totals.sgst > 0 && <div className="flex justify-between text-sm font-bold text-slate-600 dark:text-slate-300"><span>SGST</span><span>₹{totals.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>}
                                </>
                            )}
                            {totals.tax === 0 && <div className="flex justify-between text-sm font-bold text-slate-600 dark:text-slate-300"><span>Tax Components</span><span>₹0.00</span></div>}
                            <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-700 flex justify-between items-baseline">
                                <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Net Total</span>
                                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">₹{totals.grand.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileSelect}
            />
        </div>
    );
};

export default InvoiceEditor;
