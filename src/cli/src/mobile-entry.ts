// Side-effect-free control-plane entry. Game/browser runtime is the standalone
// template; importing this entry must never start the CLI or a store operation.
export * from "./mobile/contracts.js";
export * from "./mobile/beta.js";
