import React from 'react';
import { Composition, Still } from 'remotion';
import { Clip } from './Clip';
import { Frame } from './Frames';
import { FrameArc } from './FrameArc';
import { HeatStory } from './HeatStory';
import { MadMonday } from './MadMonday';

export const Root: React.FC = () => (
  <>
    <Composition id="Clip" component={Clip} durationInFrames={300} fps={30} width={1920} height={1080} />
    <Composition id="HeatStory" component={HeatStory} durationInFrames={1800} fps={30} width={1920} height={1080} />
    <Composition id="MadMonday" component={MadMonday} durationInFrames={1200} fps={30} width={1920} height={1080} />
    <Still id="FrameNeon" component={Frame} defaultProps={{ look: 'neon' as const }} width={1920} height={1080} />
    <Still id="FrameGame" component={Frame} defaultProps={{ look: 'game' as const }} width={1920} height={1080} />
    <Still id="FramePremium" component={Frame} defaultProps={{ look: 'premium' as const }} width={1920} height={1080} />
    <Still id="FrameArc" component={FrameArc} width={1920} height={1080} />
    <Still id="FrameArcFlat" component={FrameArc} defaultProps={{ flat: true }} width={1920} height={1080} />
    <Still id="FrameArcNavy" component={FrameArc} defaultProps={{ flat: true, navy: true }} width={1920} height={1080} />
    <Still id="FrameArcBare" component={FrameArc} defaultProps={{ flat: true, navy: true, bare: true }} width={1920} height={1080} />
    <Still id="FramePremiumBare" component={Frame} defaultProps={{ look: 'premium' as const, bare: true }} width={1920} height={1080} />
  </>
);
