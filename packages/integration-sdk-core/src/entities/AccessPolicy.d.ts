/* eslint-disable */
import { Entity } from './Base';

/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * A policy for access control assigned to a Host, Role, User, UserGroup, or Service.
 */
export type AccessPolicy = Entity & {
  /**
   * Indicates if the policy grants administrative privilege.
   */
  admin?: boolean;
  /**
   * Rules of this policy. Each rule is written 'as-code' that can be operationalized with a control provider or within JupiterOne's rules engine.
   */
  rules?: string[];
  /**
   * Content of a policy contains the raw policy rules, if applicable. For example, the JSON text of an AWS IAM Policy. This is stored in raw data.
   */
  content?: string;
  [k: string]: unknown;
};
