// Helper to convert PipelineResult to serializable format
export const serializePipelineResult = (result) => ({
    nodes: [...result.graph.iterNodes()],
    relationships: [...result.graph.iterRelationships()],
    repoPath: result.repoPath,
    totalFileCount: result.totalFileCount,
});
// Helper to reconstruct from serializable format (used in main thread)
export const deserializePipelineResult = (serialized, createGraph) => {
    const graph = createGraph();
    serialized.nodes.forEach(node => graph.addNode(node));
    serialized.relationships.forEach(rel => graph.addRelationship(rel));
    return {
        graph,
        repoPath: serialized.repoPath,
        totalFileCount: serialized.totalFileCount,
    };
};
