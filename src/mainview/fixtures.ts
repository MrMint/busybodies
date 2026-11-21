// Recorded, anonymized snapshot timelines from fixtures/*.ndjson (tools/record.ts), bundled for
// ?replay=<name>&speed=8. Loaded lazily, so a normal start doesn't carry them.
const files = import.meta.glob("../../fixtures/*.ndjson", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

export async function loadFixture(name: string): Promise<string | undefined> {
	const key = Object.keys(files).find((k) => k.endsWith(`/${name}.ndjson`));
	return key ? files[key]!() : undefined;
}

export const fixtureNames = () => Object.keys(files).map((k) => k.replace(/^.*\//, "").replace(/\.ndjson$/, ""));
