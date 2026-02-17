import { type ProgramIntent, type RoomDemand } from '../models/intent.js';
import { type RelationEdge, type RoomGraph, type RoomNode } from '../models/graph.js';

export function buildRoomGraph(intent: ProgramIntent): RoomGraph {
    const nodes: RoomNode[] = [];
    const edges: RelationEdge[] = [];
    const groupedByType = new Map<string, RoomNode[]>();

    for (const demand of intent.roomDemands) {
        const count = Math.max(demand.minCount, demand.targetCount ?? demand.minCount);
        for (let i = 0; i < count; i++) {
            const node: RoomNode = {
                id: `${demand.roomType}-${i + 1}`,
                roomType: demand.roomType,
                minAreaSqFt: demand.minAreaSqFt,
                minWidthFt: demand.minWidthFt,
                requiredCountIndex: i
            };
            nodes.push(node);
            const bucket = groupedByType.get(demand.roomType) ?? [];
            bucket.push(node);
            groupedByType.set(demand.roomType, bucket);
        }
    }

    for (const demand of intent.roomDemands) {
        const fromNodes = groupedByType.get(demand.roomType) ?? [];
        if (fromNodes.length === 0) {
            continue;
        }

        for (const preferredType of demand.preferredAdjacency ?? []) {
            const toNodes = groupedByType.get(preferredType) ?? [];
            if (toNodes.length === 0) {
                continue;
            }

            edges.push(...pairEdges(fromNodes, toNodes, demand, preferredType));
        }
    }

    addRequiredEdgesForBasicCirculation(nodes, edges);
    addForbiddenEdges(edges, groupedByType);

    return { nodes, edges };
}

function pairEdges(fromNodes: RoomNode[], toNodes: RoomNode[], demand: RoomDemand, preferredType: string): RelationEdge[] {
    const edges: RelationEdge[] = [];
    const max = Math.max(fromNodes.length, toNodes.length);
    for (let i = 0; i < max; i++) {
        const from = fromNodes[i % fromNodes.length];
        const to = toNodes[i % toNodes.length];
        if (from.id === to.id) {
            continue;
        }

        edges.push({
            id: `${from.id}->${to.id}`,
            fromNodeId: from.id,
            toNodeId: to.id,
            strength: 'preferred',
            flowPriority: 'normal',
            reason: `${demand.roomType} prefers adjacency to ${preferredType}`
        });
    }
    return edges;
}

function addRequiredEdgesForBasicCirculation(nodes: RoomNode[], edges: RelationEdge[]): void {
    const livingRooms = nodes.filter((n) => n.roomType === 'living_room');
    const kitchens = nodes.filter((n) => n.roomType === 'kitchen');
    const bathrooms = nodes.filter((n) => n.roomType === 'bathroom');
    const bedrooms = nodes.filter((n) => n.roomType === 'bedroom');

    if (livingRooms.length > 0 && kitchens.length > 0) {
        edges.push({
            id: 'required-living-kitchen',
            fromNodeId: livingRooms[0].id,
            toNodeId: kitchens[0].id,
            strength: 'required',
            flowPriority: 'critical',
            reason: 'Core living flow requires living room to connect to kitchen'
        });
    }

    if (bathrooms.length > 0 && bedrooms.length > 0) {
        edges.push({
            id: 'required-bedroom-bath',
            fromNodeId: bedrooms[0].id,
            toNodeId: bathrooms[0].id,
            strength: 'required',
            flowPriority: 'normal',
            reason: 'At least one bathroom should be reachable from a bedroom cluster'
        });
    }
}

function addForbiddenEdges(edges: RelationEdge[], groupedByType: Map<string, RoomNode[]>): void {
    const utilities = groupedByType.get('utility') ?? [];
    const dining = groupedByType.get('dining_room') ?? [];

    if (utilities.length === 0 || dining.length === 0) {
        return;
    }

    edges.push({
        id: 'forbidden-utility-dining',
        fromNodeId: utilities[0].id,
        toNodeId: dining[0].id,
        strength: 'forbidden',
        flowPriority: 'low',
        reason: 'Utility rooms should not directly open into dining spaces'
    });
}
