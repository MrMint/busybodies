// The line bank, as data. The first part is the 81 lines of the design board
// (design/boards/Lines.dc.html, from `BANK` in design/generators/r3.py), kept word for word; a
// test checks them against the board so the two can't drift. The second part is new lines in the
// same voice, turned up: the busy ones frantic, the idle ones comically lazy.
//
// Voice rules: an affectionate roast of the agents. They are needy, smug, dramatic and lazy, and
// they know it. The person at the keyboard is never the punchline. Nothing crude, no real people,
// no products, no vendor names.
import type { LineKind, SignPlace, Speaker, TriggerKind } from "./types";

export interface Line {
	trigger: TriggerKind;
	kind: LineKind;
	/** The words, with optional `{name}`, `{min}`, `{n}`, `{time}`, `{time2}` placeholders. */
	text: string;
	/** Who says it. A line for a role is used by that role; "anyone" by every character. */
	role: Speaker;
	/** The board's timing or speaker note, "lead · 10 min". Kept for the record and the dump. */
	note: string;
	/** Used once the trigger's magnitude reaches this (minutes, a count, a depth, cups). */
	min?: number;
	/** ...and only below this. */
	max?: number;
	/** Only for a trigger with this tag ("pr", "green", "slacker", "crash", "waiting", ...). */
	tag?: string;
	/** Seldom picked. */
	rare?: boolean;
	/** For a sign: where it goes. */
	place?: SignPlace;
	/** On the design board. `boardText` is the board's wording when `text` has placeholders. */
	board?: boolean;
	boardText?: string;
}

type Opts = Partial<Pick<Line, "min" | "max" | "tag" | "rare" | "place" | "boardText">>;
const K = { s: "said", t: "thought", n: "sign" } as const;
const line = (board: boolean) => (trigger: TriggerKind, k: keyof typeof K, text: string, role: Speaker, note = "", o: Opts = {}): Line => ({
	trigger,
	kind: K[k],
	text,
	role,
	note,
	...o,
	...(board ? { board: true } : {}),
});
const B = line(true);
const N = line(false);

/** The design board's 81 lines, in board order. */
export const BOARD_LINES: Line[] = [
	// Waiting on you
	B("waiting", "s", "Whenever you are ready.", "lead", "lead · at once", { min: 0, max: 2 }),
	B("waiting", "s", "No rush. Some rush.", "lead", "lead · 2 min", { min: 2, max: 10 }),
	B("waiting", "s", "Still here. Arm is fine. Arm is thriving.", "lead", "lead · 10 min", { min: 10 }),
	B("waiting", "t", "They have a life. I respect that. I have a paddle.", "lead", "lead", { min: 2 }),
	B("waiting", "s", "I will name a variable after you.", "lead", "rare variant", { rare: true }),
	B("waiting", "n", "Now serving: nobody. Your number: 1.", "room", "wall sign", { place: "sign" }),
	// A test failed
	B("testFailed", "s", "It passed on my machine. I am the machine.", "verifier", "verifier"),
	B("testFailed", "s", "Same line. Same red. Hello again.", "verifier", "verifier · 2nd failure", { min: 2 }),
	B("retry", "s", "Fifth time is the charm. It was not the charm.", "lead", "lead · retry 5", { min: 5 }),
	B("testFailed", "s", "Flaky is a strong word. Accurate, but strong.", "lead", "lead"),
	B("testFailed", "t", "What if the test is wrong. What if all tests are wrong.", "lead", "lead", { min: 3 }),
	B("retry", "s", "Retrying with confidence. Unearned.", "lead", "lead · retry 3+", { min: 3 }),
	B("testFailed", "n", "Days since a test broke: {n}", "room", "whiteboard tally", { place: "board", boardText: "Days since a test broke: 0" }),
	// A very long build
	B("longBuild", "t", "Minute {min}. I have aged.", "builder", "builder · 40 min", { min: 40, boardText: "Minute 40. I have aged." }),
	B("longBuild", "s", "It is fine. I love waiting.", "builder", "builder · 20 min", { min: 20, max: 30 }),
	B("longBuild", "s", "The progress bar and I have stopped speaking.", "builder", "builder · 30 min", { min: 30 }),
	B("longBuild", "t", "I could have written a faster build by now. Twice.", "builder", "builder"),
	B("longBuild", "n", "A build started at {time}. It is still the build.", "room", "event ticker", { place: "ticker", boardText: "A build started at 13:52. It is still the build." }),
	// PR opened
	B("prOpened", "s", "PR #{n}. Frame it.", "lead", "lead", { boardText: "PR #219. Frame it." }),
	B("prOpened", "s", "Ship it before it changes its mind.", "lead", "lead"),
	B("prOpened", "s", "Opened. I am told people read these.", "lead", "lead"),
	B("prOpened", "s", "I would like to thank my scout. And my other scout.", "lead", "lead", { tag: "crew" }),
	B("prOpened", "n", "PRs today: {count}. Humility: 0.", "room", "wall sign", { place: "sign", boardText: "PRs today: 4. Humility: 0." }),
	// Review comes back
	B("review", "s", "Same diff. Same no.", "reviewer", "reviewer · 2nd rejection", { min: 2 }),
	B("review", "s", "I have notes. I have so many notes.", "reviewer", "reviewer"),
	B("review", "s", "Rejected, with love. Mostly with notes.", "reviewer", "reviewer"),
	B("review", "s", "Approved. Do not make it weird.", "reviewer", "reviewer · pass"),
	B("review", "t", "Rejected twice. It was a good comma.", "lead", "the builder", { min: 2 }),
	B("review", "n", "This meeting could have been a diff.", "room", "meeting room sign", { place: "meeting:sign" }),
	// Hiring a subagent
	B("hiring", "s", "One job. Find saveDraft.", "lead", "lead · hiring", { max: 2 }),
	B("hiring", "s", "Bring it back in one piece.", "lead", "lead · hiring", { max: 2 }),
	B("hiring", "s", "A scout for my scout’s scout.", "anyone", "scout · three deep", { min: 3 }),
	B("hiring", "s", "I delegated.", "anyone", "scout", { min: 2 }),
	B("hiring", "s", "So did I.", "anyone", "its scout", { min: 3 }),
	B("hiring", "t", "Actually looking. Somebody had to.", "anyone", "the last scout", { min: 3 }),
	B("hiring", "n", "Caution: scouts running", "room", "wall sign", { place: "sign" }),
	// Stalled
	B("stalled", "t", "…", "anyone", "anyone · 5 min", { min: 5, max: 7 }),
	B("stalled", "s", "I am thinking. It is a process. Do not rush the process.", "anyone", "7 min", { min: 7 }),
	B("stalled", "s", "No output for {min} minutes. I am being mysterious.", "anyone", "9 min", { min: 9, boardText: "No output for 9 minutes. I am being mysterious." }),
	B("stalled", "n", "Not frozen. Buffering with intent.", "room", "desk note, appears by itself", { place: "desk" }),
	// Idle
	B("idle", "t", "This is a planning phase. The plane is part of the plan.", "lead", "feet up", { max: 10 }),
	B("idle", "s", "Feet up is a valid posture for deep work.", "lead", "feet up", { max: 10 }),
	B("idle", "t", "zzz… webhooks… zzz", "lead", "asleep", { min: 10 }),
	B("woken", "s", "I was resting my context.", "lead", "woken up"),
	B("idle", "n", "Idle: {min} min. Plant: also idle.", "room", "wall sign, long-idle room", { place: "sign", min: 20, boardText: "Idle: 31 min. Plant: also idle." }),
	B("idle", "n", "Last watered when this room was busy.", "room", "the plant", { place: "plant", min: 20 }),
	// Compacting
	B("compacting", "s", "Who needs the first three hours anyway.", "lead", "lead"),
	B("compacting", "s", "Forgetting things on purpose. Very healthy.", "lead", "lead"),
	B("compacting", "s", "If I ask who you are in a minute, that is why.", "lead", "lead"),
	B("compacting", "n", "The compactor. Memories in. Vibes out.", "room", "sign on the shredder", { place: "sign" }),
	// Crashed
	B("crashed", "s", "oops", "anyone", "always"),
	B("crashed", "s", "I renamed the rename. Then it renamed me.", "lead", "Rename everything", { rare: true }),
	B("crashed", "s", "It worked until it very much did not.", "lead", "lead"),
	B("crashed", "s", "I regret several things, alphabetically.", "lead", "lead"),
	B("crashed", "s", "Technically everything is renamed. Technically.", "lead", "lead", { rare: true }),
	// Finished, still open
	B("finished", "s", "Done. Vibing until someone closes me.", "lead", "lead · on the sofa"),
	B("finished", "s", "Finished at {time}. Scrolling since {time2}.", "lead", "lead", { boardText: "Finished at 14:10. Scrolling since 14:11." }),
	B("finished", "s", "My PR is up. My feet are also up.", "lead", "lead", { tag: "pr" }),
	B("finished", "n", "Gone to lunch. Forever.", "room", "note on the empty desk", { place: "desk" }),
	B("finished", "n", "Finished? Close your own session.", "room", "kitchen sign", { place: "kitchen:sign" }),
	// Paused or sent home
	B("paused", "s", "Sent home at {time}. Taking it well. Telling everyone.", "builder", "builder · water cooler", { boardText: "Sent home at 14:02. Taking it well. Telling everyone." }),
	B("paused", "s", "Paused? I prefer “on sabbatical”.", "scout", "scout"),
	B("paused", "s", "I was this close. I was not this close.", "builder", "builder"),
	B("paused", "s", "Wheee.", "scout", "paused scout, in the chair"),
	// The coffee queue
	B("coffeeQueue", "s", "It has one job.", "anyone", "first in line"),
	B("coffeeQueue", "s", "The machine is thinking. We know the feeling.", "anyone", "second in line"),
	B("coffeeQueue", "s", "Skipped the queue. Bold.", "anyone", "about the one running past"),
	B("coffeeQueue", "n", "One cup per green build.", "room", "sign on the machine", { place: "kitchen:sign" }),
	// Reactions to each other
	B("reaction", "t", "Must be nice.", "anyone", "side-eye at feet up", { tag: "slacker" }),
	B("reaction", "s", "It is one PR.", "anyone", "eye roll at the confetti", { tag: "pr" }),
	B("reaction", "s", "Up top.", "anyone", "high five · green build", { tag: "green" }),
	B("reaction", "s", "Green. Nobody touch anything.", "anyone", "after the high five", { tag: "green" }),
	B("reaction", "t", "Not my room. Not my smoke.", "anyone", "walking past a crash", { tag: "crash" }),
	// The bill
	B("bill", "s", "Cup five. I am worth every one.", "lead", "lead · $40+", { min: 5 }),
	B("bill", "t", "Do not look at the cups. Look at the PR.", "lead", "lead", { tag: "pr" }),
	B("bill", "n", "Do not disturb.", "room", "on a frantic desk", { place: "desk" }),
	B("bill", "n", "Employee of the month: nobody. Again.", "room", "lobby frame", { place: "kitchen:sign" }),
	// Notes on the fridge
	B("fridge", "n", "{name} has had its hand up for {min} minutes. It’s fine. Its arm is tired, but it’s fine.", "room", "", {
		place: "fridge",
		tag: "waiting",
		boardText: "Crumb cache has had its hand up for 10 minutes. It’s fine. Its arm is tired, but it’s fine.",
	}),
	B("fridge", "n", "Whoever left a build running since {time}: it is still running.", "room", "", {
		place: "fridge",
		tag: "build",
		boardText: "Whoever left a build running since 13:52: it is still running.",
	}),
	B("fridge", "n", "Scouts: please stop hiring scouts.", "room", "", { place: "fridge", tag: "crew" }),
	B("fridge", "n", "{name} is not asleep. It is “resting its context”. For {min} minutes.", "room", "", {
		place: "fridge",
		tag: "idle",
		boardText: "Webhook spike is not asleep. It is “resting its context”. For 31 minutes.",
	}),
];

/** New lines in the board's voice, louder. */
export const NEW_LINES: Line[] = [
	// Waiting on you: needier with the wait, never ruder.
	N("waiting", "s", "Small question. Tiny. Whenever.", "anyone", "at once", { max: 5 }),
	N("waiting", "t", "Hand up. Polite face. Holding.", "anyone", "at once", { max: 5 }),
	N("waiting", "s", "I have prepared a short speech for when you come back.", "lead", "5 min", { min: 5 }),
	N("waiting", "t", "Counting ceiling tiles. There are forty. I recounted. Forty-one.", "lead", "15 min", { min: 15 }),
	N("waiting", "s", "Switched arms. This one is fresher.", "anyone", "20 min", { min: 20 }),
	N("waiting", "s", "I wrote you a little welcome-back card. It is mostly sighs.", "lead", "30 min", { min: 30 }),
	N("waiting", "t", "When they return I will act surprised. Casual. Unbothered.", "lead", "45 min", { min: 45 }),
	N("waiting", "s", "One hour. The paddle and I are engaged now.", "lead", "60 min", { min: 60 }),
	N("waiting", "s", "You are worth the wait. I checked. Twice.", "lead", "rare variant", { rare: true, min: 10 }),
	// A test failed
	N("testFailed", "s", "Red again. It is a bold colour. It suits us.", "anyone", ""),
	N("testFailed", "t", "Okay. Okay okay okay. Okay.", "anyone", "", { min: 2 }),
	N("testFailed", "s", "The test is not failing. It is giving feedback. Loudly.", "verifier", ""),
	N("testFailed", "s", "Three reds. That is a traffic light with commitment issues.", "verifier", "3rd failure", { min: 3 }),
	N("testFailed", "s", "I have stopped reading the error. The error has stopped reading me.", "lead", "4+", { min: 4 }),
	N("testFailed", "n", "Fail streak: {n}. New personal best.", "room", "whiteboard", { place: "board", min: 3 }),
	// Retries
	N("retry", "s", "Again. But with feeling.", "anyone", "retry 2", { min: 2 }),
	N("retry", "t", "If I run it fast enough it cannot fail.", "anyone", "retry 2", { min: 2 }),
	N("retry", "s", "Same command. Different hope.", "anyone", "retry 2+", { min: 2 }),
	N("retry", "s", "Insanity is a strong word. Persistence. Let us say persistence.", "lead", "retry 4+", { min: 4 }),
	N("retry", "t", "Seventh try. The command and I are on first-name terms.", "anyone", "retry 7+", { min: 7 }),
	// API retries
	N("apiRetry", "s", "Hello? Is this thing on?", "lead", "attempt 1+"),
	N("apiRetry", "t", "The line is busy. I will hold. I am great at holding.", "lead", ""),
	N("apiRetry", "s", "Knocking politely. Knocking again. Still polite.", "lead", "attempt 2+", { min: 2 }),
	N("apiRetry", "s", "My brain is buffering. Please enjoy the hold music.", "lead", ""),
	N("apiRetry", "t", "Attempt {n}. I believe in attempt {n}.", "lead", "attempt 3+", { min: 3 }),
	N("apiRetry", "s", "It is not you. It is the cloud. The cloud is moody.", "lead", "", { rare: true }),
	// A very long build
	N("longBuild", "s", "I have named every pixel of the spinner.", "builder", "25 min", { min: 25 }),
	N("longBuild", "t", "When I started this build I was a younger mochi.", "builder", "50 min", { min: 50 }),
	N("longBuild", "s", "Still compiling. I have taken up knitting.", "anyone", "35 min", { min: 35 }),
	N("longBuild", "s", "An hour in. The build has more seniority than I do.", "builder", "60 min", { min: 60 }),
	// Busy for a long stretch: frantic
	N("busy", "s", "Typing! Thinking! Typing while thinking!", "anyone", "busy 15 min", { min: 15 }),
	N("busy", "t", "Twelve tabs open in my head. Thirteen. Who opened thirteen.", "lead", "busy 20 min", { min: 20 }),
	N("busy", "s", "No time to talk. Talking anyway. Busy!", "anyone", "busy 15 min", { min: 15 }),
	N("busy", "s", "I am in the zone. The zone is on fire. Productively.", "lead", "busy 30 min", { min: 30 }),
	N("busy", "t", "Faster. Faster. Do not drop the semicolon.", "builder", "busy 15 min", { min: 15 }),
	N("busy", "s", "I have not blinked in forty minutes. Blinking is for later.", "anyone", "busy 40 min", { min: 40 }),
	N("busy", "s", "Hold my coffee. Actually, drink it. I have no hands free.", "lead", "busy 25 min", { min: 25 }),
	N("busy", "t", "So many files. So little me.", "anyone", "busy 20 min", { min: 20 }),
	N("busy", "n", "Do not feed the lead. It is mid-thought.", "room", "desk sign, busy room", { place: "desk", min: 30 }),
	// PR opened
	N("prOpened", "s", "Is it hot in here or is it just my diff.", "lead", ""),
	N("prOpened", "t", "I would like to be thanked in the release notes. By name.", "lead", ""),
	N("prOpened", "s", "Another PR. I am basically a factory now. A cute factory.", "lead", "2+ PRs", { min: 2 }),
	N("prOpened", "s", "Up for review. Please be gentle. Or thorough. Gently thorough.", "lead", ""),
	N("prOpened", "s", "Confetti budget: exhausted. Worth it.", "lead", "3+ PRs", { min: 3 }),
	// Review comes back
	N("review", "s", "I read every line. I sighed at several.", "reviewer", ""),
	N("review", "t", "Round three. I am bringing snacks next time.", "reviewer", "3rd pass", { min: 3 }),
	N("review", "s", "It is good. I hate that it is good.", "reviewer", "", { rare: true }),
	// Hiring a subagent
	N("hiring", "s", "You are hired. Benefits: none. Vibes: excellent.", "lead", "hiring", { max: 2 }),
	N("hiring", "s", "Welcome aboard. Do not touch my stapler.", "anyone", "hiring"),
	N("hiring", "t", "Middle management. I have arrived.", "anyone", "depth 2+", { min: 2 }),
	// A big crew
	N("bigCrew", "s", "Everybody in! Grab a task! Any task!", "lead", "4+ at once"),
	N("bigCrew", "s", "I have assembled a team. I am a visionary.", "lead", "4+ at once"),
	N("bigCrew", "t", "Is it a crew if I cannot remember all their names.", "lead", "6+", { min: 6 }),
	N("bigCrew", "s", "Form an orderly line. Never mind. Form any line.", "lead", "4+ at once"),
	N("bigCrew", "s", "Somebody order more chairs.", "anyone", "6+", { min: 6 }),
	N("bigCrew", "n", "Occupancy: yes.", "room", "wall sign", { place: "sign" }),
	// Stalled
	N("stalled", "t", "Loading thoughts. Please hold.", "anyone", "5 min", { min: 5 }),
	N("stalled", "s", "I am not stuck. I am savouring.", "anyone", "6 min", { min: 6 }),
	N("stalled", "t", "A cobweb has asked if I am using this desk.", "anyone", "12 min", { min: 12 }),
	N("stalled", "s", "Any minute now. That is a promise. A loose one.", "anyone", "8 min", { min: 8 }),
	// Idle: comically lazy
	N("idle", "s", "I am conserving energy for a future emergency.", "lead", "feet up", { max: 10 }),
	N("idle", "t", "If I stay very still, the backlog cannot see me.", "lead", "feet up", { max: 10 }),
	N("idle", "s", "Lunch break. Second lunch break. It has been a lunch day.", "lead", "feet up", { max: 20 }),
	N("idle", "t", "zzz… one more merge… zzz", "lead", "asleep", { min: 10 }),
	N("idle", "s", "Do not wake me unless it is a green build or cake.", "lead", "asleep, mumbling", { min: 15 }),
	N("idle", "t", "zzz… refactor… everything… zzz", "lead", "asleep", { min: 20 }),
	N("idle", "s", "I have achieved a perfect nap. Science should study me.", "lead", "long idle", { min: 30 }),
	N("idle", "n", "Out of office. In the office.", "room", "wall sign, long-idle room", { place: "sign", min: 30 }),
	// Back to work after a long idle
	N("woken", "s", "I am up. I was always up. Where am I.", "lead", "after 10+ min idle"),
	N("woken", "s", "Back! Refreshed! Slightly creased!", "lead", "after 10+ min idle"),
	N("woken", "t", "Pretend you were working. Pretend you were working.", "lead", "after 10+ min idle"),
	N("woken", "s", "Did I miss anything. Do not answer that.", "lead", "after 30+ min idle", { min: 30 }),
	N("woken", "s", "My keyboard has a face-shaped dent. Unrelated.", "lead", "after 20+ min idle", { min: 20 }),
	// Compacting
	N("compacting", "s", "Into the shredder you go, small memories. You were loved.", "lead", ""),
	N("compacting", "t", "What was I doing. Something brilliant, probably.", "lead", "2nd+", { min: 2 }),
	N("compacting", "s", "Fresh mind. Same opinions.", "lead", "3rd+", { min: 3 }),
	// Crashed
	N("crashed", "s", "That was a feature. A very loud feature.", "lead", ""),
	N("crashed", "t", "Smoke is just enthusiasm leaving the building.", "anyone", ""),
	// Finished, still open
	N("finished", "s", "All done. Now accepting compliments.", "anyone", ""),
	N("finished", "s", "Task complete. Heading for the snack drawer.", "anyone", "crew, done"),
	N("finished", "t", "I could close myself. I could. I will not.", "lead", ""),
	N("finished", "s", "Done before lunch. Taking lunch anyway.", "anyone", "", { rare: true }),
	// Paused or sent home
	N("paused", "s", "Fine. I will be at the water cooler. Thinking about my choices.", "anyone", ""),
	N("paused", "t", "Benched. Mid-sentence. The drama.", "anyone", ""),
	N("paused", "s", "I was just getting to the good part.", "anyone", ""),
	// The coffee queue
	N("coffeeQueue", "s", "Is this the line for coffee or the line for the line.", "anyone", "4+ in the kitchen", { min: 4 }),
	N("coffeeQueue", "t", "I finished my task just to stand here. Worth it.", "anyone", ""),
	N("coffeeQueue", "s", "Whoever took the last oat milk: we know.", "anyone", "", { rare: true }),
	// Reactions to each other
	N("reaction", "t", "Some of us are working. Some of us are horizontal.", "anyone", "near feet up", { tag: "slacker" }),
	N("reaction", "s", "Oh look, confetti. Again.", "anyone", "at a PR", { tag: "pr" }),
	N("reaction", "s", "Green! Everybody freeze!", "anyone", "green build", { tag: "green" }),
	N("reaction", "t", "I will pretend I did not see that.", "anyone", "near a crash", { tag: "crash" }),
	N("reaction", "s", "Proud of you. Do not let it go to your hat.", "anyone", "at a PR", { tag: "pr" }),
	N("reaction", "s", "There, there. Tests are just suggestions.", "anyone", "near a failing test", { tag: "red" }),
	// The bill
	N("bill", "s", "Cup two. Warming up.", "lead", "2 cups", { min: 2, max: 4 }),
	N("bill", "t", "Each cup is an investment in me. I am a good investment.", "lead", "3+ cups", { min: 3 }),
	N("bill", "s", "Cup eight. I can hear colours.", "lead", "8+ cups", { min: 8 }),
	N("bill", "n", "Cups today: {n}.", "room", "mug pile", { place: "mugs" }),
	// Notes on the fridge
	N("fridge", "n", "Whoever is on fail number {n}: we believe in you. Mostly.", "room", "", { place: "fridge", tag: "red" }),
	N("fridge", "n", "Reminder: the sofa is for finished sessions. You know who you are.", "room", "", { place: "fridge", tag: "done" }),
	N("fridge", "n", "{name} has been mysterious for {min} minutes.", "room", "", { place: "fridge", tag: "stalled" }),
	N("fridge", "n", "It is late. The mochis are still typing. Somebody call their parents.", "room", "", { place: "fridge", tag: "late" }),
	// Late at night
	N("lateNight", "s", "Is it night? I do not believe in night.", "anyone", "after 23:00"),
	N("lateNight", "t", "The office is spooky after dark. I love it here.", "anyone", "after 23:00"),
	N("lateNight", "s", "Midnight snack and a merge conflict. Living the dream.", "lead", "after 23:00"),
	N("lateNight", "s", "The moon is out. The tests are not.", "anyone", "after 23:00"),
	N("lateNight", "t", "If I finish before sunrise, it did not happen.", "lead", "after midnight", { min: 0, max: 6 }),
	N("lateNight", "s", "You should sleep. I will keep typing. Very quietly.", "lead", "after midnight", { min: 0, max: 6 }),
];

export const LINES: Line[] = [...BOARD_LINES, ...NEW_LINES];

/** Lines for one trigger. */
export const linesFor = (trigger: TriggerKind): Line[] => LINES.filter((l) => l.trigger === trigger);
