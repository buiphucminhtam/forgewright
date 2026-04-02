// ─── Error Codes ──────────────────────────────────────────────────────
export var ErrorCode;
(function (ErrorCode) {
    // State errors (FW0xx)
    ErrorCode["STATE_FILE_NOT_FOUND"] = "FW001";
    ErrorCode["STATE_PARSE_ERROR"] = "FW002";
    ErrorCode["STATE_SAVE_ERROR"] = "FW003";
    ErrorCode["STATE_INVALID"] = "FW004";
    // Pipeline errors (FW2xx)
    ErrorCode["PIPELINE_NOT_INITIALIZED"] = "FW201";
    ErrorCode["PIPELINE_ALREADY_RUNNING"] = "FW202";
    ErrorCode["PIPELINE_COMPLETED"] = "FW203";
    ErrorCode["PIPELINE_INVALID_MODE"] = "FW205";
    // Tool errors (FW3xx)
    ErrorCode["TOOL_NOT_FOUND"] = "FW301";
    ErrorCode["TOOL_EXECUTION_ERROR"] = "FW302";
    // Skill errors (FW4xx)
    ErrorCode["SKILL_NOT_FOUND"] = "FW401";
    ErrorCode["SKILL_YAML_PARSE_ERROR"] = "FW405";
    ErrorCode["SKILL_PARSE_ERROR"] = "FW406";
    // MCP errors (FW5xx)
    ErrorCode["MCP_SERVER_ERROR"] = "FW501";
    // Workspace errors (FW6xx)
    ErrorCode["WORKSPACE_NOT_FOUND"] = "FW601";
})(ErrorCode || (ErrorCode = {}));
export class ForgewrightError extends Error {
    code;
    recoverable;
    context;
    constructor(code, message, context = {}, recoverable = true) {
        super(message);
        this.name = 'ForgewrightError';
        this.code = code;
        this.recoverable = recoverable;
        this.context = context;
    }
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            context: this.context,
            recoverable: this.recoverable,
            stack: this.stack,
        };
    }
    toString() {
        const ctx = Object.keys(this.context).length > 0 ? ` (${JSON.stringify(this.context)})` : '';
        return `[${this.code}] ${this.message}${ctx}`;
    }
}
// ─── Specialized Errors ──────────────────────────────────────────────
export class StateError extends ForgewrightError {
    constructor(code, message, context = {}, recoverable = true) {
        super(code, message, context, recoverable);
        this.name = 'StateError';
    }
}
export class PipelineError extends ForgewrightError {
    constructor(code, message, context = {}, recoverable = false) {
        super(code, message, context, recoverable);
        this.name = 'PipelineError';
    }
}
export class ToolError extends ForgewrightError {
    constructor(code, message, context = {}, recoverable = false) {
        super(code, message, context, recoverable);
        this.name = 'ToolError';
    }
}
export class SkillError extends ForgewrightError {
    constructor(code, message, context = {}, recoverable = true) {
        super(code, message, context, recoverable);
        this.name = 'SkillError';
    }
}
// ─── Helpers ─────────────────────────────────────────────────────────
export function isForgewrightError(value) {
    return value instanceof ForgewrightError;
}
export function getErrorMessage(error) {
    if (isForgewrightError(error)) {
        return error.toString();
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
