// The app's babble and per-character pitch, bundled for the audition page (tools/voice.ts
// `listen`), so what you hear there is exactly what the app makes.
import { babble } from "../src/mainview/speech";
import { babbleHz, pitchCents } from "../src/scene/sass/voiced";

Object.assign(window, { busyBabble: { babble, babbleHz, pitchCents } });
