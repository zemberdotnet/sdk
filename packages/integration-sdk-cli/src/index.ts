import { createCommand } from 'commander';

import {
  collect,
  diff,
  document,
  run,
  sync,
  visualize,
  visualizeTypes,
  validateQuestionFile,
  neo4j,
  visualizeDependencies,
  generateIntegrationGraphSchemaCommand,
  troubleshootLocalExecution,
} from './commands';

export function createCli() {
  return createCommand()
    .addCommand(collect())
    .addCommand(diff())
    .addCommand(visualize())
    .addCommand(sync())
    .addCommand(run())
    .addCommand(visualizeTypes())
    .addCommand(document())
    .addCommand(validateQuestionFile())
    .addCommand(neo4j())
    .addCommand(visualizeDependencies())
    .addCommand(generateIntegrationGraphSchemaCommand())
    .addCommand(troubleshootLocalExecution());
}
