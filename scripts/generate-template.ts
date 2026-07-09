console.warn("WARNING: generate-template.ts has been moved to utilities/generate-template.ts. This shim will be removed in the next release.");
import * as path from 'path';
require(path.join(__dirname, "utilities/generate-template.ts"));
