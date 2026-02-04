
import { storage } from '../src/config/firebase.js';

async function setCors() {
    const bucket = storage.bucket(); // Uses default bucket from config

    const corsConfiguration = [
        {
            origin: ["http://localhost:3000", "http://127.0.0.1:3000", "https://perrottabuilt.com", "https://www.perrottabuilt.com"],
            method: ["GET"],
            responseHeader: ["Content-Type"],
            maxAgeSeconds: 3600
        }
    ];

    console.log(`Setting CORS for bucket: ${bucket.name}`);

    try {
        await bucket.setCorsConfiguration(corsConfiguration);
        console.log("CORS configuration set successfully!");

        // Check it
        const [metadata] = await bucket.getMetadata();
        console.log("New Metadata CORS:", JSON.stringify(metadata.cors, null, 2));

    } catch (error) {
        console.error("Error setting CORS:", error);
    }
}

setCors();
