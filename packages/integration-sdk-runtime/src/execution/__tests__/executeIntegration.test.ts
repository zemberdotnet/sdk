import { promises as fs } from 'fs';
import { vol } from 'memfs';
import path from 'path';

import {
  getRootStorageDirectory,
  readJsonFromPath,
  walkDirectory,
} from '../../fileSystem';
import {
  executeIntegrationInstance,
  executeIntegrationLocally,
  ExecuteIntegrationResult,
} from '../executeIntegration';
import { LOCAL_INTEGRATION_INSTANCE } from '../instance';
import {
  createIntegrationLogger,
  IntegrationLogger as IntegrationLoggerImpl,
} from '../../logger';
import {
  IntegrationLogger,
  IntegrationExecutionContext,
  IntegrationInstance,
  IntegrationInvocationConfig,
  StepResultStatus,
  IntegrationInvocationValidationFunction,
  IntegrationValidationError,
  Entity,
  Relationship,
  createDirectRelationship,
  RelationshipClass,
} from '@jupiterone/integration-sdk-core';
import { InMemoryGraphObjectStore } from '@jupiterone/integration-sdk-private-test-utils';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { FlushedGraphObjectData } from '../../storage/types';

const brotliDecompress = promisify(zlib.brotliDecompress);

jest.mock('fs');

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

export interface InstanceConfigurationData {
  validateInvocation: IntegrationInvocationValidationFunction;
  instance: IntegrationInstance;
  invocationConfig: IntegrationInvocationConfig;
  logger: IntegrationLogger;
}

function createInstanceConfiguration(
  options?: Partial<InstanceConfigurationData>,
): InstanceConfigurationData {
  const validateInvocation: IntegrationInvocationValidationFunction =
    options?.validateInvocation || jest.fn();

  const invocationConfig: IntegrationInvocationConfig = {
    validateInvocation,
    integrationSteps: [],
    ...options?.invocationConfig,
  };

  return {
    validateInvocation,
    invocationConfig,
    instance: LOCAL_INTEGRATION_INSTANCE,
    logger: createIntegrationLogger({
      name: 'integration-name',
      invocationConfig,
    }),
    ...options,
  };
}

afterEach(() => {
  vol.reset();
  delete process.env.ENABLE_GRAPH_OBJECT_SCHEMA_VALIDATION;
});

describe('executeIntegrationInstance', () => {
  beforeEach(() => {
    delete process.env.INTEGRATION_FILE_COMPRESSION_ENABLED;
  });

  test('executes validateInvocation function if provided in config', async () => {
    const config = createInstanceConfiguration();
    await executeIntegrationInstance(
      config.logger,
      config.instance,
      config.invocationConfig,
    );

    const expectedContext: IntegrationExecutionContext = {
      instance: config.instance,
      logger: config.logger,
    };

    expect(config.validateInvocation).toHaveBeenCalledWith(expectedContext);
  });

  test('logs validation error if validation fails', async () => {
    const error = new IntegrationValidationError(
      'Failed to auth with provider',
    );

    const config = createInstanceConfiguration({
      validateInvocation: jest.fn().mockRejectedValue(error),
    });

    const validationFailureSpy = jest.spyOn(config.logger, 'validationFailure');
    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).rejects.toThrow(/Failed to auth with provider/);

    expect(validationFailureSpy).toHaveBeenCalledTimes(1);
    expect(validationFailureSpy).toHaveBeenCalledWith(error);
  });

  test('throws validation errors on invalid output of getStepStartStates', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        getStepStartStates: jest.fn().mockReturnValue({}),
        integrationSteps: [
          {
            id: 'my-step',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest.fn(),
          },
        ],
      },
    });

    const validationFailureSpy = jest.spyOn(config.logger, 'validationFailure');
    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).rejects.toThrow(/Start states not found for/);
    // This error is not one the user can fix, we just crash
    expect(validationFailureSpy).not.toHaveBeenCalled();
  });

  test('returns integration step results and metadata about partial datasets', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest.fn(),
          },
        ],
      },
    });

    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).resolves.toEqual({
      integrationStepResults: [
        {
          id: 'my-step',
          name: 'My awesome step',
          declaredTypes: ['test'],
          partialTypes: [],
          encounteredTypes: [],
          status: StepResultStatus.SUCCESS,
        },
      ],
      metadata: {
        partialDatasets: {
          types: [],
        },
      },
    });
  });

  test('compresses files when INTEGRATION_FILE_COMPRESSION_ENABLED is set', async () => {
    process.env.INTEGRATION_FILE_COMPRESSION_ENABLED = '1';

    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test',
                _class: 'Test',
              },
            ],
            relationships: [],
            async executionHandler({ jobState }) {
              const fromEntity = await jobState.addEntity({
                _key: 'test',
                _type: 'test',
                _class: 'Test',
              });

              const toEntity = await jobState.addEntity({
                _key: 'test1',
                _type: 'test',
                _class: 'Test',
              });

              await jobState.addRelationship(
                createDirectRelationship({
                  _class: RelationshipClass.HAS,
                  from: fromEntity,
                  to: toEntity,
                }),
              );
            },
          },
        ],
      },
    });

    await executeIntegrationInstance(
      config.logger,
      config.instance,
      config.invocationConfig,
    );

    interface FlushedGraphObjectDataWithFilePath
      extends FlushedGraphObjectData {
      filePath;
    }

    const flushedGraphData: FlushedGraphObjectDataWithFilePath[] = [];

    await walkDirectory({
      path: path.join(getRootStorageDirectory(), 'graph'),
      iteratee: async ({ filePath }) => {
        const fileData = await fs.readFile(filePath);
        const decompressed = (await brotliDecompress(fileData)).toString(
          'utf-8',
        );
        flushedGraphData.push({
          ...JSON.parse(decompressed),
          filePath,
        });
      },
    });

    const sortedFlushedGraphData = flushedGraphData
      .sort((a, b) => {
        return a.filePath > b.filePath ? 1 : -1;
      })
      .map((flushed) => {
        delete flushed.filePath;
        return flushed;
      });

    expect(sortedFlushedGraphData).toEqual([
      {
        entities: [
          {
            _key: 'test',
            _type: 'test',
            _class: 'Test',
          },
          {
            _key: 'test1',
            _type: 'test',
            _class: 'Test',
          },
        ],
      },
      {
        relationships: [
          {
            _key: 'test|has|test1',
            _type: 'test_has_',
            _class: 'HAS',
            _fromEntityKey: 'test',
            _toEntityKey: 'test1',
            displayName: 'HAS',
          },
        ],
      },
    ]);
  });

  test('publishes disk usage metric', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest.fn(),
          },
        ],
      },
    });

    const publishMetricSpy = jest.spyOn(config.logger, 'publishMetric');
    await executeIntegrationInstance(
      config.logger,
      config.instance,
      config.invocationConfig,
    );

    expect(publishMetricSpy).toHaveBeenCalledWith({
      name: 'disk-usage',
      unit: 'Bytes',
      value: expect.any(Number),
    });
  });

  test('populates partialDatasets type for failed steps', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest
              .fn()
              .mockRejectedValue(new Error('something broke')),
          },
        ],
      },
    });

    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).resolves.toEqual({
      integrationStepResults: [
        {
          id: 'my-step',
          name: 'My awesome step',
          declaredTypes: ['test'],
          partialTypes: [],
          encounteredTypes: [],
          status: StepResultStatus.FAILURE,
        },
      ],
      metadata: {
        partialDatasets: {
          types: ['test'],
        },
      },
    });
  });

  test('includes types for partially successful steps in partial datasets', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step-a',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_a',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest
              .fn()
              .mockRejectedValue(new Error('something broke')),
          },
          {
            id: 'my-step-b',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_b',
                _class: 'Test',
              },
            ],
            relationships: [],
            dependsOn: ['my-step-a'],
            executionHandler: jest.fn(),
          },
        ],
      },
    });

    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).resolves.toEqual({
      integrationStepResults: [
        {
          id: 'my-step-a',
          name: 'My awesome step',
          declaredTypes: ['test_a'],
          partialTypes: [],
          encounteredTypes: [],
          status: StepResultStatus.FAILURE,
        },
        {
          id: 'my-step-b',
          name: 'My awesome step',
          declaredTypes: ['test_b'],
          partialTypes: [],
          encounteredTypes: [],
          dependsOn: ['my-step-a'],
          status: StepResultStatus.PARTIAL_SUCCESS_DUE_TO_DEPENDENCY_FAILURE,
        },
      ],
      metadata: {
        partialDatasets: {
          types: ['test_a', 'test_b'],
        },
      },
    });
  });

  test('includes partialTypes declared in subsequent step meta data when dependency failure', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step-a',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_a',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest
              .fn()
              .mockRejectedValue(new Error('something broke')),
          },
          {
            id: 'my-step-b',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_b',
                _class: 'Test',
              },
              {
                resourceName: 'The Test',
                _type: 'test_b2',
                _class: 'Test',
                partial: true,
              },
            ],
            relationships: [],
            dependsOn: ['my-step-a'],
            executionHandler: jest.fn(),
          },
        ],
      },
    });

    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).resolves.toEqual({
      integrationStepResults: [
        {
          id: 'my-step-a',
          name: 'My awesome step',
          declaredTypes: ['test_a'],
          partialTypes: [],
          encounteredTypes: [],
          status: StepResultStatus.FAILURE,
        },
        {
          id: 'my-step-b',
          name: 'My awesome step',
          declaredTypes: ['test_b', 'test_b2'],
          encounteredTypes: [],
          partialTypes: ['test_b2'],
          dependsOn: ['my-step-a'],
          status: StepResultStatus.PARTIAL_SUCCESS_DUE_TO_DEPENDENCY_FAILURE,
        },
      ],
      metadata: {
        partialDatasets: {
          types: ['test_a', 'test_b2', 'test_b'],
        },
      },
    });
  });

  test('includes partialTypes declared in failing step meta data', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step-a',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_a',
                _class: 'Test',
              },
              {
                resourceName: 'The Test',
                _type: 'test_a2',
                _class: 'Test',
                partial: true,
              },
            ],
            relationships: [],
            executionHandler: jest
              .fn()
              .mockRejectedValue(new Error('something broke')),
          },
          {
            id: 'my-step-b',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_b',
                _class: 'Test',
              },
            ],
            relationships: [],
            dependsOn: ['my-step-a'],
            executionHandler: jest.fn(),
          },
        ],
      },
    });

    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).resolves.toEqual({
      integrationStepResults: [
        {
          id: 'my-step-a',
          name: 'My awesome step',
          declaredTypes: ['test_a', 'test_a2'],
          partialTypes: ['test_a2'],
          encounteredTypes: [],
          status: StepResultStatus.FAILURE,
        },
        {
          id: 'my-step-b',
          name: 'My awesome step',
          declaredTypes: ['test_b'],
          partialTypes: [],
          encounteredTypes: [],
          dependsOn: ['my-step-a'],
          status: StepResultStatus.PARTIAL_SUCCESS_DUE_TO_DEPENDENCY_FAILURE,
        },
      ],
      metadata: {
        partialDatasets: {
          types: ['test_a2', 'test_a', 'test_b'],
        },
      },
    });
  });

  test('does not include partialTypes for disabled steps', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        getStepStartStates: () => ({
          'my-step-b': { disabled: true },
          'my-step-a': { disabled: false },
        }),
        integrationSteps: [
          {
            id: 'my-step-a',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_a',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest
              .fn()
              .mockRejectedValue(new Error('something broke')),
          },
          {
            id: 'my-step-b',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_b',
                _class: 'Test',
                partial: true,
              },
            ],
            relationships: [],
            executionHandler: jest.fn(),
          },
        ],
      },
    });

    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).resolves.toEqual({
      integrationStepResults: [
        {
          id: 'my-step-a',
          name: 'My awesome step',
          declaredTypes: ['test_a'],
          partialTypes: [],
          encounteredTypes: [],
          status: StepResultStatus.FAILURE,
        },
        {
          id: 'my-step-b',
          name: 'My awesome step',
          declaredTypes: ['test_b'],
          partialTypes: ['test_b'],
          encounteredTypes: [],
          status: StepResultStatus.DISABLED,
        },
      ],
      metadata: {
        partialDatasets: {
          types: ['test_a'],
        },
      },
    });
  });

  test('does not include partial data sets for disabled steps in async "getStepStartStates"', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        getStepStartStates: async () => {
          await sleep(5);

          return {
            'my-step-b': { disabled: true },
            'my-step-a': { disabled: false },
          };
        },
        integrationSteps: [
          {
            id: 'my-step-a',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_a',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest
              .fn()
              .mockRejectedValue(new Error('something broke')),
          },
          {
            id: 'my-step-b',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_b',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest.fn(),
          },
        ],
      },
    });

    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).resolves.toEqual({
      integrationStepResults: [
        {
          id: 'my-step-a',
          name: 'My awesome step',
          declaredTypes: ['test_a'],
          partialTypes: [],
          encounteredTypes: [],
          status: StepResultStatus.FAILURE,
        },
        {
          id: 'my-step-b',
          name: 'My awesome step',
          declaredTypes: ['test_b'],
          partialTypes: [],
          encounteredTypes: [],
          status: StepResultStatus.DISABLED,
        },
      ],
      metadata: {
        partialDatasets: {
          types: ['test_a'],
        },
      },
    });
  });

  test('clears out the storage directory prior to performing collection', async () => {
    const previousContentFilePath = path.resolve(
      getRootStorageDirectory(),
      'graph',
      'my-test',
      'someFile.json',
    );

    vol.fromJSON({
      [previousContentFilePath]: '{ "entities": [] }',
    });

    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test',
                _class: 'Test',
              },
            ],
            relationships: [],
            async executionHandler({ jobState }) {
              await jobState.addEntity({
                _key: 'test',
                _type: 'test',
                _class: 'Test',
              });
            },
          },
        ],
      },
    });

    await executeIntegrationInstance(
      config.logger,
      config.instance,
      config.invocationConfig,
    );

    // file should no longer exist
    await expect(fs.readFile(previousContentFilePath)).rejects.toThrow(
      /ENOENT/,
    );

    // should still have written data to disk
    const files = await fs.readdir(getRootStorageDirectory());
    expect(files).toHaveLength(3);
    expect(files).toEqual(
      expect.arrayContaining(['graph', 'index', 'summary.json']),
    );

    // files should not exist any more
    await expect(fs.readFile(previousContentFilePath)).rejects.toThrow(
      /ENOENT/,
    );
  });

  test('writes results to summary.json in storage directory', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest.fn(),
          },
          {
            id: 'my-step-2',
            name: 'My awesome second step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test_2',
                _class: 'Test',
              },
            ],
            relationships: [],
            executionHandler: jest
              .fn()
              .mockRejectedValue(new Error('something went wrong')),
          },
        ],
      },
    });

    const expectedResults: ExecuteIntegrationResult = {
      integrationStepResults: [
        {
          id: 'my-step',
          name: 'My awesome step',
          declaredTypes: ['test'],
          partialTypes: [],
          encounteredTypes: [],
          status: StepResultStatus.SUCCESS,
        },
        {
          id: 'my-step-2',
          name: 'My awesome second step',
          declaredTypes: ['test_2'],
          partialTypes: [],
          encounteredTypes: [],
          status: StepResultStatus.FAILURE,
        },
      ],
      metadata: {
        partialDatasets: {
          types: ['test_2'],
        },
      },
    };

    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).resolves.toEqual(expectedResults);

    const writtenSummary = await readJsonFromPath<ExecuteIntegrationResult>(
      path.resolve(getRootStorageDirectory(), 'summary.json'),
    );

    expect(writtenSummary).toEqual(expectedResults);
  });

  test('includes step partialTypes when all success', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'Resource 1A',
                _type: 'test_1',
                _class: 'Test',
              },
              {
                resourceName: 'Resource 1B',
                _type: 'test_1b',
                _class: 'Test',
                partial: true,
              },
            ],
            relationships: [],
            executionHandler: jest.fn(),
          },
          {
            id: 'my-step-2',
            name: 'My awesome second step',
            entities: [
              {
                resourceName: 'Resource 2A',
                _type: 'test_2',
                _class: 'Test',
              },
              {
                resourceName: 'Resource 2B',
                _type: 'test_2b',
                _class: 'Test',
                partial: true,
              },
            ],
            relationships: [
              {
                sourceType: 'Resource 1A',
                targetType: 'Resource 2A',
                _type: 'test_3',
                _class: RelationshipClass.HAS,
                partial: true,
              },
            ],
            executionHandler: jest.fn(),
          },
        ],
      },
    });

    const expectedResults: ExecuteIntegrationResult = {
      integrationStepResults: [
        {
          id: 'my-step',
          name: 'My awesome step',
          declaredTypes: ['test_1', 'test_1b'],
          partialTypes: ['test_1b'],
          encounteredTypes: [],
          status: StepResultStatus.SUCCESS,
        },
        {
          id: 'my-step-2',
          name: 'My awesome second step',
          declaredTypes: ['test_2', 'test_2b', 'test_3'],
          partialTypes: ['test_2b', 'test_3'],
          encounteredTypes: [],
          status: StepResultStatus.SUCCESS,
        },
      ],
      metadata: {
        partialDatasets: {
          types: ['test_1b', 'test_2b', 'test_3'],
        },
      },
    };

    await expect(
      executeIntegrationInstance(
        config.logger,
        config.instance,
        config.invocationConfig,
      ),
    ).resolves.toEqual(expectedResults);

    const writtenSummary = await readJsonFromPath<ExecuteIntegrationResult>(
      path.resolve(getRootStorageDirectory(), 'summary.json'),
    );

    expect(writtenSummary).toEqual(expectedResults);
  });

  test('throws error if duplicate key is found within same step', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'a',
            name: 'a',
            entities: [{ _type: 'duplicate_entity', _class: 'DuplicateEntity', resourceName: ''}],
            relationships: [],
            async executionHandler({ jobState }) {
              await jobState.addEntities([
                {
                  _key: 'key_a',
                  _type: 'duplicate_entity',
                  _class: 'DuplicateEntity',
                },
                {
                  _key: 'key_a',
                  _type: 'duplicate_entity',
                  _class: 'DuplicateEntity',
                },
              ]);
            },
          },
        ],
      },
    });

    const response = await executeIntegrationInstance(
      config.logger,
      config.instance,
      config.invocationConfig,
    );
    expect(response).toMatchObject({
      integrationStepResults: [
        {
          encounteredTypes: ['duplicate_entity'],
          status: 'failure',
        },
      ],
      metadata: {
        partialDatasets: {
          types: ['duplicate_entity'],
        }
      }
    });
  });

  test('throws error if duplicate key is found across steps', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'a',
            name: 'a',
            entities: [{ _type: 'duplicate_entity', _class: 'DuplicateEntity', resourceName: ''}],
            relationships: [],
            async executionHandler({ jobState }) {
              await jobState.addEntity({
                _key: 'key_a',
                _type: 'duplicate_entity',
                _class: 'DuplicateEntity',
              });
            },
          },
          {
            id: 'b',
            name: 'b',
            entities: [{ _type: 'duplicate_entity', _class: 'DuplicateEntity', resourceName: ''}],
            relationships: [],
            async executionHandler({ jobState }) {
              await jobState.addEntity({
                _key: 'key_a',
                _type: 'duplicate_entity',
                _class: 'DuplicateEntity',
              });
            },
          },
        ],
      },
    });

    const response = await executeIntegrationInstance(
      config.logger,
      config.instance,
      config.invocationConfig,
    );
    expect(response).toMatchObject({
      integrationStepResults: [
        {
          id: 'a',
          encounteredTypes: ['duplicate_entity'],
          status: 'success',
        },
        {
          id: 'b',
          encounteredTypes: [],
          status: 'failure',
        },
      ],
      metadata: {
        partialDatasets: {
          types: ['duplicate_entity'],
        }
      }
    });
  });

  test('allows graph object schema validation to be enabled via options', async () => {
    const config = createInstanceConfiguration();
    expect(process.env.ENABLE_GRAPH_OBJECT_SCHEMA_VALIDATION).toBeUndefined();

    await executeIntegrationInstance(
      config.logger,
      config.instance,
      config.invocationConfig,
      {
        enableSchemaValidation: true,
      },
    );

    expect(process.env.ENABLE_GRAPH_OBJECT_SCHEMA_VALIDATION).toBeDefined();
  });

  test('does not turn on schema validation if enableSchemaValidation is not set', async () => {
    const config = createInstanceConfiguration();
    await executeIntegrationInstance(
      config.logger,
      config.instance,
      config.invocationConfig,
    );
    expect(process.env.ENABLE_GRAPH_OBJECT_SCHEMA_VALIDATION).toBeUndefined();
  });

  test('should allow passing custom graphObjectStore', async () => {
    const config = createInstanceConfiguration({
      invocationConfig: {
        integrationSteps: [
          {
            id: 'my-step',
            name: 'My awesome step',
            entities: [
              {
                resourceName: 'The Test',
                _type: 'test',
                _class: 'Test',
              },
              {
                resourceName: 'The Test 1',
                _type: 'test1',
                _class: 'Test1',
              },
            ],
            relationships: [],
            async executionHandler({ jobState }) {
              const fromEntity = await jobState.addEntity({
                _key: 'test',
                _type: 'test',
                _class: 'Test',
              });

              const toEntity = await jobState.addEntity({
                _key: 'test1',
                _type: 'test1',
                _class: 'Test1',
              });

              await jobState.addRelationship(
                createDirectRelationship({
                  _class: RelationshipClass.HAS,
                  from: fromEntity,
                  to: toEntity,
                }),
              );
            },
          },
        ],
      },
    });

    const graphObjectStore = new InMemoryGraphObjectStore();

    await executeIntegrationInstance(
      config.logger,
      config.instance,
      config.invocationConfig,
      {
        graphObjectStore,
      },
    );

    const entities: Entity[] = [];
    const relationships: Relationship[] = [];

    await graphObjectStore.iterateEntities(
      {
        _type: 'test',
      },
      (e) => {
        entities.push(e);
      },
    );

    await graphObjectStore.iterateEntities(
      {
        _type: 'test1',
      },
      (e) => {
        entities.push(e);
      },
    );

    await graphObjectStore.iterateRelationships(
      {
        _type: 'test_has_test1',
      },
      (r) => {
        relationships.push(r);
      },
    );

    expect(entities).toEqual([
      {
        _key: 'test',
        _type: 'test',
        _class: 'Test',
      },
      {
        _key: 'test1',
        _type: 'test1',
        _class: 'Test1',
      },
    ]);

    expect(relationships).toEqual([
      {
        _key: 'test|has|test1',
        _type: 'test_has_test1',
        _class: 'HAS',
        _fromEntityKey: 'test',
        _toEntityKey: 'test1',
        displayName: 'HAS',
      },
    ]);
  });
});

describe('executeIntegrationLocally', () => {
  beforeEach(() => {
    delete process.env.INTEGRATION_FILE_COMPRESSION_ENABLED;
  });

  test('provides generated logger and instance', async () => {
    const validateInvocation = jest.fn();

    await executeIntegrationLocally({
      validateInvocation,
      integrationSteps: [],
    });

    const expectedContext: IntegrationExecutionContext = {
      instance: LOCAL_INTEGRATION_INSTANCE,
      logger: expect.any(IntegrationLoggerImpl),
    };

    expect(validateInvocation).toHaveBeenCalledWith(expectedContext);
  });

  test('enables graph object schema validation', async () => {
    const validateInvocation = jest.fn();

    expect(process.env.ENABLE_GRAPH_OBJECT_SCHEMA_VALIDATION).toBeUndefined();

    await executeIntegrationLocally({
      validateInvocation,
      integrationSteps: [],
    });

    expect(process.env.ENABLE_GRAPH_OBJECT_SCHEMA_VALIDATION).toBeDefined();
  });
});
