# Integration development

This project exposes both a framework for constructing integrations and a CLI to
assist with collecting and publishing data with JupiterOne.

For the purpose of synchronizing data, developers only need to collect the "new
state of the world" from a provider and have the data sent to JupiterOne. Data
that was sent up will be diffed against JupiterOne's understanding of the
"world" and persisted via a background process.

## Table of Contents

- [Integration development](#integration-development)
  - [Table of Contents](#table-of-contents)
  - [The integration framework](#the-integration-framework)
    - [`IntegrationInvocationConfig` fields](#integrationinvocationconfig-fields)
      - [`instanceConfigFields`](#instanceconfigfields)
      - [`loadExecutionConfig`](#loadexecutionconfig)
      - [`validateInvocation`](#validateinvocation)
      - [`getStepStartStates`](#getstepstartstates)
      - [`integrationSteps`](#integrationsteps)
      - [`beforeAddEntity(context: IntegrationExecutionContext<IntegrationConfig>, e: Entity): Entity`](#beforeaddentitycontext-integrationexecutioncontextintegrationconfig-e-entity-entity)
      - [`beforeAddRelationship(context: IntegrationExecutionContext<IntegrationConfig>, r: Relationship): Promise<Relationship> | Relationship`](#beforeaddrelationshipcontext-integrationexecutioncontextintegrationconfig-r-relationship-promiserelationship--relationship)
      - [`ingestionConfig`](#ingestionconfig)
      - [`afterExecution(context: IntegrationExecutionContext<IntegrationConfig>): Promise<void>`](#afterexecutioncontext-integrationexecutioncontextintegrationconfig-promisevoid)
      - [`executionHandlerWrapper(context: {step: Step<IntegrationStepExecutionContext>}, stepFunction: () => Promise<void>): Promise<void>`](#executionhandlerwrappercontext-step-stepintegrationstepexecutioncontext-stepfunction---promisevoid-promisevoid)
    - [How integrations are executed](#how-integrations-are-executed)
      - [Validation](#validation)
      - [Collection](#collection)
    - [What's in the `IntegrationExecutionContext` and `IntegrationExecutionStepContext`?](#whats-in-the-integrationexecutioncontext-and-integrationexecutionstepcontext)
      - [`IntegrationExecutionContext`](#integrationexecutioncontext)
        - [`instance`](#instance)
        - [`logger`](#logger)
          - [`forbiddenResource`](#forbiddenresource)
      - [`IntegrationExecutionStepContext`](#integrationexecutionstepcontext)
        - [`jobState`](#jobstate)
    - [Additional utilities](#additional-utilities)
      - [Data conversion](#data-conversion)
      - [Graph data generation and validation](#graph-data-generation-and-validation)
        - [`createIntegrationEntity`](#createintegrationentity)
        - [`createDirectRelationship`](#createdirectrelationship)
          - [`DirectRelationshipOptions`](#directrelationshipoptions)
          - [`DirectRelationshipLiteralOptions`](#directrelationshipliteraloptions)
        - [`createMappedRelationship`](#createmappedrelationship)
          - [`MappedRelationshipOptions`](#mappedrelationshipoptions)
          - [`MappedRelationshipLiteralOptions`](#mappedrelationshipliteraloptions)
      - [Raw data collection](#raw-data-collection)
      - [Testing](#testing)
    - [Auto-magic behind the framework](#auto-magic-behind-the-framework)
      - [Event reporting](#event-reporting)
      - [Data collection](#data-collection)
      - [Failure handling](#failure-handling)
        - [Step status codes](#step-status-codes)
      - [Letting the synchronizer know about partial datasets](#letting-the-synchronizer-know-about-partial-datasets)
        - [Detecting undeclared types](#detecting-undeclared-types)
  - [The CLI](#the-cli)
    - [Authentication](#authentication)
    - [Supported commands](#supported-commands)
      - [Command `j1-integration collect`](#command-j1-integration-collect)
        - [Options](#options)
          - [Option `--module` or `-m`](#option---module-or--m)
          - [Option `--integrationInstanceId` or `-i`](#option---integrationinstanceid-or--i)
          - [Option `--api-key` or `-k`](#option---api-key-or--k)
          - [Option `--step` or `-s`](#option---step-or--s)
          - [Option `--no-cache`](#option---no-cache)
          - [Option `--cache-path`](#option---cache-path)
          - [Option `--disable-schema-validation` or `-V`](#option---disable-schema-validation-or--v)
      - [Command `j1-integration sync`](#command-j1-integration-sync)
        - [Keeping the door open for developers not using JavaScript or TypeScript](#keeping-the-door-open-for-developers-not-using-javascript-or-typescript)
        - [Options](#options-1)
          - [Option `--module` or `-m`](#option---module-or--m-1)
          - [Option `--integrationInstanceId` or `-i`](#option---integrationinstanceid-or--i-1)
          - [Option `--source`](#option---source)
          - [Option `--scope`](#option---scope)
          - [Option `--api-key` or `-k`](#option---api-key-or--k-1)
          - [Option `--tail` or `-t`](#option---tail-or--t)
          - [Option `--api-base-url`](#option---api-base-url)
      - [Command `j1-integration run`](#command-j1-integration-run)
        - [Option `--skip-finalize`](#option---skip-finalize)
      - [Command `j1-integration visualize`](#command-j1-integration-visualize)
      - [Command `j1-integration visualize-types`](#command-j1-integration-visualize-types)
      - [Command `j1-integration document`](#command-j1-integration-document)
      - [Command `j1-integration validate-question-file`](#command-j1-integration-validate-question-file)
      - [Command `j1-integration generate-integration-graph-schema`](#command-j1-integration-generate-integration-graph-schema)
      - [Command `j1-integration troubleshoot`](#command-j1-integration-troubleshoot)
      - [Future commands and utilities](#future-commands-and-utilities)
        - [More commands and options](#more-commands-and-options)
          - [Command `j1-integration plan`](#command-j1-integration-plan)
          - [Command `j1-integration sync --dry-run`](#command-j1-integration-sync---dry-run)
          - [Command `j1-integration generate`](#command-j1-integration-generate)
        - [One CLI tool for all JupiterOne development](#one-cli-tool-for-all-jupiterone-development)
        - [Better methods of authentication with JupiterOne](#better-methods-of-authentication-with-jupiterone)
  - [Does JupiterOne use this SDK for managed integrations?](#does-jupiterone-use-this-sdk-for-managed-integrations)
  - [Future work around integrations](#future-work-around-integrations)
    - [`external` integrations](#external-integrations)
    - [Event ingestion](#event-ingestion)
  - [j1 CLI](#j1-cli)
    - [Authentication](#authentication-1)
    - [Supported commands](#supported-commands-1)
      - [Command `j1 export`](#command-j1-export)
      - [Command `j1 import`](#command-j1-import)

## The integration framework

This SDK supports building JupiterOne integrations using either JavaScript or
TypeScript.

The execution process expects the integration to produce an object conforming to
the
[`IntegrationInvocationConfig`](/packages/integration-sdk-core/src/types/config.ts)
interface.

This includes configuration fields required to run the integration, a function
for performing config field validation, a function for determining which steps
of an integration to ignore, and a list of steps that define how an integration
should collect data.

Use the provided
[Integration Template](https://github.com/JupiterOne/integration-template) to
get started.

### `IntegrationInvocationConfig` fields

#### `instanceConfigFields`

The `instanceConfigFields` field contains a map of integration fields that are
required for authenticating with provider APIs and otherwise necessary to
configure the integration for execution. This varies between services.

The `type` will ensure the values are cast when
[read from `.env`](#command-j1-integration-collect). It is important to mark
secrets with `mask: true` to facilitate safe logging.

Example:

```typescript
const instanceConfigFields: IntegrationInstanceConfigFieldMap<MyIntegrationConfigFields> =
  {
    clientId: {
      type: 'string',
      mask: false,
    },
    clientSecret: {
      type: 'string',
      mask: true,
    },
    ingestGroups: {
      type: boolean,
      mask: true,
    },
  };
```

#### `loadExecutionConfig`

The `loadExecutionConfig` method loads any config assets that should be used
across multiple steps. This method is most often used to create shared
credentials for API clients.

The `loadExecutionConfig` method runs before `validateInvocation`,
`getStepStartStates`, and `integrationSteps`. The loaded config is accessible in
any of these contexts as `context.executionConfig`.

Example:

```typescript
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { randomUUID as uuid } from 'crypto';

interface InstanceConfig extends IntegrationInstanceConfig {
  roleArn: string;
  externalId: string;
}

export function loadExecutionConfig({ config: InstanceConfig }) {
  return {
    credentials: fromTemporaryCredentials({
      params: {
        RoleArn: config.roleArn,
        ExternalId: config.externalId,
        RoleSessionName: `juptierone-${uuid()}`,
      },
    }),
  };
}
```

Calling functions may use the loaded `executionConfig` like so:

```ts
// -----------------------------------------------------------------------------
// client.ts
import { EC2Client, DescribeVpcsCommand, Vpc } from '@aws-sdk/client-ec2';

export class J1Ec2Client {
  private ec2: Ec2Client;
  constructor(credentials: ProviderCredentials) {
    this.ec2 = new Ec2Client({ credentials });
  }

  public async iterateVpcs(iteratee: (vpc: Vpc) => Promise<void>) {
    do {
      const response = await this.ec2.send(new DescribeVpcsCommand({}));
      if (response.Vpcs) {
        for (const vpc of response.Vpcs) {
          await iteratee(vpc);
        }
      }
      nextToken = response.NextToken;
    } while (nextToken);
  }
}

// -----------------------------------------------------------------------------
// index.ts
import { J1Ec2Client } from './client';
import { createVpcEntity } from './converters';
import { Ec2Entities } from './constants';

async function fetchVpcs({
  jobState,
  executionConfig,
}: IntegrationStepExecutionContext<IntegrationConfig>) {
  const { credentials } = executionConfig;
  const client = new J1Ec2Client(credentials);
  await client.iterateVpcs(async (vpc) =>
    jobState.addEntity(createVpcEntity(vpc)),
  );
}

export const ec2Steps = [
  {
    id: 'fetch-vpcs',
    name: 'Fetch EC2 VPCs',
    entities: [Ec2Entities.VPC],
    relationships: [],
    executionHandler: fetchVpcs,
  },
];
```

#### `validateInvocation`

The `validateInvocation` field is a validation function that is required for
ensuring the integration has received a valid set of `instanceConfigFields`.

It is assumed that the integration's configuration is valid if the validation
function executes without error. If an error is thrown, a message will be
published to the integration's event log stating that validation has failed.

A typical implementation will:

1. Verify required configuration properties are provided, throwing an
   `IntegrationValidationError` when they are not.
1. Create an instance of the API client and execute an authenticated API call to
   ensure the credentials are valid, throwing an
   `IntegrationProviderAuthenticationError` when they are not.

Example:

```typescript
import {
  IntegrationExecutionContext,
  IntegrationProviderAuthenticationError,
  IntegrationValidationError,
} from '@jupiterone/integration-sdk-core';

import { IntegrationConfig } from './types';

async function validateInvocation(
  context: IntegrationExecutionContext<IntegrationConfig>,
) {
  const { config } = context.instance;

  if (!config.clientId || !config.clientSecret) {
    throw new IntegrationValidationError(
      'Config requires all of {clientId, clientSecret}',
    );
  }

  const apiClient = createAPIClient(config);
  try {
    await apiClient.verifyAuthentication();
  } catch (err) {
    throw new IntegrationProviderAuthenticationError({
      cause: err,
      endpoint: 'https://provider.com/api/v1/some/endpoint?limit=1',
      status: err.status,
      statusText: err.statusText,
    });
  }
}
```

Using the above example, the following message will be logged if the config's
`clientId` or `clientSecret` is not set:

`Error occurred while validating integration configuration. (errorCode="CONFIG_VALIDATION_ERROR", errorId="<generated error id>", reason="Config requires all of {clientId, clientSecret}")`;

#### `getStepStartStates`

The `getStepStartStates` is an optional function that can be provided for
determining if a certain step should be run or not. The default implementation
enables all steps. When you provide this function, it must return an entry for
each step.

Example:

```typescript
import { IntegrationExecutionContext } from '@jupiterone/integration-sdk-core';

import { IntegrationConfig } from './types';

function getStepStartStates(
  executionContext: IntegrationExecutionContext<IntegrationConfig>,
): StepStartStates {
  const { config } = executionContext.instance;

  const notDisabled = { disabled: false };
  const shouldIngestGroups = config.ingestGroups;

  return {
    'fetch-accounts': notDisabled,
    'fetch-users': notDisabled,
    'fetch-groups': { disabled: !shouldIngestGroups },
  };
}
```

#### `integrationSteps`

The `integrationSteps` field is used to define an `Array` of steps that collect
data, producing entities and relationships.

Example:

```typescript
[
  {
    id: 'fetch-accounts',
    name: 'Fetch Accounts',
    types: ['my_integration_account'],
    async executionHandler(executionContext: IntegrationStepExecutionContext) {
      return fetchAccounts(executionContext);
    },
  },
  {
    id: 'fetch-users',
    name: 'Fetch Users',
    types: ['my_integration_user'],
    async executionHandler(executionContext: IntegrationStepExecutionContext) {
      return fetchUsers(executionContext);
    },
  },
  {
    id: 'fetch-groups',
    name: 'Fetch Groups',
    types: ['my_integration_group'],
    executionHandler(executionContext: IntegrationStepExecutionContext) {
      return fetchGroups(executionContext);
    },
  },
  {
    id: 'build-user-to-group-relationships',
    name: 'Build relationships',
    types: ['my_integration_user_to_group_relationship'],
    dependsOn: ['fetch-users', 'fetch-groups'],
    async executionHandler(executionContext: IntegrationStepExecutionContext) {
      return fetchAccounts(executionContext);
    },
  },
];
```

It is important to provide `types` for the backend synchronization process to
determine how updates and deletes should be applied.

Optionally, a `step` may contain a `dependsOn` list of step IDs that need to
execute before the step can run. This field will be used to determine whether
previous work has failed to complete. The synchronization process will treat the
data retrieved in the step as a partial dataset. See the
[Failure handling](#failure-handling) section below for more information on
partial datasets.

#### `beforeAddEntity(context: IntegrationExecutionContext<IntegrationConfig>, e: Entity): Entity`

`beforeAddEntity` is an optional hook function that can be provided. The
function is called before an entity is added to the job state internally and the
return value of the function is the entity that will ultimately be added to the
job state. The hook is particularly useful for when a specific property should
be added to every entity that is produced by the integration.

Example:

```typescript
import {
  Entity,
  IntegrationInvocationConfig,
} from '@jupiterone/integration-sdk-core';
import { IntegrationConfig, IntegrationStepContext } from './types';
import getStepStartStates from './getStepStartStates';

export const invocationConfig: IntegrationInvocationConfig<IntegrationConfig> =
  {
    instanceConfigFields: {},
    integrationSteps: [],

    beforeAddEntity(
      context: IntegrationExecutionContext<IntegrationConfig>,
      entity: Entity,
    ): Entity {
      const projectId = context.instance.config.myProjectId;

      return {
        ...entity,
        projectId: entity.projectId || myProjectId,
      };
    },
  };
```

#### `beforeAddRelationship(context: IntegrationExecutionContext<IntegrationConfig>, r: Relationship): Promise<Relationship> | Relationship`

`beforeAddRelationship` is an optional hook function that can be provided. The
function is called before a relationship is added to the job state internally
and the return value of the function is the relationship that will ultimately be
added to the job state. The hook is particularly useful for when a specific
property should be added to every relationship that is produced by the
integration.

Example:

```typescript
import {
  Relationship,
  IntegrationInvocationConfig,
} from '@jupiterone/integration-sdk-core';
import { IntegrationConfig, IntegrationStepContext } from './types';
import getStepStartStates from './getStepStartStates';

export const invocationConfig: IntegrationInvocationConfig<IntegrationConfig> =
  {
    instanceConfigFields: {},
    integrationSteps: [],

    beforeAddRelationship(
      context: IntegrationExecutionContext<IntegrationConfig>,
      relationship: Relationship,
    ): Relationship {
      return relationship;
    },
  };
```

#### `ingestionConfig`

`ingestionConfig` is an optional config object that can be provided. This is
used to store information about data ingestion sources that can be enabled or
disabled. When this element is provided, it is expected that one or more steps
will reference these ids so that if one of these elements is disabled, all steps
and dependencies will also be disabled.

In essence, the ingestionConfig allows grouping and controlling the activation
of a list of steps. Unlike `getStepStartStates`, where you have to add an entry
for each step and go to the code to change the state of the step,
`ingestionConfig` allows us to enable or disable a set of steps, as well as
allowing us to do it in the UI or using the `integration-service`.

```typescript
import {
  IntegrationIngestionConfigFieldMap,
} from '@jupiterone/integration-sdk-core';
import { INGESTION_SOURCE_IDS } from './constants';

export const integrationSteps: IntegrationStep<IntegrationConfig>[] = [
  {
    id: 'fetch-vulnerability-alerts',
    name: 'Fetch Vulnerability Alerts',
    entities: [ /* Step Entities */ ],
    relationships: [ /* Step Relationships */  ],
    dependsOn: [ /* Step Dependencies */ ],
    ingestionSourceId: INGESTION_SOURCE_IDS.FINDING_ALERTS,
    executionHandler: /* Step Execution Handler */,
  },
];

const ingestionConfig: IntegrationIngestionConfigFieldMap = {
  [INGESTION_SOURCE_IDS.FINDING_ALERTS]: {
    title: 'Finding Alerts',
    description:
      'Dependabot vulnerability alert ingestion and Code scanning alerts',
    defaultsToDisabled: true,
    cannotBeDisabled: false
  },
  // ... more sources ...
};

export const invocationConfig: IntegrationInvocationConfig<IntegrationConfig> =
  {
    instanceConfigFields: {},
    integrationSteps,
    ingestionConfig,
  };
```

#### `afterExecution(context: IntegrationExecutionContext<IntegrationConfig>): Promise<void>`

`afterExecution` is an optional hook function that can be provided. The function
is called after an integration has executed, regardless of whether the execution
was successful or not. An example of when you may decide to use this function is
when you need to close out a globally configured client in an integration.

Example:

```typescript
import { IntegrationInvocationConfig } from '@jupiterone/integration-sdk-core';
import { IntegrationConfig } from './types';

export const invocationConfig: IntegrationInvocationConfig<IntegrationConfig> =
  {
    instanceConfigFields: {},
    integrationSteps: [],
    async afterExecution(context) {
      context.logger.info('Integration execution completed...');
    },
  };
```

#### `executionHandlerWrapper(context: {step: Step<IntegrationStepExecutionContext>}, stepFunction: () => Promise<void>): Promise<void>`

`executionHandlerWrapper` is an optional hook function that can be provided. The
function runs everytime `step.executionHandler()` is called, and wraps the
execution handler call and response. This allows a user to update run steps
immediately before and after the executionHandler. An example of when you would
use this, is to add tracing to your execution handler.

Example:

```typescript
import {
  IntegrationStepExecutionContext,
  Step,
  StepExecutionHandlerWrapperFunction,
} from '@jupiterone/integration-sdk-core';

export const executionHandlerWrapper: StepExecutionHandlerWrapperFunction<
  IntegrationStepExecutionContext
> = async (
  context: {
    step: Step<IntegrationStepExecutionContext>;
  },
  stepFunction: () => Promise<void>,
) => {
  console.log(`Starting execution handler for step ${context.step.id}`);
  const resp = await stepFunction();
  console.log(`Ending execution handler for step ${context.step.id}`);
  return resp;
};
```

### How integrations are executed

The `IntegrationInvocationConfig` informs how an integration runs. The CLI that
is provided by this package will consume the invocation configuration and
construct a state machine to execute work in a specific order.

#### Validation

The `validateInvocation` function will run first to ensure the integration is
capable of interfacing with a given provider. Next, the `getStepStartStates`
will run to get a list of integration steps that should be executed.

#### Collection

Finally, the steps defined in `integrationSteps` are executed based on the
dependency list provided by each step's `dependsOn` field.

The integration sdk will construct a dependency graph to determine the order in
which steps will be executed (likely be using a third party library like
[dependency-graph](https://github.com/jriecken/dependency-graph#readme)).

After the dependency graph was constructed, the integration sdk will in begin
execution of all leaf steps first. As a step completes, the integration sdk will
check for dependent steps that are now eligible to run and invoke them. This
process will repeat until there are no more steps to run.

### What's in the `IntegrationExecutionContext` and `IntegrationExecutionStepContext`?

#### `IntegrationExecutionContext`

The `IntegrationExecutionContext` contains some basic utilities to provide some
information about the entity data.

##### `instance`

An `instance` field containing the integration instance, which contains
configuration field values stored under a `config` field. When only performing
local data collection, this is mocked out.

##### `logger`

It includes a `logger` that can be used by the integration developer for
debugging their integration. This follows a similar api to other Node.js loggers
such as [bunyan](https://github.com/trentm/node-bunyan) or
[pino](https://github.com/pinojs/pino), providing a standard set of log levels
(`debug`, `trace`, `info`, `warn`, and `error`) and also allowing for child
loggers to be created via the `child` function.

Most information logged via the `logger` will _not_ be displayed to customers
via the integration job event log, but there are some special messages that need
to be displayed to customers to allow them to know if there are issues
preventing integrations from collecting data.

For these cases, we provide the `logger.publishInfoEvent`,
`logger.publishWarnEvent`, and `logger.publishErrorEvent` functions.

`logger.publishInfoEvent` is used for purely informational purposes. Example
usage:

```typescript
logger.publishInfoEvent({
  name: IntegrationInfoEventName.Stats,
  description: 'Fetched 10000 records',
});
```

`logger.publishWarnEvent` is used primarily to indicate to the end-user that
some notable issue/event has occurred that isn't significant enough to mark the
ingestion as a failure, but is still actionable Example usage:

```typescript
logger.publishWarnEvent({
  name: IntegrationWarnEventName.MissingPermission,
  description: `Missing permissions to read X from Y. In ${platform}, please do Z to remedy this issue. More information can be found here: ${link_to_docs}`,
});
```

`logger.publishErrorEvent` is much like warn, except that this is a case where
the issue/event that occurred **is** significant enough to mark the ingestion as
a failure. Execution will continue as planned (as it is expected that you would
not throw an error in your step in this case), but the execution will still be
marked a failure on completion.

Example usage:

```typescript
logger.publishErrorEvent({
  name: IntegrationErrorEventName.MissingPermission,
  description: `Missing permissions to read W from X. Since this integration relies on the last successful execution timestamp to do Y, this execution will be marked as a failure. In ${platform}, please do Z to remedy this issue. More information can be found here: ${link_to_docs}`,
});
```

A `logger.auth` function for displaying authorization related warnings or errors
encountered while data is being collected in the steps.

Additionally, errors logged via `logger.error` will be displayed by customers as
well. This is helpful for providing customers with some context about provider
api issues that prevent data from being collected.

###### `forbiddenResource`

The `forbiddenResource` function will be exposed to allow developers to display
warnings that the integration's access to a given resource is not allowed. This
message helps integration consumers understand that the configuration they have
provided has insufficient permissions and if they want to resolve this, changes
need to be made.

#### `IntegrationExecutionStepContext`

The `IntegrationExecutionStepContext` contains the same data stored in the
`IntegrationExecutionContext` but also contains a `jobState` object that
provides utilities for collecting and validating graph data.

##### `jobState`

The `jobState` object is used for collecting entities and relationships that
have been created throughout the integration run via the `addEntities` and
`addRelationships` functions.

Previously collected integration data can be collected via the `iterateEntities`
and `iterateRelationships` function. These functions will initially allow for
data to be fetched via the `_type` property, but in the future may allow more
options for collecting.

Example usage:

```typescript
await iterateEntities({ _type: 'my_integration_user' }, async (userEntity) => {
  await doWorkWithEntity(userEntity);
});
```

Specific entities can be looked up using the entity `_key` property via the
`findEntity` function. `findEntity` will return `null` if the entity does not
exist.

Example usage:

```typescript
const entity = await jobState.findEntity('myentitykey');
```

More details about how the framework uses `jobState` is detailed in the
[Data collection](#data-collection) section below.

### Additional utilities

#### Data conversion

A `convertProperties` function is exposed by the sdk to reformat an object into
a flattened object that can be used for building entities.

#### Graph data generation and validation

To assist with constructing data that is compliant with JupiterOne's model, the
integration SDK exposes utility functions (`createIntegrationEntity` and
`createDirectRelationship`) for validating entities and relationships based on
their assigned `_class`.

These functions will automatically validate that an entity contains required
fields.

##### `createIntegrationEntity`

`createIntegrationEntity` accepts an object containing `entityData`, which
accepts a `source` object (from the provider), an `assign` object that contains
core entity properties, and an optional `tagProperties` array for mapping source
properties to tags.

Snippet of input type used by the `createIntegrationEntity` function:

```typescript
export type IntegrationEntityBuilderInput = {
  /**
   * Data used to generate an `Entity`.
   */
  entityData: IntegrationEntityData;
};

/**
 * Data used to generate an `Entity`.
 */
export type IntegrationEntityData = {
  /**
   * Data from a provider API that will be selectively transferred to an
   * `Entity`.
   *
   * The common properties defined by data model schemas, selected by the
   * `assign._class`, will be found and transferred to the generated entity.
   */
  source: ProviderSourceData; // accepts pretty much any object

  /**
   * Literal property assignments. These values will override anything
   * transferred from the `source` data.
   */
  assign: LiteralAssignments; // core entity properties like _class, _type, _key

  /**
   * The names of properties that will be assigned directly to the entity from
   * tags with matching names. See `assignTags`.
   */
  tagProperties?: string[];
};
```

The function will collect properties from the `source` object that match the
`_class` defined in our data model, apply the `assign` object values, and also
store the `source` under a `_rawData` attribute on the entity.

Schema validation will be then performed to ensure that entity fits the schema
of the `_class` it was assigned.

Some fields on the `source` object are used as default values for entity
properties.

A `providerId` or `id` property on the `source` object will be used as the
`_key` property if the `_key` is not provided on the `assign` object. Also, the
`tags` property from the `source` object will be normalized and added to the
generated entity as properties prefixed with `tag.`.

Here's an example of how the `createIntegrationEntity` function can be used to
convert Azure SQLDatabases into a JupiterOne entity.

```typescript
export function createDatabaseEntity(
  webLinker: AzureWebLinker,
  data: MySQLDatabase | SQLDatabase,
  _type: string,
) {
  return createIntegrationEntity({
    entityData: {
      source: data,
      assign: {
        ...convertProperties(data),
        _type,
        _class: AZURE_DATABASE_ENTITY_CLASS,
        displayName: data.name || data.id || 'unnamed',
        classification: null,
        encrypted: null,
      },
    },
  });
}
```

##### `createDirectRelationship`

`createDirectRelationship` can be used to help build non-mapped relationships
between entities.

There are two types of relationships that can be built: direct relationships and
mapped relationships. When creating a mapped relationship, one should use the
`createMappedRelationship` function.

Direct relationships are explicit edges constructed between two entities from
the same integration.

The function accepts multiple different options:

- `DirectRelationshipOptions`
- `DirectRelationshipLiteralOptions`

If needed, additional properties can be added to relationships created via the
`properties` field that exists on all options.

###### `DirectRelationshipOptions`

If you have access to the two entities, you can simply provide them as inputs to
the function via the `from` and `to` options.

```typescript
// input type
type DirectRelationshipOptions = {
  _class: string;
  from: Entity;
  to: Entity;
  properties?: AdditionalRelationshipProperties;
};

// usage
createDirectRelationship({
  _class: RelationshipClass.HAS,
  source: entityA,
  target: entityB,
});
```

###### `DirectRelationshipLiteralOptions`

If you know the `_type` and `_key` of the two entities you want to relate, you
can provide them via the `fromType`, `fromKey`, `toType`, and `toKey`
properties.

```typescript
// input type
type DirectRelationshipLiteralOptions = {
  _class: string;
  fromType: string;
  fromKey: string;
  toType: string;
  toKey: string;
  properties?: AdditionalRelationshipProperties;
};

// usage
createDirectRelationship({
  _class: RelationshipClass.HAS,
  fromKey: 'a',
  fromType: 'a_entity',
  toKey: 'b',
  toType: 'b_entity',
});
```

##### `createMappedRelationship`

Mapped relationships are edges that are built from a source entity to a target
entity that may be managed by a different integration or may not be known by any
integration. Mapped relationships also allow for more generalized relationships
to be created from a source entity to multiple target entities based on a set of
filters.

A common use case for mapped relationships is for building edges between a
security group that allows access to the public internet (a global entity not
managed by an integration). This can help determine which servers or workloads
have access to the open internet and can be used to assist with locking down
security groups for services that do not require internet access.

Another use case is for mapping `User` entities created by an integration to
their `Person` entity based off of their name or email. That relationship can
then be used to help determine what services a person in an organization may
have access to.

###### `MappedRelationshipOptions`

Mapped relationships accept a `source` and `target` entity for constructing
relationships.

The `Internet` and `Everyone` global entities are exposed by the
`@jupiterone/data-model` and can be used here.

The relationship direction can be specified using the `relationshipDirection`
option.

`skipTargetCreation` can be set to `false` to have JupiterOne skip the creation
of the target entity if it does not exist.

Additional options are defined below.

```typescript
// input type
type MappedRelationshipOptions = {
  _class: string;
  source: Entity;
  target: TargetEntity;
  properties?: AdditionalRelationshipProperties;

  /**
   * Defaults to `RelationshipDirection.FORWARD`, assuming the common case of
   * source -> target.
   */
  relationshipDirection?: RelationshipDirection;

  /**
   * Identifies properties in the `targetEntity` that are used to locate the
   * entities to connect to the `sourceEntityKey`.
   *
   * Defaults to `[["_type", "_key"]]`, allowing for the simple case of mapping
   * to a known type and key.
   */
  targetFilterKeys?: TargetFilterKey[];

  /**
   * Defaults to `undefined`, leaving it up to the default established in the
   * mapper.
   */
  skipTargetCreation?: boolean;
};

// usage
createMappedRelationship({
  _class: RelationshipClass.ALLOWS,
  source: securityGroupEntity,
  target: DataModel.Internet,
  relationshipDirection: RelationshipDirection.FORWARD,
});
```

###### `MappedRelationshipLiteralOptions`

For additional control, mapped relationships can be created by providing fine
details on how mappings should be generated. This is useful for cases where more
generalized relationships need to be created between a source entity and one or
more target entities that match a set of properties.

````typescript
// input type
type MappedRelationshipLiteralOptions = {
  _class: string;
  _mapping: RelationshipMapping;
  properties?: AdditionalRelationshipProperties;
};

export interface RelationshipMapping {
  /**
   * The relationship direction, `source - FORWARD -> target` or
   * `source <- REVERSE - target`.
   */
  relationshipDirection: RelationshipDirection;

  /**
   * The `_key` value of the entity managed by the integration, to which
   * relationships will be created.
   *
   * "Source" implies that the graph vertex will have an outgoing edge. However,
   * that is not necessarily the case. See `relationshipDirection`.
   */
  sourceEntityKey: string;

  /**
   * Identifies properties in the `targetEntity` that are used to locate the
   * entities to connect to the `sourceEntityKey`. For example, if you know that
   * you want to build a relationship to user entities with a known email, this
   * can be expressed by:
   *
   * ```js
   * {
   *   targetFilterKeys: [['_class', 'email']],
   *   targetEntity: {
   *     _class: 'User',
   *     email: 'person@example.com',
   *     firstName: 'Person',
   *     lastName: 'Example'
   *   }
   * }
   */
  targetFilterKeys: TargetFilterKey[];

  /**
   * Properties of the target entity known to the integration building the
   * relationship.
   *
   * The property values of the `targetFilterKeys` are used to find the target
   * entities. When the mapper manages the target entity (it created the entity,
   * no other integration owns it), it will update the entity to store these
   * properties. This allows a number of integrations to contribute data to
   * "fill out" knowledge of the entity.
   */
  targetEntity: TargetEntityProperties;

  /**
   * By default, an entity will be created by the mapper when no matching
   * entities are found.
   *
   * When a relationship is not meaningful unless target entities already exist,
   * `skipTargetCreation: true` will inform the mapper that the entity should
   * not be created.
   */
  skipTargetCreation?: boolean;
}

// usage:
//
// This will create a relationship(s) from the
// source entity with _key = 'a'
// and target entities that match the class 'User'
// and have the email set to 'email@example.com'
createMappedRelationship({
  _class: RelationshipClass.HAS,
  _mapping: {
    relationshipDirection: RelationshipDirection.REVERSE,
    sourceEntityKey: 'a',
    targetEntity: {
      _class: 'User',
      email: 'email@example.com',
    },
    targetFilterKeys: [['_class', 'email']],
  },
});
````

#### Raw data collection

In addition to performing validation, the `createIntegrationEntity` and
`createDirectRelationship` will also automatically encode and store the original
provider data under a `_rawData` field. For now, this will always assume that
data coming in was stored as `json`, but support for other data types will come
later.

#### Testing

Please see [testing.md](testing.md) for more information about testing utilities
exposed by this project.

### Auto-magic behind the framework

#### Event reporting

When running an integration, information logged via the `logger` will
automatically be published `stdout`. For convenience, the integration framework
will automatically log out transitions between steps. This allows for developers
to keep track of how the integration is progressing without the need to
explicitly add logging information themselves.

When the integration is run with context about an integration instance (via the
`run` command exposed by the [CLI](#the-cli)), the transitions between each
`step` will be published to the JupiterOne integration events log. `auth` and
`error` logs will also be published there.

#### Data collection

The `executionContext` that is provided in the `executionHandler` step exposes a
`jobState` utility that can be used to collect entity and relationship data via
`addEntities` and `addRelationships` functions. The `jobState` utility will
automatically flush the data to disk as a certain threshold of entities and
relationships is met. The data flushed to disk are grouped in folders that are
based on the step that was run. Entities and relationships will also be grouped
by the `_type` and linked into separate directories to provide faster look up.
These directories will be used by the `findEntity`, `iterateEntities`, and
`iterateRelationships` functions to provide faster lookups.

From our experience, integrations most commonly query collected data from
previous steps the `_type` property for constructing relationships, so the
integration framework currently optimizes for this case. In the future, we plan
to allow data to be indexed in different ways to assist with optimizing
different approaches constructing entities and relationships. It is worth noting
that the method in which data is indexed can change in the future.

Using the integration configuration that was provided as a sample earlier, data
will be written to disk in the following structure (relative to the
integration's current working directory).

To assist with debugging and visibility into exactly what data was collected,
the integration will bucket data collected from each step. Here is an example of
what the `.j1-integration` directory may look like.

```
.j1-integration/
  /index/
    /entities/
      _type
        my_integration_account/
          11fa25fb-dfbf-43b8-a6e1-017ad369fe98.json
        my_integration_group/
          f983f07d-f7d8-4f8e-87da-743940a5f48d.json
          a76695f8-7d84-411e-a4e1-c012de041034.json
        my_integration_user/
          9cb7bee4-c037-4041-83b7-d532488f26a3.json
          96992893-898d-4cda-8129-4695b0323642.json
    /relationships
      _type/
        my_integration_user_to_group_relationship/
          8fcc6865-817d-4952-ac53-8248b357b5d8.json
  /graph
    /step-fetch-accounts
      /entities/
        11fa25fb-dfbf-43b8-a6e1-017ad369fe98.json
      /relationships
    /step-fetch-users
      /entities
        9cb7bee4-c037-4041-83b7-d532488f26a3.json
        96992893-898d-4cda-8129-4695b0323642.json
      /relationships
    /step-fetch-groups
      /entities
        a76695f8-7d84-411e-a4e1-c012de041034.json
        f983f07d-f7d8-4f8e-87da-743940a5f48d.json
      /relationships
    /step-build-relationships
        /relationships
          8fcc6865-817d-4952-ac53-8248b357b5d8.json
```

Integration data that is staged for publishing will be stored under the
`.j1-integration/graph` directory. Files containing Entities will be suffixed
with `.entities.json` and files containing Relationships will be suffixed with
`.relationships.json`. This is done because the directory structure of the
`graph` directory is meant to assist with debugging and provide developers
insight about the data collected in each step. During synchronization, the
directory will be blind

Data will be indexed by `_type` and stored under the
`.j1-integration/index/_type` directory.

Each `json` file will store data under the following format (describe with a
typescript interface):

```
interface FlushedEntityGraphData {
  entities: Entity[]
}

interface FlushedRelationshipGraphData {
  relationships: Relationship[]
}
```

It's best to keep a "collect and forget" mindset to avoid retaining too much
collected data in memory. Flushed data can always be pulled back into memory
later via the `listEntitiesByType` and `listRelationshipsByType` and reading
data from disk is decently fast.

#### Failure handling

By default, the framework will only halt the execution of an integration if the
configuration validation fails. Failures that occur during the execution of a
step will not halt the execution of later steps that depend on it. Information
on which steps that have failed will be collected and published as metadata when
performing synchronization with JupiterOne. A failure in a step will
automatically be logged along with context about the error that occurred. At the
end of an integration run, a summary will be displayed of the overall status to
give developers a good idea of how failures will have affected the JupiterOne
graph.

An example summary of the steps looks like this:

```json
[
  {
    "id": "step-fetch-accounts",
    "name": "Fetch Accounts",
    "declaredTypes": ["my_integration_account"],
    "encounteredTypes": ["my_integration_account"],
    "status": "success"
  },
  {
    "id": "step-fetch-users",
    "name": "Fetch Users",
    "declaredTypes": ["my_integration_user"],
    "encounteredTypes": [],
    "status": "failure"
  },
  {
    "id": "step-fetch-groups",
    "name": "Fetch Groups",
    "declaredTypes": ["my_integration_group"],
    "encounteredTypes": ["my_integration_group"],
    "status": "success"
  },
  {
    "id": "step-build-user-to-group-relationships",
    "name": "Fetch Accounts",
    "declaredTypes": ["my_integration_user_to_group_relationship"],
    "encounteredTypes": ["my_integration_user_to_group_relationship"],
    "dependsOn": ["step-fetch-users", "step-fetch-groups"],
    "status": "partial_success_from_dependency_failure"
  }
]
```

Options for pretty printing this data in a more concise format may come in the
future.

##### Step status codes

For steps: `success` - the step has successfully completed without any errors
occurring `failure` - an error has occurred, and it is possible that we have a
partial dataset `partial_success_from_dependency_failure` - the step has
successfully completed but a dependent step was found in the `failure` or
`partial_success_from_dependency_failure`, meaning it is possible that a failure
has happened.

#### Letting the synchronizer know about partial datasets

The framework's state machine will utilize `declaredTypes` and `dependsOn`
fields from the step results for constructing a list of entity and relationship
types that should be considered a partial dataset. The backend synchronization
process that performs the diffing of the data will receive a list of types that
have been affected by a failure to help determine how updates should be applied
and what data is safe to delete. The information about partial datasets will be
sent when starting the synchronization process to prevent data that should be
retained in the graph from being removed.

After the collection phase, the integration summary and partial dataset metadata
will be written to disk in the `.j1-integration/summary.json` file.

Here is an example of what the summary file would look like.

```json
{
  "integrationStepResults": [
    {
      "id": "step-fetch-accounts",
      "name": "Fetch Accounts",
      "declaredTypes": ["my_integration_account"],
      "encounteredTypes": ["my_integration_account"],
      "status": "success"
    },
    {
      "id": "step-fetch-users",
      "name": "Fetch Users",
      "declaredTypes": ["my_integration_user"],
      "encounteredTypes": [],
      "status": "failure"
    },
    {
      "id": "step-fetch-groups",
      "name": "Fetch Groups",
      "declaredTypes": ["my_integration_group"],
      "encounteredTypes": ["my_integration_group"],
      "status": "success"
    },
    {
      "id": "step-build-user-to-group-relationships",
      "name": "Fetch Accounts",
      "declaredTypes": ["my_integration_user_to_group_relationship"],
      "encounteredTypes": ["my_integration_user_to_group_relationship"],
      "dependsOn": ["step-fetch-users", "step-fetch-groups"],
      "status": "partial_success_from_dependency_failure"
    }
  ],
  "metadata": {
    "partialDatasets": {
      "types": [
        "my_integration_user",
        "my_integration_user_to_group_relationship"
      ]
    }
  }
}
```

The `integrationStepResults` is made available for developers to understand the
status of each step after collection has been completed.

The `metadata` contains a `partialDatasets` field that is a reduced collection
of `types` from steps that have returned with a `failure` or
`partial_success_from_dependency_failure` status.

The `metadata` field will be sent to JupiterOne upon performing the
`synchronization`.

##### Detecting undeclared types

In the examples from the previous sections, you may have noticed that
`integrationStepResults` contains `declaredTypes` and `encounteredTypes`. The
`declaredTypes` are the `types` provided to the `IntegrationStep` object. As an
integration collects data, the `_type` values from both entities and
relationships are added to the `encounteredTypes` field. These fields are diffed
and a warning will be displayed if there are undeclared types detected.

It is important that each integration step declares all possible `_type` values
that it expects to encounter so that data is not unintentionally deleted when an
unexpected failure occurs.

## The CLI

To assist developers working with the integration framework, a `j1-integration`
CLI tool will also be exposed by this project.

### Authentication

For commands that require interaction with JupiterOne's API, the CLI requires
credentials.

- `JUPITERONE_API_KEY` or `--api-key`: JupiterOne API key for authentication.
  This API key may be a user API key with "Admin" permission to the Integrations
  application or an integration API key.
- `JUPITERONE_ACCOUNT` or `--account`: The UUID of the JupiterOne account to
  target.

### Supported commands

#### Command `j1-integration collect`

`j1-integration collect` will run the js framework locally to _only_ perform
data collection. The `collect` command is designed to work closely with the
JupiterOne integration framework.

The `collect` command will look for an integration configuration from files in
the following order relative to the current working directory:

0. `index.js`
1. `index.ts`
2. `src/index.js`
3. `src/index.ts`

Data will be written to disk under a generated `.j1-integration` directory
(described in [this section](#data-collection)). A JupiterOne API key or set of
credentials do not have to be supplied since the JupiterOne synchronization API
will not be hit. An exception to this is when the `--integrationInstanceId`
option is provided. (see `Options` below).

To assist with making the integrations easier to develop, a mock integration
instance will be provided with fake values.

An integration cannot run without actual data from a provider though, so CLI
will use the [dotenv](https://github.com/motdotla/dotenv) package to
automatically load and populate config values for what was supplied in the
`instanceConfigFields`.

An `.env` file for the
[example integration configuration](#instanceconfigfields) would look like this:

```shell
CLIENT_ID="<insert provider client id here>"
CLIENT_SECRET="<insert provider client secret here>"
INGEST_GROUPS="<true or false>"
```

The snake cased environment variables will automatically be converted and
applied to the camel cased configuration field. So for example, `CLIENT_ID` will
apply to the `clientId` config field, `CLIENT_SECRET` will apply to
`clientSecret`, and `MY_SUPER_SECRET_CONFIGURATION_VALUE` will apply to a
`mySuperSecretConfigurationValue` configuration field.

This command will display the expected environment variables that should be set
prior to performing validation to provide developers feedback about what the
integration expects to see set.

##### Options

###### Option `--module` or `-m`

If you prefer not to place your integration configuration in one of the
supported file paths, you can optionally specify the `--module` or `-m` option
and provide a path to your integration file.

ex: `j1-integration collect --module path/to/my/integration.ts`

###### Option `--integrationInstanceId` or `-i`

If you are working with an existing integration instance and would prefer to
leverage the configuration field values from that instance, you can optionally
supply an instance id. The CLI will leverage the values stored on the
integration instance instead of locally defined environment variables.

By default, when an `--integrationInstanceId` is specified, a developer will be
prompted to input some credentials or provide an `--api-key` option.

ex: `j1-integration collect --integrationInstanceId <integration instance id>`

###### Option `--api-key` or `-k`

For developers that have an API key or prefer to not input credentials, an
`--api-key` option can be specified to access the synchronization API.

ex:
`j1-integration collect --integrationInstanceId <integration instance id> --api-key <my api key>`

###### Option `--step` or `-s`

For larger integrations, a full collection run may take a long time. To help
address this, a `--step` option can be provided to selectively run a step along
with all of its dependent steps. If the Step Cache is available for a
_dependent_ step, it is used instead of the executing the step, again decreasing
runtimes.

Multiple `--step` options can be provided to allow for more than one step to be
run.

ex: `j1-integration collect --step step-fetch-users --step step-fetch-groups`

For convenience, steps may be provided as a comma delimited list.

ex: `j1-integration collect --step step-fetch-users,step-fetch-groups`

**Step Cache Details**

- The Step Cache can be disabled using option `--no-cache`. This will force the
  dependent step(s) to fully execute.
- The default location of the Step Cache is found at `./.j1-integration-cache`.
  It is populated by moving `./.j1-integrations/graph` to
  `./.j1-integration-cache`.
- The `--cache-path` option allows for a different cache to be used. The
  structure of the cache follows a similar format as the `.j1-integration` data
  storage. An example structure is provided below.

###### Option `--no-cache`

To be used with the `--step` option to disable the Step Cache.

ex: `j1-integration collect --step step-fetch-users --no-cache`

###### Option `--cache-path`

To be used with the `--step` to provide a filepath to a Step Cache to used.

ex: `j1-integration collect --step step-fetch-users --cache-path ./my-cache`

**Step Cache Structure**

```
.j1-integration-cache/
   /graph
      /step-fetch-accounts
         /entities/
            11fa25fb-dfbf-43b8-a6e1-017ad369fe98.json
      /step-fetch-users
         /entities
            9cb7bee4-c037-4041-83b7-d532488f26a3.json
            96992893-898d-4cda-8129-4695b0323642.json
         /relationships
            8fcc6865-817d-4952-ac53-8248b357b5d8.json
```

###### Option `--disable-schema-validation` or `-V`

Disables schema validation.

#### Command `j1-integration sync`

Validates data collected by the `collect` command and uploads it to JupiterOne.
Data is read from `.j1-integration/graph`. An API key is required to upload data
to JupiterOne.

`sync` provisions a bulk upload job, uploads data, and finalizes the job.
`--skip-finalize` may be used to defer this step. The integration instance ID
specified by `--integrationInstanceId` or the `--source` and `--scope` are used
to scope uploaded data. When `--integrationInstanceId` is specified, an
integration job is also created to record integration job events.

A successful operation will produce a summary of the upload job, including the
number of entities and relationships uploaded, to
`.j1-integration/summary.json`.

Optionally, developers can specify the `--tail` flag to automatically poll the
integration job for status updates. The polling will end once the job has been
marked as completed and metadata about the synchronization status will be
returned.

Using the `--api-base-url` option, the following endpoints are used to upload
data:

- `POST /synchronization/jobs`: Initiates a bulk upload job.
- `POST /synchronization/jobs/:id/entities`: Publishes entity data.
- `POST /synchronization/jobs/:id/relationships`: Publishes relationship data.
- `POST /synchronization/jobs/:id/finalize`: Finalizes the bulk upload job.
- `GET /synchronization/jobs/:id`: Fetch the bulk upload job status.

##### Keeping the door open for developers not using JavaScript or TypeScript

Not everyone uses the Node.js ecosystem, and we understand that. For developers
that would prefer to use a different language for building integrations, the
`sync` command does not require that a developer use the JupiterOne integration
framework at all. The `sync` command will just recursively walk the
`.j1-integration/graph` directory, search for `.json` files, validate the data
to ensure it is formatted correctly, and publish it up via the synchronization
API.

The JupiterOne data model is open source and can be used by anyone to ensure
that data conforms to our expectations. If you build custom tooling or your own
framework for developing integrations, let us know!

##### Options

###### Option `--module` or `-m`

Much like the `collect` command, you can optionally specify an `--module` or
`-m` option to specify the path to the integration configuration file.

###### Option `--integrationInstanceId` or `-i`

The integration instance ID with which to associate the integration job. All
data published to the synchronization API will be scoped to this integration
instance and integration events will be published to the integration's job log.

ex:
`j1-integration sync --integrationInstanceId <integration instance id> --api-key <my api key>`

Alternatively, `--source` and `--scope` may be used for a bulk upload unrelated
to an integration.

###### Option `--source`

Specifies the bulk upload job `source` property. This is not required when
`--integrationInstanceId` is specified. `--scope` is required when `--source` is
specified.

###### Option `--scope`

Specifies the bulk upload job `scope` property. This is not required when
`--integrationInstanceId` is specified. `--source` is required when `--scope` is
specified.

###### Option `--api-key` or `-k`

Like the `collect` command, an API key can be optionally passed in to use for
synchronization.

ex:
`j1-integration sync --integrationInstanceId <integration instance id> --api-key <my api key>`

###### Option `--tail` or `-t`

If provided this option poll the integration job to and display the status of
the job run. The polling will stop once the job was marked as complete.

ex:
`j1-integration sync --integrationInstanceId <integration instance id> --tail`

###### Option `--api-base-url`

If provided this option specifies which base URL to use for synchronization.
Cannot be used with the `--development` flag.

ex:
`yarn j1-integration sync --integrationInstanceId <integration instance id> --api-base-url <api base url>`

#### Command `j1-integration run`

The `j1-integration run` command combines the functionality of the `collect` and
`sync` commands, essentially running the commands back to back. See those
commands for additional options.

Example usage:

```shell
yarn j1-integration run --integrationInstanceId 7ad16b51-e4d6-4e74-afbd-2fac6185f398
```

###### Option `--skip-finalize`

The command will not finalize the bulk upload job. This is useful for deferred
finalization. Additional data may be uploaded to the job by another script.

#### Command `j1-integration visualize`

The `j1-integration visualize` command reads JSON files from the
`.j1-integrations/graph` directory and generates a visualization of the data
found using [vis-network](https://visjs.github.io/vis-network/docs/network/).

The `visualize` command accepts an optional parameter `--data-dir` allowing the
user to specify a custom directory to read JSON files from. By default, the
`visualize` command will read from the `.j1-integrations/graph` directory
generated by the `collect` command.

When supplying the `--data-dir` ensure the following format within your JSON
files:

```json
{
  "entities": [
    {
      "_key": "...",
      "displayName": "..."
    }
  ]
}
```

```json
{
  "relationships": [
    {
      "_fromEntityKey": "...",
      "_toEntityKey": "...",
      "displayName": "..."
    }
  ]
}
```

#### Command `j1-integration visualize-types`

```
Usage: j1-integration visualize-types [options]

generate graph visualization of entity and relationship types to collect

Options:
  -p, --project-path <directory>  absolute path to integration project directory (default: "{CWD}")
  -o, --output-file <path>        absolute path of generated HTML file (default: "{CWD}/.j1-integration/types-graph/index.html")
  -t, --type <string>             J1 entity type(s) to visualize, comma separated (default: [])
  -h, --help                      display help for command
```

`j1-integration visualize-types` generates a [vis.js](http://www.visjs.org)
graph based on the metadata defined in each step.

#### Command `j1-integration document`

```
Usage: j1-integration document [options]

generate documentation for all steps

Options:
  -p, --project-path <directory>  absolute path to integration project directory (default: "{CWD}")
  -o, --output-file <path>        project relative path to generated Markdown file (default: "docs/jupiterone.md")
  -h, --help                      display help for command
```

`j1-integration document` generates entity and relationship documentation based
on the metadata defined in each step. Documentation for an integration is stored
in the `{integration-project-dir}/docs/jupiterone.md` file by default.

#### Command `j1-integration validate-question-file`

JupiterOne managed question files live under an integration's `/jupiterone`
directory. For example `/jupiterone/questions.yaml`. The
`validate-question-file` command can run in a "dry-run" mode, which will skip
making requests to validate individual JupiterOne queries.

```
Usage: j1-integration validate-question-file [options]

validates an integration questions file

Options:
  -p, --file-path <filePath>                         absolute path to managed question file (default: "{CWD}/jupiterone/questions/questions.yaml")
  -a, --jupiterone-account-id <jupiteroneAccountId>  J1 account ID used to validate J1QL queries
  -k, --jupiterone-api-key <jupiteroneApiKey>        J1 API key used to validate J1QL queries
  -d, --dry-run                                      skip making HTTP requests to validate J1QL queries
  --api-base-url                                     API base URL used to validate question file.
  -h, --help                                         display help for command
```

#### Command `j1-integration generate-integration-graph-schema`

```
Usage: j1-integration generate-integration-graph-schema [options]

generate integration graph metadata summary from step metadata

Options:
  -o, --output-file <path>        project relative path to generated integration graph schema file
  -p, --project-path <directory>  path to integration project directory (default: "{CWD}")
  -h, --help                      display help for command
```

NOTE: When the `--output-file` flag is not specified, the generated graph schema
will be written to stdout.

#### Command `j1-integration troubleshoot`

```
Usage: j1-integration troubleshoot [options]

troubleshoot common issues with local execution

Options:
  -p, --project-path <directory>  path to integration project directory (default: "{CWD}")
  -h, --help                      display help for command
```

#### Future commands and utilities

##### More commands and options

###### Command `j1-integration plan`

We hope to make it easy for developers to understand how an integration collects
data and the order in which it performs work.

We hope to support a `j1-integration plan` command to display the dependency
graph of the steps and types required for a successful integration run.

###### Command `j1-integration sync --dry-run`

A developer may want to have a better understanding of how synchronization of
collected data may affect their JupiterOne graph. We plan to support a
`--dry-run` flag for both the `sync` and `run` commands to provide some feedback
about what kind of changes will be applied to the graph.

This dry run function will give metrics about how many creates, updates, and
deletes will be performed, categorized by the entity and relationship `_type`
field.

###### Command `j1-integration generate`

A project generator might be helpful for getting new integration developers up
and running quickly. For our own integration developers, it would provide a
consistent interface and allow developers a unified interface for building
integrations. This may even go an `ember` or `angular` cli route and provide an
opinionated interface for generating new steps.

##### One CLI tool for all JupiterOne development

The `j1-integration` CLI is a standalone tool designed to work just for
integration development. The CLI tool will be designed in a way that allows for
it to be added as an `integration` subcommand for the `j1` CLI (so you can run
things like `j1 integration sync` but also maybe something like `j1 query` from
a single tool). This will likely be done by forwarding commands from the core
`j1` cli to the `j1-integration` executable or by exposing the code used for
constructing the `j1-integration` CLI to the project that handles the `j1` cli.

In the future, the `j1` CLI will provide a suite of commands for interfacing
with queries, questions, rules, and various other JupiterOne features. This may
end up living under a `@jupiterone/dev-tools` project. That repo might even end
up becoming a monorepo and become a one-stop shop for all JupiterOne related
development tools.

##### Better methods of authentication with JupiterOne

The current implementation of the `j1` cli requires that an API key or set of
credentials be supplied to interface with APIs. We plan to introduce a `j1 auth`
command which will accept credentials and store the refresh and access tokens
somewhere on your file system for later use with all CLI commands. For users
that would prefer to not use an API key, this would provide a more friendly
interface for running commands that require API access. We plan to support SSO
integration with this as well.

## Does JupiterOne use this SDK for managed integrations?

Yes. All managed integrations are built using this SDK. However, integrations
deployed to the JupiterOne managed integration platform are executed with a
custom runtime instead of the `@jupiterone/integration-sdk-cli` tool.

## Future work around integrations

### `external` integrations

Sometimes customers have their own data that they want to publish and don't
necessarily want JupiterOne to manage the execution of it.

We've seen customers use our Entity/Relationship mutation APIs to build their
own integrations. Part of our reason for building and open sourcing an
integration SDK is to help out those users that perform their own diffing and
graph state management.

We hope to support the concept of an `external` integration in the near future
that will work just like our regular integrations and work with our SDK. The
only difference is that you can define your own integration (the name,
description, and configuration fields) and we won't run automatically run the
integration for you on a regularly scheduled interval (although, the option to
do have us do that is certainly something we are considering!).

### Event ingestion

At the moment a few of our managed JupiterOne integrations are capable of
handling events that perform a partial ingestion of data from a provider and
immediately reflect that in the graph.

We hope to provide a good interface via this SDK for providing an interface for
handling events via this SDK and providing commands/utilities for testing events
to get an understanding of how they may affect the JupiterOne graph.

## j1 CLI

In addition to the `j1-integration` CLI, this project exposes a `j1` CLI for
`import` and `export` processes.

### Authentication

For commands that require interaction with JupiterOne's API, the CLI provides
two options for providing credentials:

1. All commands that interact with an API will accept an --api-key option.
2. For added convenience when developing locally, we will also look for a
   JUPITERONE_API_KEY environment variable to be used as the API key.

### Supported commands

Currently, the CLI supports a limited interface consisting of only two commands:
`export` and `import`.

#### Command `j1 export`

```
Usage: j1 export [options]

Exports account's entities/relationships into csv files

Options:
  -d, --data-dir <relative_directory>  The directory where entities/relationships will be downloaded (default: ".j1/export")
  --account <account>                  The JupiterOne account you are exporting entities/relationships from
  --api-key <key>                      The key used to initiate api calls with your instance of JupiterOne
  --include-entities                   Include entities in export (default: true)
  --include-relationships              Include relationships in export (default: true)
  --include-deleted                    Include deleted entities/relationships in export (default: true)
  --no-include-entities                Exclude entities in export
  --no-include-relationships           Exclude relationships in export
  --no-include-deleted                 Exclude deleted entities/relationships in export
  --api-base-url <url>                 The base URL used to initiate api calls with your instance of JupiterOne (defaults to `https://api.us.jupiterone.io`)
  -h, --help                           display help for command
```

#### Command `j1 import`

```
Usage: j1 import [options]

Imports exported account entities/relationships into JupiterOne account

Options:
  -d --data-dir <relative_directory>  The directory where entities and relationships can be found (default: ".j1/export")
  --scope <scope>                     (REQUIRED) A unique id that identifies the synchronization job that will be importing your assets, use any id of your choosing.
  --account <account>                 The JupiterOne account you are importing entities/relationships into
  --api-key <key>                     The key used to initiate api calls with your instance of JupiterOne
  --include-relationships             Include relationships in import (default: true)
  --include-deleted                   Include deleted entities/relationships in import (default: true)
  --no-include-entities               Exclude entities in import
  --no-include-relationships          Exclude relationships in import
  --api-base-url <url>                The base URL used to initiate api calls with your instance of JupiterOne (defaults to `https://api.us.jupiterone.io`)
  -h, --help                          display help for command
```
