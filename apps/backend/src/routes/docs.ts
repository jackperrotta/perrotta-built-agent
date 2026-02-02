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
</body>
</html>
`;

router.get('/', (req: Request, res: Response) => {
    res.send(docsHtml);
});

export default router;
