import * as THREE from 'three';

/**
 * Color constants for grid tiles
 */
export const COLORS = {
    WALL: '#2c2c54',
    PATH: '#3d3d5c',
    PAINTED: '#3742fa',
    PLAYER: '#3742fa',
} as const;

/**
 * Get THREE.js color from hex string
 */
export const getThreeColor = (hex: string): THREE.Color => {
    return new THREE.Color(hex);
};

/**
 * Create a gradient color between two colors (for animations)
 */
export const lerpColor = (
    hex1: string,
    hex2: string,
    t: number
): THREE.Color => {
    const c1 = new THREE.Color(hex1);
    const c2 = new THREE.Color(hex2);
    return new THREE.Color().lerpColors(c1, c2, t);
};
