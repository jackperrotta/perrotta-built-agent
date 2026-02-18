export type Unit = 'feet' | 'meters' | 'inches';

export interface User {
    id: string;
    email: string;
    displayName?: string;
    ownedProperties: string[];
}

export interface Property {
    id: string;
    ownerId: string;
    address: string;
    name?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type ScanSegmentType =
    | 'FirstFloor'
    | 'SecondFloor'
    | 'Basement'
    | 'Attic'
    | 'Backyard'
    | 'FrontYard'
    | 'Bathroom'
    | 'LivingArea';

export interface ScanSegment {
    id: string;
    type: ScanSegmentType;
    startTime: number; // Timestamp
    endTime: number; // Timestamp
    roomPlanModelUrl?: string;
    arWorldMapUrl?: string;
    videoChunkUrl?: string;
    roomPlanJSONRemoteURL?: string;
}

export interface CapturedImage {
    segmentID: string;
    imageUrl: string;
    worldTransform: number[]; // 16 numbers (simd_float4x4 flat array)
    nearestSurfaceDistance: number;
    nearestSurfaceNormal: [number, number, number];
}

export interface Stairway {
    fromSegmentID: string;
    toSegmentID: string;
    startPoint: [number, number, number];
    endPoint: [number, number, number];
    stepCountEstimate: number;
}

export interface ScanSession {
    id: string;
    createdAt: number; // Timestamp
    segments: ScanSegment[];
    capturedImages: CapturedImage[];
    stairways: Stairway[];
    audioRecordingUrl?: string;
    projectId?: string;
}

// API Request/Response Types
export interface UploadUrlRequest {
    filename: string;
    contentType: string;
}

export interface UploadUrlResponse {
    uploadUrl: string;
}

export interface CreateSessionResponse {
    status: 'success' | 'error';
    sessionId: string;
}


export interface ExtractedNote {
    id: string;
    segmentId: string;
    roomId?: string;
    content: string;
    category: 'structural' | 'mep' | 'code' | 'opportunity' | 'risk';
    confidence: number;
    timestampStart?: number;
    timestampEnd?: number;
}

// --- Accounting & Financials (Phase 1) ---
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense';

export type AccountSubType =
    | 'current_asset'
    | 'fixed_asset'
    | 'contra_asset'
    | 'current_liability'
    | 'long_term_liability'
    | 'equity'
    | 'operating_revenue'
    | 'other_income'
    | 'direct_cost'
    | 'operating_expense';

export interface Account {
    id: string;
    code: string;
    name: string;
    type: AccountType;
    subType?: AccountSubType;
    parentId?: string;
    description?: string;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface Project {
    id: string;
    name: string;
    address: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    projectType: 'flip' | 'remodel' | 'addition' | 'other';
    customerId?: string;
    status?: 'estimate' | 'active' | 'on_hold' | 'completed' | 'archived';
    startDate?: number;
    endDate?: number;
    scanSessionIds?: string[];
    createdAt: number;
    updatedAt: number;
}

export interface JournalLine {
    accountId: string;
    debit: number;
    credit: number;
    projectId?: string;
    tagIds?: string[];
    memo?: string;
    vendorId?: string;
    customerId?: string;
}

export interface JournalEntry {
    id: string;
    date: number;
    memo?: string;
    status: 'draft' | 'posted';
    currency: string;
    lines: JournalLine[];
    sourceType?: string;
    sourceId?: string;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}

export interface ProfitLossLine {
    accountId: string;
    accountName: string;
    accountType: 'revenue' | 'cogs' | 'expense';
    amount: number;
}

export interface ProfitLossReport {
    currency: string;
    dateFrom: number;
    dateTo: number;
    projectId?: string;
    revenueTotal: number;
    cogsTotal: number;
    expenseTotal: number;
    netIncome: number;
    lines: ProfitLossLine[];
}

export interface BalanceSheetLine {
    accountId: string;
    accountName: string;
    accountType: 'asset' | 'liability' | 'equity';
    amount: number;
}

export interface BalanceSheetReport {
    currency: string;
    asOf: number;
    projectId?: string;
    assetsTotal: number;
    liabilitiesTotal: number;
    equityTotal: number;
    netIncome: number;
    lines: BalanceSheetLine[];
}

export type ImportStatus = 'uploaded' | 'processing' | 'processed' | 'error';
export type TransactionStatus = 'uncategorized' | 'categorized' | 'posted';

export interface AccountingImport {
    id: string;
    filename: string;
    storagePath?: string;
    contentType?: string;
    bankAccountId?: string;
    currency: string;
    status: ImportStatus;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    processedAt?: number;
    errorMessage?: string;
}

export interface BankTransaction {
    id: string;
    importId: string;
    date: number;
    description: string;
    amount: number;
    currency: string;
    status: TransactionStatus;
    accountId?: string;
    projectId?: string;
    memo?: string;
    categoryConfidence?: number;
    journalEntryId?: string;
    receiptId?: string;
    createdAt: number;
    updatedAt: number;
}

export interface CategorizationRule {
    id: string;
    name: string;
    matchText: string;
    accountId: string;
    projectId?: string;
    priority: number;
    isActive: boolean;
    autoPost: boolean;
    createdAt: number;
    updatedAt: number;
}

export type ReceiptStatus = 'uploaded' | 'processing' | 'processed' | 'error';

export interface ReceiptExtraction {
    merchant?: string;
    merchantName?: string;
    total?: number;
    totalAmount?: number;
    subtotal?: number;
    tax?: number;
    date?: number;
    currency?: string;
    confidence?: number;
    rawText?: string;
}

export interface ReceiptLineItem {
    id?: string;
    description?: string;
    descriptionRaw?: string;
    quantity?: number;
    unitPrice?: number;
    amount?: number;
    category?: string;
    sku?: string;
    upc?: string;
    taxable?: boolean;
}

export interface Receipt {
    id: string;
    filename: string;
    storagePath?: string;
    contentType?: string;
    status: ReceiptStatus;
    extracted?: ReceiptExtraction;
    rawOcrText?: string;
    rawLines?: string[];
    parsedSource?: string;
    parseConfidence?: number;
    processingVersion?: string;
    merchantName?: string;
    merchantId?: string;
    storeId?: string;
    merchantPhone?: string;
    merchantAddressLine1?: string;
    merchantCity?: string;
    merchantState?: string;
    merchantPostalCode?: string;
    geoLat?: number;
    geoLng?: number;
    transactionDate?: number;
    transactionTime?: string;
    timezone?: string;
    subtotal?: number;
    tax?: number;
    total?: number;
    currency?: string;
    discounts?: number;
    tip?: number;
    paymentMethod?: string;
    cardLast4?: string;
    authCode?: string;
    tenderType?: string;
    returnPolicyText?: string;
    returnPolicyDays?: number;
    returnPolicyExpiresAt?: number;
    lineItems?: ReceiptLineItem[];
    validationWarnings?: string[];
    linkedTransactionId?: string;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    processedAt?: number;
    errorMessage?: string;
}

// --- Project Management (Phase 2) ---

export type TaskStatus = 'todo' | 'scheduled' | 'in_progress' | 'review_pending' | 'completed' | 'blocked';
export type WorkOrderStatus = 'draft' | 'sent' | 'approved' | 'paid';
export type FieldLogType = 'daily_report' | 'issue' | 'progress_update' | 'change_order_request';
export type UserRole = 'gc_admin' | 'subcontractor' | 'laborer' | 'client';

export interface Phase {
    id: string;
    projectId: string;
    name: string; // "Foundation", "Framing"
    orderIndex: number;
    startDate?: number;
    endDate?: number;
}

export interface Task {
    id: string;
    projectId: string;
    phaseId?: string;
    title: string;
    description?: string;
    status: TaskStatus;
    assignedTo?: string; // UserId

    // Scheduling
    startDate?: number;
    endDate?: number;
    actualStartDate?: number;
    actualCompletedDate?: number;

    // Dependencies (Gantt)
    dependencyIds?: string[]; // TaskIds that must finish before this starts

    // Financials
    workOrderId?: string;

    createdAt: number;
    updatedAt: number;
}

export interface WorkOrder {
    id: string;
    projectId: string;
    subcontractorId: string; // UserId
    status: WorkOrderStatus;
    taskIds: string[]; // The scope of this contract

    totalAmount: number;
    currency: string;

    // Simple line items for the contract itself (optional detail)
    lineItems?: {
        description: string;
        amount: number;
    }[];

    paymentIds?: string[];

    createdAt: number;
    updatedAt: number;
    signedBy?: string;
    signedAt?: number;
}

export interface FieldLog {
    id: string;
    projectId: string;
    taskId?: string; // Optional link to specific task
    authorId: string;
    type: FieldLogType;

    date: number; // Timestamp of the log date (noon that day)
    content: string; // The text note or transcription
    photos?: string[];

    // Metadata
    location?: {
        latitude: number;
        longitude: number;
    };
    weatherSnapshot?: string; // "Sunny, 75F"

    sentiment?: 'positive' | 'neutral' | 'negative';
    flaggedIssues?: string[];
    taskUpdates?: {
        taskId: string;
        status: TaskStatus;
        notes?: string;
    }[];

    createdAt: number;
}

export interface ProjectTeamMember {
    userId: string;
    role: UserRole;
    permissions?: string[]; // "view_financials", "edit_schedule"
}

// Extension to the existing Project interface
// Note: We don't modify the original 'Project' interface directly here 
// to avoid breaking changes, but valid PM Projects will expect these fields.
export interface PMProjectMetadata {
    team?: ProjectTeamMember[];
    budgetTotal?: number;
}
