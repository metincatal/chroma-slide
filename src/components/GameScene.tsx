import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { useGameStore, WALL, PATH, PAINTED, getXY, GameState } from '../store';

// ============================================
// CONSTANTS
// ============================================

const TILE_SIZE = 1;
const TILE_GAP = 0.05;
const FLOOR_HEIGHT = 0.15;
const WALL_HEIGHT = 0.6;

// Colors - using white for now as requested
const FLOOR_COLOR = '#ffffff';
const WALL_COLOR = '#ffffff';

// ============================================
// TYPES
// ============================================

interface TileData {
    x: number;
    y: number;
    worldX: number;
    worldZ: number;
}

// ============================================
// INSTANCED FLOOR COMPONENT
// ============================================

interface InstancedFloorProps {
    tiles: TileData[];
}

/**
 * InstancedFloor - Renders all floor tiles using a single InstancedMesh
 * This is CRITICAL for performance - avoids creating separate mesh for each tile
 */
const InstancedFloor: React.FC<InstancedFloorProps> = ({ tiles }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Create geometry and material once
    const geometry = useMemo(() =>
        new THREE.BoxGeometry(TILE_SIZE - TILE_GAP, FLOOR_HEIGHT, TILE_SIZE - TILE_GAP),
        []
    );

    const material = useMemo(() =>
        new THREE.MeshStandardMaterial({
            color: FLOOR_COLOR,
            roughness: 0.5,
            metalness: 0.1,
        }),
        []
    );

    // Update instance matrices when tiles change
    useEffect(() => {
        if (!meshRef.current || tiles.length === 0) return;

        const tempMatrix = new THREE.Matrix4();

        tiles.forEach((tile, index) => {
            tempMatrix.setPosition(tile.worldX, 0, tile.worldZ);
            meshRef.current!.setMatrixAt(index, tempMatrix);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [tiles]);

    if (tiles.length === 0) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, material, tiles.length]}
            castShadow
            receiveShadow
        />
    );
};

// ============================================
// INSTANCED WALLS COMPONENT
// ============================================

interface InstancedWallsProps {
    tiles: TileData[];
}

/**
 * InstancedWalls - Renders all wall tiles using a single InstancedMesh
 * This is CRITICAL for performance - avoids creating separate mesh for each wall
 */
const InstancedWalls: React.FC<InstancedWallsProps> = ({ tiles }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Create geometry and material once
    const geometry = useMemo(() =>
        new THREE.BoxGeometry(TILE_SIZE - TILE_GAP, WALL_HEIGHT, TILE_SIZE - TILE_GAP),
        []
    );

    const material = useMemo(() =>
        new THREE.MeshStandardMaterial({
            color: WALL_COLOR,
            roughness: 0.6,
            metalness: 0.2,
        }),
        []
    );

    // Update instance matrices when tiles change
    useEffect(() => {
        if (!meshRef.current || tiles.length === 0) return;

        const tempMatrix = new THREE.Matrix4();

        tiles.forEach((tile, index) => {
            // Walls are positioned higher (center of wall height)
            tempMatrix.setPosition(tile.worldX, WALL_HEIGHT / 2, tile.worldZ);
            meshRef.current!.setMatrixAt(index, tempMatrix);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [tiles]);

    if (tiles.length === 0) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, material, tiles.length]}
            castShadow
            receiveShadow
        />
    );
};

// ============================================
// MAIN GAME SCENE COMPONENT
// ============================================

/**
 * GameScene - Main 3D scene component
 * Uses InstancedMesh for optimal performance when rendering the grid
 * 
 * CRITICAL: All tiles are rendered using InstancedMesh, NOT individual mesh components
 * This allows rendering thousands of tiles with minimal draw calls
 */
export const GameScene: React.FC = () => {
    // Get grid data from store
    const grid = useGameStore((state: GameState) => state.grid);
    const width = useGameStore((state: GameState) => state.width);
    const height = useGameStore((state: GameState) => state.height);

    // Calculate grid offset to center it in the scene
    const gridOffset = useMemo(() => ({
        x: -((width - 1) * (TILE_SIZE + TILE_GAP)) / 2,
        z: -((height - 1) * (TILE_SIZE + TILE_GAP)) / 2,
    }), [width, height]);

    // Separate grid into floor tiles and wall tiles
    // This is computed once when grid changes
    const { floorTiles, wallTiles } = useMemo(() => {
        const floors: TileData[] = [];
        const walls: TileData[] = [];

        grid.forEach((tileState: number, index: number) => {
            const { x, y } = getXY(index, width);

            // Calculate world position
            const worldX = gridOffset.x + x * (TILE_SIZE + TILE_GAP);
            const worldZ = gridOffset.z + y * (TILE_SIZE + TILE_GAP);

            const tileData: TileData = { x, y, worldX, worldZ };

            if (tileState === WALL) {
                walls.push(tileData);
            } else {
                // PATH and PAINTED tiles are floor tiles
                floors.push(tileData);
            }
        });

        return { floorTiles: floors, wallTiles: walls };
    }, [grid, width, gridOffset]);

    return (
        <group name="game-scene">
            {/* Lighting */}
            <ambientLight intensity={0.6} />
            <directionalLight
                position={[5, 10, 5]}
                intensity={1}
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
            />
            <pointLight position={[-5, 5, -5]} intensity={0.3} color="#ffffff" />

            {/* Grid Container */}
            <group name="grid">
                {/* Floor tiles - single InstancedMesh for all floors */}
                <InstancedFloor tiles={floorTiles} />

                {/* Wall tiles - single InstancedMesh for all walls */}
                <InstancedWalls tiles={wallTiles} />
            </group>
        </group>
    );
};

export default GameScene;
