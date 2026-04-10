class TaskStore {
  /** @param {any} _ctx @param {any} _query */
  async list(_ctx, _query) {
    throw new Error("TaskStore.list not implemented");
  }

  /** @param {any} _ctx @param {string} _id */
  async getById(_ctx, _id) {
    throw new Error("TaskStore.getById not implemented");
  }

  /** @param {any} _ctx @param {object} _payload */
  async create(_ctx, _payload) {
    throw new Error("TaskStore.create not implemented");
  }

  /** @param {any} _ctx @param {string} _id @param {object} _merged — mergeTaskPatchFromBody 产出 */
  async update(_ctx, _id, _merged) {
    throw new Error("TaskStore.update not implemented");
  }

  /** @param {any} _ctx @param {string} _id */
  async delete(_ctx, _id) {
    throw new Error("TaskStore.delete not implemented");
  }
}

module.exports = { TaskStore };
