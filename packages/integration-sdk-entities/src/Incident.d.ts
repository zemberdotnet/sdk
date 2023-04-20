/* eslint-disable */
import { Entity } from './Base';

/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * An operational or security incident. An event that negatively affects the confidentiality, integrity or availability of an organization's assets.
 */
export type Incident = Entity & {
  /**
   * The category of the incident
   */
  category: string;
  /**
   * Severity rating based on impact. Can be a string such as 'critical', 'major', 'minor', or an integer usually between 1-3.
   */
  severity: string;
  /**
   * The target listing of [IDs/keys to] systems and resources this incident impacts.
   */
  impacts?: string[];
  /**
   * Indicates if this is a reportable incident per applicable regulations, such as HIPAA, PCI, or GDPR.
   */
  reportable: boolean;
  /**
   * The person/entity who reported this incident.
   */
  reporter?: string;
  /**
   * Summary and/or a link to the documented lesson learned.
   */
  postmortem?: string;
  [k: string]: unknown;
};
