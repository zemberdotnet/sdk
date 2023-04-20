/* eslint-disable */
import { Entity } from './Base';

/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * A program. For example, a bug bounty/vuln disclosure program.
 */
export type Program = Entity & {
  /**
   * The type of program.
   */
  type?: string;
  /**
   * Program overview.
   */
  overview?: string;
  [k: string]: unknown;
};
