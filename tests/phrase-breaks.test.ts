import { test } from "node:test";
import assert from "node:assert/strict";
import { patternFor, splitPhrases } from "../src/lib/phrase-breaks";

test("phrase breaks: a pattern splits only the sentence it spells; any other sentence stays whole", () => {
  assert.deepEqual(splitPhrases("使う前に、確認してください。", "使う前に、|確認してください。"), ["使う前に、", "確認してください。"]);
  // One character more or less in the sentence: the pattern does not apply, nothing is lost or added.
  assert.deepEqual(splitPhrases("使う前に、確認してください", "使う前に、|確認してください。"), ["使う前に、確認してください"]);
  assert.deepEqual(splitPhrases("使う前に、確認してください。", undefined), ["使う前に、確認してください。"]);
  assert.deepEqual(splitPhrases("a b", "a |b|"), ["a ", "b"]);
  assert.equal(patternFor("使う前に、確認してください。", ["別の文。", "使う前に、|確認してください。"]), "使う前に、|確認してください。");
  assert.equal(patternFor("変わった文。", ["使う前に、|確認してください。"]), undefined);
});
