/** TOTP 时间步与倒计时（与 RFC 6238 窗口对齐，秒边界用 Math.floor）。 */

export function currentTimeMs(timeOffsetMs: number): number {
  return Date.now() + timeOffsetMs;
}

export function timeStepIndex(adjustedTimeMs: number, periodSec: number): number {
  const unixSec = Math.floor(adjustedTimeMs / 1000);
  return Math.floor(unixSec / periodSec);
}

/** 当前周期内剩余秒数 (0, period]，用于 UI 倒计时；本周期开始时接近 period。 */
export function remainingSecondsInPeriod(adjustedTimeMs: number, periodSec: number): number {
  const unixSec = Math.floor(adjustedTimeMs / 1000);
  const secInPeriod = unixSec % periodSec;
  return periodSec - secInPeriod;
}

/** 0..1，本周期已用比例（用于进度条） */
export function periodProgress(adjustedTimeMs: number, periodSec: number): number {
  const unixSec = adjustedTimeMs / 1000;
  const frac = (unixSec % periodSec) / periodSec;
  return Math.min(1, Math.max(0, frac));
}
