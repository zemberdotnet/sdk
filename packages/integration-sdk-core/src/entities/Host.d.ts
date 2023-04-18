/* eslint-disable */
import { Entity } from './Base';

/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * A compute instance that itself owns a whole network stack and serves as an environment for workloads. Typically it runs an operating system. The exact host type is described in the _type property of the Entity. The UUID of the host should be captured in the _id property of the Entity
 */
export type Host = Entity & {
  /**
   * Fully qualified domain name(s)
   */
  fqdn?: string | string[];
  /**
   * The primary/local hostname
   */
  hostname: string | null;
  /**
   * A listing of all IP addresses associated with this Host
   */
  ipAddress?: string | string[];
  /**
   * The public DNS name
   */
  publicDnsName?: string;
  /**
   * The private DNS name
   */
  privateDnsName?: string;
  /**
   * The public IP address or addresses
   */
  publicIpAddress?: string | string[];
  /**
   * The private IP address or addresses
   */
  privateIpAddress?: string | string[];
  /**
   * A listing of all MAC addresses associated with this Host
   */
  macAddress?: string | string[];
  /**
   * Operating System Platform
   */
  platform?:
    | 'darwin'
    | 'linux'
    | 'unix'
    | 'windows'
    | 'android'
    | 'ios'
    | 'embedded'
    | 'other';
  /**
   * Operating System Full Details (e.g. macOS High Sierra version 10.13.6)
   */
  osDetails?: string;
  /**
   * Operating System Name (e.g. macOS)
   */
  osName?: string;
  /**
   * Operating System Version (e.g. 10.13.6)
   */
  osVersion?: string;
  /**
   * Indicates if this is a physical host, such as a physical server.
   */
  physical?: boolean;
  /**
   * The current state of a host (e.g. pending, running, shutting-down, terminated, stopping, stopped)
   */
  state?: string;
  [k: string]: unknown;
};
