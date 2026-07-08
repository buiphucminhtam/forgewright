import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Dimensions } from 'react-native';
import { theme, PALETTES } from '../theme/theme';
import PipePuzzleBoard from '../components/PipePuzzleBoard';
import { PipeTile } from '../logic/PipePuzzle';
import { PipeGenerator } from '../logic/PipeGenerator';

const { width } = Dimensions.get('window');
const vw = (percent: number) => (width * percent) / 100;

export function PipeLevelsScreen({ navigation }: any) {
  const [completed, setCompleted] = useState(false);
  const [levelSize, setLevelSize] = useState(3);
  const [tiles, setTiles] = useState<PipeTile[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const [currentTheme, setCurrentTheme] = useState(PALETTES[0]);

  useEffect(() => {
    // Generate a new level when resetKey or levelSize changes
    const newTiles = PipeGenerator.generateLevel(levelSize, levelSize);
    setTiles(newTiles);
    setCompleted(false);
    
    // Pick a random theme!
    const randomTheme = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    setCurrentTheme(randomTheme);
  }, [resetKey, levelSize]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: currentTheme.background }]}>
      <View style={[styles.container, { backgroundColor: currentTheme.background }]}>
        
        {/* TOP HUD */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.hudButton} onPress={() => navigation.goBack()}>
            <Text style={[styles.hudButtonText, { color: currentTheme.secondary }]}>Back</Text>
          </TouchableOpacity>
          
          <View style={styles.hudCenter}>
            <Text style={[styles.hudTitle, { color: currentTheme.text }]}>WATER FLOW</Text>
            <Text style={[styles.hudSubtitle, { color: currentTheme.secondary }]}>{levelSize}x{levelSize} GRID</Text>
          </View>
          
          <TouchableOpacity style={styles.hudButton} onPress={() => {}}>
            <Text style={[styles.hudButtonText, { color: currentTheme.secondary }]}>Hint</Text>
          </TouchableOpacity>
        </View>

        {/* BOARD AREA */}
        <View style={styles.boardContainer}>
          {tiles.length > 0 && (
            <PipePuzzleBoard 
              key={`${levelSize}-${resetKey}`}
              width={levelSize} 
              height={levelSize} 
              initialTiles={tiles} 
              currentTheme={currentTheme}
              onComplete={() => setCompleted(true)} 
            />
          )}
          
          {completed && (
            <View style={[styles.successMessage, { backgroundColor: currentTheme.sink }]}>
              <Text style={styles.successText}>LEVEL COMPLETE!</Text>
            </View>
          )}
        </View>

        {/* BOTTOM CONTROLS */}
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.hudButton, styles.footerButton, { backgroundColor: currentTheme.surface }]} 
            onPress={() => setResetKey(k => k + 1)}
          >
            <Text style={[styles.footerButtonText, { color: currentTheme.text }]}>RETRY</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.hudButton, 
              styles.footerButton, 
              { backgroundColor: currentTheme.surface },
              !completed && styles.hudButtonDisabled, 
              completed && { backgroundColor: currentTheme.primary }
            ]} 
            disabled={!completed}
            onPress={() => {
              // Increase difficulty slowly
              if (levelSize < 8) setLevelSize(s => s + 1);
              else setResetKey(k => k + 1);
            }}
          >
            <Text style={[styles.footerButtonText, { color: currentTheme.text }, completed && styles.nextButtonTextActive]}>NEXT LEVEL</Text>
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
    justifyContent: 'space-between', // Push header to top, footer to bottom
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
  successMessage: {
    position: 'absolute',
    top: 20, // Above the board
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.borderRadius.pill,
    ...theme.shadows.soft,
  },
  successText: {
    color: '#fff',
    fontFamily: 'Inter_900Black',
    fontSize: 16,
    letterSpacing: 1,
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
  nextButtonTextActive: {
    color: '#fff',
  }
});
