import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { PipeTile, PipeValidator } from '../logic/PipePuzzle';
import { theme } from '../theme/theme';

interface Props {
  width: number;
  height: number;
  initialTiles: PipeTile[];
  currentTheme?: typeof theme.colors;
  onComplete?: () => void;
}

export default function PipePuzzleBoard({ width, height, initialTiles, currentTheme = theme.colors, onComplete }: Props) {
  const [tiles, setTiles] = useState<PipeTile[]>([]);

  useEffect(() => {
    setTiles(initialTiles.map(t => ({ ...t })));
  }, [initialTiles]);

  // Compute flow state on every render
  const flowState = PipeValidator.getFlowState(width, height, tiles);
  const filledTiles = flowState.filled;

  const screenWidth = Dimensions.get('window').width;
  const padding = theme.spacing.md;
  const boardSize = Math.min(screenWidth - theme.spacing.lg * 2, 400);
  const innerBoardSize = boardSize - padding * 2;
  const cellSize = innerBoardSize / Math.max(width, height);

  const handleTilePress = (index: number) => {
    setTiles(prevTiles => {
      const newTiles = [...prevTiles];
      const tile = { ...newTiles[index] };
      if (!tile.isLocked) {
        tile.rotation = (tile.rotation + 1) % 4;
        newTiles[index] = tile;
      }
      return newTiles;
    });
  };

  useEffect(() => {
    if (tiles.length > 0 && flowState.isSolved) {
      onComplete?.();
    }
  }, [tiles, flowState.isSolved, onComplete]);

  return (
    <View style={[styles.board, { 
      backgroundColor: currentTheme.surface, 
      width: boardSize, 
      height: (cellSize * height) + padding * 2 
    }]}>
      {tiles.map((tile, index) => {
        // Is this tile filled with fluid?
        const isFilled = filledTiles.has(tile);
        
        // Determine colors based on type and filled state
        let pipeColor = isFilled ? currentTheme.primary : currentTheme.emptyPipe;
        let centerColor = isFilled ? currentTheme.primary : currentTheme.emptyPipe;
        
        if (tile.type === 'source') {
          centerColor = currentTheme.source;
          pipeColor = currentTheme.source;
        } else if (tile.type === 'sink') {
          centerColor = isFilled ? currentTheme.sink : currentTheme.secondary;
          pipeColor = isFilled ? currentTheme.sink : currentTheme.emptyPipe;
        }

        return (
          <TouchableOpacity
            key={`tile-${tile.x}-${tile.y}`}
            activeOpacity={tile.isLocked ? 1 : 0.7}
            onPress={() => handleTilePress(index)}
            style={[
              styles.tileWrapper,
              {
                left: tile.x * cellSize + padding,
                top: tile.y * cellSize + padding,
                width: cellSize,
                height: cellSize,
              }
            ]}
          >
            <View
              style={[
                styles.tileInner,
                tile.isLocked && styles.tileLocked,
                { transform: [{ rotate: `${tile.rotation * 90}deg` }] }
              ]}
            >
              {/* Center node */}
              <View style={[
                styles.centerNode, 
                { backgroundColor: centerColor },
                tile.type === 'source' && styles.sourceNode,
                tile.type === 'sink' && styles.sinkNode,
              ]} />
              
              {/* Pipe arms */}
              {tile.baseConnections[0] && <View style={[styles.pipeArm, styles.pipeTop, { backgroundColor: pipeColor }]} />}
              {tile.baseConnections[1] && <View style={[styles.pipeArm, styles.pipeRight, { backgroundColor: pipeColor }]} />}
              {tile.baseConnections[2] && <View style={[styles.pipeArm, styles.pipeBottom, { backgroundColor: pipeColor }]} />}
              {tile.baseConnections[3] && <View style={[styles.pipeArm, styles.pipeLeft, { backgroundColor: pipeColor }]} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    borderRadius: theme.borderRadius.xl,
    position: 'relative',
    ...theme.shadows.soft,
  },
  tileWrapper: {
    position: 'absolute',
  },
  tileInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: theme.borderRadius.md,
  },
  tileLocked: {
    backgroundColor: 'rgba(200, 200, 200, 0.15)',
  },
  centerNode: {
    position: 'absolute',
    width: '40%',
    height: '40%',
    borderRadius: theme.borderRadius.pill,
    zIndex: 2,
  },
  sourceNode: {
    width: '50%',
    height: '50%',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.8)',
    ...theme.shadows.innerPulse,
  },
  sinkNode: {
    width: '50%',
    height: '50%',
    borderRadius: 8, // Square-ish for sink
  },
  pipeArm: {
    position: 'absolute',
    zIndex: 1,
  },
  pipeTop: {
    width: '40%',
    height: '50%',
    top: 0,
    borderTopLeftRadius: theme.borderRadius.sm,
    borderTopRightRadius: theme.borderRadius.sm,
  },
  pipeRight: {
    width: '50%',
    height: '40%',
    right: 0,
    borderTopRightRadius: theme.borderRadius.sm,
    borderBottomRightRadius: theme.borderRadius.sm,
  },
  pipeBottom: {
    width: '40%',
    height: '50%',
    bottom: 0,
    borderBottomLeftRadius: theme.borderRadius.sm,
    borderBottomRightRadius: theme.borderRadius.sm,
  },
  pipeLeft: {
    width: '50%',
    height: '40%',
    left: 0,
    borderTopLeftRadius: theme.borderRadius.sm,
    borderBottomLeftRadius: theme.borderRadius.sm,
  },
});
