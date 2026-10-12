import assert from "node:assert/strict";
import test from "node:test";
import {
  KURU_MON_USDC_MARKET,
  KURU_TRADE_TOPIC,
  analyzeKuruFlow,
  decodeKuruTradeLog,
  type KuruRawLog,
  type KuruTrade,
} from "../lib/monad/kuru-flow.ts";

const word = (value: bigint) => value.toString(16).padStart(64, "0");
const addressWord = (value: string) => value.slice(2).padStart(64, "0");
const hash = (character: string) => `0x${character.repeat(64)}`;

function log(overrides: Partial<KuruRawLog> = {}): KuruRawLog {
  return {
    address: KURU_MON_USDC_MARKET,
    blockNumber: "0x64",
    logIndex: "0x2",
    transactionHash: hash("a"),
    topics: [KURU_TRADE_TOPIC],
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
    ...overrides,
  };
}

function trade(index: number, side: "BUY" | "SELL", sizeMon: number, priceUsd = 0.025): KuruTrade {
  return {
    blockNumber: 100 + index,
    logIndex: index,
    transactionHash: `0x${index.toString(16).padStart(64, "0")}`,
    orderId: index,
    makerAddress: "0x1111111111111111111111111111111111111111",
    takerAddress: `0x${(index + 10).toString(16).padStart(40, "0")}`,
    txOrigin: "0x3333333333333333333333333333333333333333",
    side,
    priceUsd,
    sizeMon,
    notionalUsd: sizeMon * priceUsd,
    orderRemainingMon: 0,
  };
}

test("decodes the official non-indexed Kuru Trade event", () => {
  const decoded = decodeKuruTradeLog(log());
  assert.equal(decoded.orderId, 42);
  assert.equal(decoded.side, "BUY");
  assert.equal(decoded.priceUsd, 0.025538);
  assert.equal(decoded.sizeMon, 200);
  assert.equal(decoded.orderRemainingMon, 500);
  assert.equal(decoded.notionalUsd, 5.1076);
  assert.equal(decoded.takerAddress, "0x2222222222222222222222222222222222222222");
});

test("rejects logs from another contract or topic", () => {
  assert.throws(() => decodeKuruTradeLog(log({ address: "0x4444444444444444444444444444444444444444" })), /market address/);
  assert.throws(() => decodeKuruTradeLog(log({ topics: [hash("b")] })), /event topic/);
});

test("rejects malformed and removed evidence", () => {
  assert.throws(() => decodeKuruTradeLog(log({ data: "0x12" })), /eight ABI words/);
  assert.throws(() => decodeKuruTradeLog(log({ removed: true })), /Removed/);
});

test("withholds direction when the verified sample is sparse", () => {
  const result = analyzeKuruFlow([trade(1, "BUY", 10), trade(2, "SELL", 8)]);
  assert.equal(result.classification, "INSUFFICIENT");
  assert.deepEqual(result.flags.map((flag) => flag.code), ["SPARSE_SAMPLE"]);
  assert.match(result.explanation, /withholds/);
});

test("classifies ordinary mixed flow without inventing an anomaly", () => {
  const result = analyzeKuruFlow([
    trade(1, "BUY", 10, 0.025), trade(2, "SELL", 9, 0.0251), trade(3, "BUY", 8, 0.0252),
    trade(4, "SELL", 10, 0.0251), trade(5, "BUY", 9, 0.025), trade(6, "SELL", 8, 0.0252),
  ]);
  assert.equal(result.classification, "BALANCED");
  assert.equal(result.flags.length, 0);
  assert.equal(result.uniqueTakers, 6);
  assert.ok(result.vwapUsd != null);
});

test("flags one-sided flow using the disclosed 70 percent gate", () => {
  const result = analyzeKuruFlow([
    trade(1, "BUY", 20), trade(2, "BUY", 20), trade(3, "BUY", 20), trade(4, "BUY", 20), trade(5, "SELL", 5),
  ]);
  assert.equal(result.classification, "WATCH");
  assert.ok(result.flags.some((flag) => flag.code === "ONE_SIDED_FLOW"));
  assert.ok(result.imbalancePercent >= 70);
});

test("flags volume concentration without calling it manipulation", () => {
  const result = analyzeKuruFlow([trade(1, "BUY", 80), trade(2, "SELL", 10), trade(3, "BUY", 10)]);
  const concentration = result.flags.find((flag) => flag.code === "LARGE_TRADE_CONCENTRATION");
  assert.ok(concentration);
  assert.doesNotMatch(concentration.explanation, /manipulation/i);
});

test("flags a wide executed price range", () => {
  const result = analyzeKuruFlow([
    trade(1, "BUY", 10, 0.02), trade(2, "SELL", 10, 0.021), trade(3, "BUY", 10, 0.022),
    trade(4, "SELL", 10, 0.023), trade(5, "BUY", 10, 0.024),
  ]);
  assert.ok(result.flags.some((flag) => flag.code === "WIDE_PRICE_RANGE"));
  assert.ok((result.priceRangeBps ?? 0) >= 200);
});
