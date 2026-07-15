#!/usr/bin/env node
'use strict';

const { approveDraft } = require('./lib/blog-admin-ops');

try {
  const result = approveDraft(process.argv[2]);
  console.log(`Approved → ${result.url}`);
  if (result.buildLog) console.log(result.buildLog);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
