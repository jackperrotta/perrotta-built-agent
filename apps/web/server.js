const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ADMIN_ROOT = path.resolve(__dirname);
const WEBSITE_ROOT = path.resolve(__dirname, '../website/public');

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

    let reqUrl = req.url.split('?')[0];

    // Routing Logic
    let filePath;
    let serveRoot;

    if (reqUrl.startsWith('/admin')) {
        // serve from apps/web (Admin Dashboard)
        let relativeUrl = reqUrl.substring(6); // remove '/admin'
        if (relativeUrl === '' || relativeUrl === '/') relativeUrl = '/index.html';

        serveRoot = ADMIN_ROOT;
        filePath = path.join(ADMIN_ROOT, relativeUrl);
    } else {
        // serve from apps/website/public (Customer Website)
        if (reqUrl === '/') reqUrl = '/index.html';

        serveRoot = WEBSITE_ROOT;
        filePath = path.join(WEBSITE_ROOT, reqUrl);
    }

    // Safety check
    if (!filePath.startsWith(serveRoot)) {
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
    console.log(`- Website: http://localhost:${PORT}/`);
    console.log(`- Admin:   http://localhost:${PORT}/admin`);
    console.log(`Serving with COOP/COEP headers for WASM support.`);
});
