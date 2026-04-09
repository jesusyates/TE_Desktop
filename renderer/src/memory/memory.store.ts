export type MemoryRecord = {
  id: string;
  prompt: string;
  summary: string;
  createdAt: string;
};

const memoryDb: MemoryRecord[] = [];

export const memoryStore = {
  list: () => memoryDb,
  save: (record: MemoryRecord) => {
    memoryDb.unshift(record);
  }
};
