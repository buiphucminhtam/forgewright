import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { PipeTile, PipeValidator } from '../logic/PipePuzzle';
import { theme } from '../theme/theme';

interface Props {
  width: number;
  height: number;
  initialTiles: PipeTile[];
  onComplete?: () => void;
}

export default function PipePuzzleBoard({ width, height, initialTiles, onComplete }: Props) {
  const [tiles, setTiles] = useState<PipeTile[]>([]);

  useEffect(() => {
    // Deep clone initial tiles
    setTiles(initialTiles.map(t => ({ ...t })));
  }, [initialTiles]);

  // Use a fixed board size based on screen width
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
    if (tiles.length > 0) {
      if (PipeValidator.isValid(width, height, tiles)) {
        onComplete?.();
      }
    }
  }, [tiles, width, height, onComplete]);

  return (
    <View style={[styles.board, { width: boardSize, height: (cellSize * height) + padding * 2 }]}>
      {tiles.map((tile, index) => {
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
              <View style={styles.centerNode} />
              
              {/* Pipe arms */}
              {tile.baseConnections[0] && <View style={[styles.pipeArm, styles.pipeTop]} />}
              {tile.baseConnections[1] && <View style={[styles.pipeArm, styles.pipeRight]} />}
              {tile.baseConnections[2] && <View style={[styles.pipeArm, styles.pipeBottom]} />}
              {tile.baseConnections[3] && <View style={[styles.pipeArm, styles.pipeLeft]} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    position: 'relative',
    ...theme.shadows.clay,
  },
  tileWrapper: {
    position: 'absolute',
    // removed hard borders
  },
  tileInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent', // Let board background show through
    borderRadius: theme.borderRadius.md,
  },
  tileLocked: {
    backgroundColor: 'rgba(235, 235, 235, 0.4)', // subtle visual distinction
  },
  centerNode: {
    position: 'absolute',
    width: '40%',
    height: '40%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.pill,
    zIndex: 2,
    ...theme.shadows.claySoft,
  },
  pipeArm: {
    position: 'absolute',
    backgroundColor: theme.colors.primary,
    zIndex: 1,
    ...theme.shadows.claySoft,
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
