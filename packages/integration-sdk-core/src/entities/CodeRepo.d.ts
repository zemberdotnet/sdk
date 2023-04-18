/* eslint-disable */
import { Entity } from './Base';

/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * A source code repository. A CodeRepo is also a DataRepository therefore should carry all the required properties of DataRepository.
 */
export type CodeRepo = Entity & {
  /**
   * The application that this repo is part of.
   */
  application?: string;
  /**
   * The project that this repo belongs to.
   */
  project?: string;
  /**
   * Indicates if this is a public repo.
   */
  public?: boolean;
  [k: string]: unknown;
};
