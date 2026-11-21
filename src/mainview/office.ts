// A placeholder office drawn from a Snapshot: one room per session, the session's lead at a desk,
// and its agents gathered around. It is rebuilt on each snapshot, but characters are kept by id so
// a busybody doesn't restart its bounce whenever anything changes.
import { Container, Graphics, Text } from "pixi.js";
import type { Agent, Session, Snapshot } from "../watcher/model";
import { Busybody, type Mood } from "./busybody";

const INK = 0x2b2340;
const FLOOR = 0xfffaf2;
const WALL = 0xf0e1cc;
const PALETTE = [0xff8fab, 0x8fd3ff, 0xffd166, 0x9be7a0, 0xc3a6ff, 0xffb38a, 0x7fe0d4, 0xf5a3e0];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const colourFor = (key: string) => PALETTE[hash(key) % PALETTE.length]!;

const sessionMood = (s: Session): Mood => (s.state === "busy" ? "busy" : "idle");
const agentMood = (a: Agent): Mood =>
	a.status === "running" ? "busy" : a.status === "stalled" ? "stalled" : "done";

/** Sessions and their side sessions, flattened: each gets its own room. */
const rooms = (list: Session[]): Session[] => list.flatMap((s) => [s, ...rooms(s.children)]);
/** An agent tree, flattened in reading order. */
const crew = (list: Agent[]): Agent[] => list.flatMap((a) => [a, ...crew(a.children)]);

const label = (text: string, size: number, weight: "400" | "700" = "400", alpha = 1) => {
	const t = new Text({ text, style: { fill: INK, fontSize: size, fontWeight: weight, fontFamily: "ui-rounded, system-ui" } });
	t.alpha = alpha;
	return t;
};

export class Office extends Container {
	#people = new Map<string, Busybody>();
	#layer = new Container();
	#snapshot?: Snapshot;

	constructor() {
		super();
		this.addChild(this.#layer);
	}

	get animating(): boolean {
		for (const p of this.#people.values()) if (p.animating) return true;
		return false;
	}

	tick(dt: number): void {
		for (const p of this.#people.values()) p.tick(dt);
	}

	show(snapshot: Snapshot, width: number, height: number): void {
		this.#snapshot = snapshot;
		this.layout(width, height);
	}

	layout(width: number, height: number): void {
		const snap = this.#snapshot;
		if (!snap) return;
		// Characters outlive their rooms: detach them before the rooms are destroyed.
		for (const p of this.#people.values()) p.removeFromParent();
		for (const child of this.#layer.removeChildren()) child.destroy({ children: true });
		const list = rooms(snap.sessions);
		if (list.length === 0) {
			const t = label("Nobody's in. Suspicious.", 28, "700", 0.6);
			t.anchor.set(0.5);
			t.position.set(width / 2, height / 2);
			this.#layer.addChild(t);
			this.#forgetExcept(new Set());
			return;
		}

		const gap = 18;
		const cols = Math.ceil(Math.sqrt((list.length * width) / height));
		const rows = Math.ceil(list.length / cols);
		const rw = (width - gap * (cols + 1)) / cols;
		const rh = (height - gap * (rows + 1)) / rows;
		const seen = new Set<string>();

		list.forEach((s, i) => {
			const room = new Container();
			room.position.set(gap + (i % cols) * (rw + gap), gap + Math.floor(i / cols) * (rh + gap));
			this.#layer.addChild(room);
			this.#drawRoom(room, s, rw, rh, seen);
		});
		this.#forgetExcept(seen);
	}

	#drawRoom(room: Container, s: Session, w: number, h: number, seen: Set<string>): void {
		const wallH = Math.min(h * 0.28, 70);
		const busy = s.state === "busy";
		room.addChild(
			new Graphics()
				.roundRect(0, 0, w, h, 18)
				.fill(FLOOR)
				.roundRect(0, 0, w, wallH, 18)
				.fill(WALL)
				.roundRect(0, 0, w, h, 18)
				.stroke({ width: 3, color: INK, alpha: busy ? 0.9 : 0.35 }),
		);

		const title = label(s.title, Math.max(12, Math.min(18, w / 22)), "700");
		title.position.set(14, 10);
		const where = label([s.project, s.branch ?? s.worktree].filter(Boolean).join(" · "), 12, "400", 0.6);
		where.position.set(14, 10 + title.height + 2);
		this.#clip(title, w - 28);
		this.#clip(where, w - 28);
		room.addChild(title, where);

		// The lead's desk, bottom left; its crew fills the rest of the floor.
		const floorTop = wallH + 8;
		const lead = Math.min((h - floorTop) * 0.55, w * 0.22, 90);
		const deskX = 16 + lead * 0.7;
		const deskY = h - 18;
		room.addChild(this.#desk(deskX + lead * 0.55, deskY, lead, busy));
		room.addChild(this.#person(`s:${s.id}`, colourFor(s.project), lead, sessionMood(s), deskX, deskY, seen));

		if (busy && s.activity) {
			const bubble = this.#bubble(s.activity.tool);
			bubble.position.set(deskX - lead * 0.2, deskY - lead * 1.2 - bubble.height);
			room.addChild(bubble);
		}

		const agents = crew(s.agents);
		if (agents.length === 0) return;
		const areaX = deskX + lead * 1.4;
		const areaW = w - areaX - 12;
		const small = Math.max(22, Math.min(lead * 0.6, Math.sqrt((areaW * (h - floorTop)) / agents.length) * 0.55));
		const perRow = Math.max(1, Math.floor(areaW / (small * 1.15)));
		agents.forEach((a, i) => {
			const size = small * (a.depth > 1 ? 0.8 : 1);
			const x = areaX + (i % perRow) * small * 1.15 + small * 0.5;
			const y = h - 14 - Math.floor(i / perRow) * small * 1.35;
			room.addChild(this.#person(`a:${s.id}:${a.id}`, colourFor(a.role), size, agentMood(a), x, y, seen));
		});
		const counts = label(`${agents.filter((a) => a.status === "running").length} busy · ${agents.length} on the crew`, 11, "400", 0.55);
		counts.position.set(14, 10 + title.height + 2 + where.height + 2);
		this.#clip(counts, w - 28);
		room.addChild(counts);
	}

	#person(key: string, colour: number, size: number, mood: Mood, x: number, y: number, seen: Set<string>): Busybody {
		seen.add(key);
		let p = this.#people.get(key);
		if (!p || Math.abs(p.size - size) > 0.5) {
			p?.destroy({ children: true });
			p = new Busybody(colour, size);
			this.#people.set(key, p);
		}
		p.setMood(mood);
		p.position.set(x, y);
		return p;
	}

	#forgetExcept(keep: Set<string>): void {
		for (const [key, p] of this.#people) {
			if (keep.has(key)) continue;
			p.destroy({ children: true });
			this.#people.delete(key);
		}
	}

	#desk(cx: number, floorY: number, size: number, lit: boolean): Graphics {
		const w = size * 1.3;
		const top = floorY - size * 0.55;
		return new Graphics()
			.roundRect(cx - w / 2, top, w, size * 0.1, 4)
			.fill(0xc99a6b)
			.rect(cx - w * 0.42, top, size * 0.06, size * 0.55)
			.rect(cx + w * 0.36, top, size * 0.06, size * 0.55)
			.fill(0xa57a50)
			.roundRect(cx - size * 0.32, top - size * 0.42, size * 0.64, size * 0.4, 5)
			.fill(lit ? 0x9fe3ff : 0x55607a)
			.stroke({ width: 2, color: INK });
	}

	#bubble(text: string): Container {
		const t = label(text.replace(/^mcp__[^_]+__/, ""), 12, "700");
		const b = new Container();
		const pad = 7;
		b.addChild(
			new Graphics()
				.roundRect(0, 0, t.width + pad * 2, t.height + pad * 1.4, 10)
				.fill(0xffffff)
				.stroke({ width: 2, color: INK }),
			t,
		);
		t.position.set(pad, pad * 0.7);
		return b;
	}

	#clip(t: Text, max: number): void {
		if (t.width <= max) return;
		let s = t.text;
		while (s.length > 1 && t.width > max) {
			s = s.slice(0, -1);
			t.text = `${s}…`;
		}
	}
}
