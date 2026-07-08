import { PipeTile, Direction, TileType } from './PipePuzzle';

export class PipeGenerator {
    /**
     * Generates a new random pipe puzzle level.
     * Uses a randomized DFS maze generation algorithm to create a fully connected spanning tree.
     */
    static generateLevel(width: number, height: number): PipeTile[] {
        // 1. Initialize grid structure
        const grid: {
            x: number,
            y: number,
            connections: boolean[],
            type: TileType,
            color?: string
        }[][] = Array.from({ length: height }, (_, y) => 
            Array.from({ length: width }, (_, x) => ({
                x, y,
                connections: [false, false, false, false],
                type: 'pipe'
            }))
        );

        const visited = new Set<string>();
        const toKey = (x: number, y: number) => `${x},${y}`;

        // 2. Randomized DFS for Spanning Tree
        const startX = Math.floor(Math.random() * width);
        const startY = Math.floor(Math.random() * height);
        
        const stack = [{ x: startX, y: startY }];
        visited.add(toKey(startX, startY));

        const getUnvisitedNeighbors = (cx: number, cy: number) => {
            const neighbors: {nx: number, ny: number, dir: Direction, opp: Direction}[] = [];
            if (cy > 0 && !visited.has(toKey(cx, cy - 1))) neighbors.push({nx: cx, ny: cy - 1, dir: Direction.Top, opp: Direction.Bottom});
            if (cx < width - 1 && !visited.has(toKey(cx + 1, cy))) neighbors.push({nx: cx + 1, ny: cy, dir: Direction.Right, opp: Direction.Left});
            if (cy < height - 1 && !visited.has(toKey(cx, cy + 1))) neighbors.push({nx: cx, ny: cy + 1, dir: Direction.Bottom, opp: Direction.Top});
            if (cx > 0 && !visited.has(toKey(cx - 1, cy))) neighbors.push({nx: cx - 1, ny: cy, dir: Direction.Left, opp: Direction.Right});
            return neighbors;
        };

        // Track leaf nodes to assign as Source/Sink
        const leaves: {x: number, y: number}[] = [];

        while (stack.length > 0) {
            const curr = stack[stack.length - 1];
            const neighbors = getUnvisitedNeighbors(curr.x, curr.y);

            if (neighbors.length === 0) {
                // If it's a leaf node (only 1 connection), keep track of it
                const connections = grid[curr.y][curr.x].connections;
                const degree = connections.filter(c => c).length;
                if (degree === 1) {
                    leaves.push({x: curr.x, y: curr.y});
                }
                stack.pop();
            } else {
                // Pick random neighbor
                const next = neighbors[Math.floor(Math.random() * neighbors.length)];
                
                // Connect them
                grid[curr.y][curr.x].connections[next.dir] = true;
                grid[next.ny][next.nx].connections[next.opp] = true;

                visited.add(toKey(next.nx, next.ny));
                stack.push({ x: next.nx, y: next.ny });
            }
        }

        // 3. Assign Source and Sink
        // We need at least 2 leaves. A spanning tree with >1 nodes always has >=2 leaves.
        if (leaves.length >= 2) {
            // Pick two leaves furthest apart or randomly. Let's just pick first and last for simplicity.
            // Or shuffle leaves and pick top 2.
            const sourceLeaf = leaves[0];
            const sinkLeaf = leaves[leaves.length - 1];
            
            grid[sourceLeaf.y][sourceLeaf.x].type = 'source';
            grid[sinkLeaf.y][sinkLeaf.x].type = 'sink';
            // In a real multi-color we might assign colors here
            grid[sourceLeaf.y][sourceLeaf.x].color = 'blue';
            grid[sinkLeaf.y][sinkLeaf.x].color = 'blue';
        }

        // 4. Convert to PipeTile array and Scramble Rotations
        const tiles: PipeTile[] = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const cell = grid[y][x];
                
                // Determine baseConnections by rotating the connections back to some "base" state 
                // Actually, the connections array IS the base connections when rotation is 0.
                const baseConns = [...cell.connections];
                
                // Assign a random rotation (0 to 3)
                const randomRot = Math.floor(Math.random() * 4);
                
                // We don't need to actually rotate the baseConnections because they represent the 
                // solved state when the piece is rotated into the CORRECT position.
                // Wait. If `baseConnections` is the physical shape of the tile, and `rotation` is its current orientation on the board...
                // If the solved state needs connections [Top=True, Right=True, Bottom=False, Left=False]
                // and we set rotation to 1 (90deg clockwise), the actual connections on board become [Right, Bottom].
                // So if we want the actual connections to be [Top, Right] in the SOLVED state, we must ensure:
                // getActualConnections(baseConns, solvedRotation) === solvedConnections.
                // The easiest way: set baseConnections = solvedConnections, and solvedRotation = 0.
                // Then to scramble, we just set `rotation` to randomRot.
                // The player will rotate it back to 0 (or another valid symmetrical rotation).

                tiles.push({
                    x, y,
                    baseConnections: baseConns,
                    rotation: randomRot,
                    isLocked: false,
                    type: cell.type,
                    color: cell.color
                });
            }
        }

        return tiles;
    }
}
