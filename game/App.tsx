import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainMenuScreen, RootStackParamList } from './src/screens/MainMenuScreen';
import RectangleLevelsScreen from './src/screens/RectangleLevelsScreen';
import { PipeLevelsScreen } from './src/screens/PipeLevelsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="MainMenu">
        <Stack.Screen 
          name="MainMenu" 
          component={MainMenuScreen} 
          options={{ title: 'Select Level' }}
        />
        <Stack.Screen 
          name="RectangleLevels" 
          component={RectangleLevelsScreen} 
          options={{ title: 'Rectangle Puzzles' }}
        />
        <Stack.Screen 
          name="PipeLevels" 
          component={PipeLevelsScreen} 
          options={{ title: 'Pipe Puzzles' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
