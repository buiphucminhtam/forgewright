import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, SafeAreaView, Alert } from 'react-native';
import RectanglePuzzleBoard from '../components/RectanglePuzzleBoard';
import { Clue } from '../logic/RectanglePuzzle';

type Level = {
  id: string;
  width: number;
  height: number;
  clues: Clue[];
};

const LEVELS: Level[] = [
  {
    id: 'A-1',
    width: 2,
    height: 1,
    clues: [{ x: 0, y: 0, value: 2 }]
  },
  {
    id: 'A-2',
    width: 2,
    height: 2,
    clues: [
      { x: 0, y: 0, value: 2 },
      { x: 0, y: 1, value: 2 }
    ]
  },
  {
    id: 'A-3',
    width: 3,
    height: 3,
    clues: [
      { x: 0, y: 0, value: 3 },
      { x: 1, y: 1, value: 4 },
      { x: 0, y: 2, value: 2 }
    ]
  }
];

export default function RectangleLevelsScreen() {
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
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Level {level.id}</Text>
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
      <View style={styles.controls}>
        <Button 
          title="Previous" 
          disabled={currentLevelIndex === 0} 
          onPress={() => setCurrentLevelIndex(currentLevelIndex - 1)} 
        />
        <Button 
          title="Next" 
          disabled={currentLevelIndex === LEVELS.length - 1} 
          onPress={() => setCurrentLevelIndex(currentLevelIndex + 1)} 
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5FCFF',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
  },
  boardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 40,
  }
});
