// tools/pose-dump.ts [pose...]: print every pose (or the named ones) as text, one line per frame,
// so a pose can be reviewed by reading. No renderer needed. Parts not printed are at rest.
//   bun tools/pose-dump.ts            every pose
//   bun tools/pose-dump.ts waiting    one pose
// Pixi-free modules only, so this runs under plain Bun.
import { describe } from "../src/scene/rig/frame";
import { BEAT_MS, POSES, type Pose, duration } from "../src/scene/rig/poses";

const pick = process.argv.slice(2);
const poses = pick.length ? POSES.filter((p) => pick.includes(p.name)) : POSES.filter((p) => p.name !== "rest");
if (pick.length && poses.length !== pick.length) {
	console.error(`unknown pose; have: ${POSES.map((p) => p.name).join(", ")}`);
	process.exit(1);
}

const block = (who: string, frames: Pose["frames"]) =>
	frames
		.map((f, i) => {
			const n = `${who}${String(i + 1).padStart(2)}`;
			const t = `${String(f.ms).padStart(4)}ms`;
			return `  ${n}  ${t}  ${describe(f)}${f.say ? `  says "${f.say}"` : ""}`;
		})
		.join("\n");

for (const p of poses) {
	const rare = p.rarity < 1 ? `, rare 1 in ${Math.round(1 / p.rarity)}` : "";
	const roles = p.roles ? `, roles ${p.roles.join("/")}` : "";
	console.log(`${p.name}: ${p.title}`);
	console.log(`  on ${p.trigger}${rare}, ${p.play}${p.habit ? ", slacking habit" : ""}${roles}; ${p.frames.length} frames, ${duration(p.frames)} ms (${duration(p.frames) / BEAT_MS} beats)`);
	if (p.lines.length) console.log(`  may say: ${p.lines.map((l) => `"${l}"`).join(" ")}`);
	if (p.partner) {
		console.log(block("lead ", p.frames));
		console.log(block(`${p.partner.role.padEnd(5).slice(0, 5)}`, p.partner.frames));
	} else {
		console.log(block("", p.frames));
	}
	console.log();
}
