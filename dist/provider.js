/**
 * Provider matching: decide whether the current Pi model is an OpenCode Go model
 *
 * Two checks (OR-ed):
 *  1. `ctx.model?.provider === "opencode-go"`  (primary; verified in v0.1 dev)
 *  2. `ctx.model?.id?.startsWith("opencode-go/")`  (fallback; covers case where
 *     Pi internally uses a different provider id but model id is namespaced)
 */
/** Provider prefix used in Pi for OpenCode Go */
export const PROVIDER_PREFIX = "opencode-go";
/**
 * Return true iff the model is any `opencode-go/*` model.
 *
 * Defensive against missing fields (model may be undefined during early
 * session_start or after session switches).
 */
export function isOpencodeGoModel(model) {
    if (!model)
        return false;
    if (model.provider === PROVIDER_PREFIX)
        return true;
    if (typeof model.id === "string" && model.id.startsWith(`${PROVIDER_PREFIX}/`))
        return true;
    return false;
}
/** Return true iff the current ctx model is any `opencode-go/*` model. */
export function isOpencodeGoProvider(ctx) {
    return isOpencodeGoModel(ctx.model);
}
//# sourceMappingURL=provider.js.map