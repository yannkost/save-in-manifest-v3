export type ShortcutMode = "none" | "url" | "desktop" | "html";

export interface RuleMatchers {
    contextPattern?: string;
    pageDomainPattern?: string;
    pageUrlPattern?: string;
    sourceDomainPattern?: string;
    sourceUrlPattern?: string;
    fileExtensionPattern?: string;
    linkTextPattern?: string;
}

export interface WorkflowRule {
    id: string;
    name: string;
    pathTemplate: string;
    filenameTemplate?: string;
    shortcutMode?: ShortcutMode;
    matchers?: RuleMatchers;
}

export interface TemplateContext {
    pageUrl?: string | null;
    pageTitle?: string | null;
    sourceUrl?: string | null;
    linkText?: string | null;
    selectionText?: string | null;
    filename?: string | null;
    naiveFilename?: string | null;
    captures?: string[];
    now?: Date;
}

export interface RuleMatchInput {
    context: string;
    pageUrl?: string | null;
    sourceUrl?: string | null;
    filename?: string | null;
    linkText?: string | null;
}

export interface RuleMatchResult {
    matches: boolean;
    captures: string[];
}

export interface TokenDescriptor {
    token: string;
    description: string;
}

export const AVAILABLE_TOKENS: TokenDescriptor[] = [
    { token: ":date:", description: "Local date as YYYY-MM-DD" },
    { token: ":isodate:", description: "UTC timestamp as YYYY-MM-DDTHHMMSSZ" },
    { token: ":unixdate:", description: "Unix timestamp in seconds" },
    { token: ":year:", description: "4-digit local year" },
    { token: ":month:", description: "2-digit local month" },
    { token: ":day:", description: "2-digit local day" },
    { token: ":hour:", description: "2-digit local hour" },
    { token: ":minute:", description: "2-digit local minute" },
    { token: ":second:", description: "2-digit local second" },
    {
        token: ":pageurl:",
        description: "Active page URL converted into nested path segments",
    },
    {
        token: ":sourceurl:",
        description: "Target source URL converted into nested path segments",
    },
    { token: ":pagedomain:", description: "Hostname of the page URL" },
    { token: ":sourcedomain:", description: "Hostname of the source URL" },
    { token: ":pagetitle:", description: "Current page title" },
    {
        token: ":linktext:",
        description: "Captured link text from the clicked anchor",
    },
    {
        token: ":selectiontext:",
        description: "Selected text trimmed and sanitized",
    },
    { token: ":filename:", description: "Resolved download filename" },
    {
        token: ":fileext:",
        description: "Extension of the resolved download filename",
    },
    {
        token: ":naivefilename:",
        description: "Filename guessed from the source URL path",
    },
    {
        token: ":naivefileext:",
        description: "Extension guessed from the source URL path",
    },
];

export function normalizeWorkflowRule(rule: WorkflowRule): WorkflowRule {
    return {
        id: rule.id,
        name: rule.name.trim(),
        pathTemplate: normalizeTemplate(rule.pathTemplate),
        filenameTemplate: normalizeFilenameTemplate(
            rule.filenameTemplate ?? "",
        ),
        shortcutMode: normalizeShortcutMode(rule.shortcutMode),
        matchers: normalizeMatchers(rule.matchers),
    };
}

export function normalizeShortcutMode(
    mode?: ShortcutMode | string | null,
): ShortcutMode {
    return mode === "url" || mode === "desktop" || mode === "html"
        ? mode
        : "none";
}

export function normalizeTemplate(template: string): string {
    return template
        .trim()
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/")
        .replace(/^\/+|\/+$/g, "");
}

export function normalizeFilenameTemplate(template: string): string {
    return template.trim();
}

export function normalizeMatchers(matchers: RuleMatchers = {}): RuleMatchers {
    return {
        contextPattern: (matchers.contextPattern ?? "").trim(),
        pageDomainPattern: (matchers.pageDomainPattern ?? "").trim(),
        pageUrlPattern: (matchers.pageUrlPattern ?? "").trim(),
        sourceDomainPattern: (matchers.sourceDomainPattern ?? "").trim(),
        sourceUrlPattern: (matchers.sourceUrlPattern ?? "").trim(),
        fileExtensionPattern: (matchers.fileExtensionPattern ?? "").trim(),
        linkTextPattern: (matchers.linkTextPattern ?? "").trim(),
    };
}

export function hasRuleMatchers(rule: WorkflowRule): boolean {
    const matchers = normalizeMatchers(rule.matchers);
    return Object.values(matchers).some(Boolean);
}

export function validateWorkflowName(name: string): string | null {
    if (name.trim().length === 0) {
        return "Workflow rule name is required.";
    }

    return null;
}

export function validatePathTemplate(template: string): string | null {
    const normalized = normalizeTemplate(template);

    if (normalized.length === 0) {
        return "Path is required.";
    }

    if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("/")) {
        return "Use a path relative to the default Downloads directory.";
    }

    if (normalized.split("/").some((segment) => segment === "..")) {
        return "Parent directory segments (..) are not allowed.";
    }

    return null;
}

export function validateFilenameTemplate(template: string): string | null {
    const normalized = normalizeFilenameTemplate(template);

    if (normalized.length === 0) {
        return null;
    }

    if (/[\\/]/.test(normalized)) {
        return "Filename template must resolve to a file name, not a path.";
    }

    return null;
}

export function validateMatchers(matchers: RuleMatchers = {}): string | null {
    const normalized = normalizeMatchers(matchers);
    const entries: Array<[string, string]> = [
        ["context pattern", normalized.contextPattern ?? ""],
        ["page domain pattern", normalized.pageDomainPattern ?? ""],
        ["page URL pattern", normalized.pageUrlPattern ?? ""],
        ["source domain pattern", normalized.sourceDomainPattern ?? ""],
        ["source URL pattern", normalized.sourceUrlPattern ?? ""],
        ["file extension pattern", normalized.fileExtensionPattern ?? ""],
        ["link text pattern", normalized.linkTextPattern ?? ""],
    ];

    for (const [label, value] of entries) {
        if (!value) {
            continue;
        }

        try {
            new RegExp(value);
        } catch {
            return `Invalid ${label}.`;
        }
    }

    return null;
}

export function renderPathTemplate(
    template: string,
    context: TemplateContext = {},
): string {
    const normalized = normalizeTemplate(template);
    const rendered = replaceTemplateTokens(normalized, context);
    return sanitizeRelativePath(rendered);
}

export function renderFilenameTemplate(
    template: string,
    context: TemplateContext = {},
): string {
    const normalized = normalizeFilenameTemplate(template);
    if (!normalized) {
        return "";
    }

    const rendered = replaceTemplateTokens(normalized, context);
    return sanitizeFileName(rendered);
}

export function doesRuleMatch(
    rule: WorkflowRule,
    input: RuleMatchInput,
): boolean {
    return resolveRuleMatch(rule, input).matches;
}

export function resolveRuleMatch(
    rule: WorkflowRule,
    input: RuleMatchInput,
): RuleMatchResult {
    const matchers = normalizeMatchers(rule.matchers);

    if (!Object.values(matchers).some(Boolean)) {
        return { matches: false, captures: [] };
    }

    const pageUrl = input.pageUrl ?? "";
    const sourceUrl = input.sourceUrl ?? "";
    const filename = input.filename ?? "";
    const linkText = input.linkText ?? "";
    const pageDomain = pageUrl ? getHostname(pageUrl) : "";
    const sourceDomain = sourceUrl ? getHostname(sourceUrl) : "";
    const fileExtension = getFileExtension(filename);
    const captureBuffer: string[] = [];

    const results = [
        executePattern(matchers.contextPattern, input.context, captureBuffer),
        executePattern(matchers.pageDomainPattern, pageDomain, captureBuffer),
        executePattern(matchers.pageUrlPattern, pageUrl, captureBuffer),
        executePattern(
            matchers.sourceDomainPattern,
            sourceDomain,
            captureBuffer,
        ),
        executePattern(matchers.sourceUrlPattern, sourceUrl, captureBuffer),
        executePattern(
            matchers.fileExtensionPattern,
            fileExtension,
            captureBuffer,
        ),
        executePattern(matchers.linkTextPattern, linkText, captureBuffer),
    ];

    return {
        matches: results.every(Boolean),
        captures: results.every(Boolean) ? captureBuffer : [],
    };
}

export function joinRelativePath(directory: string, filename: string): string {
    const cleanDirectory = sanitizeRelativePath(directory);
    const cleanFilename = sanitizeFileName(filename);

    if (!cleanDirectory) {
        return cleanFilename;
    }

    return `${cleanDirectory}/${cleanFilename}`;
}

export function sanitizeFileName(filename: string): string {
    const segments = filename.split(/[/\\]+/).filter(Boolean);
    const lastSegment = segments.at(-1) ?? filename;
    return sanitizeSegment(lastSegment || "download");
}

export function getNaiveFilenameFromUrl(urlValue?: string | null): string {
    if (!urlValue) {
        return "download";
    }

    try {
        const url = new URL(urlValue);
        const rawName = decodeURIComponent(
            url.pathname.split("/").filter(Boolean).at(-1) ?? "download",
        );
        return sanitizeFileName(rawName || "download");
    } catch {
        return sanitizeFileName(urlValue);
    }
}

export function getFileExtension(filename?: string | null): string {
    if (!filename) {
        return "";
    }

    const cleanName = sanitizeFileName(filename);
    const extension = cleanName.match(/\.([0-9a-z]{1,16})$/i);
    return extension?.[1] ?? "";
}

export function getTokenExample(
    token: string,
    context: TemplateContext = {},
): string {
    return replaceTemplateTokens(token, context) || "—";
}

function replaceTemplateTokens(
    template: string,
    context: TemplateContext,
): string {
    const now = context.now ?? new Date();
    const pageUrl = context.pageUrl ?? "";
    const sourceUrl = context.sourceUrl ?? "";
    const filename = context.filename
        ? sanitizeFileName(context.filename)
        : "download";
    const naiveFilename = context.naiveFilename
        ? sanitizeFileName(context.naiveFilename)
        : getNaiveFilenameFromUrl(sourceUrl || pageUrl);
    const values: Record<string, string> = {
        ":date:": formatDate(now),
        ":isodate:": formatIsoDate(now),
        ":unixdate:": Math.floor(now.getTime() / 1000).toString(),
        ":year:": now.getFullYear().toString(),
        ":month:": padDate(now.getMonth() + 1),
        ":day:": padDate(now.getDate()),
        ":hour:": padDate(now.getHours()),
        ":minute:": padDate(now.getMinutes()),
        ":second:": padDate(now.getSeconds()),
        ":pageurl:": pageUrl ? urlToFolderPath(pageUrl) : "unknown-page",
        ":sourceurl:": sourceUrl
            ? urlToFolderPath(sourceUrl)
            : "unknown-source",
        ":pagedomain:": pageUrl ? getHostname(pageUrl) : "unknown-page",
        ":sourcedomain:": sourceUrl ? getHostname(sourceUrl) : "unknown-source",
        ":pagetitle:":
            sanitizeSegment(context.pageTitle ?? "") || "untitled-page",
        ":linktext:":
            sanitizeSegment(context.linkText ?? "") || "untitled-link",
        ":selectiontext:":
            sanitizeSegment(context.selectionText ?? "") || "selection",
        ":filename:": filename,
        ":fileext:": getFileExtension(filename) || "none",
        ":naivefilename:": naiveFilename,
        ":naivefileext:": getFileExtension(naiveFilename) || "none",
    };

    const withStandardTokens = Object.entries(values).reduce(
        (value, [token, replacement]) => {
            return value.replaceAll(token, replacement);
        },
        template,
    );

    return replaceCaptureTokens(withStandardTokens, context.captures ?? []);
}

function formatDate(date: Date): string {
    return [
        date.getFullYear(),
        padDate(date.getMonth() + 1),
        padDate(date.getDate()),
    ].join("-");
}

function formatIsoDate(date: Date): string {
    return [
        date.getUTCFullYear(),
        padDate(date.getUTCMonth() + 1),
        padDate(date.getUTCDate()),
        "T",
        padDate(date.getUTCHours()),
        padDate(date.getUTCMinutes()),
        padDate(date.getUTCSeconds()),
        "Z",
    ].join("");
}

function padDate(value: number): string {
    return value.toString().padStart(2, "0");
}

function getHostname(urlValue: string): string {
    try {
        return sanitizeSegment(new URL(urlValue).hostname) || "unknown-host";
    } catch {
        return sanitizeSegment(urlValue) || "unknown-host";
    }
}

function urlToFolderPath(urlValue: string): string {
    try {
        const url = new URL(urlValue);
        const pathnameSegments = url.pathname
            .split("/")
            .map((segment) => segment.trim())
            .filter(Boolean);
        const segments = [url.hostname, ...pathnameSegments];

        const query = url.searchParams.toString();
        if (query) {
            segments.push(query);
        }

        const hash = url.hash.replace(/^#/, "");
        if (hash) {
            segments.push(hash);
        }

        return sanitizeRelativePath(segments.join("/")) || "unknown-page";
    } catch {
        return sanitizeRelativePath(urlValue) || "unknown-page";
    }
}

function sanitizeRelativePath(path: string): string {
    return normalizeTemplate(path)
        .split("/")
        .map((segment) => sanitizeSegment(segment))
        .filter(
            (segment) =>
                segment.length > 0 && segment !== "." && segment !== "..",
        )
        .join("/");
}

function sanitizeSegment(segment: string): string {
    return segment
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/g, "")
        .slice(0, 80);
}

function replaceCaptureTokens(template: string, captures: string[]): string {
    return captures.reduce(
        (value, capture, index) =>
            value.replaceAll(`:$${index}:`, sanitizeSegment(capture)),
        template,
    );
}

function executePattern(
    pattern: string | undefined,
    value: string,
    captureBuffer: string[],
): boolean {
    if (!pattern) {
        return true;
    }

    if (!value) {
        return false;
    }

    try {
        const match = value.match(new RegExp(pattern));
        if (!match) {
            return false;
        }

        captureBuffer.push(...match.map((item) => item ?? ""));
        return true;
    } catch {
        return false;
    }
}
