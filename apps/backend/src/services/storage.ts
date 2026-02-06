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

export const uploadBufferToStorage = async (filename: string, buffer: Buffer, contentType: string): Promise<string> => {
    const bucket = storage.bucket();
    const file = bucket.file(filename);

    await file.save(buffer, {
        contentType,
        public: true
    });

    await file.makePublic();

    return `https://storage.googleapis.com/${bucket.name}/${filename}`;
};

export const deleteStorageFileByUrl = async (fileUrl: string): Promise<void> => {
    if (!fileUrl) return;
    const bucket = storage.bucket();
    const bucketName = bucket.name;

    let objectPath: string | null = null;
    const storagePrefix = `https://storage.googleapis.com/${bucketName}/`;

    if (fileUrl.startsWith(storagePrefix)) {
        objectPath = fileUrl.slice(storagePrefix.length);
    } else if (fileUrl.startsWith('gs://')) {
        const gsPath = fileUrl.replace('gs://', '');
        if (gsPath.startsWith(`${bucketName}/`)) {
            objectPath = gsPath.slice(bucketName.length + 1);
        }
    }

    if (!objectPath) return;

    await bucket.file(objectPath).delete({ ignoreNotFound: true });
};
