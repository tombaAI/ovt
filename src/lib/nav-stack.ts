// Client-only navigation stack stored in sessionStorage.
// Enables "← back" navigation with preserved filter state.

export type NavStackEntry = { url: string; label: string };

const STACK_KEY = "ovt-nav-stack";
const MAX_DEPTH = 10;

function readStack(): NavStackEntry[] {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(sessionStorage.getItem(STACK_KEY) ?? "[]");
    } catch {
        return [];
    }
}

function writeStack(stack: NavStackEntry[]): void {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
}

export function pushNavStack(entry: NavStackEntry): void {
    const stack = readStack();
    stack.push(entry);
    if (stack.length > MAX_DEPTH) stack.shift();
    writeStack(stack);
}

export function popNavStack(): NavStackEntry | null {
    const stack = readStack();
    if (stack.length === 0) return null;
    const entry = stack.pop()!;
    writeStack(stack);
    return entry;
}

export function peekNavStack(): NavStackEntry | null {
    const stack = readStack();
    return stack.length > 0 ? stack[stack.length - 1] ?? null : null;
}
