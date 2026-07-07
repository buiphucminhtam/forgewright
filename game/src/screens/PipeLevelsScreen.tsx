import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { theme } from '../theme/theme';
import PipePuzzleBoard from '../components/PipePuzzleBoard';
import { PipeTile } from '../logic/PipePuzzle';

const LEVEL_WIDTH = 3;
const LEVEL_HEIGHT = 3;

// A complete 3x3 connected loop with a cross in the center, properly scrambled.
const INITIAL_TILES: PipeTile[] = [
  // 0,0: Corner (solution: R, B -> rot 0). base: [false, true, true, false]. scrambled: rot 1
  { x: 0, y: 0, baseConnections: [false, true, true, false], rotation: 1, isLocked: false },
  // 1,0: T-shape (solution: L, R, B -> rot 0). base: [false, true, true, true]. scrambled: rot 2
  { x: 1, y: 0, baseConnections: [false, true, true, true], rotation: 2, isLocked: false },
  // 2,0: Corner (solution: L, B -> rot 1). base: [false, true, true, false]. scrambled: rot 0
  { x: 2, y: 0, baseConnections: [false, true, true, false], rotation: 0, isLocked: false },
  
  // 0,1: T-shape (solution: T, R, B -> rot 3). base: [false, true, true, true]. scrambled: rot 1
  { x: 0, y: 1, baseConnections: [false, true, true, true], rotation: 1, isLocked: false },
  // 1,1: Cross (solution: T, R, B, L -> rot 0). base: [true, true, true, true]. scrambled: rot 0 (locked)
  { x: 1, y: 1, baseConnections: [true, true, true, true], rotation: 0, isLocked: true },
  // 2,1: T-shape (solution: T, L, B -> rot 1). base: [false, true, true, true]. scrambled: rot 3
  { x: 2, y: 1, baseConnections: [false, true, true, true], rotation: 3, isLocked: false },
  
  // 0,2: Corner (solution: T, R -> rot 3). base: [false, true, true, false]. scrambled: rot 2
  { x: 0, y: 2, baseConnections: [false, true, true, false], rotation: 2, isLocked: false },
  // 1,2: T-shape (solution: T, L, R -> rot 2). base: [false, true, true, true]. scrambled: rot 0
  { x: 1, y: 2, baseConnections: [false, true, true, true], rotation: 0, isLocked: false },
  // 2,2: Corner (solution: T, L -> rot 2). base: [false, true, true, false]. scrambled: rot 1
  { x: 2, y: 2, baseConnections: [false, true, true, false], rotation: 1, isLocked: false },
];

export function PipeLevelsScreen() {
  const [completed, setCompleted] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Pipe Connection</Text>
        <Text style={styles.subtitle}>Tap tiles to rotate them and connect all pipes to form a continuous network.</Text>
        
        <View style={styles.boardContainer}>
          <PipePuzzleBoard 
            key={resetKey}
            width={LEVEL_WIDTH} 
            height={LEVEL_HEIGHT} 
            initialTiles={INITIAL_TILES} 
            onComplete={() => setCompleted(true)} 
          />
        </View>

        {completed && (
          <View style={styles.successMessage}>
            <Text style={styles.successText}>Puzzle Solved!</Text>
          </View>
        )}

        <TouchableOpacity 
          style={styles.resetButton} 
          onPress={() => {
            setCompleted(false);
            setResetKey(k => k + 1);
          }}
        >
          <Text style={styles.resetButtonText}>Reset Puzzle</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.sizes.h1,
    color: theme.colors.text,
    fontWeight: theme.typography.weights.bold,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.text,
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  boardContainer: {
    marginVertical: theme.spacing.lg,
  },
  successMessage: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  successText: {
    color: theme.colors.surface,
    fontSize: theme.typography.sizes.h3,
    fontWeight: theme.typography.weights.bold,
  },
  resetButton: {
    marginTop: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.pill,
  },
  resetButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
  }
});
