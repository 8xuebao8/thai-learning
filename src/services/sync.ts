import { z } from "zod";
import { db, getMeta } from "../data/store";
import { wordSchema, eventSchema, settingsSchema } from "../domain/model";
export const changeSchema = z.object({
  seq: z.number().int().nonnegative(),
  kind: z.enum(["word", "settings", "event"]),
  id: z.string(),
  payload: z.unknown(),
  version: z.number().int().nonnegative(),
  deleted: z.boolean(),
});
export type Change = z.infer<typeof changeSchema>;
export async function applyChanges(
  account: string,
  input: unknown[],
  cursor: number,
  epoch?: number,
): Promise<void> {
  const changes = z.array(changeSchema).parse(input);
  // Validate the whole page before changing the database, including payloads.
  const validated = changes.map((c) => ({
    ...c,
    payload:
      c.kind === "word"
        ? wordSchema.parse({
            ...(c.payload as object),
            id: c.id,
            version: c.version,
            dirty: false,
            deleted: c.deleted,
          })
        : c.kind === "event"
          ? eventSchema.parse({ ...(c.payload as object), id: c.id })
          : settingsSchema.parse(c.payload),
  }));
  await db.transaction(
    "rw",
    db.words,
    db.events,
    db.configs,
    db.meta,
    async () => {
      if (
        epoch !== undefined &&
        (await getMeta(`${account}:epoch`, -1)) !== epoch
      )
        return;
      for (const c of validated) {
        if (c.kind === "event") {
          const event = eventSchema.parse(c.payload);
          const current = await db.events.get([account, c.id]);
          if (!current)
            await db.events.put({ ...event, account, pending: false });
        } else if (c.kind === "word") {
          const remote = wordSchema.parse(c.payload);
          const local = await db.words.get([account, c.id]);
          if (local?.dirty && c.version > local.version) {
            await db.words.put({
              ...local,
              id: crypto.randomUUID(),
              theme: "personal",
              version: 0,
              dirty: true,
              deleted: false,
              source: `${local.source} · 同步冲突副本`,
              updatedAt: Date.now(),
            });
          }
          if (
            !local ||
            (!local.dirty && c.version >= local.version) ||
            (local.dirty && c.version > local.version)
          )
            await db.words.put({ ...remote, account });
        } else {
          const local = await db.configs.get(account);
          const settings = settingsSchema.parse(c.payload);
          if (local?.dirty && c.version > local.version)
            await db.meta.put({
              key: `${account}:settings-conflict`,
              value: local.settings,
            });
          if (!local || !local.dirty || c.version > local.version)
            await db.configs.put({
              account,
              settings,
              version: c.version,
              dirty: false,
            });
        }
      }
      await db.meta.put({ key: `${account}:cursor`, value: cursor });
    },
  );
}
