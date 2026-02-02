import { type ScanSession } from '@construction/shared';

export interface ImageAnalysisResult {
    tags: string[];
    objects: string[];
}

export function analyzeImage(imageUrl: string): Promise<ImageAnalysisResult> {
    return Promise.resolve({ tags: [], objects: [] });
}
