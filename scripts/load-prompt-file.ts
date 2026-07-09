console.warn("WARNING: load-prompt-file.ts has been moved to utilities/load-prompt-file.ts. This shim will be removed in the next release.");
import * as path from 'path';
require(path.join(__dirname, "utilities/load-prompt-file.ts"));
