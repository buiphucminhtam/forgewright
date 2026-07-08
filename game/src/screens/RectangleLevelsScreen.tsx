import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Dimensions, Alert } from 'react-native';
import RectanglePuzzleBoard from '../components/RectanglePuzzleBoard';
import { Clue } from '../logic/RectanglePuzzle';
import { theme, PALETTES } from '../theme/theme';

const { width } = Dimensions.get('window');
const vw = (percent: number) => (width * percent) / 100;

type Level = {
  id: string;
  width: number;
  height: number;
  clues: Clue[];
};

const LEVELS: Level[] = [
  { id: '1', width: 2, height: 1, clues: [{ x: 0, y: 0, value: 2 }] },
  { id: '2', width: 2, height: 2, clues: [{ x: 0, y: 0, value: 2 }, { x: 0, y: 1, value: 2 }] },
  { id: '3', width: 3, height: 3, clues: [{ x: 0, y: 0, value: 3 }, { x: 1, y: 1, value: 4 }, { x: 0, y: 2, value: 2 }] }
];

export default function RectangleLevelsScreen({ navigation }: any) {
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [currentTheme, setCurrentTheme] = useState(PALETTES[0]);

  useEffect(() => {
    // Random theme per level
    const randomTheme = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    setCurrentTheme(randomTheme);
  }, [currentLevelIndex]);

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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: currentTheme.background }]}>
      <View style={[styles.container, { backgroundColor: currentTheme.background }]}>
        
        {/* TOP HUD */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.hudButton} onPress={() => navigation.goBack()}>
            <Text style={[styles.hudButtonText, { color: currentTheme.secondary }]}>Back</Text>
          </TouchableOpacity>
          
          <View style={styles.hudCenter}>
            <Text style={[styles.hudTitle, { color: currentTheme.text }]}>RECTANGLES</Text>
            <Text style={[styles.hudSubtitle, { color: currentTheme.secondary }]}>LEVEL {level.id}</Text>
          </View>
          
          <TouchableOpacity style={styles.hudButton} onPress={() => {}}>
            <Text style={[styles.hudButtonText, { color: currentTheme.secondary }]}>Hint</Text>
          </TouchableOpacity>
        </View>

        {/* BOARD AREA */}
        <View style={styles.boardContainer}>
          <RectanglePuzzleBoard 
            key={level.id}
            width={level.width} 
            height={level.height} 
            clues={level.clues} 
            currentTheme={currentTheme}
            onComplete={handleComplete} 
          />
        </View>

        {/* BOTTOM CONTROLS */}
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.hudButton, styles.footerButton, { backgroundColor: currentTheme.surface }, currentLevelIndex === 0 && styles.hudButtonDisabled]} 
            disabled={currentLevelIndex === 0} 
            onPress={() => setCurrentLevelIndex(currentLevelIndex - 1)} 
          >
            <Text style={[styles.footerButtonText, { color: currentTheme.text }]}>PREV</Text>
          </TouchableOpacity>
          
          <View style={styles.progressDots}>
            {LEVELS.map((_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: currentTheme.border }, i === currentLevelIndex && { backgroundColor: currentTheme.primary }]} />
            ))}
          </View>

          <TouchableOpacity 
            style={[styles.hudButton, styles.footerButton, { backgroundColor: currentTheme.surface }, currentLevelIndex === LEVELS.length - 1 && styles.hudButtonDisabled]} 
            disabled={currentLevelIndex === LEVELS.length - 1} 
            onPress={() => setCurrentLevelIndex(currentLevelIndex + 1)} 
          >
            <Text style={[styles.footerButtonText, { color: currentTheme.text }]}>NEXT</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: vw(5),
    paddingTop: vw(4),
    paddingBottom: vw(2),
  },
  hudCenter: {
    alignItems: 'center',
  },
  hudTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: vw(5),
    letterSpacing: 2,
  },
  hudSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: vw(3.5),
    marginTop: 2,
    letterSpacing: 1,
  },
  hudButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: vw(4),
  },
  boardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: vw(5),
    paddingBottom: vw(8),
    paddingTop: vw(4),
  },
  footerButton: {
    borderRadius: theme.borderRadius.pill,
    paddingHorizontal: 24,
    ...theme.shadows.soft,
  },
  footerButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  hudButtonDisabled: {
    opacity: 0.3,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  }
});
