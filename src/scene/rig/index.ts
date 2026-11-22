// The mochi rig. Pixi-free modules (vocab, frame, motion, poses, player, roles) can be imported by
// tests and tools without a renderer; atlas, theme, puppet, character and sheet need Pixi.
export * from "./vocab";
export * from "./frame";
export * from "./motion";
export * from "./poses";
export * from "./player";
export * from "./roles";
export { Atlas, ATLAS_WIDTH, PAD, RESOLUTION, pack, type Slot } from "./atlas";
export { paperTheme, PAPER_PALETTE, ACCENTS, ANCHORS, type Theme, type Palette, type Painter } from "./theme";
export { Puppet, type PuppetOptions, type PlayOptions, type PuppetState } from "./puppet";
export { rigCharacters, PUPPET_HEIGHT } from "./character";
export { buildPoseSheet } from "./sheet";
