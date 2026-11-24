// Where the compact window goes: the top-right corner of the main display's work area (below the
// menu bar), with a small margin.
import { Screen } from "electrobun/main";

// 440 by 340: a room (about square) fills more of it than at 300 tall, so a shot reads.
const COMPACT_SIZE = { width: 440, height: 340 };
const MARGIN = 16;

export function compactFrame(): { x: number; y: number; width: number; height: number } {
	const { workArea } = Screen.getPrimaryDisplay();
	const { width, height } = COMPACT_SIZE;
	if (!workArea.width) return { x: 120, y: 80, width, height };
	return { x: workArea.x + workArea.width - width - MARGIN, y: workArea.y + MARGIN, width, height };
}
