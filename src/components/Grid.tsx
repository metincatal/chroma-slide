import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { useGameStore, WALL, PATH, PAINTED, getXY, GameState } from '../store';

// Constants
const TILE_SIZE = 1;
const TILE_HEIGHT = 0.1;
const WALL_HEIGHT = 0.5;
const GAP = 0.05;

// Colors
const WALL_COLOR = '#2c2c54';
const PATH_COLOR = '#3d3d5c';
const PAINTED_COLOR = '#3742fa';

/**
 * Grid Component
 * Uses InstancedMesh for optimal performance
 * Renders floor tiles and walls from flat number array
 */
export const Grid: React.FC = () => {
    const grid = useGameStore((state: GameState) => state.grid);
    const width = useGameStore((state: GameState) => state.width);
    const height = useGameStore((state: GameState) => state.height);

    // Refs for instanced meshes
    const floorMeshRef = useRef<THREE.InstancedMesh>(null);
    const wallMeshRef = useRef<THREE.InstancedMesh>(null);

    // Calculate grid offset to center it
    const gridOffset = useMemo(() => ({
        x: -((width - 1) * (TILE_SIZE + GAP)) / 2,
        z: -((height - 1) * (TILE_SIZE + GAP)) / 2,
    }), [width, height]);

    // Separate tiles into floors and walls
    const { floorTiles, wallTiles } = useMemo(() => {
        const floors: { x: number; y: number; state: number }[] = [];
        const walls: { x: number; y: number }[] = [];

        grid.forEach((tileState: number, index: number) => {
            const { x, y } = getXY(index, width);

            if (tileState === WALL) {
                walls.push({ x, y });
            } else {
                floors.push({ x, y, state: tileState });
            }
        });

        return { floorTiles: floors, wallTiles: walls };
    }, [grid, width]);

    // Update instanced mesh transforms
    useFrame(() => {
        if (!floorMeshRef.current || !wallMeshRef.current) return;

        const tempMatrix = new THREE.Matrix4();
        const tempColor = new THREE.Color();

        // Update floor tiles
        floorTiles.forEach((tile, i) => {
            const worldX = gridOffset.x + tile.x * (TILE_SIZE + GAP);
            const worldZ = gridOffset.z + tile.y * (TILE_SIZE + GAP);

            tempMatrix.setPosition(worldX, 0, worldZ);
            floorMeshRef.current!.setMatrixAt(i, tempMatrix);

            // Set color based on tile state (PATH or PAINTED)
            const color = tile.state === PAINTED ? PAINTED_COLOR : PATH_COLOR;
            tempColor.set(color);
            floorMeshRef.current!.setColorAt(i, tempColor);
        });

        floorMeshRef.current.instanceMatrix.needsUpdate = true;
        if (floorMeshRef.current.instanceColor) {
            floorMeshRef.current.instanceColor.needsUpdate = true;
        }

        // Update wall tiles
        wallTiles.forEach((tile, i) => {
            const worldX = gridOffset.x + tile.x * (TILE_SIZE + GAP);
            const worldZ = gridOffset.z + tile.y * (TILE_SIZE + GAP);

            tempMatrix.setPosition(worldX, WALL_HEIGHT / 2, worldZ);
            wallMeshRef.current!.setMatrixAt(i, tempMatrix);
        });

        wallMeshRef.current.instanceMatrix.needsUpdate = true;
    });

    // Floor geometry and material
    const floorGeometry = useMemo(() =>
        new THREE.BoxGeometry(TILE_SIZE - GAP, TILE_HEIGHT, TILE_SIZE - GAP),
        []
    );

    const floorMaterial = useMemo(() =>
        new THREE.MeshStandardMaterial({
            roughness: 0.4,
            metalness: 0.1,
        }),
        []
    );

    // Wall geometry and material
    const wallGeometry = useMemo(() =>
        new THREE.BoxGeometry(TILE_SIZE - GAP, WALL_HEIGHT, TILE_SIZE - GAP),
        []
    );

    const wallMaterial = useMemo(() =>
        new THREE.MeshStandardMaterial({
            color: WALL_COLOR,
            roughness: 0.6,
            metalness: 0.2,
        }),
        []
    );

    if (floorTiles.length === 0 && wallTiles.length === 0) {
        return null;
    }

    return (
        <group>
            {/* Floor tiles */}
            {floorTiles.length > 0 && (
                <instancedMesh
                    ref={floorMeshRef}
                    args={[floorGeometry, floorMaterial, floorTiles.length]}
                    castShadow
                    receiveShadow
                />
            )}

            {/* Wall tiles */}
            {wallTiles.length > 0 && (
                <instancedMesh
                    ref={wallMeshRef}
                    args={[wallGeometry, wallMaterial, wallTiles.length]}
                    castShadow
                    receiveShadow
                />
            )}
        </group>
    );
};

export default Grid;
