
export interface LineItem {
  id: string;
  description: string;
  hsn: string;
  quantity: number;
  rate: number;
  amount: number; // Taxable Value
  gstRate: number; // e.g., 18
  unit?: string; // e.g., Nos, Kg, Box
  isIGST?: boolean; // Optional: Force IGST even when GSTIN is not available
  ledgerName?: string; // Mapped Ledger Name for Tally
}

export interface InvoiceData {
  documentType?: 'INVOICE' | 'BANK_STATEMENT'; // Classification flag
  supplierName: string;
  supplierAddress?: string; // Added for Tally XML
  supplierGstin: string;
  buyerName: string;
  buyerAddress?: string; // Added for Tally XML
  buyerGstin: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  voucherType: 'Sales' | 'Purchase';
  targetCompany?: string; // Target Tally Company for import
  lineItems: LineItem[];
  roundOff?: number; // Added for rounding
  grandTotal?: number; // Added for rounded total
}

export interface BankTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  withdrawal: number; // Debit
  deposit: number; // Credit
  balance?: number;
  contraLedger: string; // The Tally Ledger to map to (e.g., "Electricity Exp" or "Customer X")
  voucherType: 'Payment' | 'Receipt' | 'Contra';
}

export interface ExcelVoucherItem {
  amount: number;
  taxRate: number;
  quantity?: number;
  ledgerName?: string;
  cgst?: number;
  sgst?: number;
  igst?: number;
  cess?: number; // Added
}

export interface ExcelVoucher {
  id: string;
  date: string;
  invoiceNo: string;
  partyName: string;
  gstin: string;
  voucherType: 'Sales' | 'Purchase';
  items: ExcelVoucherItem[];
  totalAmount: number;
  narration?: string;
  address?: string; // Added for Party Address
  period?: string; // Added
  reverseCharge?: string; // Added
  placeOfSupply?: string; // Added for explicit state mapping
  roundOff?: number; // Added for rounding differences
}

export interface BankStatementData {
  id?: string; // Added for UI state management
  documentType?: 'INVOICE' | 'BANK_STATEMENT'; // Classification flag
  bankName: string; // My Bank Ledger Name in Tally
  accountNumber?: string; // Last 4 digits of account number
  gstin?: string; // Bank GSTIN if available
  ifsc?: string; // IFSC code if available
  transactions: BankTransaction[];
}

export interface ProcessedFile {
  id: string;
  file: File;
  status: 'Pending' | 'Processing' | 'Ready' | 'Success' | 'Failed' | 'Mismatch';
  fileName: string;
  previewUrl?: string; // For decrypted PDF or other previews
  sourceType: 'OCR_INVOICE' | 'BANK_STATEMENT' | 'EXCEL_IMPORT'; // NEW: Track source
  data?: InvoiceData;
  bankData?: BankStatementData; // NEW: Store Bank Data
  excelData?: ExcelVoucher[]; // NEW: Store full Excel voucher data
  excelMapping?: any; // NEW: Store Excel column mapping configuration
  error?: string;
  correctEntries: number;
  incorrectEntries: number;
  timeTaken: string;
  uploadTimestamp: number;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  method: 'POST' | 'GET';
  endpoint: string;
  status: 'Success' | 'Failed' | 'Pending' | 'Processing';
  message: string;
  response?: string;
}

export interface TallyResponse {
  success: boolean;
  message: string;
  createdMasters?: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  UPLOAD = 'UPLOAD',
  EDITOR = 'EDITOR',
  LOGS = 'LOGS',
  CHAT = 'CHAT',
  IMAGE_ANALYSIS = 'IMAGE_ANALYSIS',
  BANK_STATEMENT = 'BANK_STATEMENT',
  EXCEL_IMPORT = 'EXCEL_IMPORT',
  BULK_PROCESSING = 'BULK_PROCESSING'
}
