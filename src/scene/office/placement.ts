// Who stands where, for now. The director (S4) will own this, with walks between rooms; until
// then these simple rules put people where FloorBusy shows them:
// - A session's lead stands at its desk.
// - Its running and stalled agents stand around the desk; deeper agents are smaller.
// - A running reviewer takes the diff to the meeting room.
// - Finished agents queue for coffee in the kitchen (three deep), then take the nap pod, the water
//   cooler, the rest of the queue and the sofas. If all are taken, they wait by their desk.
// Each agent keeps its crew spot while it stays, so a newcomer doesn't shuffle the others.
import type { Agent, Session, Snapshot } from "../../watcher/model";
import { seats } from "./layout";
import type { Mood, Who } from "./slot";
import { type Slot, type World, crewSlot } from "./world";

export interface Placed {
	who: Who;
	slot: Slot;
	/** The desk the character belongs to, if any. */
	desk?: string;
	/** Where it is: the area's id. */
	area?: string;
}

export const LEAD_SIZE = 72;
const crewSize = (depth: number) => Math.max(40, 58 - (depth - 1) * 8);

const agentMood = (a: Agent): Mood => (a.status === "running" ? "busy" : a.status === "stalled" ? "stalled" : "done");
const sessionMood = (s: Session): Mood => (s.state === "busy" ? "busy" : "idle");
/** An agent tree, flattened in reading order. */
export const crewOf = (list: Agent[]): Agent[] => list.flatMap((a) => [a, ...crewOf(a.children)]);

export class Placement {
	/** Per session: agent id -> crew spot index. */
	#spots = new Map<string, Map<string, number>>();

	place(snapshot: Snapshot, world: World): Placed[] {
		const out: Placed[] = [];
		const common = (kind: string, spot: string) => {
			const area = world.areas.find((a) => a.kind === kind);
			return (area?.spots[spot] ?? []).map((slot) => ({ slot, area: area!.id }));
		};
		const free = {
			meeting: common("meeting", "seat"),
			// Finished agents fill these in order.
			out: [...common("kitchen", "queue").slice(0, 3), ...common("lobby", "nap"), ...common("kitchen", "cooler"), ...common("kitchen", "queue").slice(3), ...common("lobby", "sofa"), ...common("kitchen", "sofa")],
		};
		const live = new Set<string>();

		for (const { session } of seats(snapshot.sessions)) {
			const desk = world.desks.get(session.id);
			if (!desk) continue;
			live.add(session.id);
			out.push({
				who: { key: `s:${session.id}`, kind: "lead", role: "lead", mood: sessionMood(session), size: LEAD_SIZE, tint: session.project },
				slot: desk.lead,
				desk: desk.id,
				area: desk.areaId,
			});
			const spots = this.#spots.get(session.id) ?? new Map<string, number>();
			this.#spots.set(session.id, spots);
			const crew = crewOf(session.agents);
			const ids = new Set(crew.map((a) => a.id));
			for (const id of spots.keys()) if (!ids.has(id)) spots.delete(id);

			for (const a of crew) {
				const who: Who = { key: `a:${session.id}:${a.id}`, kind: "crew", role: a.role, mood: agentMood(a), size: crewSize(a.depth), tint: a.role };
				const away = a.status === "running" && /review/i.test(a.role) ? free.meeting.shift() : a.status === "finished" || a.status === "stopped" ? free.out.shift() : undefined;
				if (away) {
					spots.delete(a.id);
					out.push({ who, slot: away.slot, desk: desk.id, area: away.area });
					continue;
				}
				out.push({ who, slot: crewSlot(desk, this.#spotFor(spots, a.id)), desk: desk.id, area: desk.areaId });
			}
		}
		for (const id of this.#spots.keys()) if (!live.has(id)) this.#spots.delete(id);
		return out;
	}

	#spotFor(spots: Map<string, number>, id: string): number {
		const had = spots.get(id);
		if (had !== undefined) return had;
		const taken = new Set(spots.values());
		let i = 0;
		while (taken.has(i)) i++;
		spots.set(id, i);
		return i;
	}
}
