import React from 'react';
import { Composition } from 'remotion';
import { Clip } from './Clip';

export const Root: React.FC = () => (
  <Composition id="Clip" component={Clip} durationInFrames={300} fps={30} width={1920} height={1080} />
);
