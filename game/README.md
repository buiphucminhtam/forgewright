# Logic Puzzles Game

A React Native / Expo puzzle game focusing on advanced UI/UX heuristics.

## Features
- **Advanced Typographic Scaling:** Uses `@expo-google-fonts/inter` (Inter Variable font) with Viewport-scaled (`vw()`) typographies.
- **Bento Grid Layout:** Replaces traditional lists with a responsive native flexbox bento grid in the `MainMenuScreen`, adhering to progressive disclosure.
- **Meta HUDs:** Replaces traditional navigation header bars with floating Meta HUDs anchored to `SafeAreaView` in the puzzle screens (`RectangleLevelsScreen`, `PipeLevelsScreen`).
- **Ergonomic Touch Targets:** Touch targets meet Fitts's law spacing principles.
- **Smooth Animations:** Powered by `react-native-reanimated` for spring animations and press effects.

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the Expo server:**
   ```bash
   npm start
   ```

## Testing

The project includes an automated test suite configured with Jest, `react-test-renderer`, and `react-native-reanimated` mocks.

To run the tests:
```bash
npm test
```

To run a static type check (TypeScript):
```bash
npx tsc --noEmit
```
