/**
 * @param {{ taskType: string; complexity: string; allowCloud: boolean }} input
 */
function selectModelKey(input) {
  const { taskType, complexity, allowCloud } = input;

  if (taskType === "local") return "local";
  if (!allowCloud) return "local";

  if (complexity === "simple") return "cheap";
  if (complexity === "medium") return "balanced";

  return "strong";
}

module.exports = { selectModelKey };
