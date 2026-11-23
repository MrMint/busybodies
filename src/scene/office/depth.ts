// Depth without a rebuild. Pixi treats every zIndex write as a change to the scene's structure:
// the whole render group (the office's world: every room, the yard, the cast) rebuilds its draw
// instructions on the next frame, even when the new value leaves the order as it was. A walker's
// zIndex follows its feet every frame, so a busy office rebuilt the world on nearly every frame.
//
// `setDepth` writes the new depth and tells Pixi only when the order really changes: when the value
// moves past a neighbour's in the sorted children. Otherwise the children are still sorted, and a
// sort would leave them as they are (Pixi's sort is a stable Array.sort on zIndex), so what is drawn
// is the same, frame for frame.
import type { Container } from "pixi.js";

export function setDepth(view: Container, z: number): void {
	if (view.zIndex === z) return;
	const parent = view.parent;
	// Not in a sorted layer, or a sort is already due: the plain way.
	if (!parent || !parent.sortableChildren || parent.sortDirty) {
		view.zIndex = z;
		return;
	}
	const kids = parent.children;
	const i = kids.indexOf(view);
	const before = kids[i - 1];
	const after = kids[i + 1];
	// Ties keep their order in a stable sort, so landing level with a neighbour moves nothing.
	if ((before && before.zIndex > z) || (after && after.zIndex < z)) {
		view.zIndex = z;
		return;
	}
	// Pixi's own field behind the zIndex setter (sortMixin): the value the next sort reads.
	view._zIndex = z;
}
