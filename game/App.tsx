import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { MainMenuScreen, RootStackParamList } from './src/screens/MainMenuScreen';
import RectangleLevelsScreen from './src/screens/RectangleLevelsScreen';
import { PipeLevelsScreen } from './src/screens/PipeLevelsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  let [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });

  if (!fontsLoaded) {
    return <View style={styles.loadingContainer} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="MainMenu" screenOptions={{ headerShown: false }}>
        <Stack.Screen 
          name="MainMenu" 
          component={MainMenuScreen} 
        />
        <Stack.Screen 
          name="RectangleLevels" 
          component={RectangleLevelsScreen} 
        />
        <Stack.Screen 
          name="PipeLevels" 
          component={PipeLevelsScreen} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
});
