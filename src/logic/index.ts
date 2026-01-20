// Core movement function
export { calculateTarget } from './movement';

// Types
export type { Position, Direction, MovementResult } from './movement';

// Constants
export { DIRECTION_VECTORS } from './movement';

// Helper functions
export {
    isValidPosition,
    getTileAt,
    manhattanDistance,
    getAdjacentPositions,
    getOppositeDirection,
    getIndex,
    getXY,
} from './movement';

// Colors
export {
    COLORS,
    getThreeColor,
    lerpColor,
} from './colors';
