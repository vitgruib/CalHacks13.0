import { schema, table, t } from 'spacetimedb/server';
const thing = table({ public: true }, { id: t.u64().primaryKey().autoInc(), name: t.string() });
const spacetimedb = schema({ thing });
export default spacetimedb;
export const add_thing = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  if (!name) throw new Error('empty');
  ctx.db.thing.insert({ id: 0n, name });
});
