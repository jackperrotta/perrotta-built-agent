const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = path.resolve(__dirname);

// MIME types
const MIMES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary',
    '.usdz': 'model/vnd.usdz+zip'
};

http.createServer((req, res) => {
    console.log(`[${req.method}] ${req.url}`);

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
    };

    // Remove query string
    let cleanUrl = req.url.split('?')[0];
    if (cleanUrl === '/') cleanUrl = '/index.html';

    let filePath = path.join(ROOT, cleanUrl);

    // Safety check
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403, headers);
        res.end('Forbidden');
        return;
    }

    // Check file existence
    const serveFile = (targetPath) => {
        fs.stat(targetPath, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404, headers);
                res.end('File not found');
                return;
            }

            const ext = path.extname(targetPath).toLowerCase();
            const contentType = MIMES[ext] || 'application/octet-stream';

            const finalHeaders = { ...headers, 'Content-Type': contentType };
            res.writeHead(200, finalHeaders);

            const readStream = fs.createReadStream(targetPath);
            readStream.pipe(res);
        });
    };

    if (fs.existsSync(filePath)) {
        if (fs.lstatSync(filePath).isDirectory()) {
            // Folder -> try index.html
            const index = path.join(filePath, 'index.html');
            if (fs.existsSync(index)) {
                serveFile(index);
            } else {
                res.writeHead(404, headers);
                res.end('Directory listing forbidden');
            }
        } else {
            serveFile(filePath);
        }
    } else {
        // Try appending .html
        const htmlPath = filePath + '.html';
        if (fs.existsSync(htmlPath)) {
            serveFile(htmlPath);
        } else {
            res.writeHead(404, headers);
            res.end('File not found');
        }
    }

}).listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Serving with COOP/COEP headers for WASM support.`);
});
