/* eslint-disable */
import { Entity } from './Base';

/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * A network endpoint for connecting to or accessing network resources. For example, NFS mount targets or VPN endpoints.
 */
export type NetworkEndpoint = Entity & {
  /**
   * The endpoint IP address
   */
  ipAddress?: string;
  [k: string]: unknown;
};
