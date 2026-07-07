import React from 'react';
import renderer from 'react-test-renderer';
import RectangleLevelsScreen from '../RectangleLevelsScreen';

const mockGoBack = jest.fn();
const mockNavigation = { goBack: mockGoBack } as any;

describe('RectangleLevelsScreen', () => {
  beforeEach(() => {
    mockGoBack.mockClear();
  });

  it('renders correctly', () => {
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(<RectangleLevelsScreen navigation={mockNavigation} />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });
});
