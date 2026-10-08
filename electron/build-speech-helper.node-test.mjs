import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { plusSpeechInfoPlist } from "./build-speech-helper.mjs";

test("Plus speech helper keeps a distinct bundle id and display name", () => {
  const source = readFileSync(new URL("./resources/speech-helper-Info.plist", import.meta.url), "utf8");
  const plus = plusSpeechInfoPlist(source);
  assert.match(plus, /<string>com\.openmausbot\.app\.plus\.speech-helper<\/string>/);
  assert.doesNotMatch(plus, /<string>com\.openmausbot\.app\.speech-helper<\/string>/);
  assert.match(plus, /<string>OpenMausBot Plus<\/string>/);
  assert.match(plus, /<string>OpenMausBot Plus Speech<\/string>/);
  assert.match(plus, /OpenMausBot Plus listens/);
  assert.match(plus, /OpenMausBot Plus converts/);
  assert.match(source, /<string>com\.openmausbot\.app\.speech-helper<\/string>/);
});
