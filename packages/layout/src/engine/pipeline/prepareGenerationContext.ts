import { type RoomPlanJson } from '../../roomPlanTypes.js';
import { buildRoomGraph } from '../graph/roomGraphBuilder.js';
import { validateRoomGraph } from '../graph/graphValidator.js';
import { resolveProgramIntent } from '../intent/intentResolver.js';
import { type GenerationContext } from '../models/constraints.js';
import { type ProgramIntentInput } from '../models/intent.js';
import { normalizeScanGeometry } from '../scan/scanNormalizer.js';

export interface PreparedContextResult {
    context?: GenerationContext;
    warnings: string[];
    errors: string[];
}

export function prepareGenerationContext(scan: RoomPlanJson, intentInput: ProgramIntentInput = {}): PreparedContextResult {
    const intent = resolveProgramIntent(intentInput);
    const graph = buildRoomGraph(intent);
    const validation = validateRoomGraph(graph);
    const normalizedScan = normalizeScanGeometry(scan, intent.policy.envelopeToleranceRatio);

    const warnings = [
        ...intent.assumptions.map((a) => `${a.key}=${a.value}: ${a.reason}`),
        ...validation.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
        ...normalizedScan.notes
    ];
    const errors = validation.issues.filter((i) => i.severity === 'error').map((i) => i.message);

    if (intent.policy.rejectLowConfidenceScansBelow !== undefined &&
        normalizedScan.envelope.confidence < intent.policy.rejectLowConfidenceScansBelow) {
        errors.push('Scan confidence below configured threshold.');
    }

    if (errors.length > 0) {
        return { warnings, errors };
    }

    return {
        warnings,
        errors,
        context: {
            intent,
            graph,
            normalizedScan
        }
    };
}
