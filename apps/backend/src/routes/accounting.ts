import { Router, type Response } from 'express';
import crypto from 'crypto';
import { db, storage } from '../config/firebase.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import {
    type Account,
    type AccountingImport,
    type BankTransaction,
    type CategorizationRule,
    type JournalEntry,
    type JournalLine,
    type ProfitLossReport,
    type BalanceSheetReport,
    type Receipt,
    type ReceiptExtraction,
    type ReceiptLineItem
} from '@construction/shared';
import { generateSignedUploadUrl } from '../services/storage.js';
import { enrichReceiptAsync } from '../services/receiptEnrichment.js';

const router = Router();
const accountsCollection = db.collection('accounts');
const journalEntriesCollection = db.collection('journalEntries');
const importsCollection = db.collection('imports');
const transactionsCollection = db.collection('transactions');
const rulesCollection = db.collection('rules');
const receiptsCollection = db.collection('receipts');
const merchantsCollection = db.collection('merchants');

const DEFAULT_CURRENCY = 'USD';
const DEFAULT_BANK_ACCOUNT_ID = '1010';

type DefaultAccount = Pick<Account, 'id' | 'code' | 'name' | 'type' | 'subType' | 'parentId' | 'description'>;

const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccount[] = [
    { id: '1000', code: '1000', name: 'Cash', type: 'asset', subType: 'current_asset' },
    { id: '1010', code: '1010', name: 'Operating Checking', type: 'asset', subType: 'current_asset', parentId: '1000' },
    { id: '1020', code: '1020', name: 'Savings', type: 'asset', subType: 'current_asset', parentId: '1000' },
    { id: '1030', code: '1030', name: 'Petty Cash', type: 'asset', subType: 'current_asset', parentId: '1000' },
    { id: '1100', code: '1100', name: 'Accounts Receivable', type: 'asset', subType: 'current_asset' },
    { id: '1200', code: '1200', name: 'Undeposited Funds', type: 'asset', subType: 'current_asset' },
    { id: '1300', code: '1300', name: 'Inventory & Materials', type: 'asset', subType: 'current_asset' },
    { id: '1400', code: '1400', name: 'Prepaid Expenses', type: 'asset', subType: 'current_asset' },
    { id: '1500', code: '1500', name: 'Fixed Assets', type: 'asset', subType: 'fixed_asset' },
    { id: '1510', code: '1510', name: 'Equipment', type: 'asset', subType: 'fixed_asset', parentId: '1500' },
    { id: '1520', code: '1520', name: 'Vehicles', type: 'asset', subType: 'fixed_asset', parentId: '1500' },
    { id: '1530', code: '1530', name: 'Furniture & Fixtures', type: 'asset', subType: 'fixed_asset', parentId: '1500' },
    { id: '1590', code: '1590', name: 'Accumulated Depreciation', type: 'asset', subType: 'contra_asset', parentId: '1500' },
    { id: '1600', code: '1600', name: 'Work in Progress', type: 'asset', subType: 'current_asset' },
    { id: '2000', code: '2000', name: 'Accounts Payable', type: 'liability', subType: 'current_liability' },
    { id: '2100', code: '2100', name: 'Credit Cards', type: 'liability', subType: 'current_liability' },
    { id: '2200', code: '2200', name: 'Accrued Expenses', type: 'liability', subType: 'current_liability' },
    { id: '2300', code: '2300', name: 'Payroll Liabilities', type: 'liability', subType: 'current_liability' },
    { id: '2400', code: '2400', name: 'Customer Deposits', type: 'liability', subType: 'current_liability' },
    { id: '2500', code: '2500', name: 'Sales Tax Payable', type: 'liability', subType: 'current_liability' },
    { id: '2600', code: '2600', name: 'Loans Payable', type: 'liability', subType: 'long_term_liability' },
    { id: '2700', code: '2700', name: 'Retainage Payable', type: 'liability', subType: 'current_liability' },
    { id: '3000', code: '3000', name: "Owner's Equity", type: 'equity', subType: 'equity' },
    { id: '3100', code: '3100', name: "Owner's Draw", type: 'equity', subType: 'equity', parentId: '3000' },
    { id: '3200', code: '3200', name: 'Retained Earnings', type: 'equity', subType: 'equity', parentId: '3000' },
    { id: '4000', code: '4000', name: 'Construction Revenue', type: 'revenue', subType: 'operating_revenue' },
    { id: '4100', code: '4100', name: 'Change Orders', type: 'revenue', subType: 'operating_revenue' },
    { id: '4200', code: '4200', name: 'Service & Maintenance', type: 'revenue', subType: 'operating_revenue' },
    { id: '4300', code: '4300', name: 'Other Income', type: 'revenue', subType: 'other_income' },
    { id: '5000', code: '5000', name: 'Materials', type: 'cogs', subType: 'direct_cost' },
    { id: '5100', code: '5100', name: 'Subcontractor Costs', type: 'cogs', subType: 'direct_cost' },
    { id: '5200', code: '5200', name: 'Labor', type: 'cogs', subType: 'direct_cost' },
    { id: '5300', code: '5300', name: 'Equipment Rental', type: 'cogs', subType: 'direct_cost' },
    { id: '5400', code: '5400', name: 'Permits & Fees', type: 'cogs', subType: 'direct_cost' },
    { id: '5500', code: '5500', name: 'Job Site Expenses', type: 'cogs', subType: 'direct_cost' },
    { id: '6000', code: '6000', name: 'Office Supplies', type: 'expense', subType: 'operating_expense' },
    { id: '6100', code: '6100', name: 'Insurance', type: 'expense', subType: 'operating_expense' },
    { id: '6200', code: '6200', name: 'Utilities', type: 'expense', subType: 'operating_expense' },
    { id: '6300', code: '6300', name: 'Marketing', type: 'expense', subType: 'operating_expense' },
    { id: '6400', code: '6400', name: 'Professional Fees', type: 'expense', subType: 'operating_expense' },
    { id: '6500', code: '6500', name: 'Software & Subscriptions', type: 'expense', subType: 'operating_expense' },
    { id: '6600', code: '6600', name: 'Travel & Meals', type: 'expense', subType: 'operating_expense' },
    { id: '6700', code: '6700', name: 'Vehicle Expenses', type: 'expense', subType: 'operating_expense' },
    { id: '6800', code: '6800', name: 'Depreciation', type: 'expense', subType: 'operating_expense' },
    { id: '6900', code: '6900', name: 'Rent', type: 'expense', subType: 'operating_expense' },
    { id: '6950', code: '6950', name: 'Bank Fees', type: 'expense', subType: 'operating_expense' },
    { id: '6990', code: '6990', name: 'Miscellaneous', type: 'expense', subType: 'operating_expense' }
];

const roundToCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const toCents = (value: number) => Math.round((value + Number.EPSILON) * 100);

const buildAccount = (base: DefaultAccount): Account => {
    const now = Date.now();
    return {
        ...base,
        isActive: true,
        createdAt: now,
        updatedAt: now
    };
};

const parseNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return NaN;
};

const parseCurrency = (value: string) => {
    if (!value) return undefined;
    const trimmed = value.trim().toUpperCase();
    if (trimmed === 'USD' || trimmed === 'EUR' || trimmed === 'GBP') return trimmed;
    return undefined;
};

const extractReceiptData = (rawText?: string): ReceiptExtraction => {
    if (!rawText) return {};

    const normalized = rawText.replace(/\r/g, '\n');
    const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
    const merchant = lines[0];

    const totalMatch = rawText.match(/total\s*[:$]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
    const taxMatch = rawText.match(/tax\s*[:$]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
    const dateMatch = rawText.match(/([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/);
    const currencyMatch = rawText.match(/\b(USD|EUR|GBP)\b/i);

    const date = dateMatch ? Date.parse(dateMatch[1]) : NaN;

    return {
        merchant,
        total: totalMatch ? parseNumber(totalMatch[1]) : undefined,
        tax: taxMatch ? parseNumber(taxMatch[1]) : undefined,
        date: Number.isFinite(date) ? date : undefined,
        currency: parseCurrency(currencyMatch?.[1] || ''),
        confidence: totalMatch ? 0.6 : 0.3,
        rawText
    };
};

const parseCsvLine = (line: string) => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }

    result.push(current.trim());
    return result;
};

const parseCsvToTransactions = (csvText: string) => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
        return [];
    }

    const headers = parseCsvLine(lines[0]).map(header => header.toLowerCase());
    const headerIndex = (name: string) => headers.findIndex(header => header === name);
    const dateIndex = headerIndex('date');
    const descriptionIndex = headerIndex('description');
    const amountIndex = headerIndex('amount');
    const debitIndex = headerIndex('debit');
    const creditIndex = headerIndex('credit');
    const memoIndex = headerIndex('memo');

    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
        const values = parseCsvLine(lines[i]);
        if (!values.length) continue;

        const dateRaw = values[dateIndex] ?? '';
        const description = values[descriptionIndex] ?? '';
        const memo = memoIndex >= 0 ? values[memoIndex] : '';
        const parsedDate = Date.parse(dateRaw);

        let amount = NaN;
        if (amountIndex >= 0) {
            amount = parseNumber(values[amountIndex]);
        } else {
            const debit = debitIndex >= 0 ? parseNumber(values[debitIndex]) : NaN;
            const credit = creditIndex >= 0 ? parseNumber(values[creditIndex]) : NaN;
            if (Number.isFinite(debit) || Number.isFinite(credit)) {
                amount = (Number.isFinite(credit) ? credit : 0) - (Number.isFinite(debit) ? debit : 0);
            }
        }

        if (!Number.isFinite(parsedDate) || !Number.isFinite(amount) || description.trim() === '') {
            continue;
        }

        rows.push({
            date: parsedDate,
            description: description.trim(),
            amount,
            memo: memo.trim()
        });
    }

    return rows;
};

const fetchRules = async () => {
    const snapshot = await rulesCollection.orderBy('priority', 'desc').get();
    return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as CategorizationRule);
};

const createJournalEntryForTransaction = async (
    transaction: BankTransaction,
    bankAccountId: string,
    accountId: string,
    createdBy: string
) => {
    const now = Date.now();
    const entryId = crypto.randomUUID();
    const amount = Math.abs(transaction.amount);
    const isInflow = transaction.amount > 0;

    const lines = isInflow
        ? [
            { accountId: bankAccountId, debit: amount, credit: 0, projectId: transaction.projectId },
            { accountId, debit: 0, credit: amount, projectId: transaction.projectId }
        ]
        : [
            { accountId, debit: amount, credit: 0, projectId: transaction.projectId },
            { accountId: bankAccountId, debit: 0, credit: amount, projectId: transaction.projectId }
        ];

    const entry: JournalEntry = {
        id: entryId,
        date: transaction.date,
        memo: transaction.memo || transaction.description,
        status: 'posted',
        currency: transaction.currency,
        lines,
        sourceType: 'bank-import',
        sourceId: transaction.id,
        createdBy,
        createdAt: now,
        updatedAt: now
    };

    const validationError = validateJournalEntry(entry);
    if (validationError) {
        throw new Error(validationError);
    }

    await journalEntriesCollection.doc(entryId).set(entry);
    return entryId;
};

const extractFilename = (pathValue?: string) => {
    if (!pathValue) return undefined;
    try {
        if (pathValue.startsWith('file://')) {
            const url = new URL(pathValue);
            const segments = url.pathname.split('/').filter(Boolean);
            return segments[segments.length - 1];
        }
    } catch {
        // fall through to string parsing
    }

    const cleaned = pathValue.split('?')[0];
    const parts = cleaned.split('/').filter(Boolean);
    return parts[parts.length - 1];
};

const normalizeReceiptExtraction = (payload?: ReceiptExtraction | Record<string, unknown>) => {
    if (!payload) return undefined;
    const anyPayload = payload as Record<string, unknown>;
    const total = typeof anyPayload.total === 'number'
        ? anyPayload.total
        : typeof anyPayload.totalAmount === 'number'
            ? anyPayload.totalAmount
            : undefined;
    const subtotal = typeof anyPayload.subtotal === 'number'
        ? anyPayload.subtotal
        : undefined;
    const merchant = typeof anyPayload.merchant === 'string'
        ? anyPayload.merchant
        : typeof anyPayload.merchantName === 'string'
            ? anyPayload.merchantName
            : undefined;
    const rawDate = typeof anyPayload.date === 'number' ? anyPayload.date : undefined;
    const normalizedDate = rawDate && rawDate < 1_000_000_000_000 ? rawDate * 1000 : rawDate;

    return {
        merchant,
        merchantName: merchant,
        total,
        totalAmount: total,
        subtotal,
        tax: typeof anyPayload.tax === 'number' ? anyPayload.tax : undefined,
        date: normalizedDate,
        currency: typeof anyPayload.currency === 'string' ? anyPayload.currency : undefined,
        confidence: typeof anyPayload.confidence === 'number' ? anyPayload.confidence : undefined,
        rawText: typeof anyPayload.rawText === 'string' ? anyPayload.rawText : undefined
    };
};

const stripUndefined = <T extends Record<string, unknown>>(data: T): T => {
    return Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined)
    ) as T;
};

const normalizeMerchantName = (value?: string) => {
    if (!value) return undefined;
    return value.trim().replace(/\s+/g, ' ');
};

const merchantSlug = (value?: string) => {
    if (!value) return undefined;
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
};

const upsertMerchant = async (merchantName?: string) => {
    const normalized = normalizeMerchantName(merchantName);
    if (!normalized) return undefined;
    const slug = merchantSlug(normalized);
    if (!slug) return undefined;
    const docRef = merchantsCollection.doc(slug);
    const doc = await docRef.get();
    if (!doc.exists) {
        await docRef.set({
            id: slug,
            name: normalized,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    }
    return slug;
};

const normalizeLineItems = (items?: unknown): ReceiptLineItem[] | undefined => {
    if (!Array.isArray(items)) return undefined;
    const normalized = items.map(item => {
        const record = item as Record<string, unknown>;
        return stripUndefined({
            id: typeof record.id === 'string' ? record.id : undefined,
            description: typeof record.description === 'string' ? record.description : undefined,
            descriptionRaw: typeof record.descriptionRaw === 'string' ? record.descriptionRaw : undefined,
            quantity: typeof record.quantity === 'number' ? record.quantity : undefined,
            unitPrice: typeof record.unitPrice === 'number' ? record.unitPrice : undefined,
            amount: typeof record.amount === 'number' ? record.amount : undefined,
            category: typeof record.category === 'string' ? record.category : undefined,
            sku: typeof record.sku === 'string' ? record.sku : undefined,
            upc: typeof record.upc === 'string' ? record.upc : undefined,
            taxable: typeof record.taxable === 'boolean' ? record.taxable : undefined
        });
    });
    return normalized;
};

const parsePaymentMethod = (value?: string) => {
    if (!value) return {};
    const last4Match = value.match(/(\d{4})$/);
    const last4 = last4Match ? last4Match[1] : undefined;
    let tenderType: string | undefined;
    if (/visa/i.test(value)) tenderType = 'card';
    if (/mastercard/i.test(value)) tenderType = 'card';
    if (/amex/i.test(value)) tenderType = 'card';
    if (/cash/i.test(value)) tenderType = 'cash';
    return { paymentMethod: value, cardLast4: last4, tenderType };
};

const normalizeReceiptDetails = (payload: Record<string, unknown>) => {
    const merchantName = normalizeMerchantName(
        typeof payload.merchantName === 'string'
            ? payload.merchantName
            : typeof payload.merchant === 'string'
                ? payload.merchant
                : undefined
    );
    const total = typeof payload.total === 'number'
        ? payload.total
        : typeof payload.totalAmount === 'number'
            ? payload.totalAmount
            : undefined;
    const subtotal = typeof payload.subtotal === 'number' ? payload.subtotal : undefined;
    const tax = typeof payload.tax === 'number' ? payload.tax : undefined;
    const currency = typeof payload.currency === 'string' ? payload.currency : undefined;
    const rawDate = typeof payload.date === 'number' ? payload.date : undefined;
    const transactionDate = rawDate && rawDate < 1_000_000_000_000 ? rawDate * 1000 : rawDate;

    const paymentMethod = typeof payload.paymentMethod === 'string' ? payload.paymentMethod : undefined;
    const authCode = typeof payload.authCode === 'string' ? payload.authCode : undefined;
    const returnPolicyText = typeof payload.returnPolicyDescription === 'string'
        ? payload.returnPolicyDescription
        : typeof payload.returnPolicyText === 'string'
            ? payload.returnPolicyText
            : undefined;

    const rawLines = Array.isArray(payload.rawLines)
        ? (payload.rawLines.filter(line => typeof line === 'string') as string[])
        : undefined;
    const rawOcrText = typeof payload.rawOcrText === 'string'
        ? payload.rawOcrText
        : typeof payload.rawText === 'string'
            ? payload.rawText
            : undefined;

    const parsedSource = typeof payload.parsedSource === 'string' ? payload.parsedSource : undefined;
    const parseConfidence = typeof payload.parseConfidence === 'number' ? payload.parseConfidence : undefined;
    const processingVersion = typeof payload.processingVersion === 'string' ? payload.processingVersion : undefined;

    const { paymentMethod: normalizedPayment, cardLast4, tenderType } = parsePaymentMethod(paymentMethod);
    const lineItems = normalizeLineItems(payload.items);

    return stripUndefined({
        merchantName,
        total,
        subtotal,
        tax,
        currency,
        transactionDate,
        paymentMethod: normalizedPayment,
        cardLast4,
        authCode,
        tenderType,
        returnPolicyText,
        rawOcrText,
        rawLines,
        parsedSource,
        parseConfidence,
        processingVersion,
        lineItems
    });
};

const validateReceiptTotals = (details: Record<string, unknown>) => {
    const warnings: string[] = [];
    const subtotal = typeof details.subtotal === 'number' ? details.subtotal : undefined;
    const tax = typeof details.tax === 'number' ? details.tax : undefined;
    const total = typeof details.total === 'number' ? details.total : undefined;
    const tip = typeof details.tip === 'number' ? details.tip : 0;
    const discounts = typeof details.discounts === 'number' ? details.discounts : 0;

    if (subtotal !== undefined && tax !== undefined && total !== undefined) {
        const computed = subtotal + tax + tip - discounts;
        if (Math.abs(computed - total) > 0.02) {
            warnings.push('Totals do not reconcile with subtotal/tax/discounts.');
        }
    }
    return warnings;
};

const findMatchingTransaction = async (amount?: number, date?: number) => {
    if (!Number.isFinite(amount) || !Number.isFinite(date)) return undefined;
    const snapshot = await transactionsCollection.orderBy('date', 'desc').get();
    const transactions = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as BankTransaction);
    const targetDate = date as number;
    const candidates = transactions.filter((txn: BankTransaction) => {
        const amountMatch = Math.round(Math.abs(txn.amount) * 100) === Math.round(Math.abs(amount as number) * 100);
        const dateDiff = Math.abs(txn.date - targetDate);
        return amountMatch && dateDiff <= 1000 * 60 * 60 * 24 * 2;
    });
    return candidates[0];
};

const validateJournalEntry = (entry: JournalEntry) => {
    if (!entry.lines || entry.lines.length < 2) {
        return 'Journal entry must include at least two lines.';
    }

    let debitTotal = 0;
    let creditTotal = 0;

    for (const line of entry.lines) {
        const debit = parseNumber(line.debit);
        const credit = parseNumber(line.credit);

        if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
            return 'Journal lines must include valid debit and credit amounts.';
        }

        if (debit < 0 || credit < 0) {
            return 'Debit and credit amounts must be non-negative.';
        }

        if (debit > 0 && credit > 0) {
            return 'Each journal line must have either a debit or a credit amount, not both.';
        }

        debitTotal += debit;
        creditTotal += credit;
    }

    if (toCents(debitTotal) !== toCents(creditTotal)) {
        return 'Debits and credits must balance.';
    }

    return null;
};

const fetchAccountsMap = async () => {
    const snapshot = await accountsCollection.orderBy('code', 'asc').get();
    const accounts = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as Account);
    return new Map<string, Account>(accounts.map((account: Account) => [account.id, account]));
};

const fetchJournalEntries = async () => {
    const snapshot = await journalEntriesCollection.orderBy('date', 'asc').get();
    return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as JournalEntry);
};


// POST /api/accounting/accounts/seed
router.post('/accounts/seed', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const existingSnapshot = await accountsCollection.orderBy('code', 'asc').get();
        if (existingSnapshot.docs.length > 0) {
            return res.json({ status: 'skipped', message: 'Chart of accounts already exists.' });
        }

        const batch = db.batch();
        DEFAULT_CHART_OF_ACCOUNTS.forEach(account => {
            const docRef = accountsCollection.doc(account.id);
            batch.set(docRef, buildAccount(account));
        });
        await batch.commit();

        res.json({ status: 'success', count: DEFAULT_CHART_OF_ACCOUNTS.length });
    } catch (error) {
        console.error('Error seeding chart of accounts:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/accounting/accounts
router.get('/accounts', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const snapshot = await accountsCollection.orderBy('code', 'asc').get();
        const accounts = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as Account);
        res.json(accounts);
    } catch (error) {
        console.error('Error listing accounts:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/accounting/accounts
router.post('/accounts', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<Account>;
        if (!body.name || !body.code || !body.type) {
            return res.status(400).json({ error: 'Account name, code, and type are required.' });
        }

        const now = Date.now();
        const accountId = body.id || body.code;
        const account: Account = {
            id: accountId,
            code: body.code,
            name: body.name,
            type: body.type,
            subType: body.subType,
            parentId: body.parentId,
            description: body.description,
            isActive: body.isActive ?? true,
            createdAt: body.createdAt ?? now,
            updatedAt: now
        };

        await accountsCollection.doc(accountId).set(account);
        res.json({ status: 'success', account });
    } catch (error) {
        console.error('Error saving account:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/accounting/accounts/:id
router.get('/accounts/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const doc = await accountsCollection.doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Account not found.' });
        }
        res.json(doc.data() as Account);
    } catch (error) {
        console.error('Error fetching account:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/accounting/accounts/:id
router.put('/accounts/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<Account>;
        const accountId = req.params.id;
        const docRef = accountsCollection.doc(accountId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Account not found.' });
        }

        const now = Date.now();
        await docRef.update({
            ...body,
            id: accountId,
            updatedAt: now
        });

        const updated = (await docRef.get()).data() as Account;
        res.json({ status: 'success', account: updated });
    } catch (error) {
        console.error('Error updating account:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/accounting/accounts/:id (soft deactivate)
router.delete('/accounts/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const accountId = req.params.id;
        const docRef = accountsCollection.doc(accountId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Account not found.' });
        }

        await docRef.update({
            isActive: false,
            updatedAt: Date.now()
        });
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error deactivating account:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// POST /api/accounting/journal-entries
router.post('/journal-entries', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<JournalEntry>;
        if (!body.date || !Array.isArray(body.lines)) {
            return res.status(400).json({ error: 'Journal entry date and lines are required.' });
        }

        const now = Date.now();
        const entryId = body.id || crypto.randomUUID();
        const entry: JournalEntry = {
            id: entryId,
            date: body.date,
            memo: body.memo,
            status: body.status ?? 'posted',
            currency: body.currency ?? DEFAULT_CURRENCY,
            lines: body.lines,
            sourceType: body.sourceType,
            sourceId: body.sourceId,
            createdBy: req.user?.uid || 'unknown',
            createdAt: body.createdAt ?? now,
            updatedAt: now
        };

        const validationError = validateJournalEntry(entry);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        await journalEntriesCollection.doc(entryId).set(entry);
        res.json({ status: 'success', entryId });
    } catch (error) {
        console.error('Error saving journal entry:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/accounting/journal-entries/:id
router.get('/journal-entries/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const doc = await journalEntriesCollection.doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Journal entry not found.' });
        }
        res.json(doc.data() as JournalEntry);
    } catch (error) {
        console.error('Error fetching journal entry:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/accounting/journal-entries/:id
router.put('/journal-entries/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const entryId = req.params.id;
        const body = req.body as Partial<JournalEntry>;
        const docRef = journalEntriesCollection.doc(entryId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Journal entry not found.' });
        }

        const existing = doc.data() as JournalEntry;
        const updated: JournalEntry = {
            ...existing,
            ...body,
            id: entryId,
            updatedAt: Date.now()
        };

        const validationError = validateJournalEntry(updated);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        await docRef.set(updated);
        res.json({ status: 'success', entryId });
    } catch (error) {
        console.error('Error updating journal entry:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/accounting/journal-entries/:id
router.delete('/journal-entries/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const docRef = journalEntriesCollection.doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Journal entry not found.' });
        }
        await docRef.delete();
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error deleting journal entry:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/accounting/journal-entries
router.get('/journal-entries', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const dateFrom = parseNumber(req.query.dateFrom);
        const dateTo = parseNumber(req.query.dateTo);
        const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;

        const entries = await fetchJournalEntries();
        const filtered = entries.filter((entry: JournalEntry) => {
            const inRange =
                (!Number.isFinite(dateFrom) || entry.date >= dateFrom) &&
                (!Number.isFinite(dateTo) || entry.date <= dateTo);
            if (!inRange) return false;
            if (!projectId) return true;
            return entry.lines.some((line: JournalLine) => line.projectId === projectId);
        });

        res.json(filtered);
    } catch (error) {
        console.error('Error listing journal entries:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/accounting/imports
router.post('/imports', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<AccountingImport>;
        if (!body.filename) {
            return res.status(400).json({ error: 'filename is required.' });
        }

        const now = Date.now();
        const importId = body.id || crypto.randomUUID();
        const storagePath = body.storagePath || `accounting/imports/${importId}/${body.filename}`;
        const currency = body.currency ?? DEFAULT_CURRENCY;
        const record: AccountingImport = {
            id: importId,
            filename: body.filename,
            storagePath,
            contentType: body.contentType,
            bankAccountId: body.bankAccountId ?? DEFAULT_BANK_ACCOUNT_ID,
            currency,
            status: 'uploaded',
            createdBy: req.user?.uid || 'unknown',
            createdAt: now,
            updatedAt: now
        };

        await importsCollection.doc(importId).set(record);

        let uploadUrl: string | undefined;
        if (body.contentType) {
            uploadUrl = await generateSignedUploadUrl(storagePath, body.contentType);
        }

        res.json({ status: 'success', import: record, uploadUrl });
    } catch (error) {
        console.error('Error creating import:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/accounting/imports
router.get('/imports', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const snapshot = await importsCollection.orderBy('createdAt', 'desc').get();
        const records = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as AccountingImport);
        res.json(records);
    } catch (error) {
        console.error('Error listing imports:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/accounting/imports/:id
router.get('/imports/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const doc = await importsCollection.doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Import not found.' });
        }
        res.json(doc.data() as AccountingImport);
    } catch (error) {
        console.error('Error fetching import:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/accounting/imports/:id/process
router.post('/imports/:id/process', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const importId = req.params.id;
        const body = req.body as { csvText?: string; storagePath?: string };
        const docRef = importsCollection.doc(importId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Import not found.' });
        }

        const record = doc.data() as AccountingImport;
        if (record.status === 'processed') {
            return res.json({ status: 'skipped', message: 'Import already processed.' });
        }

        await docRef.update({ status: 'processing', updatedAt: Date.now() });

        let csvText = body.csvText;
        const storagePath = body.storagePath || record.storagePath;
        if (!csvText && storagePath) {
            const [buffer] = await storage.bucket().file(storagePath).download();
            csvText = buffer.toString('utf-8');
        }

        if (!csvText) {
            await docRef.update({ status: 'error', errorMessage: 'No CSV content provided.', updatedAt: Date.now() });
            return res.status(400).json({ error: 'No CSV content provided.' });
        }

        const rows = parseCsvToTransactions(csvText);
        const rules = await fetchRules();

        const batch = db.batch();
        let createdCount = 0;
        let categorizedCount = 0;
        let postedCount = 0;

        for (const row of rows) {
            const transactionId = crypto.randomUUID();
            const matchedRule = rules.find((rule: CategorizationRule) => rule.isActive && row.description.toLowerCase().includes(rule.matchText.toLowerCase()));
            const status: BankTransaction['status'] = matchedRule ? 'categorized' : 'uncategorized';
            const transaction: BankTransaction = {
                id: transactionId,
                importId,
                date: row.date,
                description: row.description,
                amount: row.amount,
                memo: row.memo,
                currency: record.currency,
                status,
                accountId: matchedRule?.accountId,
                projectId: matchedRule?.projectId,
                categoryConfidence: matchedRule ? 0.7 : undefined,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            if (matchedRule) {
                categorizedCount += 1;
                if (matchedRule.autoPost) {
                    const journalEntryId = await createJournalEntryForTransaction(
                        transaction,
                        record.bankAccountId || DEFAULT_BANK_ACCOUNT_ID,
                        matchedRule.accountId,
                        req.user?.uid || 'unknown'
                    );
                    transaction.journalEntryId = journalEntryId;
                    transaction.status = 'posted';
                    postedCount += 1;
                }
            }

            batch.set(transactionsCollection.doc(transactionId), transaction);
            createdCount += 1;
        }

        await batch.commit();
        await docRef.update({
            status: 'processed',
            processedAt: Date.now(),
            updatedAt: Date.now()
        });

        res.json({ status: 'success', createdCount, categorizedCount, postedCount });
    } catch (error) {
        console.error('Error processing import:', error);
        await importsCollection.doc(req.params.id).update({
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Processing error',
            updatedAt: Date.now()
        });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/accounting/transactions
router.get('/transactions', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const importId = typeof req.query.importId === 'string' ? req.query.importId : undefined;

        const snapshot = await transactionsCollection.orderBy('date', 'desc').get();
        let transactions = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as BankTransaction);
        if (status) {
            transactions = transactions.filter((txn: BankTransaction) => txn.status === status);
        }
        if (importId) {
            transactions = transactions.filter((txn: BankTransaction) => txn.importId === importId);
        }
        res.json(transactions);
    } catch (error) {
        console.error('Error listing transactions:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/accounting/transactions/:id/categorize
router.post('/transactions/:id/categorize', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const transactionId = req.params.id;
        const body = req.body as { accountId?: string; projectId?: string; postToLedger?: boolean; bankAccountId?: string };
        if (!body.accountId) {
            return res.status(400).json({ error: 'accountId is required.' });
        }

        const docRef = transactionsCollection.doc(transactionId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        const transaction = doc.data() as BankTransaction;
        let journalEntryId = transaction.journalEntryId;
        let status: BankTransaction['status'] = 'categorized';
        if (body.postToLedger) {
            journalEntryId = await createJournalEntryForTransaction(
                { ...transaction, accountId: body.accountId, projectId: body.projectId },
                body.bankAccountId || DEFAULT_BANK_ACCOUNT_ID,
                body.accountId,
                req.user?.uid || 'unknown'
            );
            status = 'posted';
        }

        await docRef.update({
            accountId: body.accountId,
            projectId: body.projectId,
            status,
            journalEntryId,
            updatedAt: Date.now()
        });

        res.json({ status: 'success', journalEntryId });
    } catch (error) {
        console.error('Error categorizing transaction:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/accounting/receipts
router.post('/receipts', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<Receipt>;
        const filename = body.filename || extractFilename((body as { imagePath?: string }).imagePath);
        if (!filename) {
            return res.status(400).json({ error: 'filename is required.' });
        }

        const now = Date.now();
        const receiptId = body.id || crypto.randomUUID();
        const storagePath = body.storagePath || `accounting/receipts/${receiptId}/${filename}`;
        const extracted = normalizeReceiptExtraction(body.extracted as ReceiptExtraction);
        const cleanedExtracted = extracted ? stripUndefined(extracted as Record<string, unknown>) as ReceiptExtraction : undefined;
        const details = normalizeReceiptDetails(body as Record<string, unknown>);
        const mergedDetails = {
            ...details,
            merchantName: details.merchantName ?? extracted?.merchantName ?? extracted?.merchant,
            subtotal: details.subtotal ?? extracted?.subtotal,
            tax: details.tax ?? extracted?.tax,
            total: details.total ?? extracted?.total ?? extracted?.totalAmount,
            currency: details.currency ?? extracted?.currency
        };
        const merchantId = await upsertMerchant(mergedDetails.merchantName);
        const validationWarnings = validateReceiptTotals(mergedDetails);
        const record: Receipt = {
            id: receiptId,
            filename,
            storagePath,
            contentType: body.contentType,
            status: 'uploaded',
            extracted: cleanedExtracted,
            rawOcrText: details.rawOcrText,
            rawLines: details.rawLines,
            parsedSource: details.parsedSource,
            parseConfidence: details.parseConfidence,
            processingVersion: details.processingVersion ?? 'v1',
            merchantName: mergedDetails.merchantName,
            merchantId,
            transactionDate: details.transactionDate,
            subtotal: mergedDetails.subtotal,
            tax: mergedDetails.tax,
            total: mergedDetails.total,
            currency: mergedDetails.currency,
            paymentMethod: details.paymentMethod,
            cardLast4: details.cardLast4,
            authCode: details.authCode,
            tenderType: details.tenderType,
            returnPolicyText: details.returnPolicyText,
            lineItems: details.lineItems,
            validationWarnings: validationWarnings.length ? validationWarnings : undefined,
            linkedTransactionId: body.linkedTransactionId,
            createdBy: req.user?.uid || 'unknown',
            createdAt: now,
            updatedAt: now
        };

        await receiptsCollection.doc(receiptId).set(stripUndefined(record as unknown as Record<string, unknown>));

        void enrichReceiptAsync(receiptId, {
            rawOcrText: details.rawOcrText,
            rawLines: details.rawLines,
            extracted: body.extracted as Record<string, unknown>,
            items: (body as Record<string, unknown>).items,
            returnPolicyText: details.returnPolicyText,
            paymentMethod: details.paymentMethod,
            source: 'auto'
        });

        let uploadUrl: string | undefined;
        if (body.contentType) {
            uploadUrl = await generateSignedUploadUrl(storagePath, body.contentType);
        }

        res.json({ status: 'success', receipt: record, uploadUrl });
    } catch (error) {
        console.error('Error creating receipt:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
    }
});

// GET /api/accounting/receipts
router.get('/receipts', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const snapshot = await receiptsCollection.orderBy('createdAt', 'desc').get();
        const receipts = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as Receipt);
        res.json(receipts);
    } catch (error) {
        console.error('Error listing receipts:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/accounting/receipts/:id
router.get('/receipts/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const doc = await receiptsCollection.doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Receipt not found.' });
        }
        res.json(doc.data() as Receipt);
    } catch (error) {
        console.error('Error fetching receipt:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/accounting/receipts/:id/process
router.post('/receipts/:id/process', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const receiptId = req.params.id;
        const body = req.body as { rawText?: string; extracted?: ReceiptExtraction | Record<string, unknown> };
        const docRef = receiptsCollection.doc(receiptId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Receipt not found.' });
        }

        await docRef.update({ status: 'processing', updatedAt: Date.now() });

        if (!body.rawText && !body.extracted) {
            await docRef.update({
                status: 'error',
                errorMessage: 'rawText or extracted data is required for processing.',
                updatedAt: Date.now()
            });
            return res.status(400).json({ error: 'rawText or extracted data is required for processing.' });
        }

        const normalizedExtracted = normalizeReceiptExtraction(body.extracted as Record<string, unknown>);
        const extracted = normalizedExtracted
            ? {
                ...normalizedExtracted,
                rawText: normalizedExtracted.rawText || body.rawText
            }
            : extractReceiptData(body.rawText);
        const cleanedExtracted = stripUndefined(extracted as Record<string, unknown>) as ReceiptExtraction;

        const details = normalizeReceiptDetails({
            ...((body.extracted || {}) as Record<string, unknown>),
            rawText: body.rawText
        });
        const mergedDetails = {
            ...details,
            merchantName: details.merchantName ?? extracted.merchantName ?? extracted.merchant,
            subtotal: details.subtotal ?? extracted.subtotal,
            tax: details.tax ?? extracted.tax,
            total: details.total ?? extracted.total ?? extracted.totalAmount,
            currency: details.currency ?? extracted.currency
        };
        const merchantId = await upsertMerchant(mergedDetails.merchantName);
        const validationWarnings = validateReceiptTotals(mergedDetails);
        let linkedTransactionId: string | undefined;
        const match = await findMatchingTransaction(extracted.total, extracted.date);
        if (match) {
            linkedTransactionId = match.id;
            await transactionsCollection.doc(match.id).update({
                receiptId,
                updatedAt: Date.now()
            });
        }

        await docRef.update(stripUndefined({
            status: 'processed',
            extracted: cleanedExtracted,
            rawOcrText: details.rawOcrText,
            rawLines: details.rawLines,
            parsedSource: details.parsedSource,
            parseConfidence: details.parseConfidence,
            processingVersion: details.processingVersion ?? 'v1',
            merchantName: mergedDetails.merchantName,
            merchantId,
            transactionDate: details.transactionDate,
            subtotal: mergedDetails.subtotal,
            tax: mergedDetails.tax,
            total: mergedDetails.total,
            currency: mergedDetails.currency,
            paymentMethod: details.paymentMethod,
            cardLast4: details.cardLast4,
            authCode: details.authCode,
            tenderType: details.tenderType,
            returnPolicyText: details.returnPolicyText,
            lineItems: details.lineItems,
            validationWarnings: validationWarnings.length ? validationWarnings : undefined,
            linkedTransactionId,
            processedAt: Date.now(),
            updatedAt: Date.now()
        }));

        void enrichReceiptAsync(receiptId, {
            rawOcrText: details.rawOcrText,
            rawLines: details.rawLines,
            extracted: body.extracted as Record<string, unknown>,
            items: (body.extracted as Record<string, unknown>)?.items,
            returnPolicyText: details.returnPolicyText,
            paymentMethod: details.paymentMethod,
            source: 'auto'
        });

        res.json({ status: 'success', linkedTransactionId });
    } catch (error) {
        console.error('Error processing receipt:', error);
        await receiptsCollection.doc(req.params.id).update({
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Processing error',
            updatedAt: Date.now()
        });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
    }
});

// POST /api/accounting/receipts/:id/link-transaction
router.post('/receipts/:id/link-transaction', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const receiptId = req.params.id;
        const body = req.body as { transactionId?: string };
        if (!body.transactionId) {
            return res.status(400).json({ error: 'transactionId is required.' });
        }

        const receiptRef = receiptsCollection.doc(receiptId);
        const receiptDoc = await receiptRef.get();
        if (!receiptDoc.exists) {
            return res.status(404).json({ error: 'Receipt not found.' });
        }

        const txnRef = transactionsCollection.doc(body.transactionId);
        const txnDoc = await txnRef.get();
        if (!txnDoc.exists) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        await receiptRef.update({
            linkedTransactionId: body.transactionId,
            updatedAt: Date.now()
        });
        await txnRef.update({
            receiptId,
            updatedAt: Date.now()
        });

        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error linking receipt:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/accounting/receipts/:id/enrich
router.post('/receipts/:id/enrich', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const receiptId = req.params.id;
        const doc = await receiptsCollection.doc(receiptId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Receipt not found.' });
        }

        const receipt = doc.data() as Receipt;
        await enrichReceiptAsync(receiptId, {
            rawOcrText: receipt.rawOcrText,
            rawLines: receipt.rawLines,
            extracted: receipt.extracted as Record<string, unknown>,
            items: receipt.lineItems,
            returnPolicyText: receipt.returnPolicyText,
            paymentMethod: receipt.paymentMethod,
            source: 'manual'
        });

        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error enriching receipt:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
    }
});

// POST /api/accounting/receipts/enrich
router.post('/receipts/enrich', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as { status?: Receipt['status']; limit?: number };
        const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 100) : 25;

        const snapshot = await receiptsCollection.orderBy('createdAt', 'desc').get();
        let receipts = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as Receipt);
        if (body.status) {
            receipts = receipts.filter((receipt: Receipt) => receipt.status === body.status);
        }

        const targetReceipts = receipts.slice(0, limit);
        for (const receipt of targetReceipts) {
            await enrichReceiptAsync(receipt.id, {
                rawOcrText: receipt.rawOcrText,
                rawLines: receipt.rawLines,
                extracted: receipt.extracted as Record<string, unknown>,
                items: receipt.lineItems,
                returnPolicyText: receipt.returnPolicyText,
                paymentMethod: receipt.paymentMethod,
                source: 'manual'
            });
        }

        res.json({ status: 'success', enrichedCount: targetReceipts.length });
    } catch (error) {
        console.error('Error enriching receipts:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
    }
});

// GET /api/accounting/rules
router.get('/rules', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const snapshot = await rulesCollection.orderBy('priority', 'desc').get();
        const rules = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as CategorizationRule);
        res.json(rules);
    } catch (error) {
        console.error('Error listing rules:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/accounting/rules
router.post('/rules', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<CategorizationRule>;
        if (!body.name || !body.matchText || !body.accountId) {
            return res.status(400).json({ error: 'name, matchText, and accountId are required.' });
        }

        const now = Date.now();
        const ruleId = body.id || crypto.randomUUID();
        const rule: CategorizationRule = {
            id: ruleId,
            name: body.name,
            matchText: body.matchText,
            accountId: body.accountId,
            projectId: body.projectId,
            priority: body.priority ?? 0,
            isActive: body.isActive ?? true,
            autoPost: body.autoPost ?? false,
            createdAt: body.createdAt ?? now,
            updatedAt: now
        };

        await rulesCollection.doc(ruleId).set(rule);
        res.json({ status: 'success', rule });
    } catch (error) {
        console.error('Error creating rule:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/accounting/rules/:id
router.put('/rules/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const ruleId = req.params.id;
        const docRef = rulesCollection.doc(ruleId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Rule not found.' });
        }

        await docRef.update({
            ...req.body,
            id: ruleId,
            updatedAt: Date.now()
        });
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error updating rule:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/accounting/rules/:id (soft deactivate)
router.delete('/rules/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const ruleId = req.params.id;
        const docRef = rulesCollection.doc(ruleId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Rule not found.' });
        }

        await docRef.update({
            isActive: false,
            updatedAt: Date.now()
        });
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error deleting rule:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/accounting/reports/pl
router.get('/reports/pl', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const dateFrom = parseNumber(req.query.dateFrom);
        const dateTo = parseNumber(req.query.dateTo);
        const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;

        if (!Number.isFinite(dateFrom) || !Number.isFinite(dateTo)) {
            return res.status(400).json({ error: 'dateFrom and dateTo are required.' });
        }

        const accountsMap = await fetchAccountsMap();
        const entries = await fetchJournalEntries();

        const lineTotals = new Map<string, number>();
        let revenueTotal = 0;
        let cogsTotal = 0;
        let expenseTotal = 0;

        for (const entry of entries) {
            if (entry.status !== 'posted') continue;
            if (entry.date < dateFrom || entry.date > dateTo) continue;

            for (const line of entry.lines) {
                if (projectId && line.projectId !== projectId) continue;

                const account = accountsMap.get(line.accountId);
                if (!account) continue;

                if (account.type === 'revenue' || account.type === 'cogs' || account.type === 'expense') {
                    const amount =
                        account.type === 'revenue'
                            ? roundToCents(line.credit - line.debit)
                            : roundToCents(line.debit - line.credit);
                    const current = lineTotals.get(account.id) ?? 0;
                    lineTotals.set(account.id, roundToCents(current + amount));

                    if (account.type === 'revenue') revenueTotal += amount;
                    if (account.type === 'cogs') cogsTotal += amount;
                    if (account.type === 'expense') expenseTotal += amount;
                }
            }
        }

        const lines = Array.from(lineTotals.entries()).map(([accountId, amount]) => {
            const account = accountsMap.get(accountId)!;
            return {
                accountId,
                accountName: account.name,
                accountType: account.type as 'revenue' | 'cogs' | 'expense',
                amount: roundToCents(amount)
            };
        });

        const report: ProfitLossReport = {
            currency: DEFAULT_CURRENCY,
            dateFrom,
            dateTo,
            projectId,
            revenueTotal: roundToCents(revenueTotal),
            cogsTotal: roundToCents(cogsTotal),
            expenseTotal: roundToCents(expenseTotal),
            netIncome: roundToCents(revenueTotal - cogsTotal - expenseTotal),
            lines
        };

        res.json(report);
    } catch (error) {
        console.error('Error generating P&L report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/accounting/reports/balance-sheet
router.get('/reports/balance-sheet', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const asOf = parseNumber(req.query.asOf);
        const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;

        if (!Number.isFinite(asOf)) {
            return res.status(400).json({ error: 'asOf is required.' });
        }

        const accountsMap = await fetchAccountsMap();
        const entries = await fetchJournalEntries();

        const lineTotals = new Map<string, number>();
        let assetsTotal = 0;
        let liabilitiesTotal = 0;
        let equityTotal = 0;
        let netIncome = 0;

        const startOfYear = new Date(new Date(asOf).getFullYear(), 0, 1).getTime();

        for (const entry of entries) {
            if (entry.status !== 'posted') continue;
            if (entry.date > asOf) continue;

            for (const line of entry.lines) {
                if (projectId && line.projectId !== projectId) continue;

                const account = accountsMap.get(line.accountId);
                if (!account) continue;

                if (account.type === 'asset' || account.type === 'liability' || account.type === 'equity') {
                    const amount =
                        account.type === 'asset'
                            ? roundToCents(line.debit - line.credit)
                            : roundToCents(line.credit - line.debit);
                    const current = lineTotals.get(account.id) ?? 0;
                    lineTotals.set(account.id, roundToCents(current + amount));

                    if (account.type === 'asset') assetsTotal += amount;
                    if (account.type === 'liability') liabilitiesTotal += amount;
                    if (account.type === 'equity') equityTotal += amount;
                }

                if (entry.date >= startOfYear) {
                    if (account.type === 'revenue') {
                        netIncome += roundToCents(line.credit - line.debit);
                    }
                    if (account.type === 'cogs' || account.type === 'expense') {
                        netIncome -= roundToCents(line.debit - line.credit);
                    }
                }
            }
        }

        const lines = Array.from(lineTotals.entries()).map(([accountId, amount]) => {
            const account = accountsMap.get(accountId)!;
            return {
                accountId,
                accountName: account.name,
                accountType: account.type as 'asset' | 'liability' | 'equity',
                amount: roundToCents(amount)
            };
        });

        const report: BalanceSheetReport = {
            currency: DEFAULT_CURRENCY,
            asOf,
            projectId,
            assetsTotal: roundToCents(assetsTotal),
            liabilitiesTotal: roundToCents(liabilitiesTotal),
            equityTotal: roundToCents(equityTotal),
            netIncome: roundToCents(netIncome),
            lines
        };

        res.json(report);
    } catch (error) {
        console.error('Error generating balance sheet report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
