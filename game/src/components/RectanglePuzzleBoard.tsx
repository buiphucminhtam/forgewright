import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, TouchableOpacity } from 'react-native';
import { Clue, Rectangle, RectangleValidator } from '../logic/RectanglePuzzle';

interface Props {
  width: number;
  height: number;
  clues: Clue[];
  onComplete?: () => void;
}

const CELL_SIZE = 60;

export default function RectanglePuzzleBoard({ width, height, clues, onComplete }: Props) {
  const [rectangles, setRectangles] = useState<Rectangle[]>([]);
  const [currentDrag, setCurrentDrag] = useState<Rectangle | null>(null);

  const containerRef = useRef<View>(null);
  const [boardLayout, setBoardLayout] = useState<{ x: number, y: number }>({ x: 0, y: 0 });

  const getCellFromTouch = (pageX: number, pageY: number) => {
    const x = Math.floor((pageX - boardLayout.x) / CELL_SIZE);
    const y = Math.floor((pageY - boardLayout.y) / CELL_SIZE);
    return { 
      x: Math.max(0, Math.min(width - 1, x)), 
      y: Math.max(0, Math.min(height - 1, y)) 
    };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        const cell = getCellFromTouch(pageX, pageY);
        setCurrentDrag({ x: cell.x, y: cell.y, width: 1, height: 1 });
      },
      onPanResponderMove: (evt) => {
        if (!currentDrag) return;
        const { pageX, pageY } = evt.nativeEvent;
        const cell = getCellFromTouch(pageX, pageY);
        
        const minX = Math.min(currentDrag.x, cell.x);
        const maxX = Math.max(currentDrag.x, cell.x);
        const minY = Math.min(currentDrag.y, cell.y);
        const maxY = Math.max(currentDrag.y, cell.y);

        setCurrentDrag({
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        });
      },
      onPanResponderRelease: () => {
        if (currentDrag) {
          // If tap (1x1), we might be removing an existing rectangle
          const isTap = currentDrag.width === 1 && currentDrag.height === 1;
          
          let updatedRects = [...rectangles];
          let removed = false;

          if (isTap) {
            const index = updatedRects.findIndex(r => 
              currentDrag.x >= r.x && currentDrag.x < r.x + r.width &&
              currentDrag.y >= r.y && currentDrag.y < r.y + r.height
            );
            if (index >= 0) {
              updatedRects.splice(index, 1);
              removed = true;
            }
          }

          if (!removed) {
            // Remove any overlapping rectangles before adding the new one
            updatedRects = updatedRects.filter(r => {
              const overlapX = Math.max(0, Math.min(r.x + r.width, currentDrag.x + currentDrag.width) - Math.max(r.x, currentDrag.x));
              const overlapY = Math.max(0, Math.min(r.y + r.height, currentDrag.y + currentDrag.height) - Math.max(r.y, currentDrag.y));
              return overlapX <= 0 || overlapY <= 0;
            });
            updatedRects.push(currentDrag);
          }

          setRectangles(updatedRects);
          
          if (RectangleValidator.isValid(width, height, clues, updatedRects)) {
            onComplete?.();
          }
        }
        setCurrentDrag(null);
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <View 
        ref={containerRef}
        style={[styles.board, { width: width * CELL_SIZE, height: height * CELL_SIZE }]}
        onLayout={(e) => {
          containerRef.current?.measure((x, y, w, h, pageX, pageY) => {
            setBoardLayout({ x: pageX, y: pageY });
          });
        }}
        {...panResponder.panHandlers}
      >
        {/* Grid cells */}
        {Array.from({ length: height }).map((_, y) => 
          Array.from({ length: width }).map((_, x) => (
            <View key={`cell-${x}-${y}`} style={[styles.cell, { left: x * CELL_SIZE, top: y * CELL_SIZE }]} />
          ))
        )}

        {/* Clues */}
        {clues.map((clue, idx) => (
          <View key={`clue-${idx}`} style={[styles.clueContainer, { left: clue.x * CELL_SIZE, top: clue.y * CELL_SIZE }]}>
            <Text style={styles.clueText}>{clue.value}</Text>
          </View>
        ))}

        {/* Drawn Rectangles */}
        {rectangles.map((rect, idx) => (
          <View 
            key={`rect-${idx}`} 
            style={[
              styles.rectangle, 
              { 
                left: rect.x * CELL_SIZE, 
                top: rect.y * CELL_SIZE, 
                width: rect.width * CELL_SIZE, 
                height: rect.height * CELL_SIZE 
              }
            ]} 
          />
        ))}

        {/* Current Dragging Rectangle */}
        {currentDrag && (
          <View 
            style={[
              styles.currentDrag, 
              { 
                left: currentDrag.x * CELL_SIZE, 
                top: currentDrag.y * CELL_SIZE, 
                width: currentDrag.width * CELL_SIZE, 
                height: currentDrag.height * CELL_SIZE 
              }
            ]} 
          />
        )}
      </View>
      <TouchableOpacity style={styles.resetButton} onPress={() => setRectangles([])}>
        <Text style={styles.resetText}>Reset</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#333',
    position: 'relative',
  },
  cell: {
    position: 'absolute',
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  clueContainer: {
    position: 'absolute',
    width: CELL_SIZE,
    height: CELL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  clueText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  rectangle: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#4A90E2',
    backgroundColor: 'rgba(74, 144, 226, 0.2)',
    zIndex: 2,
    pointerEvents: 'none',
  },
  currentDrag: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#E2904A',
    backgroundColor: 'rgba(226, 144, 74, 0.2)',
    zIndex: 3,
    pointerEvents: 'none',
  },
  resetButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#eee',
    borderRadius: 5,
  },
  resetText: {
    fontSize: 16,
  }
});
