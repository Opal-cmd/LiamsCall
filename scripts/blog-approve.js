#!/usr/bin/env node
'use strict';

const { approveDraft } = require('./lib/blog-admin-ops');

async function main() {
  const result = await approveDraft(process.argv[2]);
  console.log(`Approved → ${result.url}`);
  if (result.buildLog) console.log(result.buildLog);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
