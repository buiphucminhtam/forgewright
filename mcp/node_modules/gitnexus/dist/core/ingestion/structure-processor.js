import { generateId } from "../../lib/utils.js";
export const processStructure = (graph, paths) => {
    paths.forEach(path => {
        const parts = path.split('/');
        let currentPath = '';
        let parentId = '';
        parts.forEach((part, index) => {
            const isFile = index === parts.length - 1;
            const label = isFile ? 'File' : 'Folder';
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const nodeId = generateId(label, currentPath);
            const node = {
                id: nodeId,
                label: label,
                properties: {
                    name: part,
                    filePath: currentPath
                }
            };
            graph.addNode(node);
            if (parentId) {
                const relId = generateId('CONTAINS', `${parentId}->${nodeId}`);
                const relationship = {
                    id: relId,
                    type: 'CONTAINS',
                    sourceId: parentId,
                    targetId: nodeId,
                    confidence: 1.0,
                    reason: '',
                };
                graph.addRelationship(relationship);
            }
            parentId = nodeId;
        });
    });
};
