import React from 'react';
import renderer from 'react-test-renderer';
import { MainMenuScreen } from '../MainMenuScreen';

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate } as any;

describe('MainMenuScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders correctly', () => {
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(<MainMenuScreen navigation={mockNavigation} />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });
});
