export interface Point {
    x: number;
    y: number;
}

export interface Clue {
    x: number;
    y: number;
    value: number;
}

export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export class RectangleValidator {
    /**
     * Validates if a set of rectangles correctly solves the Shikaku-style rectangle partition puzzle.
     * 
     * @param width - The width of the puzzle grid.
     * @param height - The height of the puzzle grid.
     * @param clues - The array of clues on the board.
     * @param rectangles - The array of rectangles to validate against the rules.
     * @returns True if valid, false otherwise.
     */
    static isValid(width: number, height: number, clues: Clue[], rectangles: Rectangle[]): boolean {
        // Check 1: grid coverage exactly once (no overlaps, full coverage)
        const grid = Array.from({ length: height }, () => new Array(width).fill(0));
        
        for (const rect of rectangles) {
            // Check bounds
            if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > width || rect.y + rect.height > height) {
                return false; // Out of bounds
            }
            for (let y = rect.y; y < rect.y + rect.height; y++) {
                for (let x = rect.x; x < rect.x + rect.width; x++) {
                    grid[y][x]++;
                }
            }
        }

        // Every cell must be covered exactly once
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (grid[y][x] !== 1) return false;
            }
        }

        // Check 2: each rectangle contains exactly one clue, and its area matches the clue
        for (const rect of rectangles) {
            let cluesInRect = 0;
            let currentClueValue = 0;

            for (const clue of clues) {
                if (clue.x >= rect.x && clue.x < rect.x + rect.width &&
                    clue.y >= rect.y && clue.y < rect.y + rect.height) {
                    cluesInRect++;
                    currentClueValue = clue.value;
                }
            }

            if (cluesInRect !== 1) return false; // Must contain exactly one clue
            
            const area = rect.width * rect.height;
            if (area !== currentClueValue) return false; // Area must match the clue's value
        }

        return true;
    }
}

export class RectangleSolver {
    /**
     * Solves the Shikaku-style rectangle partition puzzle using backtracking.
     * 
     * @param width - The width of the puzzle grid.
     * @param height - The height of the puzzle grid.
     * @param clues - The array of clues on the board.
     * @returns An array of rectangles solving the puzzle, or null if no solution exists.
     */
    static solve(width: number, height: number, clues: Clue[]): Rectangle[] | null {
        const grid = Array.from({ length: height }, () => new Array(width).fill(-1));
        
        // Precompute all possible rectangles for each clue based on board constraints
        const possibleRectsForClue: Rectangle[][] = clues.map(clue => {
            const possible: Rectangle[] = [];
            for (let w = 1; w <= clue.value; w++) {
                if (clue.value % w === 0) {
                    const h = clue.value / w;
                    for (let x = clue.x - w + 1; x <= clue.x; x++) {
                        for (let y = clue.y - h + 1; y <= clue.y; y++) {
                            if (x >= 0 && y >= 0 && x + w <= width && y + h <= height) {
                                // Double check that this possible rectangle contains ONLY this clue
                                let otherCluesInside = false;
                                for (const otherClue of clues) {
                                    if (otherClue !== clue &&
                                        otherClue.x >= x && otherClue.x < x + w &&
                                        otherClue.y >= y && otherClue.y < y + h) {
                                        otherCluesInside = true;
                                        break;
                                    }
                                }
                                if (!otherCluesInside) {
                                    possible.push({ x, y, width: w, height: h });
                                }
                            }
                        }
                    }
                }
            }
            return possible;
        });

        const rectangles: Rectangle[] = [];
        
        const backtrack = (clueIndex: number): boolean => {
            if (clueIndex === clues.length) {
                // All clues processed. Check if all cells are covered.
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        if (grid[y][x] === -1) return false;
                    }
                }
                return true;
            }

            for (const rect of possibleRectsForClue[clueIndex]) {
                // Check if it overlaps with already placed rectangles
                let overlap = false;
                for (let y = rect.y; y < rect.y + rect.height; y++) {
                    for (let x = rect.x; x < rect.x + rect.width; x++) {
                        if (grid[y][x] !== -1) {
                            overlap = true;
                            break;
                        }
                    }
                    if (overlap) break;
                }

                if (!overlap) {
                    // Place the rectangle
                    for (let y = rect.y; y < rect.y + rect.height; y++) {
                        for (let x = rect.x; x < rect.x + rect.width; x++) {
                            grid[y][x] = clueIndex;
                        }
                    }
                    rectangles.push(rect);

                    // Recurse to next clue
                    if (backtrack(clueIndex + 1)) {
                        return true;
                    }

                    // Backtrack
                    rectangles.pop();
                    for (let y = rect.y; y < rect.y + rect.height; y++) {
                        for (let x = rect.x; x < rect.x + rect.width; x++) {
                            grid[y][x] = -1;
                        }
                    }
                }
            }

            return false;
        };

        if (backtrack(0)) {
            return rectangles;
        }

        return null; // No solution found
    }
}
