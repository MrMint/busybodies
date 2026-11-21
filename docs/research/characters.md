# Characters, props and animation for an agent-built PixiJS v8 scene (research, 2026-11-21)

## Recommendation (hybrid)
1. Build characters as **parametric pieces baked to a texture atlas at startup**: code (SVG/Graphics) draws a few body/head/accessory parts per theme from a palette ramp, rendered once to RenderTextures. Per-frame cost is plain sprites.
2. Make **motion generic code, not frames**: a small `Animator` applies squash/stretch, breathing, anticipation, bob, overshoot easing and secondary motion to any sprite/container by state (working/idle/waiting/error/celebrate). One motion library, every theme.
3. A **theme = a manifest (JSON/TS) + palette + optional atlas**: roles -> part recipes or sprite names; palette ramps; prop list; particle/bubble styles. A new theme is data.
4. Use **CC0 packs (Kenney, 2dPig) only as optional prop/tile filler**, and for scaffolding; never LPC (CC-BY-SA/GPL) in an MIT repo.
5. **Skip Spine** (editor licence needed per user, runtime not FOSS) and skip rigs; use code-driven bone-less transforms. AI-generated sprite sheets: optional later, human-reviewed, treat as unprotected by copyright (US) - licence risk is low but ownership is weak.
Why: best charm per token because motion carries "alive"; text-editable, deterministic, MIT-clean, tiny memory, consistent by construction.

## Comparison
| Approach | Charm | Consistency | Agent-friendly | Runtime cost | Theming | OSS licence |
|---|---|---|---|---|---|---|
| 1 Procedural/parametric (baked) | Medium-high if ramps, outlines, motion done well; generic if not | Very high | Very high (pure text/code, diffable) | Very low after bake | Very high (palette + part recipes) | Own code, MIT clean. DiceBear code MIT, many styles CC0 but per-style check |
| 2 CC0/permissive packs | High per asset, limited roles/animations | Low when mixing packs | Medium (needs picking, manifest, no editing) | Low (atlas) | Low (fixed look) | Kenney CC0 safe; LPC share-alike unsafe for MIT |
| 3 AI-generated sheets | High statics; frame consistency still weak | Medium, needs cleanup | Medium (prompting, hard to edit as text) | Low | Medium (regenerate per theme) | Outputs likely not copyrightable in US; tool ToS vary |
| 4 Skeletal (Spine) | Very high | High | Low (binary/JSON rig, editor needed) | Medium | Medium | Spine: each user needs Editor licence; poor fit for OSS |
| 5 Generic motion layer | Highest charm per token | Total (applies to anything) | Very high | Very low | Theme-neutral | Own code; GSAP free but with a carve-out |

## Findings by topic

### 1. Procedural / parametric
- DiceBear: code is MIT, but styles come from various artists and licences differ per style; pixel-art and pixel-art-neutral are CC0 1.0. Libraries output the same SVG for the same seed. https://github.com/dicebear/dicebear , https://www.dicebear.com/styles/pixel-art/ . Useful as a seeded-parameter pattern for identity, but avatars are heads, not animated bodies.
- Making it look hand-made (synthesised from sources, not one study): hue-shifted colour ramps (shadows toward blue/purple, highlights toward yellow; straight brightness ramps look generic) https://gamedev.net/tutorials/visual-arts/color-palettes-r4964 , https://ziva.sh/tools/pixel-art-palette-generator ; ramp-coloured outlines instead of black (one tone lit side, darkest on shade side) ; limited palette; recombining normalised pieces https://www.gamedeveloper.com/programming/gen-jam-2016-procedurally-generating-sprites ; PalettePainter CLI hue-shift ramps https://github.com/chickensoft-games/PalettePainter .
- Practice (well established, no single cited source): add slight shape irregularity (seeded jitter on vertices), consistent light direction, shared head/body proportion grid across roles, role identity by silhouette + one accessory + colour.

### 2. Asset packs
- Kenney: support page states assets are CC0, attribution not required; "Kenney" credit optional; logo reserved. https://kenney.nl/support
- Kenney Modular Characters, CC0, 425 assets: https://kenney.nl/assets/modular-characters . RPG Urban Pack has 6 characters, 4 directions, walk animations: https://opengameart.org/content/rpg-urban-pack . Kenney Roguelike Character pack modular, no animations: https://opengameart.org/content/roguelike-character-pack . Licences of Kenney Toon/Animated/Platformer Characters not confirmed in search: check each kenney.nl page.
- Office-themed CC0: 2dPig Pixel Office (5 characters, furniture, computers, plants; top-down) https://2dpig.itch.io/pixel-office . Confirm licence on the page before use (search snippet says CC0).
- LPC: base assets are GPLv3 and CC-BY-SA 3.0 dual-licensed; entrants must ship licence texts and AUTHORS credits. https://opengameart.org/content/properly-licensing-your-liberated-pixel-cup-game-entry . Derivatives must be share-alike; whether art in a repo is a "mere collection" vs combined work is disputed in forums, and CC-BY/BY-SA anti-DRM clauses conflict with some stores (https://opengameart.org/node/52791). For an MIT repo: keep LPC out of the code repo, or isolate as a separately-licensed asset package; not legal advice. OGA itself advises against CC-BY 3.0/CC-BY-SA 3.0/GPL 2.0 unless necessary: https://opengameart.org/content/faq
- Coverage: no found pack gives "office worker x working/idle/waiting/error/celebrating" for several roles. Mixed packs differ in pixel density, outline and palette; fix by recolouring through one palette map or by not mixing. Cartoon/pixel mix is the main inconsistency risk.

### 3. AI-generated sprite sheets
- Tools in 2026 roundups (vendor-adjacent, unverified): PixelLab (directional rotation, skeleton-based animation), Retro Diffusion (grid-native pixel generation; Aseprite extension; animation model hosted via Scenario), Ludo (directional renders). One guide says tools are decent at static sprites but struggle with coherent animation frames; manual cleanup in Aseprite is recommended. https://llamagen.ai/en-au/articles/best-ai-pixel-art-generators-2026 , https://ludo.ai/compare/best-ai-sprite-generators , https://app.cinevva.com/guides/ai-pixel-art-generators . **Unconfirmed**: exact current quality/pricing; test one generator on 3 roles x 5 states before committing.
- Ownership: US Copyright Office Part 2 (Jan 29, 2025): prompts alone do not give authorship; wholly AI output unprotected; human selection/arrangement/modification can be protected. https://www.copyright.gov/newsnet/2025/1060.html , https://blogs.loc.gov/copyright/2025/02/inside-the-copyright-offices-report-copyright-and-artificial-intelligence-part-2-copyrightability/ . Implication: you cannot reliably license raw outputs under MIT; also check each tool's ToS (**unconfirmed**, not researched).
- Cleanup pipeline (general practice): palette quantise to the theme palette, downscale with nearest, align pivots, cut by grid, pack atlas. Agents can script all of this.

### 4. Skeletal animation
- Spine: runtime source public but not FOSS; each user of a product including the runtimes needs their own Editor licence unless the distributor holds one and follows Section 2; open-source redistribution allowed with licence notice. https://esotericsoftware.com/spine-runtimes-license , https://en.esotericsoftware.com/forum/d/17246-license-for-runtimes . Essential suffices under $500k revenue per forum. Exported data owned by the creator.
- Official PixiJS v8 runtime: @esotericsoftware/spine-pixi-v8, min PixiJS 8.4.0, maintained. https://esotericsoftware.com/blog/spine-pixi-v8-runtime-released , https://esotericsoftware.com/spine-pixi
- DragonBones, Rive/other free rigs with Pixi v8: **unconfirmed**, search returned nothing. Verify before considering; DragonBones is believed stagnant (not sourced).
- Agent viability: rigs are authored in a GUI editor and are not realistically LLM-authored; keyframe JSON can be, but the licence and tooling make it a poor fit. A code-driven transform rig (container tree of parts: body, head, arms, with sin/ease offsets) gives most of the benefit as text.

### 5. Motion that sells "alive" (generic, any sprite)
- All doable in code on any Container: squash/stretch on scale with volume preservation, idle breathing (sin on scaleY, 2-4%), bob, anticipation (small counter-move before an action), overshoot easing (back/elastic), follow-through/secondary motion (spring-damped accessories, delayed head), blink, desynchronised phase per character (random offset so crowds do not pulse in unison), state pops (exclamation, sweat drop, confetti), speech bubbles as 9-slice Graphics + text. These are standard animation principles; no single source cited.
- Particles: PixiJS v8 ParticleContainer takes lightweight Particle objects; one author's benchmark: ~200k sprites vs ~1M particles at 60fps on M3 (indicative). Bounds are empty by default; set boundsArea. https://pixijs.com/blog/particlecontainer-v8 , https://pixijs.com/8.x/guides/components/scene-objects/particle-container
- Tweening: GSAP is free including commercial use since 2025 (Standard "No Charge" licence) except use in tools that let users build visual animations competing with Webflow; scope vague. https://webflow.com/blog/gsap-becomes-free , https://gsap.com/community/standard-license/ . For an MIT repo, a ~100-line in-house spring/ease helper driven by the Pixi ticker avoids dependency and licence ambiguity (recommendation). Other tween libs not researched.
- Hundreds of characters: drive all with one ticker loop and per-state functions, not per-character tween objects.

### 6. Theming architecture (design, not sourced)
- Semantic roles (builder, scout, reviewer) -> theme manifest entries: part recipe or atlas frame names, palette ramps, accessory per role, prop catalogue, bubble/particle style, motion tuning (amplitude, tempo). State machine and Animator stay theme-independent.
- Palette swap = tint for flat greys, or a small colour-map filter/shader for ramps; or just regenerate baked textures with new ramps (simpler; recommended).
- Validate manifests with a schema so agents get immediate errors; keep one required-frames checklist per theme.

### 7. Tooling
- PixiJS v8 loads TexturePacker-style JSON hash via Assets.load; animations are built from frame names and `sheet.animations` feeds AnimatedSprite. Grouping animations in sheet data is noted as TexturePacker-only in typings. https://pixijs.com/8.x/guides/components/sprite-sheets , https://app.unpkg.com/pixi.js@8.17.1/files/lib/spritesheet/Spritesheet.d.ts
- free-tex-packer has a Pixi.js export preset (json, xml, css, pixi.js, godot, phaser...). https://github.com/odrick/free-tex-packer . FastPack's PixiJS preset is plain JSON Hash. Aseprite native JSON likely needs conversion (old forum report; unconfirmed on v8). TexturePacker goes reduced-feature after trial.
- Pixel scaling: v8 scale modes are strings; set `scaleMode: 'nearest'` via load data or `texture.source.scaleMode = 'nearest'`; render at integer scale. https://pixijs.com/8.x/guides/migrations/v8 , https://html5gamedevs.com/topic/55669-using-scalemode-strings-on-pixi-v8 . Also set resolution/roundPixels yourself; "integer scale" rule is general practice, not sourced here.
- Texture memory budget: not researched. Rule of thumb: RGBA = 4 bytes/pixel, so a 2048x2048 atlas is 16 MB (GPU may add mipmaps). Baking ~20 role variants x 5 states x 4 frames at 64x64 is ~1.3 MB. Hundreds of characters share textures, so memory stays flat; cost is draw calls, solved by one atlas per theme.

## Items not confirmed
DragonBones/Rive status on Pixi v8; licences of Kenney character packs other than Modular Characters; 2dPig Pixel Office licence page; AI tool ToS; GSAP terms after April 2025; free-tex-packer output verified in v8; texture memory numbers.

## Coverage checklist (7/7 topics covered; 5 with gaps noted above)
1 procedural covered; 2 packs covered; 3 AI covered (ToS gap); 4 skeletal covered (DragonBones gap); 5 motion covered; 6 theming covered (design reasoning, unsourced); 7 tooling covered (memory gap).
