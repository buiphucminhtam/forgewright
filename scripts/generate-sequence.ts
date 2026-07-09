console.warn("WARNING: generate-sequence.ts has been moved to utilities/generate-sequence.ts. This shim will be removed in the next release.");
import * as path from 'path';
require(path.join(__dirname, "utilities/generate-sequence.ts"));
