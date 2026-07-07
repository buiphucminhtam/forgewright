import React from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView, Pressable } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { theme } from '../theme/theme';

const { width } = Dimensions.get('window');
// Simple Viewport width scale function
const vw = (percent: number) => (width * percent) / 100;

export type RootStackParamList = {
  MainMenu: undefined;
  RectangleLevels: undefined;
  PipeLevels: undefined;
};

type MainMenuScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'MainMenu'>;

type Props = {
  navigation: MainMenuScreenNavigationProp;
};

const BentoCard = ({ 
  title, 
  subtitle, 
  color, 
  onPress, 
  locked = false,
  wide = false 
}: { 
  title: string, 
  subtitle: string, 
  color: string, 
  onPress: () => void,
  locked?: boolean,
  wide?: boolean
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.95); }}
      onPressOut={() => { scale.value = withSpring(1); }}
      onPress={locked ? undefined : onPress}
      style={[styles.cardWrapper, { width: wide ? '100%' : '48%' }]}
    >
      <Animated.View style={[
        styles.card, 
        animatedStyle, 
        { backgroundColor: locked ? theme.colors.surface : color },
        locked && styles.lockedCard
      ]}>
        <Text style={[styles.cardTitle, { fontFamily: 'Inter_900Black', color: locked ? theme.colors.border : '#fff' }]}>
          {title}
        </Text>
        <Text style={[styles.cardSubtitle, { fontFamily: 'Inter_400Regular', color: locked ? theme.colors.border : 'rgba(255,255,255,0.8)' }]}>
          {locked ? 'Locked' : subtitle}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export function MainMenuScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.headerTitle}>Select Level</Text>
      <Text style={styles.headerSubtitle}>Discover logic puzzles</Text>
      
      <View style={styles.bentoGrid}>
        <BentoCard 
          title="Rectangles" 
          subtitle="Geometry logic" 
          color={theme.colors.primary} 
          wide={true}
          onPress={() => navigation.navigate('RectangleLevels')} 
        />
        <BentoCard 
          title="Pipes" 
          subtitle="Flow puzzles" 
          color={theme.colors.secondary} 
          onPress={() => navigation.navigate('PipeLevels')} 
        />
        <BentoCard 
          title="Circuit" 
          subtitle="Coming Soon" 
          color="#333" 
          locked={true}
          onPress={() => {}} 
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    padding: vw(5),
    paddingTop: vw(15),
    paddingBottom: vw(10),
  },
  headerTitle: {
    fontSize: vw(10),
    fontFamily: 'Inter_900Black',
    color: '#ffffff',
    marginBottom: vw(2),
  },
  headerSubtitle: {
    fontSize: vw(4.5),
    fontFamily: 'Inter_400Regular',
    color: '#888888',
    marginBottom: vw(8),
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: vw(4),
  },
  cardWrapper: {
    marginBottom: vw(4),
  },
  card: {
    padding: vw(6),
    borderRadius: vw(6),
    minHeight: vw(40),
    justifyContent: 'flex-end',
    // Fitts's Law applied: Min touch target via minHeight & padding
  },
  lockedCard: {
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  cardTitle: {
    fontSize: vw(7),
    marginBottom: vw(1),
  },
  cardSubtitle: {
    fontSize: vw(4),
  }
});
