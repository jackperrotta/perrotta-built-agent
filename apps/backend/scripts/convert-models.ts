
// scripts/convert-models.ts
import { initializeApp, applicationDefault, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Three.js & Needle
import * as THREE from 'three';
// @ts-ignore
import { createThreeHydra } from './lib/createThreeHydra.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// Polyfills for Node environment
dotenv.config();

if (typeof globalThis.window === 'undefined') {
    // @ts-ignore
    globalThis.window = globalThis;
    // @ts-ignore
    globalThis.self = globalThis;
    // @ts-ignore
    globalThis.document = {
        createElement: (tag: string) => ({ style: {}, appendChild: () => { } }),
        querySelector: () => null,
        body: { appendChild: () => { } }
    };
    // @ts-ignore
    // globalThis.navigator = { userAgent: 'node' }; // Already exists in Node 21+
}

// Import Emscripten Bindings manually to bypass Vite-specific imports in the main package
// This sets globalThis["NEEDLE:USD:GET"]
import '../../../node_modules/@needle-tools/usd/src/bindings/emHdBindings.js';

// Initialize Firebase
if (getApps().length === 0) {
    initializeApp({
        credential: applicationDefault(),
        projectId: 'perrotta-built-agent',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'perrotta-built-agent.firebasestorage.app'
    });
}

const db = getFirestore();
const bucket = getStorage().bucket();

// Load WASM Binary once
const wasmPath = path.resolve('../../node_modules/@needle-tools/usd/src/bindings/emHdBindings.wasm');
let usdModulePromise: Promise<any> | null = null;

async function getUSD() {
    if (usdModulePromise) return usdModulePromise;

    if (!fs.existsSync(wasmPath)) {
        throw new Error(`WASM binary not found at ${wasmPath}`);
    }
    const wasmBinary = fs.readFileSync(wasmPath);
    const wasmArrayBuffer = wasmBinary.buffer.slice(wasmBinary.byteOffset, wasmBinary.byteOffset + wasmBinary.byteLength);

    console.log('Loading USD Module (WASM)...');

    // @ts-ignore
    const getUsdModuleFn = globalThis["NEEDLE:USD:GET"];
    if (!getUsdModuleFn) {
        throw new Error("NEEDLE:USD:GET not found. Emscripten bindings not loaded?");
    }

    usdModulePromise = getUsdModuleFn({
        wasmBinary: wasmArrayBuffer,
        // Mock mainScriptUrlOrBlob if needed, but usually redundant if wasm is provided?
        // Emscripten might need it to deduce path, but we provide binary.
        mainScriptUrlOrBlob: "emHdBindings.js",
        setStatus: (msg: string) => console.log(`[USD] ${msg}`)
    });
    return usdModulePromise;
}

async function convertSessionModel(sessionData: any) {
    const { id } = sessionData;
    const segments = sessionData.segments || [];
    let sessionUpdated = false;

    console.log(`[${id}] Checking ${segments.length} segments...`);

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const usdzUrl = segment.roomPlanModelRemoteURL || segment.roomPlanModelUrl;

        if (segment.roomPlanModelGlbUrl) {
            console.log(`  [Seg ${i}] Already has GLB. Skipping.`);
            continue;
        }

        if (!usdzUrl || (!usdzUrl.toLowerCase().includes('.usdz') && !usdzUrl.toLowerCase().includes('alt=media'))) {
            continue;
        }

        console.log(`  [Seg ${i}] processing USDZ: ${usdzUrl}`);

        try {
            // 1. Download USDZ
            let buffer: ArrayBuffer;

            if (usdzUrl.startsWith('http')) {
                const resp = await fetch(usdzUrl);
                if (!resp.ok) throw new Error(`Failed to fetch ${usdzUrl}: ${resp.statusText}`);
                buffer = await resp.arrayBuffer();
            } else {
                // Assume relative path
                const [file] = await bucket.file(usdzUrl).download();
                buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
            }

            // 2. Load into Needle/Three
            const USD = await getUSD();

            const scene = new THREE.Scene();
            const root = new THREE.Object3D();
            scene.add(root);

            const hydra = await createThreeHydra({
                USD,
                scene: root,
                buffer: buffer,
                url: "model.usdz",
                files: []
            });

            if (root.children.length === 0) {
                await new Promise(r => setTimeout(r, 100)); // Wait for optional async population
            }

            console.log(`  [Seg ${i}] Loaded. Scene children: ${root.children.length}`);

            // 3. Export to GLB
            const exporter = new GLTFExporter();

            const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                exporter.parse(
                    root,
                    (result) => {
                        if (result instanceof ArrayBuffer) {
                            resolve(result);
                        } else {
                            reject(new Error('Exporter returned JSON instead of ArrayBuffer'));
                        }
                    },
                    (err) => reject(err),
                    { binary: true }
                );
            });

            hydra.dispose();

            // 4. Upload GLB
            const glbFilename = `session-models/${id}/segment_${i}_${Date.now()}.glb`;
            const file = bucket.file(glbFilename);
            await file.save(Buffer.from(glbBuffer), {
                contentType: 'model/gltf-binary',
                public: true
            });

            await file.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${glbFilename}`;

            // Update Segment Object
            segment.roomPlanModelGlbUrl = publicUrl;
            sessionUpdated = true;

            console.log(`  [Seg ${i}] SUCCESS! GLB: ${publicUrl}`);

        } catch (err: any) {
            console.error(`  [Seg ${i}] Conversion Failed: ${err.message}`);
            if (err.stack) console.error(err.stack);
        }
    }

    if (sessionUpdated) {
        await db.collection('sessions').doc(id).update({ segments });
        console.log(`[${id}] Updated Session segments.`);
    }
}

async function main() {
    console.log('Starting Batch Conversion...');
    const snapshot = await db.collection('sessions').get();

    console.log(`Found ${snapshot.size} sessions.`);

    for (const doc of snapshot.docs) {
        await convertSessionModel({ id: doc.id, ...doc.data() });
    }

    console.log('Done.');
    process.exit(0);
}

main().catch(console.error);
