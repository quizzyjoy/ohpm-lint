#!/usr/bin/env node
// Org-scoped alias: delegate to the canonical `ohpm-lint` CLI.
// Importing the module executes it with the current argv, so flags/exit codes are identical.
import 'ohpm-lint/dist/cli.js';
