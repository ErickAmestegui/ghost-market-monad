import assert from "node:assert/strict";
import test from "node:test";
import {
  KURU_REPLAY_MAX_BLOCKS,
  buildKuruReplayQuery,
  decodeHyperSyncKuruPage,
  parseHyperSyncQuantity,
} from "../lib/monad/kuru-historical-replay.ts";
import { KURU_MON_USDC_MARKET, KURU_TRADE_TOPIC } from "../lib/monad/kuru-flow.ts";

const word = (value: bigint) => value.toString(16).padStart(64, "0");
const addressWord = (value: string) => value.slice(2).padStart(64, "0");
const hash = (character: string) => `0x${character.repeat(64)}`;

test("builds a bounded Envio HyperSync query with an exclusive end block", () => {
  const query = buildKuruReplayQuery(100, 819);
  assert.equal(query.from_block, 100);
  assert.equal(query.to_block, 820);
  assert.deepEqual(query.logs, [{ address: [KURU_MON_USDC_MARKET], topics: [[KURU_TRADE_TOPIC]] }]);
  assert.ok(query.field_selection.log.includes("block_hash"));
  assert.ok(query.field_selection.log.includes("transaction_hash"));
});

test("rejects invalid or oversized replay windows", () => {
  assert.throws(() => buildKuruReplayQuery(20, 19), /invalid/);
  assert.throws(() => buildKuruReplayQuery(0, KURU_REPLAY_MAX_BLOCKS), /cannot exceed/);
});

test("accepts decimal and hex HyperSync quantities", () => {
  assert.equal(parseHyperSyncQuantity("100", "value"), 100);
  assert.equal(parseHyperSyncQuantity("0x64", "value"), 100);
  assert.equal(parseHyperSyncQuantity(100, "value"), 100);
});

test("decodes Kuru logs and preserves verifiable block hashes", () => {
  const blockHash = hash("b");
  const payload = {
    archive_height: 900,
    next_block: 820,
    data: {
      blocks: [{ number: 777, hash: blockHash, timestamp: 1_800_000_000 }],
      logs: [{
        address: KURU_MON_USDC_MARKET,
        block_hash: blockHash,
        block_number: 777,
        log_index: 2,
        transaction_hash: hash("a"),
        topic0: KURU_TRADE_TOPIC,
        data: `0x${[
          word(42n),
          addressWord("0x1111111111111111111111111111111111111111"),
          word(1n),
          word(25_538_000_000_000_000n),
          word(5_000_000_000_000n),
          addressWord("0x2222222222222222222222222222222222222222"),
          addressWord("0x3333333333333333333333333333333333333333"),
          word(2_000_000_000_000n),
        ].join("")}`,
        removed: false,
      }],
    },
  };
  const decoded = decodeHyperSyncKuruPage(payload);
  assert.equal(decoded.nextBlock, 820);
  assert.equal(decoded.archiveHeight, 900);
  assert.equal(decoded.trades[0]?.blockNumber, 777);
  assert.equal(decoded.trades[0]?.blockHash, blockHash);
  assert.equal(decoded.trades[0]?.side, "BUY");
});

test("fails closed when joined block evidence contradicts the log", () => {
  assert.throws(() => decodeHyperSyncKuruPage({
    next_block: 2,
    data: {
      blocks: [{ number: 1, hash: hash("c") }],
      logs: [{
        address: KURU_MON_USDC_MARKET,
        block_hash: hash("b"),
        block_number: 1,
        log_index: 0,
        transaction_hash: hash("a"),
        topic0: KURU_TRADE_TOPIC,
        data: "0x",
      }],
    },
  }), /eight ABI words|block hash mismatch/);
});
