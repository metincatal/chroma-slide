import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { useGameStore, GameState } from '../store';

// Constants
const PLAYER_RADIUS = 0.35;
const TILE_SIZE = 1;
const GAP = 0.05;
const LERP_SPEED = 0.15; // Smooth movement interpolation

// Player color (blue)
const PLAYER_COLOR = '#3742fa';

/**
 * Player Component
 * Renders the player ball with smooth movement
 */
export const Player: React.FC = () => {
    const player = useGameStore((state: GameState) => state.player);
    const width = useGameStore((state: GameState) => state.width);
    const height = useGameStore((state: GameState) => state.height);

    const meshRef = useRef<THREE.Mesh>(null);

    // Calculate grid offset to center it
    const gridOffset = useMemo(() => ({
        x: -((width - 1) * (TILE_SIZE + GAP)) / 2,
        z: -((height - 1) * (TILE_SIZE + GAP)) / 2,
    }), [width, height]);

    // Target position in world coordinates
    const targetPosition = useMemo(() => ({
        x: gridOffset.x + player.x * (TILE_SIZE + GAP),
        z: gridOffset.z + player.y * (TILE_SIZE + GAP),
    }), [player.x, player.y, gridOffset]);

    // Current position ref for smooth interpolation
    const currentPosition = useRef(new THREE.Vector3(
        targetPosition.x,
        PLAYER_RADIUS + 0.1,
        targetPosition.z
    ));

    // Animate position smoothly
    useFrame(() => {
        if (!meshRef.current) return;

        // Lerp current position towards target
        currentPosition.current.x = THREE.MathUtils.lerp(
            currentPosition.current.x,
            targetPosition.x,
            LERP_SPEED
        );
        currentPosition.current.z = THREE.MathUtils.lerp(
            currentPosition.current.z,
            targetPosition.z,
            LERP_SPEED
        );

        meshRef.current.position.copy(currentPosition.current);

        // Add subtle bounce/pulsing animation
        const time = Date.now() * 0.002;
        meshRef.current.position.y = PLAYER_RADIUS + 0.1 + Math.sin(time) * 0.02;
    });

    if (width === 0 || height === 0) {
        return null;
    }

    return (
        <mesh ref={meshRef} castShadow>
            <sphereGeometry args={[PLAYER_RADIUS, 32, 32]} />
            <meshStandardMaterial
                color={PLAYER_COLOR}
                roughness={0.2}
                metalness={0.3}
                emissive={PLAYER_COLOR}
                emissiveIntensity={0.2}
            />
        </mesh>
    );
};

export default Player;
