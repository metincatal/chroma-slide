// Re-export store utilities
export {
    getIndex,
    getXY,
} from '../store';

import { WALL, getIndex } from '../store';

// ============================================
// TYPES
// ============================================

/**
 * Position interface for 2D coordinates
 */
export interface Position {
    x: number;
    y: number;
}

/**
 * Direction type
 */
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

/**
 * Movement result containing path information
 */
export interface MovementResult {
    /** Final position after sliding */
    finalPosition: Position;
    /** All tiles passed through during movement */
    path: Position[];
    /** Whether any movement occurred */
    moved: boolean;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Direction vectors for each direction
 * Used to calculate next position in grid
 */
export const DIRECTION_VECTORS: Record<Direction, { dx: number; dy: number }> = {
    UP: { dx: 0, dy: -1 },
    DOWN: { dx: 0, dy: 1 },
    LEFT: { dx: -1, dy: 0 },
    RIGHT: { dx: 1, dy: 0 },
};

// ============================================
// CORE MOVEMENT FUNCTION
// ============================================

/**
 * Calculate target position when sliding in a direction
 * 
 * The player slides in the given direction until hitting a WALL (0).
 * This is pure array-based math - NO PHYSICS ENGINE.
 * 
 * Algorithm:
 * 1. Start from current position
 * 2. Check next cell in direction
 * 3. If next cell is WALL (0) or out of bounds -> STOP
 * 4. If next cell is walkable -> move there, repeat from step 2
 * 5. Return final position
 * 
 * @param grid - Flat number array representing the game grid
 * @param width - Grid width
 * @param height - Grid height
 * @param startPos - Starting position {x, y}
 * @param direction - Movement direction ('UP' | 'DOWN' | 'LEFT' | 'RIGHT')
 * @returns MovementResult with final position and path
 * 
 * @example
 * const result = calculateTarget(grid, 10, 10, {x: 1, y: 1}, 'RIGHT');
 * // result.finalPosition = {x: 8, y: 1} (stopped before wall at x=9)
 * // result.path = [{x:2,y:1}, {x:3,y:1}, ..., {x:8,y:1}]
 * // result.moved = true
 */
export const calculateTarget = (
    grid: number[],
    width: number,
    height: number,
    startPos: Position,
    direction: Direction
): MovementResult => {
    // Get direction vector
    const { dx, dy } = DIRECTION_VECTORS[direction];

    // Current position (starts at player position)
    let currentX = startPos.x;
    let currentY = startPos.y;

    // Track all tiles passed through
    const path: Position[] = [];

    // Slide until hitting a wall or boundary
    while (true) {
        // Calculate next position
        const nextX = currentX + dx;
        const nextY = currentY + dy;

        // Check boundary (out of bounds = WALL)
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
            break; // Hit boundary, stop
        }

        // Get tile value at next position
        const nextIndex = getIndex(nextX, nextY, width);
        const nextTile = grid[nextIndex];

        // Check if next tile is WALL (0)
        if (nextTile === WALL) {
            break; // Hit wall, stop
        }

        // Move to next cell
        currentX = nextX;
        currentY = nextY;

        // Add to path
        path.push({ x: currentX, y: currentY });
    }

    // Determine if any movement occurred
    const moved = currentX !== startPos.x || currentY !== startPos.y;

    return {
        finalPosition: { x: currentX, y: currentY },
        path,
        moved,
    };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a position is valid within grid boundaries
 * 
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param width - Grid width
 * @param height - Grid height
 * @returns true if position is within bounds
 */
export const isValidPosition = (
    x: number,
    y: number,
    width: number,
    height: number
): boolean => {
    return x >= 0 && x < width && y >= 0 && y < height;
};

/**
 * Get tile value at position, returns WALL if out of bounds
 * 
 * @param grid - Flat number array
 * @param width - Grid width
 * @param height - Grid height
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns Tile value or WALL if out of bounds
 */
export const getTileAt = (
    grid: number[],
    width: number,
    height: number,
    x: number,
    y: number
): number => {
    if (!isValidPosition(x, y, width, height)) {
        return WALL; // Out of bounds = WALL
    }
    return grid[getIndex(x, y, width)];
};

/**
 * Calculate Manhattan distance between two positions
 * Useful for heuristics and distance calculations
 * 
 * @param x1 - First position X
 * @param y1 - First position Y
 * @param x2 - Second position X
 * @param y2 - Second position Y
 * @returns Manhattan distance
 */
export const manhattanDistance = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number => {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
};

/**
 * Get all adjacent positions (4-directional, no diagonals)
 * 
 * @param x - Center X coordinate
 * @param y - Center Y coordinate
 * @returns Array of 4 adjacent positions
 */
export const getAdjacentPositions = (
    x: number,
    y: number
): Position[] => {
    return [
        { x: x, y: y - 1 }, // UP
        { x: x, y: y + 1 }, // DOWN
        { x: x - 1, y: y }, // LEFT
        { x: x + 1, y: y }, // RIGHT
    ];
};

/**
 * Get the opposite direction
 * 
 * @param direction - Input direction
 * @returns Opposite direction
 */
export const getOppositeDirection = (direction: Direction): Direction => {
    const opposites: Record<Direction, Direction> = {
        UP: 'DOWN',
        DOWN: 'UP',
        LEFT: 'RIGHT',
        RIGHT: 'LEFT',
    };
    return opposites[direction];
};
