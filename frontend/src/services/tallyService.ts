
import { InvoiceData, TallyResponse, BankStatementData, ExcelVoucher } from '../types';
import { TALLY_API_URL } from '../constants';
import { v4 as uuidv4 } from 'uuid';

// --- HELPER FUNCTIONS ---

const esc = (str: string) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, ' ');
};

export const cleanName = (str: string): string => {
  if (!str) return 'Unknown Item';
  return str.replace(/[^a-zA-Z0-9\s\-\.\(\)%]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 50);
};

/**
 * Monetary Rounding Rules (Strictly Followed):
 * - If decimal < 0.50 → Round DOWN to nearest whole number (floor)
 * - If decimal >= 0.50 → Round UP to next whole number (ceil + 1)
 * 
 * Examples: 100.40 → 100, 100.50 → 101, 999.49 → 999, 999.99 → 1000
 */
export const tallyRound = (value: number): number => {
  const integerPart = Math.floor(value);
  const decimalPart = value - integerPart;

  if (decimalPart >= 0.50) {
    return integerPart + 1; // Round UP
  } else {
    return integerPart; // Round DOWN
  }
};

// Standard 2-decimal rounding for intermediate calculations (taxes, line items)
const round = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const formatRate = (num: number): string => {
  return Number.isInteger(num) ? num.toString() : num.toFixed(1).replace(/\.0$/, '');
};

// STRICT TALLY FORMAT: YYYYMMDD
const formatDateForXml = (dateStr: string) => {
  if (!dateStr) {
    const today = new Date();
    return today.toISOString().slice(0, 10).replace(/-/g, '');
  }
  const d = dateStr.replace(/[\.\/\s]/g, '-');

  // Input: YYYY-MM-DD -> Output: YYYYMMDD
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replace(/-/g, '');

  // Input: DD-MM-YYYY -> Output: YYYYMMDD
  const match = d.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) return `${match[3]}${match[2].padStart(2, '0')}${match[1].padStart(2, '0')}`;

  const today = new Date();
  return today.toISOString().slice(0, 10).replace(/-/g, '');
};

const STATE_MAP: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "25": "Daman & Diu", "26": "Dadra & Nagar Haveli", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh", "38": "Ladakh"
};

const getStateName = (gstin: string): string => {
  if (!gstin || gstin.length < 2) return '';
  const code = gstin.substring(0, 2);
  return STATE_MAP[code] || '';
};

// Decode HTML entities from Tally response
const decodeHtml = (html: string) => {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
};

// --- ANALYSIS HELPER ---
export const analyzeLedgerRequirements = (vouchers: ExcelVoucher[], existingLedgers: Set<string>): string[] => {
  const required = new Set<string>();
  const missing: string[] = [];

  vouchers.forEach(voucher => {
    // 1. Party Ledger
    const partyName = cleanName(voucher.partyName);
    if (partyName) required.add(partyName);

    const isSales = voucher.voucherType === 'Sales';

    // Check State for Tax Logic
    const gstin = voucher.gstin ? voucher.gstin.trim().toUpperCase() : '';
    const sourceStateCode = '27'; // Default Home State
    const destStateCode = gstin.substring(0, 2);
    // Determine Inter-state
    const isInterState = (gstin.length >= 2 && destStateCode !== sourceStateCode);

    voucher.items.forEach(item => {
      // 2. Purchase/Sales Ledger
      const ledgerName = item.ledgerName || `${isSales ? 'Sale' : 'Purchase'} ${item.taxRate}%`;
      required.add(ledgerName);

      // 3. Tax Ledgers
      if (item.taxRate > 0) {
        if (isInterState) {
          const igstName = `${isSales ? 'Output' : 'Input'} IGST ${item.taxRate}%`;
          required.add(igstName);
        } else {
          const half = item.taxRate / 2;
          const cgstName = `${isSales ? 'Output' : 'Input'} CGST ${formatRate(half)}%`;
          const sgstName = `${isSales ? 'Output' : 'Input'} SGST ${formatRate(half)}%`;
          required.add(cgstName);
          required.add(sgstName);
        }
      }
    });
  });

  required.forEach(req => {
    if (!existingLedgers.has(req)) {
      missing.push(req);
    }
  });

  return missing.sort();
};

export const getInvoiceLedgerRequirements = (invoice: InvoiceData, existingLedgers: Set<string>): string[] => {
  const missing: string[] = [];

  // 1. Party Ledger
  const voucherType = invoice.voucherType || 'Purchase';
  const isSales = voucherType === 'Sales';
  const rawPartyName = isSales ? invoice.buyerName : invoice.supplierName;
  const partyName = cleanName(rawPartyName || "Cash Party");

  if (!existingLedgers.has(partyName)) {
    missing.push(partyName);
  }

  // 2. Tax Ledgers
  const uniqueRates = new Set<number>();
  invoice.lineItems.forEach(item => uniqueRates.add(Number(item.gstRate) || 0));

  uniqueRates.forEach(rate => {
    // Sales/Purchase Ledger
    // Note: generateTallyXml uses logic: "Sale 18%" or "Purchase 18%"
    // We must match that exact logic or pass mappings.
    // Assuming default logic for simplicity of "Missing Check"
    // If mappings exist, `generateTallyXml` uses them.
    // BUT here we don't have mappings passed in easily?
    // `App.tsx` doesn't pass mappings to `generateTallyXml`?
    // Let's check `generateTallyXml`.
    // It consumes `invoice.lineItems[].ledgerName` which is mapped in `InvoiceEditor`.
    // So we should verify THOSE names.
  });

  // Actually, `InvoiceEditor` maps ledgers and puts them in `lineItems`.
  // So we just need to check `item.ledgerName`.

  invoice.lineItems.forEach(item => {
    if (item.ledgerName && !existingLedgers.has(item.ledgerName)) {
      if (!missing.includes(item.ledgerName)) missing.push(item.ledgerName);
    }
  });

  // 3. Tax Duties (IGST, CGST, SGST)
  // `generateTallyXml` logic is complex for names (lines 735+).
  // It blindly generates "Output IGST 18%" etc.
  // We need to replicate that naming to check existence.

  uniqueRates.forEach(rate => {
    if (rate > 0) {
      const igstName = `${isSales ? 'Output' : 'Input'} IGST ${formatRate(rate)}%`;
      if (!existingLedgers.has(igstName) && !missing.includes(igstName)) missing.push(igstName);

      const half = rate / 2;
      const cgstName = `${isSales ? 'Output' : 'Input'} CGST ${formatRate(half)}%`;
      const sgstName = `${isSales ? 'Output' : 'Input'} SGST ${formatRate(half)}%`;

      if (!existingLedgers.has(cgstName) && !missing.includes(cgstName)) missing.push(cgstName);
      if (!existingLedgers.has(sgstName) && !missing.includes(sgstName)) missing.push(sgstName);
    }
  });

  return missing.sort();
};

// --- STRICT LEDGER MATCHING HELPER ---
export const findLedgerByTypeAndPercent = (
  tallyLedgers: string[],
  voucherType: 'Purchase' | 'Sales',
  gstPercent: number
): string | null => {
  const typeKey = voucherType.toLowerCase(); // "purchase" or "sales"
  const rateKey = gstPercent.toString(); // e.g. "18"

  for (const ledger of tallyLedgers) {
    const name = ledger.toLowerCase();

    // 1. Must contain the type (purchase/sales)
    if (!name.includes(typeKey)) continue;

    // 2. Must contain the rate (e.g. "18")
    // We check for boundary conditions to avoid matching "18" in "118" if possible, 
    // but simple containment is usually enough for standard names like "Purchase 18%" or "Purchase @18%"
    if (name.includes(rateKey)) {
      return ledger; // Found a candidate
    }
  }
  return null;
};

// --- CONNECTION CHECK ---
export const checkTallyConnection = async (): Promise<{ online: boolean; info: string; mode: 'full' | 'blind' | 'none'; activeCompany?: string }> => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${TALLY_API_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(id);

    if (response.ok) {
      return { online: true, info: "Proxy Connected", mode: 'full' };
    }

    return { online: false, info: "Health check failed", mode: 'none' };

  } catch (e) {
    let msg = "Unreachable";
    if (e instanceof Error) msg = e.message;
    return { online: false, info: `Offline: ${msg}`, mode: 'none' };
  }
};

// --- BANK XML GENERATION ---
export const generateBankStatementXml = (
  data: BankStatementData,
  bankLedgerName: string,
  targetCompany: string,
  ledgerMappings: Record<string, string> = {},
  userName: string = ''
): string => {
  const svCompany = targetCompany ? esc(targetCompany) : '##SVCurrentCompany';
  const cleanBankName = esc(bankLedgerName);

  // We only generate a Master for the Bank Ledger itself to ensure it exists/is valid.
  // We use "Alter" to avoid "Duplicate" errors if it exists. 
  // We assume Parent is "Bank Accounts".
  let mastersXml = `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <LEDGER NAME="${cleanBankName}" ACTION="Alter">
        <NAME.LIST><NAME>${cleanBankName}</NAME></NAME.LIST>
        <PARENT>Bank Accounts</PARENT>
        <ISBILLWISEON>No</ISBILLWISEON>
        <ISGSTAPPLICABLE>No</ISGSTAPPLICABLE>
      </LEDGER>
    </TALLYMESSAGE>`;

  // Note: We do NOT generate Ledger Masters for the Contra/Party ledgers here.
  // Since we are using "Strict Mapping", we assume the mapped target ledgers (e.g. "Office Expenses")
  // already exist in Tally. Generating "Create" or "Alter" for them without knowing their 
  // correct Parent Group (Expense, Liability, Asset?) is dangerous/incorrect.

  let vouchersXml = '';

  data.transactions.forEach((txn) => {
    const dateXml = formatDateForXml(txn.date);
    const amount = txn.voucherType === 'Payment' ? txn.withdrawal : txn.deposit;
    const originalContra = txn.contraLedger;
    const mappedContra = ledgerMappings[originalContra] || originalContra;

    // Fallback: If still unknown/empty, use Suspense but valid XML requires something.
    const finalContra = mappedContra || 'Suspense A/c';

    const narration = esc(txn.description);
    const isPayment = txn.voucherType === 'Payment';

    const bankDeemedPos = isPayment ? 'No' : 'Yes';
    const bankAmountSign = isPayment ? 1 : -1;
    const bankAmountVal = (amount * bankAmountSign).toFixed(2);

    const partyDeemedPos = isPayment ? 'Yes' : 'No';
    const partyAmountSign = isPayment ? -1 : 1;
    const partyAmountVal = (amount * partyAmountSign).toFixed(2);

    vouchersXml += `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="${txn.voucherType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${dateXml}</DATE>
        <NARRATION>${narration} (Generated by AutoTallyAI${userName ? ' - ' + userName : ''} - ${new Date().toLocaleString()})</NARRATION>
        <VOUCHERTYPENAME>${txn.voucherType}</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${uuidv4().substring(0, 8)}</VOUCHERNUMBER>
        <FBTPAYMENTTYPE>Default</FBTPAYMENTTYPE>
        <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
        
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${cleanBankName}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${bankDeemedPos}</ISDEEMEDPOSITIVE>
          <AMOUNT>${bankAmountVal}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>

        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(finalContra)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${partyDeemedPos}</ISDEEMEDPOSITIVE>
          <AMOUNT>${partyAmountVal}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>

      </VOUCHER>
    </TALLYMESSAGE>`;
  });

  return `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${svCompany}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${mastersXml}</REQUESTDATA>
    </IMPORTDATA>

    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${svCompany}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${vouchersXml}</REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
};

// --- BULK EXCEL XML GENERATION ---
export const generateBulkExcelXml = (vouchers: ExcelVoucher[], createdMasters: Set<string>, targetCompany: string, ledgerMappings: Record<string, string> = {}, userName: string = ''): string => {
  let mastersXml = '';
  let vouchersXml = '';
  const svCompany = targetCompany ? esc(targetCompany) : '##SVCurrentCompany';

  // Generate base narration string (Unified format with Invoice Upload)
  const now = new Date();
  const narrationDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
  const narrationTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const userPart = userName ? ` by ${userName}` : '';
  const baseNarration = `Generated by AutoTally AI${userPart} On ${narrationDate} ${narrationTime}`;

  // 1. Process Masters
  vouchers.forEach(voucher => {
    const partyName = cleanName(voucher.partyName);
    if (!createdMasters.has(partyName)) {
      // Use correct group based on voucher type: Sales = Sundry Debtors, Purchase = Sundry Creditors
      const group = voucher.voucherType === 'Sales' ? 'Sundry Debtors' : 'Sundry Creditors';
      // Derive State: explicit POS > GSTIN-based > Default
      const gstinState = getStateName(voucher.gstin);
      const explicitState = voucher.placeOfSupply && voucher.placeOfSupply.length > 2 ? voucher.placeOfSupply : '';
      const state = explicitState || gstinState || '';

      mastersXml += `
            <TALLYMESSAGE xmlns:UDF="TallyUDF">
                <LEDGER NAME="${esc(partyName)}" ACTION="Alter">
                    <NAME.LIST><NAME>${esc(partyName)}</NAME></NAME.LIST>
                    <PARENT>${group}</PARENT>
                    <ISBILLWISEON>Yes</ISBILLWISEON>
                    <ISGSTAPPLICABLE>Yes</ISGSTAPPLICABLE>
                    <ADDRESS.LIST>
                        <ADDRESS>${esc(voucher.address || '')}</ADDRESS>
                    </ADDRESS.LIST>
                    <COUNTRYOFRESIDENCE>India</COUNTRYOFRESIDENCE>
                    <COUNTRYNAME>India</COUNTRYNAME>
                    ${state ? `<LEDGERSTATENAME>${esc(state)}</LEDGERSTATENAME>` : ''}
                    ${state ? `<STATENAME>${esc(state)}</STATENAME>` : ''}
                    ${voucher.gstin ? `<PARTYGSTIN>${esc(voucher.gstin)}</PARTYGSTIN>` : ''}
                    ${voucher.gstin ? `<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : '<GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE>'}
                </LEDGER>
            </TALLYMESSAGE>`;
      createdMasters.add(partyName);
    }

    const gstin = voucher.gstin ? voucher.gstin.trim().toUpperCase() : '';
    const homeState = '27';
    const destState = gstin.substring(0, 2);
    const isInterState = (gstin.length >= 2 && destState !== homeState);

    voucher.items.forEach(item => {
      // Use mapped ledger if available
      const rateStr = item.taxRate ? item.taxRate.toString() : '0';
      const mappedLedger = ledgerMappings[rateStr];
      const ledgerName = item.ledgerName || mappedLedger || `${voucher.voucherType === 'Sales' ? 'Sale' : 'Purchase'} ${item.taxRate}%`;

      if (!createdMasters.has(ledgerName)) {
        mastersXml += `
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <LEDGER NAME="${esc(ledgerName)}" ACTION="Alter">
                        <NAME.LIST><NAME>${esc(ledgerName)}</NAME></NAME.LIST>
                        <PARENT>${voucher.voucherType === 'Sales' ? 'Sales Accounts' : 'Purchase Accounts'}</PARENT>
                        <ISGSTAPPLICABLE>Yes</ISGSTAPPLICABLE>
                        <GSTRATE>${item.taxRate}</GSTRATE>
                    </LEDGER>
                </TALLYMESSAGE>`;
        createdMasters.add(ledgerName);
      }

      if (item.taxRate > 0) {
        if (isInterState) {
          const taxLedgerName = `${voucher.voucherType === 'Sales' ? 'Output' : 'Input'} IGST ${item.taxRate}%`;
          if (!createdMasters.has(taxLedgerName)) {
            mastersXml += `
                        <TALLYMESSAGE xmlns:UDF="TallyUDF">
                        <LEDGER NAME="${esc(taxLedgerName)}" ACTION="Alter">
                        <NAME.LIST><NAME>${esc(taxLedgerName)}</NAME></NAME.LIST>
                        <PARENT>Duties &amp; Taxes</PARENT>
                        <TAXTYPE>GST</TAXTYPE>
                        <GSTDUTYHEAD>Integrated Tax</GSTDUTYHEAD>
                        <GSTRATE>${item.taxRate}</GSTRATE>
                        </LEDGER>
                        </TALLYMESSAGE>`;
            createdMasters.add(taxLedgerName);
          }
        } else {
          const half = item.taxRate / 2;
          const cgstName = `${voucher.voucherType === 'Sales' ? 'Output' : 'Input'} CGST ${formatRate(half)}%`;
          const sgstName = `${voucher.voucherType === 'Sales' ? 'Output' : 'Input'} SGST ${formatRate(half)}%`;

          if (!createdMasters.has(cgstName)) {
            mastersXml += `
                        <TALLYMESSAGE xmlns:UDF="TallyUDF">
                        <LEDGER NAME="${esc(cgstName)}" ACTION="Alter">
                        <NAME.LIST><NAME>${esc(cgstName)}</NAME></NAME.LIST>
                        <PARENT>Duties &amp; Taxes</PARENT>
                        <TAXTYPE>GST</TAXTYPE>
                        <GSTDUTYHEAD>Central Tax</GSTDUTYHEAD>
                        <GSTRATE>${half}</GSTRATE>
                        </LEDGER>
                        </TALLYMESSAGE>`;
            createdMasters.add(cgstName);
          }
          if (!createdMasters.has(sgstName)) {
            mastersXml += `
                        <TALLYMESSAGE xmlns:UDF="TallyUDF">
                        <LEDGER NAME="${esc(sgstName)}" ACTION="Alter">
                        <NAME.LIST><NAME>${esc(sgstName)}</NAME></NAME.LIST>
                        <PARENT>Duties &amp; Taxes</PARENT>
                        <TAXTYPE>GST</TAXTYPE>
                        <GSTDUTYHEAD>State Tax</GSTDUTYHEAD>
                        <GSTRATE>${half}</GSTRATE>
                        </LEDGER>
                        </TALLYMESSAGE>`;
            createdMasters.add(sgstName);
          }
        }
      }



      // CESS LEDGER CREATION
      if (item.cess && item.cess > 0) {
        const cessLedgerName = voucher.voucherType === 'Sales' ? 'Output Cess' : 'Input Cess';
        if (!createdMasters.has(cessLedgerName)) {
          mastersXml += `
                  <TALLYMESSAGE xmlns:UDF="TallyUDF">
                      <LEDGER NAME="${esc(cessLedgerName)}" ACTION="Alter">
                          <NAME.LIST><NAME>${esc(cessLedgerName)}</NAME></NAME.LIST>
                          <PARENT>Duties &amp; Taxes</PARENT>
                          <TAXTYPE>GST</TAXTYPE>
                          <GSTDUTYHEAD>Cess</GSTDUTYHEAD>
                          <GSTRATE>0</GSTRATE>
                      </LEDGER>
                  </TALLYMESSAGE>`;
          createdMasters.add(cessLedgerName);
        }
      }

    });

    if (!createdMasters.has('Round Off')) {
      mastersXml += `
            <TALLYMESSAGE xmlns:UDF="TallyUDF">
                <LEDGER NAME="Round Off" ACTION="Alter">
                    <NAME.LIST><NAME>Round Off</NAME></NAME.LIST>
                    <PARENT>Indirect Expenses</PARENT>
                    <ISBILLWISEON>No</ISBILLWISEON>
                    <ISGSTAPPLICABLE>No</ISGSTAPPLICABLE>
                </LEDGER>
            </TALLYMESSAGE>`;
      createdMasters.add('Round Off');
    }
  });

  // 2. Process Vouchers
  vouchers.forEach(voucher => {
    const dateXml = formatDateForXml(voucher.date);
    const partyName = cleanName(voucher.partyName);
    const isSales = voucher.voucherType === 'Sales';

    // Logic for State/POS - Same as Masters
    const gstinState = getStateName(voucher.gstin);
    const explicitState = voucher.placeOfSupply && voucher.placeOfSupply.length > 2 ? voucher.placeOfSupply : '';
    const state = explicitState || gstinState || '';

    const gstin = voucher.gstin ? voucher.gstin.trim().toUpperCase() : '';
    const homeState = '27';
    const destState = gstin.substring(0, 2);
    const isInterState = (gstin.length >= 2 && destState !== homeState);

    const partyDeemedPos = isSales ? 'Yes' : 'No';
    const taxDeemedPos = isSales ? 'No' : 'Yes';

    let allocationsXml = '';
    let totalVoucherAmount = 0;

    voucher.items.forEach(item => {
      const taxable = round(item.amount);
      const rate = item.taxRate;

      // Use Excel-provided tax values if available, otherwise calculate
      const hasExcelTaxValues = (item.igst && item.igst > 0) || (item.cgst && item.cgst > 0) || (item.sgst && item.sgst > 0);
      const calculatedTax = round(taxable * (rate / 100));

      // Determine which tax values to use
      let igstAmt = 0, cgstAmt = 0, sgstAmt = 0;
      if (hasExcelTaxValues) {
        igstAmt = round(item.igst || 0);
        cgstAmt = round(item.cgst || 0);
        sgstAmt = round(item.sgst || 0);
      } else if (rate > 0) {
        if (isInterState) {
          igstAmt = calculatedTax;
        } else {
          cgstAmt = round(calculatedTax / 2);
          sgstAmt = round(calculatedTax - cgstAmt);
        }
      }

      const totalTaxAmt = igstAmt + cgstAmt + sgstAmt;
      const cessAmt = round(item.cess || 0);
      totalVoucherAmount += (taxable + totalTaxAmt + cessAmt);

      const rateStr = rate.toString();
      const mappedLedger = ledgerMappings[rateStr];
      const ledgerName = item.ledgerName || mappedLedger || `${isSales ? 'Sale' : 'Purchase'} ${rate}%`;

      const taxableStr = isSales ? `${taxable.toFixed(2)}` : `-${taxable.toFixed(2)}`;

      allocationsXml += `
            <LEDGERENTRIES.LIST>
                <LEDGERNAME>${esc(ledgerName)}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${taxDeemedPos}</ISDEEMEDPOSITIVE>
                <AMOUNT>${taxableStr}</AMOUNT>
            </LEDGERENTRIES.LIST>`;

      // Add IGST if applicable
      if (igstAmt > 0) {
        const taxLedgerName = `${isSales ? 'Output' : 'Input'} IGST ${rate}%`;
        const taxStr = isSales ? `${igstAmt.toFixed(2)}` : `-${igstAmt.toFixed(2)}`;
        allocationsXml += `
                    <LEDGERENTRIES.LIST>
                        <LEDGERNAME>${esc(taxLedgerName)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>${taxDeemedPos}</ISDEEMEDPOSITIVE>
                        <AMOUNT>${taxStr}</AMOUNT>
                    </LEDGERENTRIES.LIST>`;
      }

      // Add CGST/SGST if applicable
      if (cgstAmt > 0 || sgstAmt > 0) {
        const half = rate / 2;
        const cgstName = `${isSales ? 'Output' : 'Input'} CGST ${formatRate(half)}%`;
        const sgstName = `${isSales ? 'Output' : 'Input'} SGST ${formatRate(half)}%`;

        if (cgstAmt > 0) {
          const cgstStr = isSales ? `${cgstAmt.toFixed(2)}` : `-${cgstAmt.toFixed(2)}`;
          allocationsXml += `
                    <LEDGERENTRIES.LIST>
                        <LEDGERNAME>${esc(cgstName)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>${taxDeemedPos}</ISDEEMEDPOSITIVE>
                        <AMOUNT>${cgstStr}</AMOUNT>
                    </LEDGERENTRIES.LIST>`;
        }
        if (sgstAmt > 0) {
          const sgstStr = isSales ? `${sgstAmt.toFixed(2)}` : `-${sgstAmt.toFixed(2)}`;
          allocationsXml += `
                    <LEDGERENTRIES.LIST>
                        <LEDGERNAME>${esc(sgstName)}</LEDGERNAME>
                        <ISDEEMEDPOSITIVE>${taxDeemedPos}</ISDEEMEDPOSITIVE>
                        <AMOUNT>${sgstStr}</AMOUNT>
                    </LEDGERENTRIES.LIST>`;
        }
      }

      // Add CESS if applicable
      if (cessAmt > 0) {
        const cessLedgerName = isSales ? 'Output Cess' : 'Input Cess';
        const cessStr = isSales ? `${cessAmt.toFixed(2)}` : `-${cessAmt.toFixed(2)}`;
        allocationsXml += `
                  <LEDGERENTRIES.LIST>
                      <LEDGERNAME>${esc(cessLedgerName)}</LEDGERNAME>
                      <ISDEEMEDPOSITIVE>${taxDeemedPos}</ISDEEMEDPOSITIVE>
                      <AMOUNT>${cessStr}</AMOUNT>
                  </LEDGERENTRIES.LIST>`;
      }
    });

    // Track the ACTUAL amounts being written to XML for exact balance
    let actualItemTotal = 0;
    let actualTaxTotal = 0;
    voucher.items.forEach(item => {
      actualItemTotal += round(item.amount);
      // Use Excel-provided tax values if available
      const hasExcelTaxValues = (item.igst && item.igst > 0) || (item.cgst && item.cgst > 0) || (item.sgst && item.sgst > 0);
      if (hasExcelTaxValues) {
        actualTaxTotal += round(item.igst || 0) + round(item.cgst || 0) + round(item.sgst || 0);
      } else if (item.taxRate > 0) {
        const calculatedTax = round(round(item.amount) * (item.taxRate / 100));
        if (isInterState) {
          actualTaxTotal += calculatedTax;
        } else {
          const halfTax = round(calculatedTax / 2);
          const otherHalf = round(calculatedTax - halfTax);
          actualTaxTotal += halfTax + otherHalf;
        }
      }

      // Always add Cess to actual tax total
      actualTaxTotal += round(item.cess || 0);
    });

    // --- ROUND OFF LOGIC ---
    let actualRoundOff = 0;
    if (voucher.roundOff && voucher.roundOff !== 0) {
      actualRoundOff = voucher.roundOff;
      // For Purchase: flip the sign. For Sales: keep the sign.
      const roundOffAmount = isSales ? voucher.roundOff : -voucher.roundOff;
      const roundOffStr = roundOffAmount.toFixed(2);
      const isRoundOffPositive = roundOffAmount > 0;
      const roundOffDeemedPos = isSales
        ? (isRoundOffPositive ? 'No' : 'Yes')
        : (isRoundOffPositive ? 'Yes' : 'No');
      allocationsXml += `
            <LEDGERENTRIES.LIST>
                <LEDGERNAME>Round Off</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${roundOffDeemedPos}</ISDEEMEDPOSITIVE>
                <AMOUNT>${roundOffStr}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
    }

    // CRITICAL: Party total = Items + Taxes + RoundOff (ACTUAL XML values)
    const partyTotal = round(actualItemTotal + actualTaxTotal + actualRoundOff);
    const partyAmountStr = isSales ? `-${partyTotal.toFixed(2)}` : `${partyTotal.toFixed(2)}`;

    let finalNarration = '';
    if (voucher.voucherType === 'Sales') {
      // Sales Format: Return Period Receiver Name GSTIN POS Invoice Type Invoice No Invoice Date [Base Narration]
      const details = [
        voucher.period,
        voucher.partyName,
        voucher.gstin,
        voucher.placeOfSupply,
        voucher.voucherType,
        voucher.invoiceNo,
        voucher.date
      ].filter(Boolean).join(' '); // Join with space, filter out empty fields
      finalNarration = `${details} ${baseNarration}`;
    } else {
      // Purchase Format: Being as per GSTR-2A [Base Narration]
      finalNarration = `Being as per GSTR-2A ${baseNarration}`;
    }

    vouchersXml += `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
            <VOUCHER VCHTYPE="${voucher.voucherType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
                <DATE>${dateXml}</DATE>
                <EFFECTIVEDATE>${dateXml}</EFFECTIVEDATE>
                <NARRATION>${finalNarration}</NARRATION>
                <VOUCHERTYPENAME>${voucher.voucherType}</VOUCHERTYPENAME>
                <VOUCHERNUMBER>${esc(voucher.invoiceNo)}</VOUCHERNUMBER>
                <REFERENCE>${esc(voucher.invoiceNo)}</REFERENCE>
                <PARTYLEDGERNAME>${esc(partyName)}</PARTYLEDGERNAME>
                <PARTYNAME>${esc(partyName)}</PARTYNAME>
                <ADDRESS.LIST>
                    <ADDRESS>${esc(voucher.address || '')}</ADDRESS>
                </ADDRESS.LIST>
                ${state ? `<STATENAME>${esc(state)}</STATENAME>` : ''}
                <COUNTRYOFRESIDENCE>India</COUNTRYOFRESIDENCE>
                ${voucher.gstin ? `<PARTYGSTIN>${esc(voucher.gstin)}</PARTYGSTIN>` : ''}
                ${voucher.gstin ? `<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : '<GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE>'}
                <PLACEOFSUPPLY>${esc(voucher.placeOfSupply || voucher.address || '')}</PLACEOFSUPPLY>
                <ISINVOICE>Yes</ISINVOICE>
                <GUID>${uuidv4()}</GUID>
                <FBTPAYMENTTYPE>Default</FBTPAYMENTTYPE>
                <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
                
                <ALLLEDGERENTRIES.LIST>
                    <LEDGERNAME>${esc(partyName)}</LEDGERNAME>
                    <ISDEEMEDPOSITIVE>${partyDeemedPos}</ISDEEMEDPOSITIVE>
                    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                    <AMOUNT>${partyAmountStr}</AMOUNT>
                    <BILLALLOCATIONS.LIST>
                        <NAME>${esc(voucher.invoiceNo)}</NAME>
                        <BILLTYPE>New Ref</BILLTYPE>
                        <AMOUNT>${partyAmountStr}</AMOUNT>
                    </BILLALLOCATIONS.LIST>
                </ALLLEDGERENTRIES.LIST>

                ${allocationsXml}

            </VOUCHER>
        </TALLYMESSAGE>`;
  });

  return `
    <ENVELOPE>
      <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
      </HEADER>
      <BODY>
        <IMPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>All Masters</REPORTNAME>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY>${svCompany}</SVCURRENTCOMPANY>
            </STATICVARIABLES>
          </REQUESTDESC>
          <REQUESTDATA>${mastersXml}</REQUESTDATA>
        </IMPORTDATA>
    
        <IMPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>Vouchers</REPORTNAME>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY>${svCompany}</SVCURRENTCOMPANY>
            </STATICVARIABLES>
          </REQUESTDESC>
          <REQUESTDATA>${vouchersXml}</REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>`;
};

// --- INVOICE XML GENERATION ---
export const generateTallyXml = (data: InvoiceData, existingLedgers: Set<string> = new Set(), userName: string = ''): string => {
  // Fallback: Default to 'Purchase' if voucherType is undefined
  const voucherType = data.voucherType || 'Purchase';
  const isSales = voucherType === 'Sales';
  const dateXml = formatDateForXml(data.invoiceDate);
  const guid = uuidv4();
  const remoteId = uuidv4();
  const vchKey = `${uuidv4()}:00000008`;

  const svCompany = data.targetCompany && data.targetCompany.trim() ? esc(data.targetCompany) : '##SVCurrentCompany';
  const rawPartyName = (isSales ? data.buyerName : data.supplierName) || "Cash Party";
  const partyName = cleanName(rawPartyName);
  const partyGroup = isSales ? 'Sundry Debtors' : 'Sundry Creditors';
  const ledgerParentGroup = isSales ? 'Sales Accounts' : 'Purchase Accounts';
  const supplierGstin = (data.supplierGstin || '').trim().toUpperCase();
  const buyerGstin = (data.buyerGstin || '').trim().toUpperCase();
  const partyGstin = isSales ? buyerGstin : supplierGstin;
  const partyState = getStateName(partyGstin) || 'Maharashtra';
  const buyerName = data.buyerName || 'Cash Buyer';
  const partyAddress = (isSales ? data.buyerAddress : data.supplierAddress) || '';

  const sState = supplierGstin.substring(0, 2);
  const bState = buyerGstin.substring(0, 2);
  const isInterStateByGstin = (sState && bState && sState !== bState);

  // Check if any line item has isIGST=true (fallback for missing GSTIN)
  const hasIGSTItems = data.lineItems.some(item => item.isIGST === true);

  // Determine if we need IGST based on GSTIN OR isIGST flags
  const useIGST = isInterStateByGstin || hasIGSTItems;

  const partyDeemedPos = isSales ? 'Yes' : 'No';
  const itemDeemedPos = isSales ? 'No' : 'Yes';
  const itemSign = isSales ? 1 : -1;
  const taxLedgerTotals: Record<string, number> = {};
  let totalVoucherValue = 0;

  let mastersXml = `
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><UNIT NAME="Nos" ACTION="Create"><NAME>Nos</NAME><ISSIMPLEUNIT>Yes</ISSIMPLEUNIT></UNIT></TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="${ledgerParentGroup}" ACTION="Create"><NAME.LIST><NAME>${ledgerParentGroup}</NAME></NAME.LIST></GROUP></TALLYMESSAGE>`;

  if (!existingLedgers.has(partyName)) {
    mastersXml += `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(partyName)}" ACTION="Create"><NAME.LIST><NAME>${esc(partyName)}</NAME></NAME.LIST><PARENT>${partyGroup}</PARENT><ISBILLWISEON>Yes</ISBILLWISEON><ISGSTAPPLICABLE>Yes</ISGSTAPPLICABLE><ADDRESS.LIST><ADDRESS>${esc(partyAddress)}</ADDRESS></ADDRESS.LIST>${partyGstin ? `<PARTYGSTIN>${esc(partyGstin)}</PARTYGSTIN>` : ''}${partyState ? `<STATENAME>${esc(partyState)}</STATENAME>` : ''}</LEDGER></TALLYMESSAGE>`;
  }

  const uniqueRates = new Set<number>();
  data.lineItems.forEach(item => {
    const rate = Number(item.gstRate) || 0;
    uniqueRates.add(rate);
    const itemName = cleanName(item.description) || `Item @ ${rate}%`;
    mastersXml += `<TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKITEM NAME="${esc(itemName)}" ACTION="Create"><NAME.LIST><NAME>${esc(itemName)}</NAME></NAME.LIST><BASEUNITS>Nos</BASEUNITS><OPENINGBALANCE>0 Nos</OPENINGBALANCE><ISGSTAPPLICABLE>Yes</ISGSTAPPLICABLE><GSTRATE>${rate}</GSTRATE></STOCKITEM></TALLYMESSAGE>`;
  });

  // Create tax ledgers - now we create both IGST and CGST/SGST ledgers to handle mixed items
  uniqueRates.forEach(rate => {
    const ledgerName = `${isSales ? 'Sale' : 'Purchase'} ${formatRate(rate)}%`;
    if (!existingLedgers.has(ledgerName)) {
      mastersXml += `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(ledgerName)}" ACTION="Create"><NAME.LIST><NAME>${esc(ledgerName)}</NAME></NAME.LIST><PARENT>${ledgerParentGroup}</PARENT><ISGSTAPPLICABLE>Yes</ISGSTAPPLICABLE><GSTRATE>${rate}</GSTRATE></LEDGER></TALLYMESSAGE>`;
    }

    // Create IGST ledger if any item uses IGST
    const igstName = `${isSales ? 'Output' : 'Input'} IGST ${formatRate(rate)}%`;
    if (!existingLedgers.has(igstName)) {
      mastersXml += `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(igstName)}" ACTION="Create"><NAME.LIST><NAME>${esc(igstName)}</NAME></NAME.LIST><PARENT>Duties &amp; Taxes</PARENT><TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>Integrated Tax</GSTDUTYHEAD><GSTRATE>${rate}</GSTRATE></LEDGER></TALLYMESSAGE>`;
    }

    // Create CGST/SGST ledgers for non-IGST items
    const half = rate / 2;
    const cgstName = `${isSales ? 'Output' : 'Input'} CGST ${formatRate(half)}%`;
    const sgstName = `${isSales ? 'Output' : 'Input'} SGST ${formatRate(half)}%`;
    if (!existingLedgers.has(cgstName)) mastersXml += `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(cgstName)}" ACTION="Create"><NAME.LIST><NAME>${esc(cgstName)}</NAME></NAME.LIST><PARENT>Duties &amp; Taxes</PARENT><TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>Central Tax</GSTDUTYHEAD><GSTRATE>${half}</GSTRATE></LEDGER></TALLYMESSAGE>`;
    if (!existingLedgers.has(sgstName)) mastersXml += `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(sgstName)}" ACTION="Create"><NAME.LIST><NAME>${esc(sgstName)}</NAME></NAME.LIST><PARENT>Duties &amp; Taxes</PARENT><TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>State Tax</GSTDUTYHEAD><GSTRATE>${half}</GSTRATE></LEDGER></TALLYMESSAGE>`;
  });

  let inventoryXml = '';
  data.lineItems.forEach(item => {
    const gstRate = Number(item.gstRate) || 0;
    const qty = Number(item.quantity) || 1;
    const itemRate = Number(item.rate) || 0;
    // CRITICAL: Use the exact amount from UI (what user sees/edited) instead of recalculating
    const amount = round(Number(item.amount) || 0);
    const itemName = cleanName(item.description) || `Item @ ${gstRate}%`;
    const ledgerName = `${isSales ? 'Sale' : 'Purchase'} ${formatRate(gstRate)}%`;
    totalVoucherValue += amount;
    const lineTax = round(amount * (gstRate / 100));
    totalVoucherValue += lineTax;

    // Determine if this item uses IGST: per-item flag takes precedence, otherwise use GSTIN-based detection
    const itemUsesIGST = item.isIGST !== undefined ? item.isIGST : isInterStateByGstin;

    if (itemUsesIGST) {
      const name = `${isSales ? 'Output' : 'Input'} IGST ${formatRate(gstRate)}%`;
      taxLedgerTotals[name] = (taxLedgerTotals[name] || 0) + lineTax;
    } else {
      const half = gstRate / 2;
      const cName = `${isSales ? 'Output' : 'Input'} CGST ${formatRate(half)}%`;
      const sName = `${isSales ? 'Output' : 'Input'} SGST ${formatRate(half)}%`;
      const halfTax = round(lineTax / 2);
      const remainder = round(lineTax - halfTax);
      taxLedgerTotals[cName] = (taxLedgerTotals[cName] || 0) + halfTax;
      taxLedgerTotals[sName] = (taxLedgerTotals[sName] || 0) + remainder;
    }
    const amountStr = `${(amount * itemSign).toFixed(2)}`;
    inventoryXml += `<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>${esc(itemName)}</STOCKITEMNAME><ISDEEMEDPOSITIVE>${itemDeemedPos}</ISDEEMEDPOSITIVE><ACTUALQTY> ${qty} Nos</ACTUALQTY><BILLEDQTY> ${qty} Nos</BILLEDQTY><RATE>${itemRate.toFixed(2)}/Nos</RATE><AMOUNT>${amountStr}</AMOUNT><ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>${esc(ledgerName)}</LEDGERNAME><ISDEEMEDPOSITIVE>${itemDeemedPos}</ISDEEMEDPOSITIVE><AMOUNT>${amountStr}</AMOUNT></ACCOUNTINGALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST>`;
  });

  // Calculate the ACTUAL tax amounts that will be written to XML
  // This ensures party total = sum of all ledger entries exactly
  let actualTaxTotal = 0;
  let taxLedgersXml = '';
  Object.entries(taxLedgerTotals).forEach(([name, rawAmt]) => {
    const amt = round(rawAmt);
    if (amt > 0) {
      actualTaxTotal += amt; // Track actual rounded tax
      const taxAmtStr = `${(amt * itemSign).toFixed(2)}`;
      taxLedgersXml += `<LEDGERENTRIES.LIST><LEDGERNAME>${esc(name)}</LEDGERNAME><ISDEEMEDPOSITIVE>${itemDeemedPos}</ISDEEMEDPOSITIVE><AMOUNT>${taxAmtStr}</AMOUNT></LEDGERENTRIES.LIST>`;
    }
  });

  // Calculate actual item total from line items
  let actualItemTotal = 0;
  data.lineItems.forEach(item => {
    actualItemTotal += round(Number(item.amount) || 0);
  });

  // --- ROUND OFF LOGIC ---
  // roundOff from UI = roundedTotal - actualTotal
  // Positive roundOff means we're rounding UP (adding to total)
  // Negative roundOff means we're rounding DOWN (subtracting from total)
  // For Tally: Purchase expense is negative amount, income is positive
  // For Tally: Sales expense is positive amount, income is negative
  let actualRoundOff = 0;
  if (data.roundOff && data.roundOff !== 0) {
    actualRoundOff = data.roundOff;
    // For Purchase: positive roundOff = expense = need negative in XML
    // For Purchase: negative roundOff = income = need positive in XML
    // For Sales: positive roundOff = income = need negative in XML
    // For Sales: negative roundOff = expense = need positive in XML
    // Simplified: For Purchase, flip the sign. For Sales, keep the sign.
    const roundOffAmount = isSales ? data.roundOff : -data.roundOff;
    const roundOffStr = roundOffAmount.toFixed(2);
    const isRoundOffPositive = roundOffAmount > 0;
    // IsDeemedPositive: For Sales round off expense is No, income is Yes
    // For Purchase round off expense is Yes, income is No
    const roundOffDeemedPos = isSales
      ? (isRoundOffPositive ? 'No' : 'Yes')  // Sales: positive is expense (No)
      : (isRoundOffPositive ? 'Yes' : 'No'); // Purchase: positive is expense (Yes)
    taxLedgersXml += `<LEDGERENTRIES.LIST><LEDGERNAME>Round Off</LEDGERNAME><ISDEEMEDPOSITIVE>${roundOffDeemedPos}</ISDEEMEDPOSITIVE><AMOUNT>${roundOffStr}</AMOUNT></LEDGERENTRIES.LIST>`;
  }

  const partySign = isSales ? -1 : 1;
  // CRITICAL: Party total = Items + Taxes + RoundOff (all using ACTUAL XML values)
  // This guarantees: Party Amount = Sum of all other ledger entries = BALANCED
  const finalPartyTotal = round(actualItemTotal + actualTaxTotal + actualRoundOff);
  const partyAmountStr = `${(finalPartyTotal * partySign).toFixed(2)}`;

  // Generate narration with username and timestamp
  const now = new Date();
  const narrationDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
  const narrationTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const userPart = userName ? ` by ${userName}` : '';
  const narration = `Generated by AutoTally AI${userPart} On ${narrationDate} ${narrationTime}`;

  return `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${svCompany}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${mastersXml}</REQUESTDATA></IMPORTDATA><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${svCompany}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="${remoteId}" VCHKEY="${vchKey}" VCHTYPE="${voucherType}" ACTION="Create" OBJVIEW="Invoice Voucher View"><OLDAUDITENTRYIDS.LIST TYPE="Number"><OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS></OLDAUDITENTRYIDS.LIST><DATE>${dateXml}</DATE><EFFECTIVEDATE>${dateXml}</EFFECTIVEDATE><REFERENCEDATE>${dateXml}</REFERENCEDATE><VCHSTATUSDATE>${dateXml}</VCHSTATUSDATE><GUID>${guid}</GUID><VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME><PARTYLEDGERNAME>${esc(partyName)}</PARTYLEDGERNAME><PARTYNAME>${esc(partyName)}</PARTYNAME><ADDRESS.LIST><ADDRESS>${esc(partyAddress)}</ADDRESS></ADDRESS.LIST><STATENAME>${esc(partyState)}</STATENAME><COUNTRYOFRESIDENCE>India</COUNTRYOFRESIDENCE><PARTYGSTIN>${esc(partyGstin)}</PARTYGSTIN><PLACEOFSUPPLY>${esc(partyState)}</PLACEOFSUPPLY><VOUCHERNUMBER>${esc(data.invoiceNumber)}</VOUCHERNUMBER><REFERENCE>${esc(data.invoiceNumber)}</REFERENCE><BASICBUYERNAME>${esc(buyerName)}</BASICBUYERNAME><ISINVOICE>Yes</ISINVOICE><NARRATION>${narration}</NARRATION><LEDGERENTRIES.LIST><LEDGERNAME>${esc(partyName)}</LEDGERNAME><ISDEEMEDPOSITIVE>${partyDeemedPos}</ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes</ISPARTYLEDGER><AMOUNT>${partyAmountStr}</AMOUNT><BILLALLOCATIONS.LIST><NAME>${esc(data.invoiceNumber)}</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>${partyAmountStr}</AMOUNT></BILLALLOCATIONS.LIST></LEDGERENTRIES.LIST>${inventoryXml}${taxLedgersXml}</VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
};

// --- PUSH FUNCTION ---
export const pushToTally = async (xml: string): Promise<TallyResponse> => {
  try {
    const response = await fetch(TALLY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Connection': 'close' },
      body: xml
    });
    const text = await response.text();
    if (text.includes("<LINEERROR>")) {
      const match = text.match(/<LINEERROR>(.*?)<\/LINEERROR>/);
      return { success: false, message: `Tally Error: ${match ? match[1] : "Unknown"}` };
    }
    const errorsMatch = text.match(/<ERRORS>(\d+)<\/ERRORS>/);
    const errors = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;
    if (errors > 0) return { success: false, message: `Tally reported ${errors} errors.` };
    return { success: true, message: "Success" };
  } catch (error) {
    let msg = "Unknown Error";
    if (error instanceof Error) msg = error.message;
    return { success: false, message: `Network Error: ${msg}` };
  }
};

// --- FETCH LEDGERS ---
export const fetchExistingLedgers = async (companyName?: string): Promise<Set<string>> => {
  const svCompany = companyName ? esc(companyName) : '##SVCurrentCompany';
  const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Accounts</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><ACCOUNTTYPE>Ledgers</ACCOUNTTYPE><SVCURRENTCOMPANY>${svCompany}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
  try {
    const response = await fetch(TALLY_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: xml });
    const text = await response.text();
    const ledgers = new Set<string>();
    const regexName = /<NAME>(.*?)<\/NAME>/gi;
    let match;
    while ((match = regexName.exec(text)) !== null) {
      ledgers.add(decodeHtml(match[1]));
    }
    return ledgers;
  } catch (error) {
    console.warn("Could not fetch existing ledgers", error);
    return new Set();
  }
};

export const fetchOpenCompanies = async (): Promise<string[]> => {
  // Simplified approach: Just get the current company by querying ledgers
  // The response will contain the company name in the header
  const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Accounts</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><ACCOUNTTYPE>Ledgers</ACCOUNTTYPE></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
  try {
    const response = await fetch(TALLY_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: xml });
    const text = await response.text();

    // Try multiple patterns to extract company name
    const patterns = [
      /<REMOTECMPINFO\.LIST>.*?<NAME>(.*?)<\/NAME>/is,
      /<COMPANY>(.*?)<\/COMPANY>/i,
      /<SVCURRENTCOMPANY>(.*?)<\/SVCURRENTCOMPANY>/i,
      /<COMPANYNAME>(.*?)<\/COMPANYNAME>/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const companyName = decodeHtml(match[1]).trim();
        if (companyName && companyName !== '##SVCurrentCompany') {
          console.log('✅ Found company:', companyName);
          return [companyName];
        }
      }
    }

    // Fallback: If we got a valid response but couldn't extract name, 
    // return a generic name so the app doesn't think Tally is offline
    if (text.includes('<ENVELOPE>') || text.includes('<LEDGER')) {
      // console.log('⚠️ Tally connected but company name not found, using current company');
      return ['Current Company'];
    }

    console.error('❌ No company found in Tally response');
    return [];
  } catch (error) {
    console.error('❌ Error fetching companies:', error);
    return [];
  }
};

export const fetchCompanyDetails = async (companyName: string): Promise<{ gstin: string; state: string } | null> => {
  // Use a custom TDL report to fetch details of ALL open companies to avoid "Form:Company" errors
  const xml = `<ENVELOPE>
    <HEADER>
      <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
      <EXPORTDATA>
        <REQUESTDESC>
          <REPORTNAME>AutoTallyCompanyList</REPORTNAME>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
        </REQUESTDESC>
        <TDL>
          <TDLMESSAGE>
            <REPORT NAME="AutoTallyCompanyList">
              <FORMS>AutoTallyCompanyForm</FORMS>
            </REPORT>
            <FORM NAME="AutoTallyCompanyForm">
              <PARTS>AutoTallyCompanyPart</PARTS>
            </FORM>
            <PART NAME="AutoTallyCompanyPart">
              <LINES>AutoTallyCompanyLine</LINES>
              <REPEAT>AutoTallyCompanyLine : Company</REPEAT>
              <SCROLLED>Vertical</SCROLLED>
            </PART>
            <LINE NAME="AutoTallyCompanyLine">
              <FIELDS>AT_Name, AT_GSTIN, AT_State</FIELDS>
            </LINE>
            <FIELD NAME="AT_Name">
              <SET>$Name</SET>
              <XMLTAG>NAME</XMLTAG>
            </FIELD>
            <FIELD NAME="AT_GSTIN">
              <SET>if $$IsEmpty:$GSTIN then $PartyGSTIN else $GSTIN</SET>
              <XMLTAG>GSTIN</XMLTAG>
            </FIELD>
            <FIELD NAME="AT_State">
              <SET>$StateName</SET>
              <XMLTAG>STATENAME</XMLTAG>
            </FIELD>
          </TDLMESSAGE>
        </TDL>
      </EXPORTDATA>
    </BODY>
  </ENVELOPE>`;

  try {
    const response = await fetch(TALLY_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: xml });
    const text = await response.text();

    // Parse the XML response
    // Format is: <NAME>...</NAME><GSTIN>...</GSTIN><STATENAME>...</STATENAME> repeated
    const regex = /<NAME>(.*?)<\/NAME>\s*<GSTIN>(.*?)<\/GSTIN>\s*<STATENAME>(.*?)<\/STATENAME>/gis;

    let match;
    while ((match = regex.exec(text)) !== null) {
      const name = decodeHtml(match[1]).trim();
      if (name.toLowerCase() === companyName.toLowerCase()) {
        return {
          gstin: decodeHtml(match[2]),
          state: decodeHtml(match[3])
        };
      }
    }

    return null;
  } catch (error) {
    console.warn("Could not fetch company details", error);
    return null;
  }
};

// --- MASTER SYNC AND CACHING ---
export interface TallyMasterSync {
  companies: string[];
  ledgers: Record<string, string[]>;
  lastSync: number;
}

export const syncMastersFromAllCompanies = async (): Promise<TallyMasterSync> => {
  const companies = await fetchOpenCompanies();
  const ledgersMap: Record<string, string[]> = {};

  for (const company of companies) {
    const ledgersSet = await fetchExistingLedgers(company);
    ledgersMap[company] = Array.from(ledgersSet);
  }

  const syncData = { companies, ledgers: ledgersMap, lastSync: Date.now() };

  // Cache the sync data
  try {
    localStorage.setItem('autotally_masters_sync', JSON.stringify(syncData));
  } catch (e) {
    console.warn('Failed to cache master sync data', e);
  }

  return syncData;
};

export const getLedgersFromCache = (companyName?: string): Set<string> => {
  try {
    const saved = localStorage.getItem('autotally_masters_sync');
    if (saved) {
      const parsed: TallyMasterSync = JSON.parse(saved);
      if (companyName && parsed.ledgers?.[companyName]) {
        return new Set(parsed.ledgers[companyName]);
      }
      // Return all ledgers from all companies
      const all = new Set<string>();
      Object.values(parsed.ledgers || {}).forEach((arr) => {
        arr.forEach((l) => all.add(l));
      });
      return all;
    }
  } catch (e) {
    console.warn('Failed to read ledgers from cache', e);
  }
  return new Set();
};

export const getCompaniesFromCache = (): string[] => {
  try {
    const saved = localStorage.getItem('autotally_masters_sync');
    if (saved) {
      const parsed: TallyMasterSync = JSON.parse(saved);
      return parsed.companies || [];
    }
  } catch (e) {
    console.warn('Failed to read companies from cache', e);
  }
  return [];
};
