import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/config/firebase.js';
import { enrichReceiptAsync } from '../src/services/receiptEnrichment.js';
import { type Receipt } from '@construction/shared';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const receiptsCollection = db.collection('receipts');

const run = async () => {
    console.log('Starting receipt enrichment script...');

    const snapshot = await receiptsCollection.orderBy('createdAt', 'desc').get();
    const receipts = snapshot.docs.map(doc => doc.data() as Receipt);

    if (!receipts.length) {
        console.log('No receipts found.');
        return;
    }

    const target = receipts.find(receipt => receipt.status === 'processed')
        || receipts.find(receipt => receipt.status === 'uploaded')
        || receipts[0];

    if (!target) {
        console.log('No receipt selected for enrichment.');
        return;
    }

    console.log(`Enriching receipt: ${target.id} (status: ${target.status})`);

    await enrichReceiptAsync(target.id, {
        rawOcrText: target.rawOcrText,
        rawLines: target.rawLines,
        extracted: target.extracted as Record<string, unknown>,
        items: target.lineItems,
        returnPolicyText: target.returnPolicyText,
        paymentMethod: target.paymentMethod,
        source: 'manual'
    });

    console.log('Enrichment completed.');
};

run()
    .then(() => {
        console.log('Done.');
        process.exit(0);
    })
    .catch(error => {
        console.error('Enrichment script failed:', error);
        process.exit(1);
    });
