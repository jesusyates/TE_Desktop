class MemoryDomainStore {
  async getPreferences(_ctx) {
    throw new Error("not implemented");
  }

  async appendEntry(_ctx, _partial) {
    throw new Error("not implemented");
  }

  async listEntries(_ctx, _limit) {
    throw new Error("not implemented");
  }
}

module.exports = { MemoryDomainStore };
