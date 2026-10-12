import assert from "node:assert/strict";
import test from "node:test";
import { deriveMonadActivitySignal, hexToSafeNumber, type MonadBlockSample } from "../lib/monad/network-pulse.ts";

const blocks = (counts: number[]): MonadBlockSample[] => counts.map((transactionCount, index) => ({
  number: 100 + index,
  hash: `0x${String(index).padStart(64, "0")}`,
  timestamp: 1_700_000_000 + index,
  transactionCount,
}));

test("decodes RPC hex values and rejects malformed input", () => {
  assert.equal(hexToSafeNumber("0x8f", "chainId"), 143);
  assert.throws(() => hexToSafeNumber("143", "chainId"), /not valid RPC hex/);
});

test("classifies a material increase from observed block activity", () => {
  const signal = deriveMonadActivitySignal(blocks([4, 5, 4, 5, 12, 13, 12, 13]));
  assert.equal(signal.trend, "RISING");
  assert.equal(signal.recentAverage, 12.5);
  assert.equal(signal.previousAverage, 4.5);
  assert.match(signal.explanation, /increase/);
});

test("keeps small changes steady and discloses fixed density bands", () => {
  const signal = deriveMonadActivitySignal(blocks([20, 21, 19, 20, 21, 20, 22, 21]));
  assert.equal(signal.trend, "STEADY");
  assert.equal(signal.density, "MODERATE");
  assert.match(signal.explanation, /fixed descriptive bands/);
});

test("classifies empty sampled blocks as quiet without making a prediction", () => {
  const signal = deriveMonadActivitySignal(blocks([0, 0, 0, 0]));
  assert.equal(signal.trend, "QUIET");
  assert.equal(signal.changePercent, null);
  assert.ok(signal.limitations.some((item) => item.includes("not a price forecast")));
});

test("requires enough blocks for a comparison", () => {
  assert.throws(() => deriveMonadActivitySignal(blocks([1, 2, 3])), /At least four/);
});
