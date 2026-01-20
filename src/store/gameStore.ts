import { create } from 'zustand';

// ============================================
// CONSTANTS - Grid Tile States
// ============================================

/**
 * Grid tile state constants
 * Using numbers for performance (flat array approach)
 */
export const WALL = 0;      // Duvar - geçilemez
export const PATH = 1;      // Yol - boyanabilir alan
export const PAINTED = 2;   // Boyanmış alan

/**
 * Direction constants for movement
 */
export const Direction = {
    UP: 'UP',
    DOWN: 'DOWN',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
} as const;

export type DirectionType = typeof Direction[keyof typeof Direction];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert 2D coordinates to 1D array index
 * Formula: index = y * width + x
 * 
 * @param x - X coordinate (column)
 * @param y - Y coordinate (row)
 * @param width - Grid width
 * @returns 1D array index
 */
export const getIndex = (x: number, y: number, width: number): number => {
    return y * width + x;
};

/**
 * Convert 1D array index to 2D coordinates
 * 
 * @param index - 1D array index
 * @param width - Grid width
 * @returns Object with x and y coordinates
 */
export const getXY = (index: number, width: number): { x: number; y: number } => {
    return {
        x: index % width,
        y: Math.floor(index / width),
    };
};

// ============================================
// TYPES
// ============================================

/**
 * Player state interface
 */
export interface PlayerState {
    x: number;
    y: number;
    isMoving: boolean;
}

/**
 * Game state interface
 */
export interface GameState {
    // Grid data - flat number array for performance
    grid: number[];
    width: number;
    height: number;

    // Player state
    player: PlayerState;

    // Game statistics
    moveCount: number;
    paintedCount: number;
    totalPathTiles: number;
    isGameComplete: boolean;

    // Actions
    initializeGrid: (width: number, height: number) => void;
    initializeTestGrid: () => void;
    setTile: (x: number, y: number, value: number) => void;
    getTile: (x: number, y: number) => number;
    movePlayer: (direction: DirectionType) => void;
    resetGame: () => void;
    setPlayerPosition: (x: number, y: number) => void;
}

// ============================================
// HELPER: Create grid with walls on edges
// ============================================

/**
 * Create a grid with walls on the edges
 */
const createGridWithWalls = (width: number, height: number): number[] => {
    const grid: number[] = new Array(width * height).fill(PATH);

    // Add walls on edges
    for (let x = 0; x < width; x++) {
        grid[getIndex(x, 0, width)] = WALL;              // Top edge
        grid[getIndex(x, height - 1, width)] = WALL;    // Bottom edge
    }

    for (let y = 0; y < height; y++) {
        grid[getIndex(0, y, width)] = WALL;              // Left edge
        grid[getIndex(width - 1, y, width)] = WALL;     // Right edge
    }

    return grid;
};

/**
 * Count total walkable (PATH) tiles in grid
 */
const countPathTiles = (grid: number[]): number => {
    return grid.filter(tile => tile === PATH).length;
};

/**
 * Count painted tiles in grid
 */
const countPaintedTiles = (grid: number[]): number => {
    return grid.filter(tile => tile === PAINTED).length;
};

// ============================================
// ZUSTAND STORE
// ============================================

/**
 * Game Store using Zustand
 * Uses flat number array for 60FPS performance
 */
export const useGameStore = create<GameState>((set, get) => ({
    // Initial state
    grid: [],
    width: 0,
    height: 0,

    player: {
        x: 1,
        y: 1,
        isMoving: false,
    },

    moveCount: 0,
    paintedCount: 0,
    totalPathTiles: 0,
    isGameComplete: false,

    // ============================================
    // ACTIONS
    // ============================================

    /**
     * Initialize empty grid with given dimensions
     */
    initializeGrid: (width: number, height: number) => {
        const grid = createGridWithWalls(width, height);
        const totalPathTiles = countPathTiles(grid);

        set({
            grid,
            width,
            height,
            totalPathTiles,
            paintedCount: 0,
            moveCount: 0,
            isGameComplete: false,
            player: { x: 1, y: 1, isMoving: false },
        });
    },

    /**
     * Initialize a 10x10 test grid with walls on edges
     */
    initializeTestGrid: () => {
        const width = 10;
        const height = 10;
        const grid = createGridWithWalls(width, height);

        // Add some internal walls for puzzle variety
        grid[getIndex(3, 2, width)] = WALL;
        grid[getIndex(3, 3, width)] = WALL;
        grid[getIndex(3, 4, width)] = WALL;

        grid[getIndex(6, 5, width)] = WALL;
        grid[getIndex(6, 6, width)] = WALL;
        grid[getIndex(6, 7, width)] = WALL;

        grid[getIndex(4, 7, width)] = WALL;
        grid[getIndex(5, 7, width)] = WALL;

        grid[getIndex(2, 6, width)] = WALL;

        const totalPathTiles = countPathTiles(grid);

        set({
            grid,
            width,
            height,
            totalPathTiles,
            paintedCount: 0,
            moveCount: 0,
            isGameComplete: false,
            player: { x: 1, y: 1, isMoving: false },
        });

        console.log(`[GameStore] Initialized 10x10 test grid with ${totalPathTiles} walkable tiles`);
    },

    /**
     * Set tile value at given coordinates
     */
    setTile: (x: number, y: number, value: number) => {
        const { grid, width, height } = get();

        if (x < 0 || x >= width || y < 0 || y >= height) {
            console.warn(`[GameStore] Invalid coordinates: (${x}, ${y})`);
            return;
        }

        const index = getIndex(x, y, width);
        const newGrid = [...grid];
        newGrid[index] = value;

        set({
            grid: newGrid,
            paintedCount: countPaintedTiles(newGrid),
        });
    },

    /**
     * Get tile value at given coordinates
     */
    getTile: (x: number, y: number) => {
        const { grid, width, height } = get();

        if (x < 0 || x >= width || y < 0 || y >= height) {
            return WALL;
        }

        const index = getIndex(x, y, width);
        return grid[index];
    },

    /**
     * Move player in given direction
     * Uses calculateTarget from logic/movement.ts for sliding calculation
     */
    movePlayer: (direction: DirectionType) => {
        const { player, width, height, grid } = get();

        if (player.isMoving) return;

        // Import calculateTarget logic inline to avoid circular dependency
        // Direction vectors
        const directionVectors: Record<DirectionType, { dx: number; dy: number }> = {
            [Direction.UP]: { dx: 0, dy: -1 },
            [Direction.DOWN]: { dx: 0, dy: 1 },
            [Direction.LEFT]: { dx: -1, dy: 0 },
            [Direction.RIGHT]: { dx: 1, dy: 0 },
        };

        const { dx, dy } = directionVectors[direction];

        // Starting position
        let currentX = player.x;
        let currentY = player.y;

        // Track path for painting
        const path: { x: number; y: number }[] = [];

        // ========================================
        // CORE ALGORITHM: Slide until hitting WALL
        // Pure array-based math, NO physics engine
        // ========================================
        while (true) {
            const nextX = currentX + dx;
            const nextY = currentY + dy;

            // Boundary check (out of bounds = WALL)
            if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
                break;
            }

            // Get tile at next position
            const nextIndex = getIndex(nextX, nextY, width);
            const nextTile = grid[nextIndex];

            // WALL check - stop if we hit a wall
            if (nextTile === WALL) {
                break;
            }

            // Move to next cell
            currentX = nextX;
            currentY = nextY;
            path.push({ x: currentX, y: currentY });
        }

        // Check if any movement occurred
        const moved = currentX !== player.x || currentY !== player.y;
        if (!moved) return;

        // Paint all tiles in the path (including start position)
        const newGrid = [...grid];

        // Paint starting position
        const startIndex = getIndex(player.x, player.y, width);
        if (newGrid[startIndex] === PATH) {
            newGrid[startIndex] = PAINTED;
        }

        // Paint path tiles
        for (const pos of path) {
            const idx = getIndex(pos.x, pos.y, width);
            if (newGrid[idx] === PATH) {
                newGrid[idx] = PAINTED;
            }
        }

        // Calculate new painted count
        const newPaintedCount = countPaintedTiles(newGrid);

        // Update state
        set({
            grid: newGrid,
            player: { ...player, x: currentX, y: currentY },
            moveCount: get().moveCount + 1,
            paintedCount: newPaintedCount,
        });

        // Check if game is complete
        const { totalPathTiles } = get();
        if (newPaintedCount >= totalPathTiles) {
            set({ isGameComplete: true });
            console.log('[GameStore] 🎉 Game Complete!');
        }
    },

    /**
     * Reset game to initial state
     */
    resetGame: () => {
        get().initializeTestGrid();
    },

    /**
     * Set player position directly
     */
    setPlayerPosition: (x: number, y: number) => {
        set((state) => ({
            player: { ...state.player, x, y },
        }));
    },
}));

// ============================================
// SELECTORS
// ============================================

export const selectPlayer = (state: GameState) => state.player;
export const selectGrid = (state: GameState) => state.grid;
export const selectDimensions = (state: GameState) => ({ width: state.width, height: state.height });
export const selectGameStats = (state: GameState) => ({
    moveCount: state.moveCount,
    paintedCount: state.paintedCount,
    totalPathTiles: state.totalPathTiles,
    isGameComplete: state.isGameComplete,
});
