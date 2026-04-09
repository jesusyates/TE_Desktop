const { getMemoryDomainStore } = require("../../stores/registry");

async function getMemory(ctx) {
  const store = getMemoryDomainStore();
  const [preferences, entries] = await Promise.all([
    store.getPreferences(ctx),
    store.listEntries(ctx, 100)
  ]);
  return { preferences, entries };
}

async function appendMemoryEntry(ctx, partial) {
  return getMemoryDomainStore().appendEntry(ctx, partial);
}

module.exports = { getMemory, appendMemoryEntry };
