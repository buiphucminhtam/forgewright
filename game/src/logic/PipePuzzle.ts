export enum Direction {
    Top = 0,
    Right = 1,
    Bottom = 2,
    Left = 3
}

export type TileType = 'pipe' | 'source' | 'sink' | 'obstacle';

export interface PipeTile {
    x: number;
    y: number;
    baseConnections: boolean[]; 
    rotation: number;
    isLocked: boolean;
    type?: TileType;
    color?: string; // For multi-color puzzles
}

export class PipeValidator {
    /**
     * Gets the current absolute connections of a tile based on its baseConnections and rotation.
     */
    static getActualConnections(tile: PipeTile): boolean[] {
        if (tile.type === 'obstacle') return [false, false, false, false];
        const actual = [false, false, false, false];
        for (let i = 0; i < 4; i++) {
            if (tile.baseConnections[i]) {
                actual[(i + tile.rotation) % 4] = true;
            }
        }
        return actual;
    }

    /**
     * Calculates the flow network and returns the set of filled tiles.
     * Also returns a boolean indicating if the puzzle is fully solved.
     */
    static getFlowState(width: number, height: number, tiles: PipeTile[]): { filled: Set<PipeTile>, isSolved: boolean } {
        const grid: (PipeTile | null)[][] = Array.from({ length: height }, () => new Array(width).fill(null));
        for (const tile of tiles) {
            if (tile.x >= 0 && tile.y >= 0 && tile.x < width && tile.y < height) {
                grid[tile.y][tile.x] = tile;
            }
        }

        const sources = tiles.filter(t => t.type === 'source');
        const sinks = tiles.filter(t => t.type === 'sink');
        const playableTiles = tiles.filter(t => t.type !== 'obstacle');
        const filled = new Set<PipeTile>();

        // 1. Strict Physical Connection Check (No leaks against walls or non-matching neighbors)
        let hasLeak = false;
        for (const tile of playableTiles) {
            const conns = this.getActualConnections(tile);
            
            if (conns[Direction.Top] && tile.y === 0) hasLeak = true;
            if (conns[Direction.Right] && tile.x === width - 1) hasLeak = true;
            if (conns[Direction.Bottom] && tile.y === height - 1) hasLeak = true;
            if (conns[Direction.Left] && tile.x === 0) hasLeak = true;

            if (conns[Direction.Top]) {
                const neighbor = grid[tile.y - 1][tile.x];
                if (!neighbor || neighbor.type === 'obstacle' || !this.getActualConnections(neighbor)[Direction.Bottom]) hasLeak = true;
            }
            if (conns[Direction.Right]) {
                const neighbor = grid[tile.y][tile.x + 1];
                if (!neighbor || neighbor.type === 'obstacle' || !this.getActualConnections(neighbor)[Direction.Left]) hasLeak = true;
            }
            if (conns[Direction.Bottom]) {
                const neighbor = grid[tile.y + 1][tile.x];
                if (!neighbor || neighbor.type === 'obstacle' || !this.getActualConnections(neighbor)[Direction.Top]) hasLeak = true;
            }
            if (conns[Direction.Left]) {
                const neighbor = grid[tile.y][tile.x - 1];
                if (!neighbor || neighbor.type === 'obstacle' || !this.getActualConnections(neighbor)[Direction.Right]) hasLeak = true;
            }
        }

        if (playableTiles.length === 0) return { filled, isSolved: true };

        // 2. Flow Validation (Graph Traversal)
        if (sources.length > 0) {
            let colorMismatch = false;
            
            for (const source of sources) {
                const color = source.color;
                const queue: PipeTile[] = [source];
                const currentVisited = new Set<PipeTile>();
                
                while (queue.length > 0) {
                    const curr = queue.shift()!;
                    if (currentVisited.has(curr)) continue;
                    
                    currentVisited.add(curr);
                    filled.add(curr);
                    
                    if (curr.type === 'sink' && curr.color !== color) {
                        colorMismatch = true;
                    }

                    const conns = this.getActualConnections(curr);
                    // Only flow into neighbors if they physically connect back (checked above, but we only traverse if local conn exists)
                    if (conns[Direction.Top]) { const n = grid[curr.y - 1][curr.x]; if (n) queue.push(n); }
                    if (conns[Direction.Right]) { const n = grid[curr.y][curr.x + 1]; if (n) queue.push(n); }
                    if (conns[Direction.Bottom]) { const n = grid[curr.y + 1][curr.x]; if (n) queue.push(n); }
                    if (conns[Direction.Left]) { const n = grid[curr.y][curr.x - 1]; if (n) queue.push(n); }
                }
            }

            let allSinksReached = true;
            for (const sink of sinks) {
                if (!filled.has(sink)) allSinksReached = false;
            }
            
            const isSolved = !hasLeak && !colorMismatch && allSinksReached && filled.size === playableTiles.length;
            return { filled, isSolved };
        } else {
            // Classic Infinity Loop logic
            const dfs = (tile: PipeTile) => {
                if (filled.has(tile)) return;
                filled.add(tile);
                const conns = this.getActualConnections(tile);
                if (conns[Direction.Top]) { const n = grid[tile.y - 1][tile.x]; if (n) dfs(n); }
                if (conns[Direction.Right]) { const n = grid[tile.y][tile.x + 1]; if (n) dfs(n); }
                if (conns[Direction.Bottom]) { const n = grid[tile.y + 1][tile.x]; if (n) dfs(n); }
                if (conns[Direction.Left]) { const n = grid[tile.y][tile.x - 1]; if (n) dfs(n); }
            };
            dfs(playableTiles[0]);
            
            const isSolved = !hasLeak && filled.size === playableTiles.length;
            return { filled, isSolved };
        }
    }

    /**
     * Validates if a set of pipe tiles correctly solves the connection puzzle.
     */
    static isValid(width: number, height: number, tiles: PipeTile[]): boolean {
        return this.getFlowState(width, height, tiles).isSolved;
    }
}

export class PipeSolver {
    /**
     * Solves the pipe connection puzzle using backtracking.
     */
    static solve(width: number, height: number, tiles: PipeTile[]): PipeTile[] | null {
        const tileStates = tiles.map(t => ({ ...t }));
        const grid: (PipeTile | null)[][] = Array.from({ length: height }, () => new Array(width).fill(null));
        for (const tile of tileStates) {
            grid[tile.y][tile.x] = tile;
        }

        const tileToIndex = new Map<PipeTile, number>();
        for (let i = 0; i < tileStates.length; i++) {
            tileToIndex.set(tileStates[i], i);
        }

        const backtrack = (index: number): boolean => {
            if (index === tileStates.length) {
                return PipeValidator.isValid(width, height, tileStates);
            }

            const tile = tileStates[index];
            if (tile.type === 'obstacle' || tile.isLocked) {
                if (!this.canBeValid(tile, grid, width, height, tileToIndex, index)) return false;
                return backtrack(index + 1);
            }

            for (let rot = 0; rot < 4; rot++) {
                tile.rotation = rot;
                if (this.canBeValid(tile, grid, width, height, tileToIndex, index)) {
                    if (backtrack(index + 1)) return true;
                }
            }
            
            tile.rotation = 0;
            return false;
        };

        if (backtrack(0)) return tileStates;
        return null;
    }

    private static canBeValid(
        tile: PipeTile, 
        grid: (PipeTile | null)[][], 
        width: number, 
        height: number, 
        tileToIndex: Map<PipeTile, number>, 
        currentIndex: number
    ): boolean {
        if (tile.type === 'obstacle') return true;
        const conns = PipeValidator.getActualConnections(tile);
        
        if (conns[Direction.Top] && tile.y === 0) return false;
        if (conns[Direction.Right] && tile.x === width - 1) return false;
        if (conns[Direction.Bottom] && tile.y === height - 1) return false;
        if (conns[Direction.Left] && tile.x === 0) return false;

        if (tile.y > 0) {
            const neighbor = grid[tile.y - 1][tile.x];
            if (neighbor) {
                const neighborIdx = tileToIndex.get(neighbor);
                if (neighbor.type === 'obstacle' && conns[Direction.Top]) return false;
                if (neighbor.type !== 'obstacle' && (neighbor.isLocked || (neighborIdx !== undefined && neighborIdx < currentIndex))) {
                    const nConns = PipeValidator.getActualConnections(neighbor);
                    if (conns[Direction.Top] !== nConns[Direction.Bottom]) return false;
                }
            } else {
                if (conns[Direction.Top]) return false;
            }
        }
        
        if (tile.x < width - 1) {
            const neighbor = grid[tile.y][tile.x + 1];
            if (neighbor) {
                const neighborIdx = tileToIndex.get(neighbor);
                if (neighbor.type === 'obstacle' && conns[Direction.Right]) return false;
                if (neighbor.type !== 'obstacle' && (neighbor.isLocked || (neighborIdx !== undefined && neighborIdx < currentIndex))) {
                    const nConns = PipeValidator.getActualConnections(neighbor);
                    if (conns[Direction.Right] !== nConns[Direction.Left]) return false;
                }
            } else {
                if (conns[Direction.Right]) return false;
            }
        }
        
        if (tile.y < height - 1) {
            const neighbor = grid[tile.y + 1][tile.x];
            if (neighbor) {
                const neighborIdx = tileToIndex.get(neighbor);
                if (neighbor.type === 'obstacle' && conns[Direction.Bottom]) return false;
                if (neighbor.type !== 'obstacle' && (neighbor.isLocked || (neighborIdx !== undefined && neighborIdx < currentIndex))) {
                    const nConns = PipeValidator.getActualConnections(neighbor);
                    if (conns[Direction.Bottom] !== nConns[Direction.Top]) return false;
                }
            } else {
                if (conns[Direction.Bottom]) return false;
            }
        }
        
        if (tile.x > 0) {
            const neighbor = grid[tile.y][tile.x - 1];
            if (neighbor) {
                const neighborIdx = tileToIndex.get(neighbor);
                if (neighbor.type === 'obstacle' && conns[Direction.Left]) return false;
                if (neighbor.type !== 'obstacle' && (neighbor.isLocked || (neighborIdx !== undefined && neighborIdx < currentIndex))) {
                    const nConns = PipeValidator.getActualConnections(neighbor);
                    if (conns[Direction.Left] !== nConns[Direction.Right]) return false;
                }
            } else {
                if (conns[Direction.Left]) return false;
            }
        }

        return true;
    }
}
