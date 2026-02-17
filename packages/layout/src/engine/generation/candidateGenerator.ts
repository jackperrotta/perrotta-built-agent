import { buildConstraintCatalog } from '../constraints/constraintCatalog.js';
import { mapGraphToEnvelope } from '../mapping/envelopeMapper.js';
import { type LayoutCandidate, type RankedCandidatesResult } from '../models/candidate.js';
import { type GenerationContext } from '../models/constraints.js';
import { rankCandidates } from '../scoring/rankCandidates.js';
import { scoreLayout } from '../scoring/scoreLayout.js';
import { calculatePolygonArea } from '@construction/geometry';
import { getBox } from '../utils/spatial.js';

export function generateCandidates(context: GenerationContext): RankedCandidatesResult {
    const catalog = buildConstraintCatalog();
    const accepted: LayoutCandidate[] = [];
    const rejected: RankedCandidatesResult['rejectedAttempts'] = [];
    const rejectionCounts: Record<string, number> = {};

    const target = context.intent.policy.targetCandidateCount;
    const maxAttempts = Math.max(target, context.intent.policy.maxGenerationAttempts);
    let executedAttempts = 0;
    const envelopeAreaSqFt = calculatePolygonArea(context.normalizedScan.envelope.polygon);
    const modelSpace = {
        widthFt: context.normalizedScan.envelope.widthFt,
        heightFt: context.normalizedScan.envelope.heightFt,
        areaSqFt: envelopeAreaSqFt,
        toleranceFt: context.normalizedScan.envelope.toleranceFt,
        confidence: context.normalizedScan.envelope.confidence,
        fillTargetAreaSqFt: envelopeAreaSqFt,
        extractionStats: {
            scanNotes: context.normalizedScan.notes
        }
    };
    logEngine('run-start', {
        targetCandidateCount: target,
        maxAttempts,
        graphNodeCount: context.graph.nodes.length,
        modelSpace,
        envelopePolygon: serializePolygon(context.normalizedScan.envelope.polygon)
    });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (accepted.length >= target) {
            break;
        }
        executedAttempts += 1;

        const candidate = mapGraphToEnvelope(context, attempt);

        const hardFailures = catalog.hardRules
            .map((rule) => ({ ruleId: rule.id, result: rule.evaluate(candidate, context) }))
            .filter((r) => !r.result.pass)
            .map((r) => ({
                constraintId: r.ruleId,
                message: r.result.message ?? 'Hard rule failed.'
            }));

        if (hardFailures.length > 0) {
            for (const failure of hardFailures) {
                rejectionCounts[failure.constraintId] = (rejectionCounts[failure.constraintId] ?? 0) + 1;
            }

            candidate.diagnostics.hardFailures.push(...hardFailures);
            rejected.push(candidate.diagnostics);
            logEngine('attempt-rejected', {
                attempt: attempt + 1,
                candidateId: candidate.id,
                hardFailures,
                candidateDimensions: summarizeCandidateDimensions(candidate, envelopeAreaSqFt),
                envelopePolygon: serializePolygon(context.normalizedScan.envelope.polygon),
                candidatePolygons: summarizeCandidatePolygons(candidate)
            });
            continue;
        }

        const penalties = catalog.softRules.map((rule) => {
            const score = rule.evaluate(candidate, context);
            return { ...score, penalty: score.penalty * rule.weight };
        });
        candidate.diagnostics.softPenalties.push(...penalties);
        candidate.score = scoreLayout(candidate, context);
        accepted.push(candidate);
        logEngine('attempt-accepted', {
            attempt: attempt + 1,
            candidateId: candidate.id,
            totalScore: candidate.score.totalScore,
            softPenalties: candidate.diagnostics.softPenalties,
            candidateDimensions: summarizeCandidateDimensions(candidate, envelopeAreaSqFt),
            envelopePolygon: serializePolygon(context.normalizedScan.envelope.polygon),
            candidatePolygons: summarizeCandidatePolygons(candidate)
        });
    }

    const ranked = rankCandidates(accepted);
    logEngine('run-summary', {
        executedAttempts,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        rejectionCounts,
        acceptedCandidateDimensions: ranked.map((candidate) => ({
            candidateId: candidate.id,
            totalScore: candidate.score.totalScore,
            dimensions: summarizeCandidateDimensions(candidate, envelopeAreaSqFt)
        }))
    });

    if (accepted.length === 0) {
        logEngine('zero-candidate-debug', {
            envelopePolygon: serializePolygon(context.normalizedScan.envelope.polygon),
            sampleRejectedAttempts: rejected.slice(0, 5)
        });
    }

    return {
        candidates: ranked,
        rejectedAttempts: rejected,
        metadata: {
            attemptsRequested: context.intent.policy.maxGenerationAttempts,
            attemptsExecuted: executedAttempts,
            generatedAt: new Date().toISOString(),
            modelSpace,
            envelopePolygon: serializePolygon(context.normalizedScan.envelope.polygon)
        }
    };
}

function logEngine(event: string, payload: Record<string, unknown>): void {
    console.log(`[LayoutDebugEngine] ${JSON.stringify({ event, ...payload })}`);
}

function summarizeCandidateDimensions(candidate: LayoutCandidate, envelopeAreaSqFt: number): Record<string, unknown> {
    const roomSummaries = candidate.rooms.map((room) => {
        return {
            id: room.id,
            roomType: room.roomType,
            widthFt: room.widthFt,
            heightFt: room.heightFt,
            areaSqFt: room.areaSqFt,
            bounds: getBox(room.polygon)
        };
    });

    const totalRoomAreaSqFt = roomSummaries.reduce((acc, room) => acc + room.areaSqFt, 0);
    const footprintBounds = getOverallBounds(roomSummaries.map((room) => room.bounds));
    const footprintAreaSqFt = Math.max(0, (footprintBounds.maxX - footprintBounds.minX) * (footprintBounds.maxY - footprintBounds.minY));

    return {
        roomCount: roomSummaries.length,
        rooms: roomSummaries,
        totals: {
            totalRoomAreaSqFt,
            footprintAreaSqFt,
            envelopeAreaSqFt,
            roomToEnvelopeRatio: envelopeAreaSqFt > 0 ? totalRoomAreaSqFt / envelopeAreaSqFt : 0,
            footprintToEnvelopeRatio: envelopeAreaSqFt > 0 ? footprintAreaSqFt / envelopeAreaSqFt : 0
        },
        footprintBounds
    };
}

function getOverallBounds(bounds: Array<{ minX: number; minY: number; maxX: number; maxY: number }>): { minX: number; minY: number; maxX: number; maxY: number } {
    if (bounds.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return {
        minX: Math.min(...bounds.map((b) => b.minX)),
        minY: Math.min(...bounds.map((b) => b.minY)),
        maxX: Math.max(...bounds.map((b) => b.maxX)),
        maxY: Math.max(...bounds.map((b) => b.maxY))
    };
}

function summarizeCandidatePolygons(candidate: LayoutCandidate): Record<string, unknown> {
    return {
        roomCount: candidate.rooms.length,
        rooms: candidate.rooms.map((room) => ({
            id: room.id,
            roomType: room.roomType,
            polygon: serializePolygon(room.polygon)
        }))
    };
}

function serializePolygon(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
    return points.map((point) => ({
        x: round3(point.x),
        y: round3(point.y)
    }));
}

function round3(value: number): number {
    return Math.round(value * 1000) / 1000;
}
