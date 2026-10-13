import type { Instrumentation } from "next";

export async function register() {
  // Next handles build-phase separation; validate again when the runtime loads.
  // next.config also checks before listen because this hook may initialize lazily.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { validateProductionEnvironment } = await import("@/lib/server/environment");
  const { checkMediaStorage } = await import("@/features/media/storage");
  validateProductionEnvironment();
  await checkMediaStorage();
}

export const onRequestError: Instrumentation.onRequestError = async (_error, _request, context) => {
  // Request path/query may contain tokens; only framework route type is recorded.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { operationLog } = await import("@/lib/server/logging");
    operationLog("unexpected", "request", { code: context.routeType });
  }
};
