/**
 * Config command helpers for /oc-go-config
 *
 * Owns the user-facing /oc-go-config slash command. Subcommands:
 *   (none)    show current status (cookie/workspace/mode/ttl)
 *   set       prompt for cookie + workspace_id, persist with chmod 600
 *   clear     confirm + remove config file
 *   test      one-shot fetch via the active path; reports success/error
 *
 * The cookie is never echoed in any message — only its length or a
 * fingerprint is shown.
 */
/**
 * Minimal command-context shape. Matches the slice of
 * `ExtensionCommandContext` that `runOcgoConfig` actually uses, so tests
 * can supply a partial mock without casting to the full context.
 */
export interface OcgoCommandContext {
    ui: {
        input: (title: string, prefilled: string) => Promise<string | undefined>;
        confirm: (title: string, message: string) => Promise<boolean>;
        notify: (msg: string, level: "info" | "warning" | "error") => void;
        theme: unknown;
    };
    modelRegistry: {
        getApiKeyForProvider: (id: string) => Promise<string | undefined>;
    };
}
interface CommandResult {
    cancel?: boolean;
    clearStatus?: boolean;
}
/**
 * Entry point registered with `pi.registerCommand("oc-go-config", ...)`.
 * `args` is the subcommand (whitespace-trimmed); ctx is the command context.
 */
export declare function runOcgoConfig(args: string, ctx: OcgoCommandContext): Promise<CommandResult>;
export {};
//# sourceMappingURL=config-cmd.d.ts.map