// Export everything from gameStore
export {
    useGameStore,
    // Constants
    WALL,
    PATH,
    PAINTED,
    Direction,
    // Helper functions
    getIndex,
    getXY,
    // Selectors
    selectPlayer,
    selectGrid,
    selectDimensions,
    selectGameStats,
} from './gameStore';

// Export types
export type {
    PlayerState,
    GameState,
    DirectionType,
} from './gameStore';
