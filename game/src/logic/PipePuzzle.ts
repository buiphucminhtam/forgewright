export enum Direction {
    Top = 0,
    Right = 1,
    Bottom = 2,
    Left = 3
}

export interface PipeTile {
    x: number;
    y: number;
    // Connections represented as an array of 4 booleans [Top, Right, Bottom, Left]
    // These are relative to the board when rotation = 0
    baseConnections: boolean[]; 
    rotation: number; // 0, 1, 2, 3 (each representing 90 degrees clockwise)
    isLocked: boolean;
}

export class PipeValidator {
    /**
     * Gets the current absolute connections of a tile based on its baseConnections and rotation.
     * @param tile - The pipe tile.
     * @returns An array of 4 booleans [Top, Right, Bottom, Left].
     */
    static getActualConnections(tile: PipeTile): boolean[] {
        const actual = [false, false, false, false];
        for (let i = 0; i < 4; i++) {
            if (tile.baseConnections[i]) {
                // A rotation of 1 means clockwise 90 degrees, so Top(0) becomes Right(1)
                actual[(i + tile.rotation) % 4] = true;
            }
        }
        return actual;
    }

    /**
     * Validates if a set of pipe tiles correctly solves the connection puzzle.
     * 
     * @param width - The width of the puzzle grid.
     * @param height - The height of the puzzle grid.
     * @param tiles - The array of pipe tiles on the board.
     * @returns True if valid, false otherwise.
     */
    static isValid(width: number, height: number, tiles: PipeTile[]): boolean {
        const grid: (PipeTile | null)[][] = Array.from({ length: height }, () => new Array(width).fill(null));
        for (const tile of tiles) {
            // Check board bounds
            if (tile.x < 0 || tile.y < 0 || tile.x >= width || tile.y >= height) return false;
            // Check overlap
            if (grid[tile.y][tile.x] !== null) return false; 
            grid[tile.y][tile.x] = tile;
        }

        for (const tile of tiles) {
            const conns = this.getActualConnections(tile);
            
            // 1. No connection may terminate at a board edge
            if (conns[Direction.Top] && tile.y === 0) return false;
            if (conns[Direction.Right] && tile.x === width - 1) return false;
            if (conns[Direction.Bottom] && tile.y === height - 1) return false;
            if (conns[Direction.Left] && tile.x === 0) return false;

            // 2. All openings must point into a matching neighbor
            if (conns[Direction.Top]) {
                const neighbor = grid[tile.y - 1][tile.x];
                if (!neighbor || !this.getActualConnections(neighbor)[Direction.Bottom]) return false;
            }
            if (conns[Direction.Right]) {
                const neighbor = grid[tile.y][tile.x + 1];
                if (!neighbor || !this.getActualConnections(neighbor)[Direction.Left]) return false;
            }
            if (conns[Direction.Bottom]) {
                const neighbor = grid[tile.y + 1][tile.x];
                if (!neighbor || !this.getActualConnections(neighbor)[Direction.Top]) return false;
            }
            if (conns[Direction.Left]) {
                const neighbor = grid[tile.y][tile.x - 1];
                if (!neighbor || !this.getActualConnections(neighbor)[Direction.Right]) return false;
            }
        }

        // 3. Every required tile must belong to one connected network
        if (tiles.length === 0) return true;
        
        const visited = new Set<PipeTile>();
        
        const dfs = (tile: PipeTile) => {
            if (visited.has(tile)) return;
            visited.add(tile);
            
            const conns = this.getActualConnections(tile);
            if (conns[Direction.Top]) {
                const neighbor = grid[tile.y - 1][tile.x];
                if (neighbor) dfs(neighbor);
            }
            if (conns[Direction.Right]) {
                const neighbor = grid[tile.y][tile.x + 1];
                if (neighbor) dfs(neighbor);
            }
            if (conns[Direction.Bottom]) {
                const neighbor = grid[tile.y + 1][tile.x];
                if (neighbor) dfs(neighbor);
            }
            if (conns[Direction.Left]) {
                const neighbor = grid[tile.y][tile.x - 1];
                if (neighbor) dfs(neighbor);
            }
        };

        // Start DFS from the first tile
        dfs(tiles[0]);

        // If not all tiles are visited, it means there are disconnected components
        return visited.size === tiles.length;
    }
}

export class PipeSolver {
    /**
     * Solves the pipe connection puzzle using backtracking.
     * 
     * @param width - The width of the puzzle grid.
     * @param height - The height of the puzzle grid.
     * @param tiles - The array of pipe tiles to solve.
     * @returns An array of rotated pipe tiles that form a valid solution, or null if no solution exists.
     */
    static solve(width: number, height: number, tiles: PipeTile[]): PipeTile[] | null {
        // Clone state for solving
        const tileStates = tiles.map(t => ({ ...t }));
        
        const grid: (PipeTile | null)[][] = Array.from({ length: height }, () => new Array(width).fill(null));
        for (const tile of tileStates) {
            grid[tile.y][tile.x] = tile;
        }

        // Pre-map tile to its index for fast processed-neighbor lookup
        const tileToIndex = new Map<PipeTile, number>();
        for (let i = 0; i < tileStates.length; i++) {
            tileToIndex.set(tileStates[i], i);
        }

        const backtrack = (index: number): boolean => {
            if (index === tileStates.length) {
                // All tiles processed, do final full validation
                return PipeValidator.isValid(width, height, tileStates);
            }

            const tile = tileStates[index];
            if (tile.isLocked) {
                // Cannot rotate, just check if it's potentially valid and proceed
                if (!this.canBeValid(tile, grid, width, height, tileToIndex, index)) return false;
                return backtrack(index + 1);
            }

            // Try all 4 rotations
            for (let rot = 0; rot < 4; rot++) {
                tile.rotation = rot;
                if (this.canBeValid(tile, grid, width, height, tileToIndex, index)) {
                    if (backtrack(index + 1)) {
                        return true;
                    }
                }
            }
            
            // Backtrack failed, restore initial rotation
            tile.rotation = 0;
            return false;
        };

        if (backtrack(0)) {
            return tileStates;
        }

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
        const conns = PipeValidator.getActualConnections(tile);
        
        // Check boundary violations
        if (conns[Direction.Top] && tile.y === 0) return false;
        if (conns[Direction.Right] && tile.x === width - 1) return false;
        if (conns[Direction.Bottom] && tile.y === height - 1) return false;
        if (conns[Direction.Left] && tile.x === 0) return false;

        // Check against already processed neighbors for immediate mismatches
        
        // Top neighbor
        if (tile.y > 0) {
            const neighbor = grid[tile.y - 1][tile.x];
            if (neighbor) {
                const neighborIdx = tileToIndex.get(neighbor);
                // If neighbor is locked or has been processed (its rotation is tentatively fixed for this branch)
                if (neighbor.isLocked || (neighborIdx !== undefined && neighborIdx < currentIndex)) {
                    const nConns = PipeValidator.getActualConnections(neighbor);
                    // Match required: My Top must equal Neighbor's Bottom
                    if (conns[Direction.Top] !== nConns[Direction.Bottom]) return false;
                }
            } else {
                // If there's no neighbor on the board, but we have a connection pointing there, it's invalid
                if (conns[Direction.Top]) return false;
            }
        }
        
        // Right neighbor
        if (tile.x < width - 1) {
            const neighbor = grid[tile.y][tile.x + 1];
            if (neighbor) {
                const neighborIdx = tileToIndex.get(neighbor);
                if (neighbor.isLocked || (neighborIdx !== undefined && neighborIdx < currentIndex)) {
                    const nConns = PipeValidator.getActualConnections(neighbor);
                    if (conns[Direction.Right] !== nConns[Direction.Left]) return false;
                }
            } else {
                if (conns[Direction.Right]) return false;
            }
        }
        
        // Bottom neighbor
        if (tile.y < height - 1) {
            const neighbor = grid[tile.y + 1][tile.x];
            if (neighbor) {
                const neighborIdx = tileToIndex.get(neighbor);
                if (neighbor.isLocked || (neighborIdx !== undefined && neighborIdx < currentIndex)) {
                    const nConns = PipeValidator.getActualConnections(neighbor);
                    if (conns[Direction.Bottom] !== nConns[Direction.Top]) return false;
                }
            } else {
                if (conns[Direction.Bottom]) return false;
            }
        }
        
        // Left neighbor
        if (tile.x > 0) {
            const neighbor = grid[tile.y][tile.x - 1];
            if (neighbor) {
                const neighborIdx = tileToIndex.get(neighbor);
                if (neighbor.isLocked || (neighborIdx !== undefined && neighborIdx < currentIndex)) {
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
