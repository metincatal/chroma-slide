import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar, Text, Animated } from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas } from '@react-three/fiber/native';
import { OrbitControls } from '@react-three/drei/native';

// Components
import { GameScene, Player } from './src/components';

// Store
import { useGameStore, Direction, GameState } from './src/store';

/**
 * Initialize test level on mount
 */
const useInitializeGame = () => {
    const initializeTestGrid = useGameStore((state: GameState) => state.initializeTestGrid);

    useEffect(() => {
        initializeTestGrid();
    }, []);
};

/**
 * Scene wrapper with OrbitControls
 */
const SceneWithControls: React.FC = () => {
    return (
        <>
            {/* Main Game Scene with InstancedMesh */}
            <GameScene />

            {/* Player */}
            <Player />

            {/* Camera Controls - Pan disabled for swipe gestures */}
            <OrbitControls
                enablePan={false}
                enableZoom={true}
                enableRotate={true}
                minDistance={12}
                maxDistance={30}
                minPolarAngle={0.2}      // Çok yukarıdan bakmasın
                maxPolarAngle={Math.PI / 3}  // Çok yandan bakmasın (~60 derece)
            />
        </>
    );
};

// Main App Component
const App: React.FC = () => {
    // Initialize game on mount
    useInitializeGame();

    // Get store values
    const movePlayer = useGameStore((state: GameState) => state.movePlayer);
    const moveCount = useGameStore((state: GameState) => state.moveCount);
    const paintedCount = useGameStore((state: GameState) => state.paintedCount);
    const totalPathTiles = useGameStore((state: GameState) => state.totalPathTiles);
    const isGameComplete = useGameStore((state: GameState) => state.isGameComplete);
    const resetGame = useGameStore((state: GameState) => state.resetGame);

    // Swipe gesture for movement
    const swipeGesture = Gesture.Pan()
        .onEnd((event) => {
            const { translationX, translationY } = event;
            const threshold = 30;

            // Determine swipe direction
            if (Math.abs(translationX) > Math.abs(translationY)) {
                // Horizontal swipe
                if (translationX > threshold) {
                    movePlayer(Direction.RIGHT);
                } else if (translationX < -threshold) {
                    movePlayer(Direction.LEFT);
                }
            } else {
                // Vertical swipe
                if (translationY > threshold) {
                    movePlayer(Direction.DOWN);
                } else if (translationY < -threshold) {
                    movePlayer(Direction.UP);
                }
            }
        });

    return (
        <GestureHandlerRootView style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header UI */}
            <View style={styles.header} pointerEvents="box-none">
                <Text style={styles.title}>🎨 Chroma Maze</Text>
                <View style={styles.statsContainer}>
                    <Text style={styles.stats}>Hamle: {moveCount}</Text>
                    <Text style={styles.stats}>Boya: {paintedCount}/{totalPathTiles}</Text>
                </View>
            </View>

            {/* Game Complete Banner */}
            {isGameComplete && (
                <View style={styles.completeBanner}>
                    <Text style={styles.completeText}>🎉 Tebrikler!</Text>
                    <Text style={styles.completeSubtext}>{moveCount} hamlede tamamlandı</Text>
                    <Text style={styles.resetButton} onPress={resetGame}>
                        Tekrar Oyna
                    </Text>
                </View>
            )}

            {/* 3D Canvas */}
            <View style={styles.canvasContainer}>
                <Canvas
                    camera={{
                        position: [0, 18, 6],  // Daha yukarıdan, daha az açılı
                        fov: 50,               // Geniş görüş açısı
                        near: 0.1,
                        far: 100,
                    }}
                    gl={{ antialias: true }}
                >
                    <SceneWithControls />
                </Canvas>
            </View>

            {/* Full-screen Gesture Overlay */}
            <GestureDetector gesture={swipeGesture}>
                <Animated.View
                    style={styles.fullScreenGesture}
                    collapsable={false}
                />
            </GestureDetector>

            {/* Footer - Instructions */}
            <View style={styles.footer} pointerEvents="none">
                <Text style={styles.instructions}>
                    👆 Kaydırarak hareket et | 🎯 Tüm alanı boya!
                </Text>
            </View>
        </GestureHandlerRootView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f0f23',
    },
    header: {
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    statsContainer: {
        alignItems: 'flex-end',
    },
    stats: {
        fontSize: 14,
        color: '#a0a0a0',
    },
    canvasContainer: {
        flex: 1,
        position: 'relative',
    },
    fullScreenGesture: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
    },
    footer: {
        padding: 20,
        alignItems: 'center',
    },
    instructions: {
        fontSize: 14,
        color: '#6c6c8a',
    },
    completeBanner: {
        backgroundColor: '#2ed573',
        padding: 15,
        marginHorizontal: 20,
        borderRadius: 12,
        alignItems: 'center',
    },
    completeText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    completeSubtext: {
        fontSize: 14,
        color: '#ffffff',
        opacity: 0.8,
    },
    resetButton: {
        marginTop: 10,
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0f0f23',
        backgroundColor: '#ffffff',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 8,
        overflow: 'hidden',
    },
});

export default App;
