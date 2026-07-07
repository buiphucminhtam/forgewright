import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../theme/theme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  MainMenu: undefined;
  RectangleLevels: undefined;
  PipeLevels: undefined;
};

type MainMenuScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'MainMenu'>;

type Props = {
  navigation: MainMenuScreenNavigationProp;
};

export function MainMenuScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Journey Map</Text>
      
      <View style={styles.mapContainer}>
        <TouchableOpacity 
          style={styles.levelNode} 
          onPress={() => navigation.navigate('RectangleLevels')}
        >
          <Text style={styles.levelText}>1</Text>
        </TouchableOpacity>
        
        <View style={styles.pathLine} />
        
        <TouchableOpacity 
          style={[styles.levelNode, styles.levelNodeSecondary]} 
          onPress={() => navigation.navigate('PipeLevels')}
        >
          <Text style={styles.levelText}>2</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.typography.sizes.h1,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xxl,
  },
  mapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelNode: {
    width: 60,
    height: 60,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  levelNodeSecondary: {
    backgroundColor: theme.colors.secondary,
  },
  levelText: {
    color: theme.colors.surface,
    fontSize: theme.typography.sizes.h2,
    fontWeight: theme.typography.weights.bold,
  },
  pathLine: {
    width: 80,
    height: 4,
    backgroundColor: theme.colors.border,
  }
});
