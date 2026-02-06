import { Router, type Request, type Response } from 'express';

const router = Router();

const docsHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Construction Scanning API Docs</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
        h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .endpoint { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 6px; padding: 20px; margin-bottom: 20px; }
        .method { font-weight: bold; padding: 4px 8px; border-radius: 4px; color: white; display: inline-block; margin-right: 10px; }
        .get { background-color: #007bff; }
        .post { background-color: #28a745; }
        .put { background-color: #6f42c1; }
        .delete { background-color: #dc3545; }
        code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-family: 'SFMono-Regular', Consolas, monospace; }
        pre { background: #2d2d2d; color: #fff; padding: 15px; border-radius: 6px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>API Documentation</h1>
    <p>Base URL: <code>/api</code></p>
    <p>Authentication: <code>Authorization: Bearer &lt;ID_TOKEN&gt;</code> (or <code>mock-token</code> in dev)</p>

    <div class="endpoint">
        <h3><span class="method post">POST</span> /upload/url</h3>
        <p>Get a signed URL for uploading files directly to Firebase Storage.</p>
        <h4>Request Body</h4>
        <pre>{
  "filename": "session_id/image.jpg",
  "contentType": "image/jpeg"
}</pre>
        <h4>Response</h4>
        <pre>{
  "uploadUrl": "https://storage.googleapis.com/..."
}</pre>
    </div>

    <div class="endpoint">
        <h3><span class="method post">POST</span> /sessions</h3>
        <p>Create or update a Scan Session.</p>
        <h4>Request Body</h4>
        <pre>{
  "id": "uuid",
  "segments": [],
  "capturedImages": [],
  "stairways": [],
  "createdAt": 1234567890
}</pre>
        <h4>Response</h4>
        <pre>{
  "status": "success",
  "sessionId": "uuid"
}</pre>
    </div>

    <div class="endpoint">
        <h3><span class="method get">GET</span> /sessions</h3>
        <p>List all scan sessions.</p>
        <h4>Response</h4>
        <pre>[
  {
    "id": "uuid",
    "createdAt": 1234567890,
    ...
  }
]</pre>
    </div>

    <div class="endpoint">
        <h3><span class="method get">GET</span> /sessions/:id</h3>
        <p>Get details for a specific session.</p>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/accounts/seed</h3>
        <p>Seed the default chart of accounts for construction bookkeeping.</p>
        <h4>Response Fields</h4>
        <pre>{
  "status": "success | skipped",
  "count": 40,
  "message": "string"
}</pre>
        <h4>Response</h4>
        <pre>{
  "status": "success",
  "count": 40
}</pre>
        <h4>Response (already seeded)</h4>
        <pre>{
  "status": "skipped",
  "message": "Chart of accounts already exists."
}</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/accounts</h3>
        <p>List all accounts in the chart of accounts.</p>
        <h4>Response Fields</h4>
        <pre>[
  {
    "id": "string",
    "code": "string",
    "name": "string",
    "type": "asset | liability | equity | revenue | cogs | expense",
    "subType": "current_asset | fixed_asset | contra_asset | current_liability | long_term_liability | equity | operating_revenue | other_income | direct_cost | operating_expense",
    "parentId": "string | null",
    "description": "string | null",
    "isActive": true,
    "createdAt": "number (ms)",
    "updatedAt": "number (ms)"
  }
]</pre>
        <h4>Response</h4>
        <pre>[
  {
    "id": "1010",
    "code": "1010",
    "name": "Operating Checking",
    "type": "asset",
    "subType": "current_asset",
    "parentId": "1000",
    "isActive": true,
    "createdAt": 1710000000000,
    "updatedAt": 1710000000000
  }
]</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/accounts/:id</h3>
        <p>Get a single account by ID.</p>
        <h4>Response Fields</h4>
        <pre>{
  "id": "string",
  "code": "string",
  "name": "string",
  "type": "asset | liability | equity | revenue | cogs | expense",
  "subType": "string | null",
  "parentId": "string | null",
  "description": "string | null",
  "isActive": true,
  "createdAt": "number (ms)",
  "updatedAt": "number (ms)"
}</pre>
        <h4>Response</h4>
        <pre>{
  "id": "1010",
  "code": "1010",
  "name": "Operating Checking",
  "type": "asset",
  "subType": "current_asset",
  "parentId": "1000",
  "isActive": true,
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000
}</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/accounts</h3>
        <p>Create or update an account.</p>
        <h4>Request Fields</h4>
        <pre>{
  "code": "string (required)",
  "name": "string (required)",
  "type": "asset | liability | equity | revenue | cogs | expense (required)",
  "subType": "string | null",
  "parentId": "string | null",
  "description": "string | null",
  "isActive": "boolean"
}</pre>
        <h4>Request Body</h4>
        <pre>{
  "code": "6150",
  "name": "Business Licenses",
  "type": "expense",
  "subType": "operating_expense",
  "parentId": null,
  "description": "Annual business licensing"
}</pre>
        <h4>Response</h4>
        <pre>{
  "status": "success",
  "account": {
    "id": "6150",
    "code": "6150",
    "name": "Business Licenses",
    "type": "expense",
    "subType": "operating_expense",
    "isActive": true,
    "createdAt": 1710000000000,
    "updatedAt": 1710000000000
  }
}</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method put">PUT</span> /accounting/accounts/:id</h3>
        <p>Update an account by ID.</p>
        <h4>Request Fields</h4>
        <pre>{
  "name": "string",
  "code": "string",
  "type": "asset | liability | equity | revenue | cogs | expense",
  "subType": "string | null",
  "parentId": "string | null",
  "description": "string | null",
  "isActive": "boolean"
}</pre>
        <h4>Request Body</h4>
        <pre>{
  "name": "Business Licenses & Permits",
  "isActive": true
}</pre>
        <h4>Response</h4>
        <pre>{
  "status": "success",
  "account": {
    "id": "6150",
    "name": "Business Licenses & Permits",
    "updatedAt": 1710000000000
  }
}</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method delete">DELETE</span> /accounting/accounts/:id</h3>
        <p>Soft-deactivate an account.</p>
        <h4>Response</h4>
        <pre>{ "status": "success" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/projects</h3>
        <p>Create a project for job-level financial tracking.</p>
        <h4>Request Fields</h4>
        <pre>{
  "name": "string (required)",
  "status": "active | on_hold | completed | archived",
  "customerId": "string | null",
  "startDate": "number (ms)",
  "endDate": "number (ms)"
}</pre>
        <h4>Request Body</h4>
        <pre>{
  "name": "Kitchen Remodel - 123 Main St",
  "status": "active",
  "startDate": 1710000000000
}</pre>
        <h4>Response</h4>
        <pre>{
  "status": "success",
  "project": {
    "id": "uuid",
    "name": "Kitchen Remodel - 123 Main St",
    "status": "active",
    "createdAt": 1710000000000,
    "updatedAt": 1710000000000
  }
}</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/projects</h3>
        <p>List projects.</p>
        <h4>Response Fields</h4>
        <pre>[
  {
    "id": "string",
    "name": "string",
    "status": "active | on_hold | completed | archived",
    "customerId": "string | null",
    "startDate": "number (ms)",
    "endDate": "number (ms)"
  }
]</pre>
        <h4>Response</h4>
        <pre>[
  { "id": "uuid", "name": "Kitchen Remodel - 123 Main St", "status": "active" }
]</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/projects/:id</h3>
        <p>Get a project by ID.</p>
        <h4>Response Fields</h4>
        <pre>{
  "id": "string",
  "name": "string",
  "status": "active | on_hold | completed | archived",
  "customerId": "string | null",
  "startDate": "number (ms)",
  "endDate": "number (ms)"
}</pre>
        <h4>Response</h4>
        <pre>{ "id": "uuid", "name": "Kitchen Remodel - 123 Main St", "status": "active" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method put">PUT</span> /accounting/projects/:id</h3>
        <p>Update a project by ID.</p>
        <h4>Request Fields</h4>
        <pre>{
  "name": "string",
  "status": "active | on_hold | completed | archived",
  "customerId": "string | null",
  "startDate": "number (ms)",
  "endDate": "number (ms)"
}</pre>
        <h4>Request Body</h4>
        <pre>{ "status": "completed" }</pre>
        <h4>Response</h4>
        <pre>{ "status": "success", "project": { "id": "uuid", "status": "completed" } }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method delete">DELETE</span> /accounting/projects/:id</h3>
        <p>Archive a project by ID.</p>
        <h4>Response</h4>
        <pre>{ "status": "success" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/journal-entries</h3>
        <p>Create a balanced journal entry.</p>
        <h4>Request Fields</h4>
        <pre>{
  "date": "number (ms, required)",
  "memo": "string | null",
  "currency": "string (default USD)",
  "status": "draft | posted",
  "lines": [
    {
      "accountId": "string (required)",
      "debit": "number",
      "credit": "number",
      "projectId": "string | null",
      "memo": "string | null"
    }
  ]
}</pre>
        <h4>Request Body</h4>
        <pre>{
  "date": 1710000000000,
  "memo": "Owner investment",
  "currency": "USD",
  "lines": [
    { "accountId": "1010", "debit": 5000, "credit": 0, "projectId": null },
    { "accountId": "3000", "debit": 0, "credit": 5000 }
  ]
}</pre>
        <h4>Response</h4>
        <pre>{ "status": "success", "entryId": "uuid" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/journal-entries</h3>
        <p>List journal entries (filter by <code>dateFrom</code>, <code>dateTo</code>, optional <code>projectId</code>).</p>
        <h4>Response Fields</h4>
        <pre>[
  {
    "id": "string",
    "date": "number (ms)",
    "memo": "string | null",
    "status": "draft | posted",
    "currency": "string",
    "lines": [ { "accountId": "string", "debit": "number", "credit": "number" } ],
    "createdAt": "number (ms)",
    "updatedAt": "number (ms)"
  }
]</pre>
        <h4>Response</h4>
        <pre>[
  {
    "id": "uuid",
    "date": 1710000000000,
    "status": "posted",
    "currency": "USD",
    "lines": [ { "accountId": "1010", "debit": 5000, "credit": 0 } ]
  }
]</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/journal-entries/:id</h3>
        <p>Fetch a single journal entry.</p>
        <h4>Response Fields</h4>
        <pre>{
  "id": "string",
  "date": "number (ms)",
  "memo": "string | null",
  "status": "draft | posted",
  "currency": "string",
  "lines": [ { "accountId": "string", "debit": "number", "credit": "number" } ]
}</pre>
        <h4>Response</h4>
        <pre>{
  "id": "uuid",
  "date": 1710000000000,
  "status": "posted",
  "currency": "USD",
  "lines": [ { "accountId": "1010", "debit": 5000, "credit": 0 } ]
}</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method put">PUT</span> /accounting/journal-entries/:id</h3>
        <p>Update a journal entry.</p>
        <h4>Request Fields</h4>
        <pre>{
  "memo": "string",
  "status": "draft | posted",
  "currency": "string",
  "lines": [
    { "accountId": "string", "debit": "number", "credit": "number", "projectId": "string | null" }
  ]
}</pre>
        <h4>Request Body</h4>
        <pre>{ "memo": "Updated memo", "lines": [ { "accountId": "1010", "debit": 5000, "credit": 0 }, { "accountId": "3000", "debit": 0, "credit": 5000 } ] }</pre>
        <h4>Response</h4>
        <pre>{ "status": "success", "entryId": "uuid" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method delete">DELETE</span> /accounting/journal-entries/:id</h3>
        <p>Delete a journal entry.</p>
        <h4>Response</h4>
        <pre>{ "status": "success" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/imports</h3>
        <p>Create an import record and (optionally) get an upload URL.</p>
        <h4>Request Fields</h4>
        <pre>{
  "filename": "string (required)",
  "contentType": "string (required for uploadUrl)",
  "currency": "string (default USD)",
  "bankAccountId": "string"
}</pre>
        <h4>Request Body</h4>
        <pre>{
  "filename": "statement.csv",
  "contentType": "text/csv",
  "currency": "USD",
  "bankAccountId": "1010"
}</pre>
        <h4>Response</h4>
        <pre>{
  "status": "success",
  "import": { "id": "uuid", "status": "uploaded", "storagePath": "accounting/imports/uuid/statement.csv" },
  "uploadUrl": "https://storage.googleapis.com/..."
}</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/imports/:id/process</h3>
        <p>Process a CSV import into transactions.</p>
        <h4>Request Fields</h4>
        <pre>{
  "csvText": "string (raw CSV text)",
  "storagePath": "string (optional if CSV stored in bucket)"
}</pre>
        <h4>Request Body</h4>
        <pre>{
  "csvText": "date,description,amount\\n2024-01-01,Home Depot,-120.50"
}</pre>
        <h4>Response</h4>
        <pre>{
  "status": "success",
  "createdCount": 10,
  "categorizedCount": 3,
  "postedCount": 1
}</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/imports</h3>
        <p>List imports.</p>
        <h4>Response Fields</h4>
        <pre>[
  {
    "id": "string",
    "filename": "string",
    "storagePath": "string",
    "currency": "string",
    "status": "uploaded | processing | processed | error",
    "createdAt": "number (ms)",
    "updatedAt": "number (ms)"
  }
]</pre>
        <h4>Response</h4>
        <pre>[
  { "id": "uuid", "filename": "statement.csv", "status": "processed" }
]</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/transactions</h3>
        <p>List transactions (optional <code>status</code>, <code>importId</code>).</p>
        <h4>Response Fields</h4>
        <pre>[
  {
    "id": "string",
    "importId": "string",
    "date": "number (ms)",
    "description": "string",
    "amount": "number",
    "currency": "string",
    "status": "uncategorized | categorized | posted",
    "accountId": "string | null",
    "projectId": "string | null",
    "journalEntryId": "string | null",
    "receiptId": "string | null"
  }
]</pre>
        <h4>Response</h4>
        <pre>[
  {
    "id": "uuid",
    "date": 1710000000000,
    "description": "Home Depot",
    "amount": -120.5,
    "status": "uncategorized"
  }
]</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/transactions/:id/categorize</h3>
        <p>Assign an account/project to a transaction.</p>
        <h4>Request Fields</h4>
        <pre>{
  "accountId": "string (required)",
  "projectId": "string | null",
  "postToLedger": "boolean",
  "bankAccountId": "string"
}</pre>
        <h4>Request Body</h4>
        <pre>{
  "accountId": "5000",
  "projectId": "uuid",
  "postToLedger": false,
  "bankAccountId": "1010"
}</pre>
        <h4>Response</h4>
        <pre>{ "status": "success", "journalEntryId": "uuid" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/rules</h3>
        <p>List auto-categorization rules.</p>
        <h4>Response Fields</h4>
        <pre>[
  {
    "id": "string",
    "name": "string",
    "matchText": "string",
    "accountId": "string",
    "projectId": "string | null",
    "priority": "number",
    "autoPost": "boolean",
    "isActive": "boolean"
  }
]</pre>
        <h4>Response</h4>
        <pre>[
  { "id": "uuid", "name": "Home Depot", "matchText": "HOME DEPOT", "accountId": "5000", "autoPost": false }
]</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/rules</h3>
        <p>Create an auto-categorization rule.</p>
        <h4>Request Fields</h4>
        <pre>{
  "name": "string (required)",
  "matchText": "string (required)",
  "accountId": "string (required)",
  "projectId": "string | null",
  "priority": "number",
  "autoPost": "boolean"
}</pre>
        <h4>Request Body</h4>
        <pre>{
  "name": "Home Depot",
  "matchText": "HOME DEPOT",
  "accountId": "5000",
  "projectId": "uuid",
  "priority": 10,
  "autoPost": false
}</pre>
        <h4>Response</h4>
        <pre>{ "status": "success", "rule": { "id": "uuid", "name": "Home Depot" } }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method put">PUT</span> /accounting/rules/:id</h3>
        <p>Update an auto-categorization rule.</p>
        <h4>Request Fields</h4>
        <pre>{
  "name": "string",
  "matchText": "string",
  "accountId": "string",
  "projectId": "string | null",
  "priority": "number",
  "autoPost": "boolean",
  "isActive": "boolean"
}</pre>
        <h4>Request Body</h4>
        <pre>{ "autoPost": true }</pre>
        <h4>Response</h4>
        <pre>{ "status": "success" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method delete">DELETE</span> /accounting/rules/:id</h3>
        <p>Disable an auto-categorization rule.</p>
        <h4>Response</h4>
        <pre>{ "status": "success" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/receipts</h3>
        <p>Create a receipt record and get an upload URL.</p>
        <h4>Request Fields</h4>
        <pre>{
  "filename": "string (required)",
  "contentType": "string (required for uploadUrl)"
}</pre>
        <h4>Request Body</h4>
        <pre>{
  "filename": "receipt.jpg",
  "contentType": "image/jpeg"
}</pre>
        <h4>Response</h4>
        <pre>{
  "status": "success",
  "receipt": { "id": "uuid", "status": "uploaded" },
  "uploadUrl": "https://storage.googleapis.com/..."
}</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/receipts/:id/process</h3>
        <p>Process OCR text or extracted receipt data.</p>
        <h4>Request Fields</h4>
        <pre>{
  "rawText": "string",
  "extracted": {
    "merchant": "string",
    "total": "number",
    "tax": "number",
    "date": "number (ms)",
    "currency": "string",
    "confidence": "number",
    "rawText": "string"
  }
}</pre>
        <h4>Request Body</h4>
        <pre>{
  "rawText": "HOME DEPOT\\nTOTAL 120.50\\n01/15/2024"
}</pre>
        <h4>Request Body (structured)</h4>
        <pre>{
  "extracted": {
    "merchant": "HOME DEPOT",
    "total": 120.5,
    "date": 1705276800000,
    "currency": "USD",
    "rawText": "HOME DEPOT\\nTOTAL 120.50\\n01/15/2024"
  }
}</pre>
        <h4>Response</h4>
        <pre>{ "status": "success", "linkedTransactionId": "uuid" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method post">POST</span> /accounting/receipts/:id/link-transaction</h3>
        <p>Link a receipt to a transaction.</p>
        <h4>Request Fields</h4>
        <pre>{ "transactionId": "string (required)" }</pre>
        <h4>Request Body</h4>
        <pre>{ "transactionId": "uuid" }</pre>
        <h4>Response</h4>
        <pre>{ "status": "success" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/receipts</h3>
        <p>List receipts.</p>
        <h4>Response Fields</h4>
        <pre>[
  {
    "id": "string",
    "filename": "string",
    "status": "uploaded | processing | processed | error",
    "linkedTransactionId": "string | null",
    "extracted": { "merchant": "string", "total": "number" }
  }
]</pre>
        <h4>Response</h4>
        <pre>[
  { "id": "uuid", "filename": "receipt.jpg", "status": "processed" }
]</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/receipts/:id</h3>
        <p>Get a receipt by ID.</p>
        <h4>Response Fields</h4>
        <pre>{
  "id": "string",
  "filename": "string",
  "status": "uploaded | processing | processed | error",
  "linkedTransactionId": "string | null",
  "extracted": { "merchant": "string", "total": "number" }
}</pre>
        <h4>Response</h4>
        <pre>{ "id": "uuid", "filename": "receipt.jpg", "status": "processed" }</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/reports/pl</h3>
        <p>Generate a profit &amp; loss report.</p>
        <p>Query params: <code>dateFrom</code>, <code>dateTo</code>, optional <code>projectId</code>.</p>
        <h4>Response Fields</h4>
        <pre>{
  "currency": "string",
  "dateFrom": "number (ms)",
  "dateTo": "number (ms)",
  "projectId": "string | null",
  "revenueTotal": "number",
  "cogsTotal": "number",
  "expenseTotal": "number",
  "netIncome": "number",
  "lines": [ { "accountId": "string", "accountName": "string", "amount": "number" } ]
}</pre>
        <h4>Response</h4>
        <pre>{
  "currency": "USD",
  "dateFrom": 1704067200000,
  "dateTo": 1706659200000,
  "revenueTotal": 50000,
  "cogsTotal": 20000,
  "expenseTotal": 8000,
  "netIncome": 22000,
  "lines": []
}</pre>
    </div>
    <div class="endpoint">
        <h3><span class="method get">GET</span> /accounting/reports/balance-sheet</h3>
        <p>Generate a balance sheet as-of a date.</p>
        <p>Query params: <code>asOf</code>, optional <code>projectId</code>.</p>
        <h4>Response Fields</h4>
        <pre>{
  "currency": "string",
  "asOf": "number (ms)",
  "projectId": "string | null",
  "assetsTotal": "number",
  "liabilitiesTotal": "number",
  "equityTotal": "number",
  "netIncome": "number",
  "lines": [ { "accountId": "string", "accountName": "string", "amount": "number" } ]
}</pre>
        <h4>Response</h4>
        <pre>{
  "currency": "USD",
  "asOf": 1706659200000,
  "assetsTotal": 150000,
  "liabilitiesTotal": 40000,
  "equityTotal": 110000,
  "netIncome": 22000,
  "lines": []
}</pre>
    </div>

    <div class="endpoint">
        <h3>Error Responses</h3>
        <p>All endpoints return JSON errors with an <code>error</code> message.</p>
        <h4>400 Bad Request</h4>
        <pre>{ "error": "Validation message" }</pre>
        <h4>401 Unauthorized</h4>
        <pre>{ "error": "Unauthorized: No token provided" }</pre>
        <h4>404 Not Found</h4>
        <pre>{ "error": "Resource not found" }</pre>
        <h4>500 Internal Server Error</h4>
        <pre>{ "error": "Internal Server Error" }</pre>
    </div>
</body>
</html>
`;

router.get('/', (req: Request, res: Response) => {
    res.send(docsHtml);
});

export default router;
