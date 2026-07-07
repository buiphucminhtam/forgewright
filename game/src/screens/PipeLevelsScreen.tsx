import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Dimensions } from 'react-native';
import { theme } from '../theme/theme';
import PipePuzzleBoard from '../components/PipePuzzleBoard';
import { PipeTile } from '../logic/PipePuzzle';

const { width } = Dimensions.get('window');
const vw = (percent: number) => (width * percent) / 100;

const LEVEL_WIDTH = 3;
const LEVEL_HEIGHT = 3;

// A complete 3x3 connected loop with a cross in the center, properly scrambled.
const INITIAL_TILES: PipeTile[] = [
  { x: 0, y: 0, baseConnections: [false, true, true, false], rotation: 1, isLocked: false },
  { x: 1, y: 0, baseConnections: [false, true, true, true], rotation: 2, isLocked: false },
  { x: 2, y: 0, baseConnections: [false, true, true, false], rotation: 0, isLocked: false },
  
  { x: 0, y: 1, baseConnections: [false, true, true, true], rotation: 1, isLocked: false },
  { x: 1, y: 1, baseConnections: [true, true, true, true], rotation: 0, isLocked: true },
  { x: 2, y: 1, baseConnections: [false, true, true, true], rotation: 3, isLocked: false },
  
  { x: 0, y: 2, baseConnections: [false, true, true, false], rotation: 2, isLocked: false },
  { x: 1, y: 2, baseConnections: [false, true, true, true], rotation: 0, isLocked: false },
  { x: 2, y: 2, baseConnections: [false, true, true, false], rotation: 1, isLocked: false },
];

export function PipeLevelsScreen({ navigation }: any) {
  const [completed, setCompleted] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  return (
    <View style={styles.container}>
      {/* Meta HUD: Floating Top Bar */}
      <SafeAreaView style={styles.metaHudTop}>
        <TouchableOpacity style={styles.hudButton} onPress={() => navigation.goBack()}>
          <Text style={styles.hudButtonText}>BACK</Text>
        </TouchableOpacity>
        <View style={styles.hudCenter}>
          <Text style={styles.hudTitle}>PIPES</Text>
          <Text style={styles.hudSubtitle}>SEC 2-A</Text>
        </View>
        <TouchableOpacity style={styles.hudButton} onPress={() => {}}>
          <Text style={styles.hudButtonText}>HINT</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <View style={styles.boardContainer}>
        <PipePuzzleBoard 
          key={resetKey}
          width={LEVEL_WIDTH} 
          height={LEVEL_HEIGHT} 
          initialTiles={INITIAL_TILES} 
          onComplete={() => setCompleted(true)} 
        />
      </View>

      {/* Meta HUD: Floating Bottom Controls */}
      <SafeAreaView style={styles.metaHudBottom}>
        <TouchableOpacity 
          style={styles.hudButton} 
          onPress={() => {
            setCompleted(false);
            setResetKey(k => k + 1);
          }}
        >
          <Text style={styles.hudButtonText}>RESET</Text>
        </TouchableOpacity>
        
        {completed && (
          <View style={styles.successMessage}>
            <Text style={styles.successText}>SOLVED</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.hudButton, !completed && styles.hudButtonDisabled]} disabled={!completed}>
          <Text style={styles.hudButtonText}>NEXT</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  metaHudTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: vw(5),
    paddingTop: vw(10),
    zIndex: 10,
  },
  hudCenter: {
    alignItems: 'center',
  },
  hudTitle: {
    fontFamily: 'Inter_900Black',
    color: '#ffffff',
    fontSize: vw(5),
    letterSpacing: 2,
  },
  hudSubtitle: {
    fontFamily: 'Inter_400Regular',
    color: theme.colors.secondary,
    fontSize: vw(3.5),
    marginTop: 2,
  },
  hudButton: {
    minWidth: vw(15),
    minHeight: vw(12),
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudButtonText: {
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.7)',
    fontSize: vw(3.5),
    letterSpacing: 1,
  },
  hudButtonDisabled: {
    opacity: 0.2,
  },
  boardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaHudBottom: {
    position: 'absolute',
    bottom: vw(10),
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: vw(5),
    zIndex: 10,
  },
  successMessage: {
    paddingVertical: vw(2),
    paddingHorizontal: vw(4),
    backgroundColor: theme.colors.secondary,
    borderRadius: vw(2),
  },
  successText: {
    color: '#fff',
    fontFamily: 'Inter_900Black',
    fontSize: vw(3.5),
    letterSpacing: 2,
  }
});
