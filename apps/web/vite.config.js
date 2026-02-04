import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    root: '.',
    // Allow serving files from root for shared assets if needed
    server: {
        host: true,
        port: 5173,
    },
    build: {
        target: 'esnext',
        outDir: 'dist'
    },
    resolve: {
        alias: {
            'three': 'three'
        }
    },
    // Needle/USD optimization needs
    optimizeDeps: {
        exclude: ['@needle-tools/usd']
    }
});
