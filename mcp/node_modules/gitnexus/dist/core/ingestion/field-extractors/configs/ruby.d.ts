import type { FieldExtractionConfig } from '../generic.js';
/**
 * Ruby field extraction config.
 *
 * Ruby is unusual: there are no field declarations in the traditional sense.
 * Fields are instance variables (@var) created by assignment, or declared
 * via attr_accessor / attr_reader / attr_writer calls.
 *
 * We detect:
 * - `call` nodes for attr_accessor / attr_reader / attr_writer
 *   (their arguments are symbol names → field names)
 *
 * For simplicity we focus on attr_* calls in the class body.
 * Instance variable assignments (self.x = ...) would require deeper analysis.
 */
export declare const rubyConfig: FieldExtractionConfig;
