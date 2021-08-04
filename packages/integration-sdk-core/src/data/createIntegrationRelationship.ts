import { IntegrationError } from '../errors';
import {
  Entity,
  ExplicitRelationship,
  MappedRelationship,
  RelationshipDirection,
  RelationshipMapping,
  TargetEntityProperties,
  TargetFilterKey,
} from '../types';
import { RelationshipClass } from '@jupiterone/data-model';

type DirectRelationshipOptions = {
  _class: RelationshipClass;
  from: Entity;
  to: Entity;
  properties?: AdditionalRelationshipProperties;
};

type DirectRelationshipLiteralOptions = {
  _class: RelationshipClass;
  fromType: string;
  fromKey: string;
  toType: string;
  toKey: string;

  /**
   * Additional/explicit properties to add to the relationship.
   */
  properties?: AdditionalRelationshipProperties;
};

type MappedRelationshipOptions = {
  /**
   * An optional `_key` for the relationship mapping. A stable value will be
   * generated using the `target` when one is not specified.
   *
   * Generated relationships will not have this `_key`, since they would not
   * then be unique. It is used to track this lifecycle of this relationship
   * mapping.
   */
  _key?: string;

  /**
   * An optional `_type` for all relationships generated by this relationship
   * mapping. It is recommended to avoid using this option, allowing for
   * generating `_type` consistently based on the source and target `_type`.
   * There are times, however, when the generator does not produce the best
   * value.
   */
  _type?: string;

  /**
   * The `_class` for all relationships generated by this relationship mapping.
   */
  _class: RelationshipClass;

  source: Entity;
  target: TargetEntity;

  /**
   * Additional/explicit properties to add to all relationships generated by the
   * mapping.
   */
  properties?: AdditionalRelationshipProperties;

  /**
   * Defaults to `RelationshipDirection.FORWARD`, assuming the common case of
   * source -> target.
   */
  relationshipDirection?: RelationshipDirection;

  /**
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

type MappedRelationshipLiteralOptions = {
  /**
   * An optional `_key` for the relationship mapping. A stable value will be
   * generated using the `_mapping` when one is not specified.
   *
   * Generated relationships will not have this `_key`, since they would not
   * then be unique. It is used to track this lifecycle of this relationship
   * mapping.
   */
  _key?: string;

  /**
   * An optional `_type` for all relationships generated by this relationship
   * mapping. It is recommended to avoid using this option, allowing for
   * generating `_type` consistently based on the source and target `_type`.
   * There are times, however, when the generator does not produce the best
   * value.
   */
  _type?: string;

  /**
   * The `_class` for all relationships generated by this relationship mapping.
   */
  _class: RelationshipClass;

  _mapping: RelationshipMapping;

  /**
   * Additional/explicit properties to add to all relationships generated by the
   * mapping.
   */
  properties?: AdditionalRelationshipProperties;
};

type TargetEntity = TargetEntityProperties & {
  _type: string;
  _key: string;
};

/**
 * Allows assignment of any additional properties without being forced to use
 * specific types where that isn't helpful.
 *
 * The persister does not allow Object or Array properties.
 */
type AdditionalRelationshipProperties = {
  _type?: string;
  _key?: string;
  [key: string]: string | boolean | number | null | undefined;
};

function createInvalidateRelationshipClassError(_class: string) {
  return new IntegrationError({
    code: 'INVALID_RELATIONSHIP_CLASS',
    message: `Invalid relationship class "${_class}" specified. The relationship class must be listed in "@jupiterone/data-model". See here for a list of valid relationship classes: https://github.com/JupiterOne/data-model/blob/main/src/RelationshipClass.ts`,
  });
}

function isValidDataModelClass(_class: string) {
  return !!RelationshipClass[_class];
}

/**
 * Create a direct `IntegrationRelationship` between two entities
 *
 * `DirectRelationshipOptions` is recommended over `DirectRelationshipOptionsLiteral`. Older integrations may need to use the literal forms to control values for some reason or other.
 */
export function createDirectRelationship(
  options: DirectRelationshipOptions | DirectRelationshipLiteralOptions,
): ExplicitRelationship {
  const { _class } = options;
  const normalizedClass = _class.toUpperCase();

  if (!isValidDataModelClass(normalizedClass)) {
    throw createInvalidateRelationshipClassError(normalizedClass);
  }

  if ('fromType' in options) {
    return createRelationship(options);
  } else {
    return createRelationship({
      _class: options._class,
      fromType: options.from._type,
      fromKey: options.from._key,
      toType: options.to._type,
      toKey: options.to._key,
      properties: options.properties,
    });
  }
}

/**
 * Create a mapped `IntegrationRelationship`.
 *
 * `MappedRelationshipOptions` is recommended over `MappedRelationshipOptionsLiteral`. Older integrations may need to use the literal forms to control values for some reason or other.
 */
export function createMappedRelationship(
  options: MappedRelationshipOptions | MappedRelationshipLiteralOptions,
): MappedRelationship {
  const { _class } = options;
  const normalizedClass = _class.toUpperCase();

  if (!isValidDataModelClass(normalizedClass)) {
    throw createInvalidateRelationshipClassError(normalizedClass);
  }

  if ('_mapping' in options) {
    return createMappedRelationshipLiteral(options);
  } else {
    return createMappedRelationshipLiteral({
      _class: options._class,
      _type: options._type,
      _key: options._key,
      _mapping: {
        relationshipDirection:
          options.relationshipDirection || RelationshipDirection.FORWARD,
        sourceEntityKey: options.source._key,
        targetEntity: options.target,
        targetFilterKeys: options.targetFilterKeys || [['_type', '_key']],
        skipTargetCreation: options.skipTargetCreation,
      },
      properties: options.properties,
    });
  }
}

function createMappedRelationshipLiteral(
  options: MappedRelationshipLiteralOptions,
): MappedRelationship {
  const mapping = options._mapping;

  if (mapping.skipTargetCreation === undefined) {
    delete mapping.skipTargetCreation;
  }

  const _key =
    options._key ||
    key(
      options.properties,
      options._class,
      mapping.sourceEntityKey,
      mapping.targetEntity._key || targetEntityKey(mapping),
    );

  const _type =
    options._type ||
    type(
      options.properties,
      options._class,
      'mapping_source',
      mapping.targetEntity._type,
    );

  const relationshipClass = options._class.toUpperCase();

  const mappedRelationship: MappedRelationship = {
    _class: relationshipClass,
    _mapping: options._mapping,
    displayName: relationshipClass,
    ...options.properties,
    _key,
    _type,
  };

  return mappedRelationship;
}

function createRelationship({
  _class,
  fromType,
  fromKey,
  toType,
  toKey,
  properties,
}: DirectRelationshipLiteralOptions): ExplicitRelationship {
  const relationshipClass = _class.toUpperCase();
  const _type = generateRelationshipType(_class, fromType, toType);
  return {
    _key: `${fromKey}|${_class.toLowerCase()}|${toKey}`,
    _type,
    _class: relationshipClass,
    _fromEntityKey: fromKey,
    _toEntityKey: toKey,
    displayName: relationshipClass,
    ...properties,
  };
}

function key(
  properties: AdditionalRelationshipProperties | undefined,
  _class: RelationshipClass,
  fromKey: string,
  toKey: string | undefined,
): string {
  if (properties && properties._key) {
    return properties._key;
  } else {
    if (!toKey) {
      throw new IntegrationError({
        code: 'MISSING_RELATIONSHIP_TO_KEY',
        message:
          'Unable to generate relationship _key without from/to _key values!',
      });
    }

    return generateRelationshipKey(_class, fromKey, toKey);
  }
}

function type(
  properties: AdditionalRelationshipProperties | undefined,
  _class: RelationshipClass,
  fromType: string,
  toType: string | undefined,
): string {
  if (properties && properties._type) {
    return properties._type;
  } else {
    if (!toType) {
      throw new IntegrationError({
        code: 'MISSING_RELATIONSHIP_TO_TYPE',
        message:
          'Without _type provided in properties, _type generation requires mapping.targetEntity._type!',
      });
    }

    return generateRelationshipType(_class, fromType, toType);
  }
}

function targetEntityKey(mapping: RelationshipMapping): string {
  let key = mapping.relationshipDirection.toString();
  mapping.targetFilterKeys.forEach((filterKey) => {
    if (Array.isArray(filterKey)) {
      key = `${key}:${filterKey
        .map((e) => `${e}=${mapping.targetEntity[e]}`)
        .join(':')}`;
    } else {
      key = `${key}:${filterKey}=${mapping.targetEntity[filterKey]}`;
    }
  });
  return key;
}

/**
 * Relationship `_type` can be generated from the `_type`s of related entities.
 * The relationship `_class` is required to ensure that the relationship `_type`
 * is distinguished from other relationships between entities of the same
 * `_type`s. This supports finding all relationships of a type for the purpose
 * of set synchronization.
 */
export function generateRelationshipType(
  _class: RelationshipClass,
  from: { _type: string } | string,
  to: { _type: string } | string,
): string {
  if (!from || !to) {
    throw new IntegrationError({
      code: 'GENERATE_RELATIONSHIP_TYPE_MISSING_RELATIONSIHP_FROM_OR_TO',
      message:
        '"from" and "to" must be provided to generate a relationship _type!',
    });
  }

  const fromValue = typeof from === 'string' ? from : from._type;
  const toValue = typeof to === 'string' ? to : to._type;

  const fromValueParts = fromValue.split('_');
  const toValueParts = toValue.split('_');

  let i = 0;
  do {
    if (toValueParts[i] === fromValueParts[i]) {
      i++;
    } else {
      break;
    }
  } while (i < toValueParts.length - 1);

  return `${fromValue}_${_class.toLowerCase()}_${toValueParts
    .slice(i)
    .join('_')}`;
}

/**
 * Relationship `_key` can be generated from the `_key`s of related entities.
 * The relationship `_class` is required to ensure that the relationship `_key`
 * is distinguished from other relationships between entities of the same
 * `_key`s.
 */
export function generateRelationshipKey(
  _class: RelationshipClass,
  from: { _key: string } | string,
  to: { _key: string } | string,
): string {
  if (!from || !to) {
    throw new IntegrationError({
      code: 'GENERATE_RELATIONSHIP_KEY_MISSING_RELATIONSHIP_FROM_OR_TO',
      message:
        '"from" and "to" must be provided to generate a relationship _type!',
    });
  }

  const fromValue = typeof from === 'string' ? from : from._key;
  const toValue = typeof to === 'string' ? to : to._key;
  return `${fromValue}|${_class.toLowerCase()}|${toValue}`;
}
