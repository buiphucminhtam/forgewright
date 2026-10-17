export interface MobileContext {
  game_id: string;
  app_id: string;
  environment: string;
  user_id: string;
}
export interface NativeResult {
  state: string;
  proof?: unknown;
  [key: string]: unknown;
}
export interface NativeBridge {
  capabilities(): Promise<{
    schema: "mobile-native-capabilities/v1";
    context: MobileContext;
    mode: "native" | "simulated";
    operations: string[];
  }>;
  request(request: {
    schema: string;
    id: string;
    context: MobileContext;
    operation: string;
    payload: Record<string, unknown>;
  }): Promise<{ id: string; context: MobileContext; result: NativeResult }>;
  dispose(): Promise<void>;
}
export function createMobileRuntime(options: {
  context: MobileContext;
  bridge: NativeBridge;
  simulation?: boolean;
  verifyPurchase?: (request: {
    context: MobileContext;
    product_id: string;
    proof: unknown;
  }) => Promise<
    NativeResult & {
      context: MobileContext;
      product_id: string;
      state: "verified";
    }
  >;
  canRequestAds?: () => boolean;
  host?: { pause(): void; resume(): void };
}): Promise<{
  mode: "native" | "simulated";
  purchase(productId: string): Promise<NativeResult>;
  restore(): Promise<NativeResult>;
  showRewarded(placementId: string): Promise<NativeResult>;
  destroy(): Promise<void>;
}>;
