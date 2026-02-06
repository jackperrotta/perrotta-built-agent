import { db } from '../config/firebase.js';
import { type Receipt, type ReceiptLineItem } from '@construction/shared';

const receiptsCollection = db.collection('receipts');
const receiptsEnrichmentLogsCollection = db.collection('receipts_enrichment_logs');
const ENRICHMENT_MODEL = 'gpt-4o-mini';

type EnrichmentInput = {
    rawOcrText?: string;
    rawLines?: string[];
    extracted?: Record<string, unknown>;
    items?: unknown;
    returnPolicyText?: string;
    paymentMethod?: string;
    source?: 'auto' | 'manual';
};

const stripUndefined = <T extends Record<string, unknown>>(data: T): T => {
    return Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined)
    ) as T;
};

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === 'string' && value.trim().length > 0;
};

const normalizeLineItems = (items?: unknown): ReceiptLineItem[] | undefined => {
    if (!Array.isArray(items)) return undefined;
    const normalized = items.map(item => {
        const record = item as Record<string, unknown>;
        return stripUndefined({
            description: isNonEmptyString(record.description) ? record.description.trim() : undefined,
            descriptionRaw: isNonEmptyString(record.descriptionRaw) ? record.descriptionRaw.trim() : undefined,
            quantity: typeof record.quantity === 'number' ? record.quantity : undefined,
            unitPrice: typeof record.unitPrice === 'number' ? record.unitPrice : undefined,
            amount: typeof record.amount === 'number' ? record.amount : undefined,
            category: isNonEmptyString(record.category) ? record.category.trim() : undefined,
            sku: isNonEmptyString(record.sku) ? record.sku.trim() : undefined,
            upc: isNonEmptyString(record.upc) ? record.upc.trim() : undefined,
            taxable: typeof record.taxable === 'boolean' ? record.taxable : undefined
        });
    });
    return normalized;
};

const mergeIfMissing = <T extends Record<string, unknown>>(target: T, source: T) => {
    const result = { ...target };
    Object.entries(source).forEach(([key, value]) => {
        if (result[key] === undefined && value !== undefined) {
            result[key] = value;
        }
    });
    return result as T;
};

const buildPrompt = (input: EnrichmentInput) => {
    return [
        'You are an expert in extracting structured receipt data.',
        'Return ONLY valid JSON with the schema below. Do not include markdown.',
        '',
        'Schema:',
        '{',
        '  "merchantName": "string | null",',
        '  "merchantPhone": "string | null",',
        '  "merchantAddressLine1": "string | null",',
        '  "merchantCity": "string | null",',
        '  "merchantState": "string | null",',
        '  "merchantPostalCode": "string | null",',
        '  "transactionDate": "number (ms) | null",',
        '  "transactionTime": "string | null",',
        '  "timezone": "string | null",',
        '  "subtotal": "number | null",',
        '  "tax": "number | null",',
        '  "total": "number | null",',
        '  "currency": "string | null",',
        '  "discounts": "number | null",',
        '  "tip": "number | null",',
        '  "paymentMethod": "string | null",',
        '  "cardLast4": "string | null",',
        '  "authCode": "string | null",',
        '  "tenderType": "string | null",',
        '  "returnPolicyText": "string | null",',
        '  "returnPolicyDays": "number | null",',
        '  "returnPolicyExpiresAt": "number (ms) | null",',
        '  "lineItems": [',
        '    {',
        '      "description": "string | null",',
        '      "quantity": "number | null",',
        '      "unitPrice": "number | null",',
        '      "amount": "number | null",',
        '      "category": "string | null"',
        '    }',
        '  ],',
        '  "parseConfidence": "number (0-1) | null"',
        '}',
        '',
        'Input:',
        JSON.stringify(input, null, 2)
    ].join('\n');
};

const parseModelJson = (text: string) => {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
};

const callOpenAI = async (prompt: string) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return undefined;

    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: ENRICHMENT_MODEL,
            input: prompt,
            temperature: 0.1
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI error: ${text}`);
    }

    const data = await response.json();
    const outputText = data.output_text as string | undefined;
    return outputText;
};

export const enrichReceiptAsync = async (receiptId: string, input: EnrichmentInput) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn('Receipt enrichment skipped: OPENAI_API_KEY not set.');
        return;
    }

    const hasInput = isNonEmptyString(input.rawOcrText)
        || (Array.isArray(input.rawLines) && input.rawLines.length > 0)
        || (Array.isArray(input.items) && input.items.length > 0);
    if (!hasInput) {
        console.warn('Receipt enrichment skipped: no OCR text, lines, or items.');
        return;
    }

    const startTime = Date.now();
    const logRef = receiptsEnrichmentLogsCollection.doc();
    const logPayload = stripUndefined({
        receiptId,
        status: 'started',
        source: input.source ?? 'auto',
        model: ENRICHMENT_MODEL,
        startedAt: startTime,
        inputSummary: {
            hasRawOcrText: isNonEmptyString(input.rawOcrText),
            rawLinesCount: Array.isArray(input.rawLines) ? input.rawLines.length : 0,
            hasItems: Array.isArray(input.items) && input.items.length > 0
        }
    });
    await logRef.set(logPayload);

    try {
        const docRef = receiptsCollection.doc(receiptId);
        const doc = await docRef.get();
        if (!doc.exists) {
            await logRef.update({
                status: 'error',
                errorMessage: 'Receipt not found.',
                finishedAt: Date.now(),
                durationMs: Date.now() - startTime
            });
            return;
        }
        const existing = doc.data() as Receipt;

        const prompt = buildPrompt(input);
        console.log(`Receipt enrichment prompt length: ${prompt.length}`);
        const outputText = await callOpenAI(prompt);
        if (!outputText) {
            await logRef.update({
                status: 'error',
                errorMessage: 'No output_text returned from OpenAI.',
                finishedAt: Date.now(),
                durationMs: Date.now() - startTime
            });
            return;
        }

        const parsed = parseModelJson(outputText);
        if (!parsed || typeof parsed !== 'object') {
            await logRef.update({
                status: 'error',
                errorMessage: 'Failed to parse OpenAI JSON response.',
                finishedAt: Date.now(),
                durationMs: Date.now() - startTime
            });
            return;
        }

        const aiLineItems = normalizeLineItems((parsed as Record<string, unknown>).lineItems);
        const updatePayload = mergeIfMissing(stripUndefined({
            merchantName: isNonEmptyString(parsed.merchantName) ? parsed.merchantName : undefined,
            merchantPhone: isNonEmptyString(parsed.merchantPhone) ? parsed.merchantPhone : undefined,
            merchantAddressLine1: isNonEmptyString(parsed.merchantAddressLine1) ? parsed.merchantAddressLine1 : undefined,
            merchantCity: isNonEmptyString(parsed.merchantCity) ? parsed.merchantCity : undefined,
            merchantState: isNonEmptyString(parsed.merchantState) ? parsed.merchantState : undefined,
            merchantPostalCode: isNonEmptyString(parsed.merchantPostalCode) ? parsed.merchantPostalCode : undefined,
            transactionDate: typeof parsed.transactionDate === 'number' ? parsed.transactionDate : undefined,
            transactionTime: isNonEmptyString(parsed.transactionTime) ? parsed.transactionTime : undefined,
            timezone: isNonEmptyString(parsed.timezone) ? parsed.timezone : undefined,
            subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : undefined,
            tax: typeof parsed.tax === 'number' ? parsed.tax : undefined,
            total: typeof parsed.total === 'number' ? parsed.total : undefined,
            currency: isNonEmptyString(parsed.currency) ? parsed.currency : undefined,
            discounts: typeof parsed.discounts === 'number' ? parsed.discounts : undefined,
            tip: typeof parsed.tip === 'number' ? parsed.tip : undefined,
            paymentMethod: isNonEmptyString(parsed.paymentMethod) ? parsed.paymentMethod : undefined,
            cardLast4: isNonEmptyString(parsed.cardLast4) ? parsed.cardLast4 : undefined,
            authCode: isNonEmptyString(parsed.authCode) ? parsed.authCode : undefined,
            tenderType: isNonEmptyString(parsed.tenderType) ? parsed.tenderType : undefined,
            returnPolicyText: isNonEmptyString(parsed.returnPolicyText) ? parsed.returnPolicyText : undefined,
            returnPolicyDays: typeof parsed.returnPolicyDays === 'number' ? parsed.returnPolicyDays : undefined,
            returnPolicyExpiresAt: typeof parsed.returnPolicyExpiresAt === 'number' ? parsed.returnPolicyExpiresAt : undefined,
            lineItems: aiLineItems && aiLineItems.length > 0 ? aiLineItems : undefined,
            parseConfidence: typeof parsed.parseConfidence === 'number' ? parsed.parseConfidence : undefined,
            parsedSource: existing.parsedSource ?? 'openai',
            processingVersion: existing.processingVersion ?? 'ai-v1',
            updatedAt: Date.now()
        }), existing as Record<string, unknown>);

        await docRef.update(updatePayload);

        await logRef.update({
            status: 'success',
            finishedAt: Date.now(),
            durationMs: Date.now() - startTime,
            outputSummary: {
                hasMerchantName: isNonEmptyString(parsed.merchantName),
                hasTotals: typeof parsed.total === 'number' || typeof parsed.subtotal === 'number',
                lineItemCount: Array.isArray(parsed.lineItems) ? parsed.lineItems.length : 0
            }
        });
    } catch (error) {
        console.error('Receipt enrichment error:', error);
        await logRef.update({
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Enrichment error',
            finishedAt: Date.now(),
            durationMs: Date.now() - startTime
        });
    }
};
