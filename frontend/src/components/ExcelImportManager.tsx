
import React, { useState, useRef, useEffect } from 'react';
import { FileSpreadsheet, ArrowRight, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Merge, Database, ListPlus, RefreshCw, Play, Building2, UploadCloud, ChevronDown, Download } from 'lucide-react';
import { read, utils, writeFile } from 'xlsx';
import { ExcelVoucher, ProcessedFile } from '../types';
import { generateBulkExcelXml, pushToTally, fetchExistingLedgers, analyzeLedgerRequirements, fetchOpenCompanies, checkTallyConnection, tallyRound, findLedgerByTypeAndPercent } from '../services/tallyService';
import LedgerMappingModal from './LedgerMappingModal';
import BulkLedgerCreationModal from './BulkLedgerCreationModal';
import { saveInvoiceRegistry, checkInvoiceExists, getInvoiceRegistry } from '../services/dbService';
import { v4 as uuidv4 } from 'uuid';
import TallyDisconnectedModal from './TallyDisconnectedModal';
import ImportSummaryModal from './ImportSummaryModal';


interface ExcelImportManagerProps {
    onPushLog: (status: 'Success' | 'Failed' | 'Processing', message: string, response?: string) => void;
    onRegisterFile?: (file: File) => string;
    onUpdateFile?: (id: string, updates: Partial<ProcessedFile>) => void;
    externalFile?: File | null; // File from dashboard re-open
    externalFileId?: string | null; // File ID from dashboard
    externalMappedData?: ExcelVoucher[] | null; // Pre-loaded mapped data
    externalMapping?: any; // Pre-loaded column mapping
    onDelete?: (id?: string) => void;
    userName?: string;
}

// Precision Helper
const round = (num: number): number => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

// ================= CESS CONFIG =================
const CESS_EFFECTIVE_DATE = new Date('2025-09-22');

// Example rates – change only these when govt updates
const OLD_CESS_RATE = 22; // % before 22-Sep-2025
const NEW_CESS_RATE = 0;  // % after 22-Sep-2025 (example)

// Safe date parser (YYYY-MM-DD from Excel)
const parseInvoiceDate = (dateStr: string): Date => {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
};

// Centralized CESS calculator
const calculateCess = (
    invoiceDate: string,
    taxableAmount: number,
    gstRate: number,
    isCessMapped: boolean,
    excelCess?: number
): number => {
    // 1️⃣ Excel override always wins (If column is mapped, TRUST IT, even if 0)
    if (isCessMapped) {
        return round(excelCess || 0);
    }

    // 2️⃣ Date-based CESS logic
    const invDate = parseInvoiceDate(invoiceDate);

    // Rule: Before 22-09-2025, Cess applies ONLY if GST is 28% (or higher)
    // Rule: On/After 22-09-2025, Cess is 0 regardless of rate
    if (invDate < CESS_EFFECTIVE_DATE) {
        if (gstRate >= 28) {
            return round((taxableAmount * OLD_CESS_RATE) / 100);
        }
    }

    return 0;
};

const ExcelImportManager: React.FC<ExcelImportManagerProps> = ({ onPushLog, onRegisterFile, onUpdateFile, externalFile, externalFileId, externalMappedData, externalMapping, onDelete, userName = '' }) => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [file, setFile] = useState<File | null>(null);
    const [fileId, setFileId] = useState<string | null>(null);
    const [rawData, setRawData] = useState<any[]>([]);
    const [mappedData, setMappedData] = useState<ExcelVoucher[]>([]);
    const [progress, setProgress] = useState({ processed: 0, total: 0, batch: 0, errors: 0 });
    const [isProcessing, setIsProcessing] = useState(false);
    const [missingLedgers, setMissingLedgers] = useState<string[]>([]);
    const [isCheckingLedgers, setIsCheckingLedgers] = useState(false);
    const [isStartingPush, setIsStartingPush] = useState(false); // Validating before push
    const [connectionError, setConnectionError] = useState<boolean>(false);
    const [companies, setCompanies] = useState<string[]>([]);
    const [selectedCompany, setSelectedCompany] = useState<string>('');
    const [loadingCompanies, setLoadingCompanies] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [allColumns, setAllColumns] = useState<string[]>([]);
    const [showNotification, setShowNotification] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const isCancelledRef = useRef(false);

    // Import Summary State
    const [summaryModalOpen, setSummaryModalOpen] = useState(false);
    const [importSummary, setImportSummary] = useState({ total: 0, skipped: 0, success: 0, failed: 0 });

    const [mapping, setMapping] = useState({
        voucherType: '',
        date: '',
        invoiceNo: '',
        partyName: '',
        gstin: '',
        amount: '',
        taxRate: '',
        rate: '',
        period: '',
        reverseCharge: '',
        invoiceValue: '',
        taxableValue: '',
        igst: '',
        cgst: '',
        sgst: '',
        cess: '',
        quantity: '',
        address: '',      // Added for Address mapping
        placeOfSupply: '' // Added for POS mapping
    });

    // Ledger Mapping State
    const [showMappingModal, setShowMappingModal] = useState(false);
    const [missingRates, setMissingRates] = useState<number[]>([]);
    const [ledgerMappings, setLedgerMappings] = useState<Record<string, string>>({}); // rate string -> ledger name

    // Bulk Ledger Creation State
    const [showLedgerCreationModal, setShowLedgerCreationModal] = useState(false);
    const [proposedLedgers, setProposedLedgers] = useState<string[]>([]);

    const [pushReadyData, setPushReadyData] = useState<{
        vouchers: ExcelVoucher[],
        ledgers: string[],
        skippedLedgers?: string[], // Added to pass skipped ledgers through
    } | null>(null);

    // Load mappings from local storage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('autotally_ledger_mappings');
            if (saved) setLedgerMappings(JSON.parse(saved));
        } catch (e) { }
    }, []);

    const downloadTemplate = () => {
        const headers = [
            'Period',
            'Supplier Name',
            'Address',
            'GSTIN',
            'POS',
            'Invoice Type',
            'Invoice No',
            'Invoice Date',
            'Reverse Charge',
            'Invoice Value',
            'Taxable Value',
            'Tax Rate',
            'IGST',
            'CGST',
            'SGST',
            'Cess'
        ];

        // Add a sample row to help users understand format
        const sampleRow = [
            'Apr-2025',          // Period
            'Sample Party Name', // Supplier Name
            'Pune, Maharashtra', // Address
            '27ABCDE1234F1Z5',   // GSTIN
            'Maharashtra',       // POS
            'Purchase',          // Invoice Type
            'INV-001',           // Invoice No
            new Date().toISOString().split('T')[0], // Invoice Date
            'No',                // Reverse Charge
            1180,                // Invoice Value
            1000,                // Taxable Value
            18,                  // Tax Rate
            0,                   // IGST
            90,                  // CGST
            90,                  // SGST
            0                    // Cess
        ];

        const ws = utils.aoa_to_sheet([headers, sampleRow]);

        // Set column widths for better readability
        const wscols = headers.map(h => ({ wch: h.length + 5 }));
        ws['!cols'] = wscols;

        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Template");
        writeFile(wb, "AutoTally_Import_Template.xlsx");
    };

    const BATCH_SIZE = 100;

    // Filter out empty/undefined columns AND unwanted GSTR filing-related columns
    const excludedKeywords = [
        'gstr3b', 'gstr-1/5', 'gstr1/5', 'gstr 1/5', 'filling status', 'filing status',
        'filling date', 'filing date', 'filling period', 'filing period',
        'tax period in which amended', 'amendment type', 'e-invoice applicable',
        'einvoice applicable', 'e invoice applicable'
    ];
    const visibleColumns = allColumns.filter(col => {
        if (col === null || col === undefined || col === '' || String(col).trim() === '') return false;
        const colLower = String(col).toLowerCase();
        // Exclude if column name contains any of the excluded keywords
        return !excludedKeywords.some(keyword => colLower.includes(keyword));
    });

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (step === 3 && mappedData.length > 0) {
            checkLedgers();
            loadCompanies();
        }
    }, [step, mappedData]);

    // Load companies on initial mount
    useEffect(() => {
        loadCompanies();
    }, []);

    // Load external file if provided (from dashboard re-open)
    useEffect(() => {
        if (externalFile && step === 1) {
            setFile(externalFile);
            if (externalFileId) setFileId(externalFileId); // Set the file ID
            const reader = new FileReader();
            reader.onload = (evt) => {
                const dataBuffer = evt.target?.result;
                if (!dataBuffer) return;
                try {
                    const wb = read(dataBuffer, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    // Use defval to ensure all columns are captured including empty cells
                    const data = utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
                    if (data.length > 0) {
                        // Use same header detection logic as processExcelFile
                        let headerRowIndex = 0;
                        let maxScore = 0;
                        // Enhanced keywords for header detection - covers both GSTR formats
                        const keywords = ['date', 'invoice', 'no', 'gstin', 'party', 'name', 'address', 'tax', 'amount', 'rate', 'value', 'type', 'ledger', 'cgst', 'sgst', 'igst', 'total', 'cess', 'taxable', 'integrated', 'central', 'state', 'supplier', 'period', 'reverse', 'pos', 'con', 'place', 'supply', 'filing', 'status', 'document', 'uin', 'applicable'];
                        for (let i = 0; i < Math.min(data.length, 20); i++) {
                            const row = data[i];
                            if (!Array.isArray(row)) continue;
                            let score = 0;
                            row.forEach(cell => { if (typeof cell === 'string' && keywords.some(k => cell.toLowerCase().includes(k))) score++; });
                            if (score > maxScore) { maxScore = score; headerRowIndex = i; }
                        }
                        const header = (data[headerRowIndex] || []).map(String);
                        // console.log('External file - Detected header row:', headerRowIndex, 'Headers:', header);
                        setAllColumns(header);
                        setRawData(data.slice(headerRowIndex + 1));

                        // Apply auto-mapping for external file (same logic as processExcelFile)
                        const guess = { ...mapping };
                        header.forEach(col => {
                            const c = col.toLowerCase().trim();
                            // Date
                            if (c === 'date' || c.includes('inv date') || c.includes('invoice date') || c.includes('bill date') || c.includes('voucher date')) guess.date = col;
                            // Invoice No
                            if (c === 'inv no' || c === 'invoice no' || c === 'no' || c === 'bill no' || c.includes('voucher no') || c.includes('doc no') || c === 'invoice number') guess.invoiceNo = col;
                            // Party Name
                            if (c === 'supplier name' || c === 'party name' || c === 'customer name' || c === 'party' || c === 'name' || c.includes('ledger') || c.includes('particulars')) guess.partyName = col;
                            // Address
                            if (c === 'address' || c === 'party address' || c === 'supplier address' || c === 'billing address') guess.address = col;
                            // GSTIN
                            if (c.includes('gstin') || c.includes('gst no') || c === 'gstin/uin' || c === 'gst number') guess.gstin = col;
                            // Taxable Value / Amount
                            if (c.includes('taxable') || c === 'taxable value' || c === 'basic' || c === 'assessable value') {
                                guess.taxableValue = col;
                                if (!guess.amount) guess.amount = col;
                            }
                            // Tax Rate
                            if (c === 'tax rate' || c === 'rate' || c === 'gst rate' || c === 'rate(%)' || (c.includes('rate') && (c.includes('tax') || c.includes('gst')))) {
                                guess.taxRate = col;
                                guess.rate = col;
                            }
                            // Invoice Value
                            if (c.includes('total') || c.includes('invoice val') || c.includes('net amount') || c === 'invoice value') guess.invoiceValue = col;
                            // IGST
                            if ((c.includes('igst') || c.includes('integrated')) && !c.includes('rate') && !c.includes('filing')) guess.igst = col;
                            // CGST
                            if ((c.includes('cgst') || c.includes('central')) && !c.includes('rate') && !c.includes('filing')) guess.cgst = col;
                            // SGST
                            if ((c.includes('sgst') || c.includes('state') || c.includes('utgst')) && !c.includes('rate') && !c.includes('filing')) guess.sgst = col;
                            // CESS
                            if (c.includes('cess') && !c.includes('rate') && !c.includes('filing')) guess.cess = col;
                            // Period - Prioritize exact matches
                            if (c === 'period' || c === 'return period') {
                                guess.period = col;
                            } else if ((c.includes('period') && !c.includes('filing'))) {
                                // Only set partial match if we haven't found an exact match yet
                                // Check if current guess is already an exact match, if so, preserve it
                                const currentGuess = guess.period ? guess.period.toLowerCase().trim() : '';
                                if (currentGuess !== 'period' && currentGuess !== 'return period') {
                                    guess.period = col;
                                }
                            }
                            // Reverse Charge
                            if (c.includes('reverse') || c.includes('rcm')) guess.reverseCharge = col;
                            // Quantity
                            if (c.includes('qty') || c.includes('quantity')) guess.quantity = col;
                        });
                        if (!guess.quantity) guess.quantity = 'N/A';
                        setMapping(guess);

                        setStep(2); // Skip to map columns
                    }
                } catch (err) {
                    console.error('Error loading external file:', err);
                }
            };
            reader.readAsArrayBuffer(externalFile);
        }
    }, [externalFile]);

    // Load external mapped data if provided (from dashboard re-open)
    useEffect(() => {
        if (externalMappedData && externalMappedData.length > 0) {
            setMappedData(externalMappedData);
            setProgress({ processed: 0, total: externalMappedData.length, batch: 0, errors: 0 });
            setStep(3); // Skip to review
        }
    }, [externalMappedData]);

    // Load external mapping if provided (from dashboard re-open)
    useEffect(() => {
        if (externalMapping) {
            setMapping(externalMapping);
        }
    }, [externalMapping]);

    const loadCompanies = async () => {
        setLoadingCompanies(true);
        try {
            const list = await fetchOpenCompanies();
            // console.log('Loaded companies:', list);
            setCompanies(list);
            if (list.length > 0 && !selectedCompany) setSelectedCompany(list[0]);
        } catch (e) {
            console.error("Failed to load companies", e);
        } finally {
            setLoadingCompanies(false);
        }
    };

    const checkLedgers = async () => {
        setIsCheckingLedgers(true);
        setConnectionError(false);
        try {
            const existing = await fetchExistingLedgers(selectedCompany);
            const sample = mappedData.slice(0, 500);
            const missing = analyzeLedgerRequirements(sample, existing);
            setMissingLedgers(missing);
        } catch (e) {
            setConnectionError(true);
        } finally {
            setIsCheckingLedgers(false);
        }
    };

    const processExcelFile = (f: File) => {
        setFile(f);
        let currentFileId = onRegisterFile ? onRegisterFile(f) : null;
        setFileId(currentFileId);
        const reader = new FileReader();
        reader.onload = (evt) => {
            const dataBuffer = evt.target?.result;
            if (!dataBuffer) return;
            try {
                const wb = read(dataBuffer, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];

                // Get the sheet range - but don't trust it blindly
                const originalRef = ws['!ref'] || 'A1';
                // console.log('Original Excel range:', originalRef);

                // Force reading all possible columns by checking for any cell data
                // Some Excel files have incorrect !ref that cuts off columns
                const refRange = utils.decode_range(originalRef);

                // Scan the worksheet for actual data extent (check first 30 rows for max column)
                let maxCol = refRange.e.c;
                for (let r = 0; r <= Math.min(refRange.e.r, 30); r++) {
                    for (let c = maxCol + 1; c <= 50; c++) { // Check up to 50 columns beyond current max
                        const cellRef = utils.encode_cell({ r, c });
                        if (ws[cellRef] && ws[cellRef].v !== undefined && ws[cellRef].v !== '') {
                            maxCol = c;
                        }
                    }
                }

                // Update the range if we found more columns
                if (maxCol > refRange.e.c) {
                    const newRef = utils.encode_range({
                        s: refRange.s,
                        e: { r: refRange.e.r, c: maxCol }
                    });
                    ws['!ref'] = newRef;
                    // console.log('Extended Excel range to:', newRef, 'Columns:', maxCol + 1);
                }

                // Use defval to ensure all columns are captured including empty cells
                const data = utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false }) as any[][];

                // Find the maximum column count across all rows
                let maxColumns = 0;
                data.forEach(row => {
                    if (Array.isArray(row) && row.length > maxColumns) {
                        maxColumns = row.length;
                    }
                });
                // console.log('Maximum columns found in data:', maxColumns);

                if (data.length > 0) {
                    let headerRowIndex = 0;
                    let maxScore = 0;
                    // Enhanced keywords list for better header detection - covers both GSTR formats
                    const keywords = ['date', 'invoice', 'no', 'gstin', 'party', 'name', 'address', 'tax', 'amount', 'rate', 'value', 'type', 'ledger', 'cgst', 'sgst', 'igst', 'total', 'cess', 'taxable', 'integrated', 'central', 'state', 'supplier', 'period', 'reverse', 'pos', 'con', 'place', 'supply', 'filing', 'status', 'document', 'uin', 'applicable'];
                    for (let i = 0; i < Math.min(data.length, 20); i++) {
                        const row = data[i];
                        if (!Array.isArray(row)) continue;
                        let score = 0;
                        row.forEach(cell => { if (typeof cell === 'string' && keywords.some(k => cell.toLowerCase().includes(k))) score++; });
                        if (score > maxScore) { maxScore = score; headerRowIndex = i; }
                    }
                    const header = (data[headerRowIndex] || []).map(String);
                    // console.log('Detected header row:', headerRowIndex, 'Headers:', header);
                    setAllColumns(header);
                    setRawData(data.slice(headerRowIndex + 1));

                    const guess = { ...mapping };
                    header.forEach(col => {
                        const c = col.toLowerCase().trim();
                        // Date Mapping
                        if (c === 'date' || c.includes('inv date') || c.includes('invoice date') || c.includes('bill date') || c.includes('voucher date') || c.includes('vch date')) guess.date = col;

                        // Invoice No Mapping
                        if (c === 'inv no' || c === 'invoice no' || c === 'no' || c === 'bill no' || c.includes('voucher no') || c.includes('doc no') || c === 'invoice number' || c === 'vch no') guess.invoiceNo = col;


                        // Party Name Mapping - Exact matches first, then partial matches
                        if (c === 'supplier name' || c === 'party name' || c === 'customer name' ||
                            c === 'party' || c === 'name' || c === 'buyer name' || c === 'seller name' ||
                            c.includes('party name') || c.includes('customer') || c.includes('supplier') ||
                            c.includes('ledger') || c.includes('particulars')) {
                            guess.partyName = col;
                        }
                        // Address Mapping
                        if (c === 'address' || c === 'party address' || c === 'supplier address' || c === 'billing address') {
                            guess.address = col;
                        }

                        // GSTIN Mapping - Enhanced for GSTR files (some files use 'IGST No' for GSTIN)
                        if (c.includes('gstin') || c.includes('gst no') || c === 'gstin/uin' ||
                            c === 'gst number' || c === 'party gstin' || c === 'supplier gstin' ||
                            (c.includes('uin') && !c.includes('filing'))) {
                            guess.gstin = col;
                        }

                        // Amount / Taxable Value Mapping - Enhanced patterns
                        if (c.includes('taxable') || c === 'taxable value' || c === 'taxable val' ||
                            c === 'basic' || c === 'assessable value' || c === 'assessable val' ||
                            (c.includes('amount') && !c.includes('total') && !c.includes('tax') && !c.includes('cgst') && !c.includes('sgst') && !c.includes('igst') && !c.includes('cess') && !c.includes('invoice'))) {
                            if (!guess.amount) guess.amount = col;
                            if (!guess.taxableValue) guess.taxableValue = col;
                        }

                        // Tax Rate Mapping - Enhanced patterns
                        if (c.includes('rate') || c.includes('%')) {
                            if (c.includes('tax') || c.includes('gst') || c === 'rate' || c === 'rate(%)' || c === 'rate %' ||
                                c === 'rate of tax' || c === 'tax rate' || c === 'gst rate' || c === 'gst %') {
                                if (!guess.taxRate) guess.taxRate = col;
                                if (!guess.rate) guess.rate = col;
                            }
                        }

                        // Quantity Mapping
                        if (c.includes('qty') || c.includes('quantity') || c.includes('nos') || c.includes('unit')) guess.quantity = col;

                        // Invoice Value / Total Amount Mapping - Enhanced patterns
                        if (c.includes('total') || c.includes('grand total') || c.includes('invoice val') ||
                            c.includes('invoice amt') || c.includes('net amount') || c === 'invoice value' ||
                            c === 'total invoice value' || c === 'inv value') guess.invoiceValue = col;

                        // IGST Column Mapping - Enhanced patterns for GSTR files
                        if ((c.includes('igst') || c.includes('integrated') || c === 'integrated tax' ||
                            c === 'igst amount' || c === 'igst amt' || c === 'integrated gst' ||
                            c === 'igst no' || c.startsWith('igst')) &&
                            !c.includes('rate') && !c.includes('filing')) {
                            guess.igst = col;
                        }

                        // CGST Column Mapping - Enhanced patterns
                        if ((c.includes('cgst') || c.includes('central') || c === 'central tax' ||
                            c === 'cgst amount' || c === 'cgst amt' || c === 'central gst') &&
                            !c.includes('rate') && !c.includes('filing')) {
                            guess.cgst = col;
                        }

                        // SGST/UTGST Column Mapping - Enhanced patterns
                        if ((c.includes('sgst') || c.includes('state') || c.includes('utgst') ||
                            c === 'state/ut tax' || c === 'state tax' || c === 'sgst amount' ||
                            c === 'sgst amt' || c === 'sgst/utgst' || c === 'state gst') &&
                            !c.includes('rate') && !c.includes('filing')) {
                            guess.sgst = col;
                        }

                        // CESS Column Mapping - Enhanced patterns
                        if ((c.includes('cess') || c === 'cess amount' || c === 'cess amt') &&
                            !c.includes('rate') && !c.includes('filing')) {
                            guess.cess = col;
                        }

                        // Taxable Value - Specific column detection
                        if (c === 'taxable value' || c === 'taxable val' || c === 'taxable amt' ||
                            c === 'taxable amount' || c === 'assessable value') {
                            guess.taxableValue = col;
                            if (!guess.amount) guess.amount = col;
                        }

                        // Tax Rate - More specific patterns
                        if (c === 'tax rate' || c === 'rate' || c === 'gst rate' || c === 'rate(%)' ||
                            c === 'rate %' || c === 'gst %' || c === 'rate of tax' ||
                            (c.includes('rate') && (c.includes('tax') || c.includes('gst')) && !c.includes('filing'))) {
                            if (!guess.taxRate) guess.taxRate = col;
                            if (!guess.rate) guess.rate = col;
                        }

                        // Period Field - Enhanced detection with priority
                        if (c === 'period' || c === 'return period') {
                            guess.period = col;
                        } else if ((c.includes('period') && !c.includes('filing'))) {
                            // Only overwrite if previous guess wasn't an exact match
                            const currentGuess = guess.period ? guess.period.toLowerCase().trim() : '';
                            if (currentGuess !== 'period' && currentGuess !== 'return period') {
                                guess.period = col;
                            }
                        }

                        // Place of Supply / State detection
                        if (c === 'place of supply' || c === 'pos' || c === 'state' || c === 'state name' || c === 'pos state') {
                            guess.placeOfSupply = col;
                        }

                        if (c.includes('reverse') || c.includes('rcm')) guess.reverseCharge = col;

                        // Invoice Date - map to date field (improved detection for new Excel formats)
                        if (c === 'invoice date' || c === 'inv date' || c === 'bill date' ||
                            c === 'voucher date' || c === 'vch date') {
                            guess.date = col; // Map Invoice Date directly to date field
                        }

                        // Invoice Type / Voucher Type detection from Excel column
                        if (c === 'invoice type' || c === 'voucher type' || c === 'type' ||
                            c === 'invoice or type' || c === 'vch type') {
                            // This column contains the voucher type value per row
                            guess.voucherType = col;
                        }
                    });

                    // Defaults
                    if (!guess.quantity) guess.quantity = 'N/A';
                    // Note: voucherType may be detected from "Invoice Type" column or left empty for manual selection

                    setMapping(guess);
                    setStep(2);
                    if (onUpdateFile && currentFileId) onUpdateFile(currentFileId, { status: 'Processing' });
                }
            } catch (err) {
                onPushLog('Failed', 'Excel Parse Error', 'Could not read file.');
                if (onUpdateFile && currentFileId) onUpdateFile(currentFileId, { status: 'Failed' });
            }
        };
        reader.readAsArrayBuffer(f);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processExcelFile(e.target.files[0]);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processExcelFile(e.dataTransfer.files[0]);
        }
    };

    const [notificationMessage, setNotificationMessage] = useState<string>('');

    const processMapping = () => {
        const requiredFields = [
            { key: 'date', label: 'Invoice Date' },
            { key: 'invoiceNo', label: 'Invoice Number' },
            { key: 'partyName', label: 'Party Name' },
            { key: 'amount', label: 'Taxable Value / Amount' },
            { key: 'taxRate', label: 'Tax Rate' },
            { key: 'voucherType', label: 'Voucher Type' },
            { key: 'period', label: 'Return Period' }
        ];

        // Strict Check: Ensure value is not null/undefined AND not just whitespace
        const missing = requiredFields.filter(field => {
            const val = mapping[field.key as keyof typeof mapping];
            if (!val || val.trim() === '') return true;
            if (field.key === 'voucherType') return false; // Handled separately
            // Ghost Value Check: Value must be in visibleColumns (prevent mapped but hidden excluded columns)
            return !visibleColumns.includes(val);
        });

        if (missing.length > 0) {
            const missingLabels = missing.map(m => m.label).join(', ');

            setNotificationMessage(`Please manual select the following columns: ${missingLabels}`);
            setShowNotification(true);
            setTimeout(() => setShowNotification(false), 5000);
            return;
        }

        const parseNum = (v: any) => {
            if (v === null || v === undefined) return 0;
            if (typeof v === 'string') return parseFloat(v.replace(/,/g, '').replace(/%/g, '')) || 0;
            return Number(v) || 0;
        };

        const flatRows = rawData.map((row: any) => {
            const idx = (colName: string) => allColumns.indexOf(colName);
            const val = (colName: string) => colName && idx(colName) !== -1 ? row[idx(colName)] : null;

            let dateVal: any = val(mapping.date);
            if (typeof dateVal === 'number' || (!isNaN(Number(dateVal)) && Number(dateVal) > 20000)) {
                const date_info = new Date(Math.floor(Number(dateVal) - 25569) * 86400 * 1000);
                dateVal = `${date_info.getFullYear()}-${String(date_info.getMonth() + 1).padStart(2, '0')}-${String(date_info.getDate()).padStart(2, '0')}`;
            } else if (typeof dateVal === 'string') { dateVal = dateVal.trim(); }
            else { dateVal = new Date().toISOString().slice(0, 10); }

            let vType = 'Purchase';
            if (mapping.voucherType === 'Purchase' || mapping.voucherType === 'Sales') {
                vType = mapping.voucherType;
            } else {
                const rowVal = String(val(mapping.voucherType) || '');
                if (rowVal && rowVal.toLowerCase().includes('sale')) vType = 'Sales';
            }

            let qty = 1;
            if (mapping.quantity && mapping.quantity !== 'N/A') {
                qty = parseNum(val(mapping.quantity)) || 1;
            }

            const taxable = parseNum(val(mapping.amount) || val(mapping.taxableValue));
            const rate = parseNum(val(mapping.taxRate) || val(mapping.rate));
            const total = parseNum(val(mapping.invoiceValue));

            const excelCess = parseNum(val(mapping.cess));

            const isCessMapped = !!mapping.cess && mapping.cess.trim() !== '';

            const computedCess = calculateCess(
                String(dateVal),
                taxable,
                rate,
                isCessMapped,
                excelCess
            );

            const mappedAddress = String(val(mapping.address) || '').trim();
            const mappedPOS = String(val(mapping.placeOfSupply) || '').trim();

            const finalAddress = mappedAddress || mappedPOS;
            const finalPOS = mappedPOS || mappedAddress;

            return {
                date: String(dateVal),
                invoiceNo: String(val(mapping.invoiceNo) || '').trim(),
                partyName: String(val(mapping.partyName) || 'Cash').trim(),
                gstin: String(val(mapping.gstin) || '').trim(),
                amount: taxable,
                taxRate: rate,
                totalAmount: total,
                voucherType: vType as 'Sales' | 'Purchase',
                quantity: qty,
                igst: parseNum(val(mapping.igst)),
                cgst: parseNum(val(mapping.cgst)),
                sgst: parseNum(val(mapping.sgst)),
                cess: computedCess, // ✅ DATE-BASED CESS APPLIED HERE
                period: String(val(mapping.period) || ''),
                reverseCharge: String(val(mapping.reverseCharge) || ''),
                placeOfSupply: finalPOS, // Fallback Logic
                address: finalAddress    // Fallback Logic
            };
        }).filter(t => (t.amount !== 0 || t.totalAmount !== 0) && t.invoiceNo !== '');

        const groupedMap = new Map<string, ExcelVoucher>();
        flatRows.forEach(row => {
            const key = `${row.invoiceNo.toLowerCase()}_${row.partyName.toLowerCase()}_${row.date}`;
            if (!groupedMap.has(key)) {
                groupedMap.set(key, {
                    id: uuidv4(), date: row.date, invoiceNo: row.invoiceNo, partyName: row.partyName,
                    gstin: row.gstin, voucherType: row.voucherType, items: [], totalAmount: 0,
                    period: row.period,
                    reverseCharge: row.reverseCharge,
                    placeOfSupply: row.placeOfSupply,
                    address: row.address
                });
            }
            const v = groupedMap.get(key)!;
            v.items.push({
                amount: row.amount,
                taxRate: row.taxRate,
                quantity: row.quantity,
                igst: row.igst,
                cgst: row.cgst,
                sgst: row.sgst,
                cess: row.cess
            });
            // ✅ CORRECT — do NOT round here
            const lineTotal =
                row.amount +
                (row.igst || 0) +
                (row.cgst || 0) +
                (row.sgst || 0) +
                (row.cess || 0);

            v.totalAmount += lineTotal; // keep raw total ONLY
        });

        // Calculate Round Off using consistent 0.50 threshold rounding
        Array.from(groupedMap.values()).forEach(v => {
            const actualTotal = v.items.reduce((acc, item) => {
                return acc
                    + item.amount
                    + (item.igst || 0)
                    + (item.cgst || 0)
                    + (item.sgst || 0)
                    + (item.cess || 0);
            }, 0);

            // 0.50 threshold rounding: < 0.50 rounds down, >= 0.50 rounds up
            const integerPart = Math.floor(actualTotal);
            const decimalPart = actualTotal - integerPart;
            const roundedTotal = decimalPart >= 0.50 ? integerPart + 1 : integerPart;
            const roundOff = +(roundedTotal - actualTotal).toFixed(2);

            v.roundOff = roundOff;        // separate ledger
            v.totalAmount = roundedTotal; // party ledger (integer)
        });




        const vouchers = Array.from(groupedMap.values());

        // Registry save moved to Push phase


        setMappedData(vouchers);
        setProgress({ processed: 0, total: vouchers.length, batch: 0, errors: 0 });
        setStep(3);
        if (onUpdateFile && fileId) onUpdateFile(fileId, { status: 'Ready', correctEntries: vouchers.length, excelMapping: mapping });
    };

    const [showDisconnectModal, setShowDisconnectModal] = useState(false);

    const handleCancelProcessing = () => {
        isCancelledRef.current = true;
        setIsProcessing(false);
    };

    // --- VERIFICATION HELPER ---
    const verifyLedgers = async (company: string = selectedCompany) => {
        if (!company) return [];

        try {
            setIsCheckingLedgers(true);
            const fetched = await fetchExistingLedgers(company);
            const tallyLedgers = Array.from(fetched);
            const calculatedMissing = analyzeLedgerRequirements(mappedData, fetched);
            setMissingLedgers(calculatedMissing);
            return tallyLedgers;
        } catch (e) {
            console.error(e);
            return [];
        } finally {
            setIsCheckingLedgers(false);
        }
    };

    // Auto-verify on Step 3 Entry
    useEffect(() => {
        if (step === 3 && selectedCompany) {
            verifyLedgers(selectedCompany);
        }
    }, [step, selectedCompany]);

    // --- BULK PUSH HANDLER (Intercepted) ---
    const handleStartBulkPushInit = async () => {
        if (!selectedCompany) {
            alert('Please select a Target Company first.');
            return;
        }

        setIsStartingPush(true); // "Pushing..." state

        try {
            // 1. Identify Unique GST Rates
            const rates = new Set<string>();
            mappedData.forEach(voucher => {
                voucher.items.forEach(item => {
                    const r = item.taxRate ? item.taxRate.toString() : '0';
                    rates.add(r);
                });
            });

            // 2. Re-Verify Ledgers (Fast check)
            const fetched = await fetchExistingLedgers(selectedCompany);
            const tallyLedgers = Array.from(fetched);
            const calculatedMissing = analyzeLedgerRequirements(mappedData, fetched);
            setMissingLedgers(calculatedMissing);

            if (calculatedMissing.length > 0) {
                setProposedLedgers(calculatedMissing);
                setIsStartingPush(false);
                setShowLedgerCreationModal(true);
                return;
            }

            // 3. Find Missing Mappings
            const missing: number[] = [];
            const voucherType = mappedData[0]?.voucherType || 'Purchase';

            rates.forEach(rateStr => {
                if (ledgerMappings[rateStr]) return;

                const rate = Number(rateStr);
                // Try to auto-match
                const match = findLedgerByTypeAndPercent(tallyLedgers, voucherType as any, rate);
                if (!match) {
                    missing.push(rate);
                } else {
                    ledgerMappings[rateStr] = match;
                }
            });

            if (missing.length > 0) {
                setMissingRates(missing);
                setPushReadyData({ vouchers: mappedData, ledgers: tallyLedgers });
                setIsStartingPush(false);
                setShowMappingModal(true);
            } else {
                // Proceed
                setPushReadyData({ vouchers: mappedData, ledgers: tallyLedgers });
                // Note: startBulkPush will handle flipping the state to isProcessing
                // We keep isStartingPush(true) until startBulkPush calls setIsStartingPush(false)
                startBulkPush(mappedData, tallyLedgers, ledgerMappings);
            }

        } catch (e) {
            console.error('Error in bulk push init:', e);
            setIsStartingPush(false);
        }
    };

    const handleConfirmMapping = (newMappings: Record<string, string>, createdLedgers: string[]) => {
        const combined = { ...ledgerMappings, ...newMappings };
        setLedgerMappings(combined);
        localStorage.setItem('autotally_ledger_mappings', JSON.stringify(combined));

        setShowMappingModal(false);
        if (pushReadyData) {
            // merge skippedLedgers from previous step + createdLedgers from this step
            const allSkipped = [
                ...(pushReadyData.skippedLedgers || []),
                ...createdLedgers
            ];
            startBulkPush(pushReadyData.vouchers, pushReadyData.ledgers, combined, allSkipped);
        }
    };

    const handleConfirmBulkLedgerCreation = (skippedLedgers: string[]) => {
        setShowLedgerCreationModal(false);
        // Resume push
        // We need data... where is logic? it was inside handleStartBulkPushInit 
        // We can just recall handleStartBulkPushInit? No, that would re-trigger checks.
        // We should replicate the "Proceed" part of handleStartBulkPushInit or extract it.
        // Easier: Just call startBulkPush? We need vouchers/ledgers/mappings.
        // We haven't done mappings yet if we stopped at ledger check.
        // So we need to CONTINUE to Step 3 (Mappings).

        // Let's create a continuation function `continueBulkPushAfterLedgers(skipped)`.
        continueAfterLedgerCheck(skippedLedgers);
    };

    const continueAfterLedgerCheck = async (skippedLedgers: string[]) => {
        // Re-get data
        const vouchers = mappedData;
        // We need `tallyLedgers` for mapping match.
        const fetched = await fetchExistingLedgers(selectedCompany);
        const tallyLedgers = Array.from(fetched);

        // 3. Find Missing Mappings
        // ... (Logic from handleStartBulkPushInit)
        const rates = new Set<string>();
        vouchers.forEach(voucher => {
            voucher.items.forEach(item => {
                const r = item.taxRate ? item.taxRate.toString() : '0';
                rates.add(r);
            });
        });

        const missing: number[] = [];
        const voucherType = vouchers[0]?.voucherType || 'Purchase';

        rates.forEach(rateStr => {
            if (ledgerMappings[rateStr]) return;
            // Check against Tally OR Proposed (since we will create them)
            // But mapping is for TAX LEDGERS usually?
            // analyzeLedgerRequirements covers Tax Ledgers too.
            // If we confimred creation, we assume they will exist.
            // But mapping relies on `findLedgerByTypeAndPercent` which searches EXISTING names.
            // If we confirm creation, the names might match standard Tally names?
            // If so, `findLedgerByTypeAndPercent` might succeed if we add proposed to the search list?

            // Simpler: Just run mapping check. If fail -> Map.
            const rate = Number(rateStr);
            const match = findLedgerByTypeAndPercent(tallyLedgers, voucherType as any, rate);
            if (!match) {
                missing.push(rate);
            } else {
                ledgerMappings[rateStr] = match;
            }
        });

        if (missing.length > 0) {
            setMissingRates(missing);
            // We need to store `skippedLedgers` to pass it later!
            // `pushReadyData` only stores vouchers/ledgers.
            // Update `pushReadyData` type or add another state field?
            // Or just capture it in closure of `handleConfirmMapping`? No.
            // Let's add `skippedLedgers` to `pushReadyData`.
            setPushReadyData({ vouchers, ledgers: tallyLedgers, skippedLedgers });
            setShowMappingModal(true);
        } else {
            startBulkPush(vouchers, tallyLedgers, ledgerMappings, skippedLedgers);
        }
    };

    const startBulkPush = async (vouchers: ExcelVoucher[], existingLedgersList: string[], mappings: Record<string, string>, skippedLedgers: string[] = []) => {
        const status = await checkTallyConnection();
        if (!status.online) {
            setShowDisconnectModal(true);
            return;
        }

        setIsProcessing(true);
        setIsStartingPush(false); // Reset this state so it doesn't get stuck
        isCancelledRef.current = false;
        if (onUpdateFile && fileId) onUpdateFile(fileId, { status: 'Processing' });

        console.log("DEBUG: Starting Bulk Push", { total: vouchers.length, skippedLedgers });


        try {
            // 1. Filter Duplicates
            const allRegistry = await getInvoiceRegistry();
            const existingNumbers = new Set(allRegistry.map(r => r.invoiceNumber.toLowerCase()));

            const newVouchers: ExcelVoucher[] = [];
            let skippedCount = 0;



            for (const v of vouchers) {
                if (v.invoiceNo && existingNumbers.has(v.invoiceNo.toLowerCase())) {
                    skippedCount++;
                } else {
                    newVouchers.push(v);
                }
            }

            if (newVouchers.length === 0) {
                onPushLog('Failed', 'Bulk Import Skipped', `All ${mappedData.length} entries are duplicates.`);
                if (onUpdateFile && fileId) onUpdateFile(fileId, { status: 'Success' });

                setImportSummary({
                    total: mappedData.length,
                    skipped: skippedCount,
                    success: 0,
                    failed: 0
                });
                setSummaryModalOpen(true);
                setIsProcessing(false);
                return;
            }

            const total = newVouchers.length;
            const totalBatches = Math.ceil(total / BATCH_SIZE);
            let createdMasters = new Set<string>(skippedLedgers); // Pre-fill to skip creation
            let errorCount = 0;
            let successCount = 0;

            for (let i = 0; i < totalBatches; i++) {
                const end = (i + 1) * BATCH_SIZE;
                const batch = newVouchers.slice(i * BATCH_SIZE, end);

                if (isCancelledRef.current) break;

                if (isCancelledRef.current) break;

                if (onPushLog) onPushLog('Processing', `Processed Batch ${i + 1}/${totalBatches}`);

                // Add small visual delay to let the UI breathe and show animation
                await new Promise(r => setTimeout(r, 50));

                // Pass userName to generateBulkExcelXml for narration
                const xml = generateBulkExcelXml(batch, createdMasters, selectedCompany, mappings, userName);
                console.log(`DEBUG: Batch ${i + 1} XML generated. Size: ${xml.length}`);

                const result = await pushToTally(xml);
                console.log(`DEBUG: Batch ${i + 1} Result:`, result);

                if (!result.success) {
                    errorCount += batch.length;
                } else {
                    successCount += batch.length;
                    // Save to registry only on success
                    batch.forEach(v => {
                        if (v.invoiceNo) saveInvoiceRegistry(v.invoiceNo, 'EXCEL');
                    });
                }

                // Add found masters to created set so subsequent batches see them
                if (result.createdMasters && result.createdMasters.length > 0) {
                    result.createdMasters.forEach(m => createdMasters.add(m));
                }

                setProgress({ processed: Math.min(end, total), total, batch: i + 1, errors: errorCount });
                await new Promise(r => setTimeout(r, 100));
            }

            const summaryMsg = `Skipped (Duplicates): ${skippedCount}\nSuccessfully Pushed: ${successCount}\nFailed: ${errorCount}`;

            if (errorCount > 0) {
                onPushLog('Failed', 'Bulk Import Completed with Errors', summaryMsg);
                if (onUpdateFile && fileId) onUpdateFile(fileId, { status: 'Failed' });
            } else {
                onPushLog('Success', 'Bulk Import Complete', summaryMsg);
                if (onUpdateFile && fileId) onUpdateFile(fileId, { status: 'Success' });
            }

            setImportSummary({
                total: mappedData.length,
                skipped: skippedCount,
                success: successCount,
                failed: errorCount
            });
            setSummaryModalOpen(true);

        } catch (e) {
            onPushLog('Failed', 'Bulk Import Error', 'An error occurred during push.');
        } finally { setIsProcessing(false); }
    };



    // Debug: Log detected columns
    // console.log('All columns detected:', allColumns);
    // console.log('Visible columns for dropdown:', visibleColumns);
    const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

    if (step === 1) {
        return (
            <div
                className={`flex flex-col h-full min-h-0 gap-4 animate-fade-in relative transition-all duration-200 overflow-y-auto p-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] ${isDragOver ? 'bg-emerald-50/30 dark:bg-emerald-900/10 ring-2 ring-emerald-500 ring-inset rounded-xl' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <div
                    className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700 shadow-sm flex justify-between items-center shrink-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shadow-inner">
                            <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">Excel Bulk Import</h2>
                            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Reconcile large volume spreadsheet data efficiently</p>
                        </div>
                    </div>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            downloadTemplate();
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg text-sm font-semibold transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Download Template
                    </button>
                </div>

                <div
                    className={`
                        flex-1 flex flex-col items-center justify-center rounded-[24px] border-4 border-dashed transition-all duration-300 p-6 relative overflow-hidden shadow-sm min-h-[300px] group cursor-pointer
                        ${isDragOver
                            ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10 scale-[0.99] ring-4 ring-emerald-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-emerald-50/30 dark:bg-emerald-900/10 hover:bg-white dark:hover:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-600'}
                    `}
                >
                    <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center mb-4 shadow-inner transition-transform group-hover:scale-110 duration-500">
                        <UploadCloud className="w-10 h-10" />
                    </div>
                    <div className="text-center space-y-3 max-w-lg">
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Drop Excel Spreadsheet</h3>
                        <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed text-sm">Select a .xlsx or .csv file. We'll help you map the columns to Tally vouchers next.</p>
                        <button
                            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-black text-base shadow-xl shadow-emerald-600/20 transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-2 mx-auto"
                        >
                            Select Spreadsheet
                            <ArrowRight className="w-4 h-4" />
                        </button>
                        <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileUpload} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0 ">
                    {[
                        { icon: Database, label: 'Column Mapping', desc: 'Map any spreadsheet structure to Tally fields.', color: 'text-emerald-500' },
                        { icon: Merge, label: 'Smart Merging', desc: 'Auto-combine line items into single vouchers.', color: 'text-emerald-500' },
                        { icon: CheckCircle2, label: 'Validation', desc: 'Pre-check ledgers before importing to Tally.', color: 'text-emerald-500' }
                    ].map((feat, i) => (
                        <div key={i} className="flex items-start gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                            <div className={`w-8 h-8 bg-slate-50 dark:bg-slate-900 rounded-lg flex items-center justify-center shadow-inner border border-slate-100 dark:border-slate-700 ${feat.color}`}>
                                <feat.icon className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black uppercase text-slate-800 dark:text-white tracking-wider">{feat.label}</h4>
                                <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium mt-0.5 leading-relaxed">{feat.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (step === 2) {
        return (
            <div className="flex-1 p-6 flex flex-col gap-6 animate-fade-in overflow-hidden relative ">
                {showNotification && (
                    <div className="fixed top-10 right-10 z-[100] bg-red-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in backdrop-blur-sm bg-opacity-95 border-2 border-red-400">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-bold">{notificationMessage}</span>
                    </div>
                )}
                {showDisconnectModal && <TallyDisconnectedModal onClose={() => setShowDisconnectModal(false)} />}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    if (onDelete && fileId) onDelete(fileId);
                                    setStep(1);
                                    setFile(null);
                                    setFileId(null);
                                    setMappedData([]);
                                }}
                                className="p-1.5 -ml-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg transition-colors"
                                title="Back to Upload"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>


                            <h3 className="font-bold text-lg flex items-center gap-2 text-slate-900 dark:text-white ">
                                <Database className="w-5 h-5 text-indigo-500" />
                                Map Columns
                            </h3>
                        </div>
                        <div className="flex items-center gap-3">

                            <span className="text-xs px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg ">
                                Detected {allColumns.length} columns (Filtered)
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin ">
                        {/* Special Handling for VoucherType logic: If it's standard dropdown */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">voucher type *</label>
                            <div className="relative group">
                                <select
                                    value={mapping.voucherType}
                                    onChange={(e) => setMapping({ ...mapping, voucherType: e.target.value })}
                                    className="w-full px-5 py-3.5 border-2 border-slate-100 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-2xl bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold appearance-none cursor-pointer outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
                                >
                                    <option value="">-- Select Type --</option>
                                    <option value="Purchase">Purchase</option>
                                    <option value="Sales">Sales</option>
                                </select>
                                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                            </div>
                        </div>

                        {/* Loop for other fields */}
                        {Object.keys(mapping).filter(key => key !== 'voucherType' && key !== 'quantity').map(key => (
                            <div key={key}>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">{key}</label>
                                <div className="relative group">
                                    <select
                                        value={mapping[key as keyof typeof mapping]}
                                        onChange={(e) => setMapping({ ...mapping, [key as keyof typeof mapping]: e.target.value })}
                                        className="w-full px-5 py-3.5 border-2 border-slate-100 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-2xl bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold appearance-none cursor-pointer outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
                                    >
                                        <option value="">Select Column</option>
                                        {visibleColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>
                        ))}

                        {/* Quantity Last */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">quantity</label>
                            <div className="relative group">
                                <select
                                    value={mapping.quantity}
                                    onChange={(e) => setMapping({ ...mapping, quantity: e.target.value })}
                                    className="w-full px-5 py-3.5 border-2 border-slate-100 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-2xl bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold appearance-none cursor-pointer outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
                                >
                                    <option value="">Select Column</option>
                                    <option value="N/A">N/A (No Quantity)</option>
                                    {visibleColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end gap-3">
                        <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition-all">Cancel</button>
                        <button
                            onClick={processMapping}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-xl shadow-indigo-600/20 active:scale-95 transition-all outline-none focus:ring-4 focus:ring-indigo-500/20"
                        >
                            Next <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 bg-white dark:bg-slate-800 rounded-[32px] border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm flex flex-col">
                    <div className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        <span className="font-black text-xs text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                            Preview (First 5 Rows)
                        </span>
                    </div>
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-white dark:bg-slate-800 text-slate-400 border-b border-slate-100 dark:border-slate-700/50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    {visibleColumns.map((c, i) => <th key={i} className="px-6 py-4 font-black uppercase tracking-wider text-[10px]">{c}</th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {rawData.slice(0, 5).map((row, i) => (
                                    <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                        {visibleColumns.map((colName, j) => {
                                            const idx = allColumns.indexOf(colName);
                                            return (
                                                <td key={j} className="px-6 py-4 text-slate-600 dark:text-slate-300 font-medium group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                                    {row[idx]}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col gap-6 animate-fade-in h-full overflow-hidden">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex justify-between items-center transition-colors shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setStep(2)}
                        className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full transition-colors disabled:opacity-50"
                        title="Back to Mapping"
                        disabled={isProcessing}
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shadow-inner">
                        <Merge className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase">Review & Import</h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">{mappedData.length} Merged Vouchers Ready</p>
                    </div>
                </div>

                {!isProcessing && progress.processed === 0 && (
                    <button
                        onClick={handleStartBulkPushInit}
                        disabled={connectionError || isCheckingLedgers || isStartingPush}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl font-black shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 active:scale-95"
                    >
                        {(isCheckingLedgers || isStartingPush) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                        {isStartingPush ? 'Pushing...' : (isCheckingLedgers ? 'Verifying...' : 'Push to Tally')}
                    </button>
                )}
            </div>

            <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 scrollbar-thin scroll-smooth">
                <div className="w-full bg-white dark:bg-slate-800 rounded-[40px] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center p-16 text-center relative overflow-hidden shrink-0 transition-colors">
                    {isProcessing && (
                        <div className="animate-fade-in">
                            <div className="mb-10 relative w-32 h-32 mx-auto">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-100 dark:text-slate-900" />
                                    <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-indigo-600 transition-all duration-300" strokeDasharray="351.8" strokeDashoffset={351.8 - (351.8 * pct) / 100} strokeLinecap="round" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-3xl font-black text-indigo-600 dark:text-indigo-500">{pct}%</span>
                                </div>
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">Syncing with Tally...</h2>
                            <p className="text-slate-600 dark:text-slate-400 font-mono font-bold">Progress: {progress.processed} / {progress.total} Entries</p>
                            <button
                                onClick={handleCancelProcessing}
                                className="mt-8 px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-red-600/20 active:scale-95"
                            >
                                Cancel Sync
                            </button>
                        </div>
                    )}
                    {!isProcessing && progress.processed > 0 && (
                        <div className="animate-fade-in">
                            {progress.errors === 0 ? (
                                // Full Success
                                <>
                                    <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner">
                                        <CheckCircle2 className="w-12 h-12" />
                                    </div>
                                    <h2 className="text-4xl font-black text-slate-900 dark:text-white mb-4 tracking-tight uppercase">Import Successful</h2>
                                    <p className="text-slate-600 dark:text-slate-400 font-medium mb-10 leading-relaxed">
                                        Successfully synchronized {progress.total} vouchers with Tally Prime.
                                    </p>
                                </>
                            ) : progress.errors === progress.total ? (
                                // Full Failure
                                <>
                                    <div className="w-24 h-24 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner">
                                        <AlertTriangle className="w-12 h-12" />
                                    </div>
                                    <h2 className="text-4xl font-black text-slate-900 dark:text-white mb-4 tracking-tight uppercase">Import Failed</h2>
                                    <p className="text-slate-600 dark:text-slate-400 font-medium mb-10 leading-relaxed">
                                        Failed to push all {progress.total} vouchers to Tally Prime. Check logs for details.
                                    </p>
                                </>
                            ) : (
                                // Partial Success
                                <>
                                    <div className="w-24 h-24 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner">
                                        <AlertTriangle className="w-12 h-12" />
                                    </div>
                                    <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4 tracking-tight uppercase">Import Completed with Errors</h2>
                                    <p className="text-slate-600 dark:text-slate-400 font-medium mb-10 leading-relaxed">
                                        {progress.total - progress.errors} Successful, {progress.errors} Failed. Check logs for details.
                                    </p>
                                </>
                            )}

                            <button onClick={() => setStep(1)} className="bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white px-12 py-4 rounded-[20px] font-black shadow-xl active:scale-95 transition-all">
                                New Bulk Task
                            </button>
                        </div>
                    )}
                    {!isProcessing && progress.processed === 0 && (
                        <div className="animate-fade-in w-fit min-w-[28rem] max-w-5xl">
                            <div className="text-left bg-slate-50 dark:bg-slate-950 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-inner">
                                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-indigo-500" />
                                    Destination Tally Company
                                </label>
                                <div className="flex gap-3">
                                    <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} className="flex-1 px-5 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-all outline-none">
                                        {companies.length === 0 ? (
                                            <option value="">No companies found - Is Tally running?</option>
                                        ) : (
                                            <>
                                                <option value="">-- Select Company --</option>
                                                {companies.map(c => (<option key={c} value={c}>{c}</option>))}
                                            </>
                                        )}
                                    </select>
                                    <button onClick={loadCompanies} disabled={loadingCompanies} className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 transition-all active:scale-95 shadow-sm" title="Refresh companies from Tally">
                                        <RefreshCw className={`w-5 h-5 ${loadingCompanies ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                                {/* Bulk Ledger Creation Modal */}
                                <BulkLedgerCreationModal
                                    isOpen={showLedgerCreationModal}
                                    onClose={() => { setShowLedgerCreationModal(false); setIsStartingPush(false); }}
                                    proposedLedgers={proposedLedgers}
                                    onConfirm={handleConfirmBulkLedgerCreation}
                                />

                                {/* Existing Validations */}
                                {companies.length === 0 && (
                                    <p className="text-xs text-red-500 mt-2">⚠️ Cannot connect to Tally. Make sure Tally Prime is running on localhost:9000</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 w-full flex flex-col bg-white dark:bg-slate-800 rounded-[32px] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden min-h-[350px] transition-colors">
                    <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
                        <h3 className="font-black text-xs text-slate-800 dark:text-white flex items-center gap-3 uppercase tracking-widest">
                            <ListPlus className="w-5 h-5 text-orange-500" />
                            Ledger Verification Gap
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 space-y-3 min-h-0">
                        {connectionError ? (
                            <div className="h-full flex flex-col items-center justify-center text-red-500 text-center gap-4 py-12">
                                <AlertTriangle className="w-12 h-12 opacity-30" />
                                <p className="font-bold">Sync required for gap analysis.</p>
                            </div>
                        ) : (
                            <>
                                {missingLedgers.length === 0 && !isCheckingLedgers && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12 gap-4">
                                        <CheckCircle2 className="w-16 h-16 opacity-10" />
                                        <p className="font-bold">No missing masters found. Ready to push.</p>
                                    </div>
                                )}
                                {missingLedgers.map((ledger, idx) => (
                                    <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl transition-all">
                                        <div className="w-2.5 h-2.5 bg-orange-500 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.4)]"></div>
                                        <div className="flex-1">
                                            <p className="text-slate-800 dark:text-white font-bold text-sm">{ledger}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Type: Accounting Master</p>
                                        </div>
                                        <span className="text-[10px] font-black text-slate-300 dark:text-slate-600">AUTO-CREATE ENABLED</span>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {showMappingModal && (
                <LedgerMappingModal
                    isOpen={showMappingModal}
                    title="Map Tax Ledgers"
                    voucherType={mappedData[0]?.voucherType === 'Sales' ? 'Sales' : 'Purchase'}
                    itemsToMap={missingRates.map(r => ({ key: r, label: `${r}% GST Items`, type: 'rate' as const }))}
                    mappings={Object.fromEntries(Object.entries(ledgerMappings).map(([k, v]) => [k, v]))}
                    tallyLedgers={pushReadyData?.ledgers || []}
                    onConfirm={(newMap: Record<string, string>, created: string[]) => {
                        handleConfirmMapping(newMap, created);
                    }}
                    onCancel={() => setShowMappingModal(false)}
                />
            )}

            {showDisconnectModal && (
                <TallyDisconnectedModal
                    onClose={() => setShowDisconnectModal(false)}
                />
            )}

            <ImportSummaryModal
                isOpen={summaryModalOpen}
                onClose={() => setSummaryModalOpen(false)}
                summary={importSummary}
            />
        </div>
    );
};

export default ExcelImportManager;
