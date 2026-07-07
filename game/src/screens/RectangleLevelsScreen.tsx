import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, Dimensions } from 'react-native';
import RectanglePuzzleBoard from '../components/RectanglePuzzleBoard';
import { Clue } from '../logic/RectanglePuzzle';
import { theme } from '../theme/theme';

const { width } = Dimensions.get('window');
const vw = (percent: number) => (width * percent) / 100;

type Level = {
  id: string;
  width: number;
  height: number;
  clues: Clue[];
};

const LEVELS: Level[] = [
  { id: 'A-1', width: 2, height: 1, clues: [{ x: 0, y: 0, value: 2 }] },
  { id: 'A-2', width: 2, height: 2, clues: [{ x: 0, y: 0, value: 2 }, { x: 0, y: 1, value: 2 }] },
  { id: 'A-3', width: 3, height: 3, clues: [{ x: 0, y: 0, value: 3 }, { x: 1, y: 1, value: 4 }, { x: 0, y: 2, value: 2 }] }
];

export default function RectangleLevelsScreen({ navigation }: any) {
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);

  const level = LEVELS[currentLevelIndex];

  const handleComplete = () => {
    Alert.alert('Puzzle Solved!', 'You have completed this level.', [
      {
        text: 'Next Level',
        onPress: () => {
          if (currentLevelIndex < LEVELS.length - 1) {
            setCurrentLevelIndex(currentLevelIndex + 1);
          } else {
            Alert.alert('Congratulations!', 'You completed all available levels.');
            setCurrentLevelIndex(0);
          }
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Meta HUD: Floating Top Bar */}
      <SafeAreaView style={styles.metaHudTop}>
        <TouchableOpacity style={styles.hudButton} onPress={() => navigation.goBack()}>
          <Text style={styles.hudButtonText}>BACK</Text>
        </TouchableOpacity>
        <View style={styles.hudCenter}>
          <Text style={styles.hudTitle}>RECTANGLES</Text>
          <Text style={styles.hudSubtitle}>SEC {level.id}</Text>
        </View>
        <TouchableOpacity style={styles.hudButton} onPress={() => {}}>
          <Text style={styles.hudButtonText}>HINT</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <View style={styles.boardContainer}>
        {/* We use key to force re-mount when level changes so state resets */}
        <RectanglePuzzleBoard 
          key={level.id}
          width={level.width} 
          height={level.height} 
          clues={level.clues} 
          onComplete={handleComplete} 
        />
      </View>

      {/* Meta HUD: Floating Bottom Controls */}
      <SafeAreaView style={styles.metaHudBottom}>
        <TouchableOpacity 
          style={[styles.hudButton, currentLevelIndex === 0 && styles.hudButtonDisabled]} 
          disabled={currentLevelIndex === 0} 
          onPress={() => setCurrentLevelIndex(currentLevelIndex - 1)} 
        >
          <Text style={styles.hudButtonText}>PREV</Text>
        </TouchableOpacity>
        
        <View style={styles.progressDots}>
          {LEVELS.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentLevelIndex && styles.activeDot]} />
          ))}
        </View>

        <TouchableOpacity 
          style={[styles.hudButton, currentLevelIndex === LEVELS.length - 1 && styles.hudButtonDisabled]} 
          disabled={currentLevelIndex === LEVELS.length - 1} 
          onPress={() => setCurrentLevelIndex(currentLevelIndex + 1)} 
        >
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
    color: theme.colors.primary,
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
  progressDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  activeDot: {
    backgroundColor: theme.colors.primary,
  }
});
