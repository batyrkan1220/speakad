import "server-only";
import { readJson, writeJson } from "./db";
import type { Actor } from "./types";

export const LIB = "library/actors.json";

// All library writes go through one queue: two requests used to read-modify-write the
// JSON at the same time and one overwrote the other (an actor lost its preview video).
let queue: Promise<unknown> = Promise.resolve();
export function updateLibrary(fn: (list: Actor[]) => Actor[]): Promise<Actor[]> {
  const run = queue.then(async () => {
    const next = fn(await readJson<Actor[]>(LIB, []));
    await writeJson(LIB, next);
    return next;
  });
  queue = run.catch(() => {});
  return run;
}

export const upsertActor = (a: Actor) =>
  updateLibrary((list) => {
    const i = list.findIndex((x) => x.id === a.id);
    if (i >= 0) list[i] = { ...list[i], ...a }; else list.unshift(a);
    return list;
  });

export const removeActor = (id: string) => updateLibrary((list) => list.filter((x) => x.id !== id));
