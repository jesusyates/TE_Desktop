import { ExecutionTask } from "./execution.types";

export class ExecutionQueue {
  private queue: ExecutionTask[] = [];

  enqueue(task: ExecutionTask) {
    this.queue.push(task);
  }

  dequeue() {
    return this.queue.shift();
  }

  size() {
    return this.queue.length;
  }
}
