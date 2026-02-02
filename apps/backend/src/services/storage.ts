import { storage } from '../config/firebase.js';

export const generateSignedUploadUrl = async (filename: string, contentType: string): Promise<string> => {
    const bucket = storage.bucket();
    const file = bucket.file(filename);

    const [url] = await file.getSignedUrl({
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: contentType,
        extensionHeaders: {
            // 'x-goog-resumable': 'start' // Optional, for resumable uploads
        }
    });

    return url;
};
