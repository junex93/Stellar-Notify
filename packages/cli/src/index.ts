#!/usr/bin/env node
import { buildProgram } from "./program.js";
import { runtime } from "./runtime.js";

try {
  await buildProgram(runtime).parseAsync();
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
