import { describe, expect, it } from "vitest";
import {
    AVAILABLE_TOKENS,
    doesRuleMatch,
    getTokenExample,
    normalizeWorkflowRule,
    renderFilenameTemplate,
    renderPathTemplate,
    resolveRuleMatch,
    type TemplateContext,
    type WorkflowRule,
} from "../utils/folders";
import { isDividerEntry, normalizeMenuEntry } from "../utils/config";

const previewContext = {
    pageTitle: "Example documentation article",
    pageUrl: "https://example.com/articles/sample-page",
    sourceUrl: "https://downloads.example.com/files/article.pdf",
    linkText: "Example article link",
    selectionText: "Example selected text",
    filename: "article.pdf",
    naiveFilename: "image.png",
    captures: ["full-match", "capture-one", "capture-two"],
    // Local components so the local-calendar :date: token is stable in any
    // test-runner timezone (a UTC instant rolls the day in far-east zones).
    now: new Date(2026, 6, 4, 12, 34, 56),
};

describe("template rendering", () => {
    it("renders page-based preview paths against example.com context", () => {
        expect(renderPathTemplate(":date:/:pageurl:", previewContext)).toBe(
            "2026-07-04/example.com/articles/sample-page",
        );
    });

    it("renders filename templates with tokens and captures", () => {
        expect(renderFilenameTemplate(":$1:-:filename:", previewContext)).toBe(
            "capture-one-article.pdf",
        );
    });

    it("renders link text tokens", () => {
        expect(getTokenExample(":linktext:", previewContext)).toBe(
            "Example article link",
        );
    });
});

describe("token expansion", () => {
    // Date-based tokens read local calendar fields; build the instant from
    // local components so the assertions hold in any test-runner timezone.
    const localNow = new Date(2026, 6, 4, 9, 8, 7);
    // :isodate: / :unixdate: read UTC, so pin them to a fixed absolute instant.
    const utcNow = new Date("2026-07-04T12:34:56Z");

    const baseContext: TemplateContext = {
        pageTitle: "Example documentation article",
        pageUrl: "https://example.com/articles/sample-page",
        sourceUrl: "https://downloads.example.com/files/article.pdf",
        linkText: "Example article link",
        selectionText: "Example selected text",
        filename: "article.pdf",
        naiveFilename: "image.png",
        captures: ["full-match", "capture-one", "capture-two"],
    };

    const tokenCases: Array<{
        token: string;
        expected: string;
        now?: Date;
    }> = [
        { token: ":date:", now: localNow, expected: "2026-07-04" },
        { token: ":isodate:", now: utcNow, expected: "20260704T123456Z" },
        { token: ":unixdate:", now: utcNow, expected: "1783168496" },
        { token: ":year:", now: localNow, expected: "2026" },
        { token: ":month:", now: localNow, expected: "07" },
        { token: ":day:", now: localNow, expected: "04" },
        { token: ":hour:", now: localNow, expected: "09" },
        { token: ":minute:", now: localNow, expected: "08" },
        { token: ":second:", now: localNow, expected: "07" },
        {
            token: ":pageurl:",
            expected: "example.com/articles/sample-page",
        },
        {
            token: ":sourceurl:",
            expected: "downloads.example.com/files/article.pdf",
        },
        { token: ":pagedomain:", expected: "example.com" },
        { token: ":sourcedomain:", expected: "downloads.example.com" },
        { token: ":pagetitle:", expected: "Example documentation article" },
        { token: ":linktext:", expected: "Example article link" },
        { token: ":selectiontext:", expected: "Example selected text" },
        { token: ":filename:", expected: "article.pdf" },
        { token: ":fileext:", expected: "pdf" },
        { token: ":naivefilename:", expected: "image.png" },
        { token: ":naivefileext:", expected: "png" },
    ];

    it("has a case for every documented token", () => {
        const documented = AVAILABLE_TOKENS.map((entry) => entry.token).sort();
        const covered = tokenCases.map((entry) => entry.token).sort();
        expect(covered).toEqual(documented);
    });

    it.each(tokenCases)(
        "expands $token",
        ({ token, expected, now }) => {
            const context = now ? { ...baseContext, now } : baseContext;
            expect(getTokenExample(token, context)).toBe(expected);
        },
    );

    it.each([
        [":$0:", "full-match"],
        [":$1:", "capture-one"],
        [":$2:", "capture-two"],
    ])("expands capture token %s", (token, expected) => {
        expect(getTokenExample(token, baseContext)).toBe(expected);
    });

    it("leaves out-of-range capture tokens untouched", () => {
        expect(getTokenExample(":$9:", baseContext)).toBe(":$9:");
    });
});

describe("token fallbacks and sanitization", () => {
    it("uses placeholder values when context fields are missing", () => {
        expect(getTokenExample(":pagedomain:", {})).toBe("unknown-page");
        expect(getTokenExample(":sourcedomain:", {})).toBe("unknown-source");
        expect(getTokenExample(":pageurl:", {})).toBe("unknown-page");
        expect(getTokenExample(":sourceurl:", {})).toBe("unknown-source");
        expect(getTokenExample(":pagetitle:", {})).toBe("untitled-page");
        expect(getTokenExample(":linktext:", {})).toBe("untitled-link");
        expect(getTokenExample(":selectiontext:", {})).toBe("selection");
    });

    it("reports 'none' for extension tokens without an extension", () => {
        const context: TemplateContext = {
            filename: "README",
            naiveFilename: "LICENSE",
        };
        expect(getTokenExample(":fileext:", context)).toBe("none");
        expect(getTokenExample(":naivefileext:", context)).toBe("none");
    });

    it("sanitizes illegal path characters out of token values", () => {
        expect(
            getTokenExample(":pagetitle:", { pageTitle: 'a/b:c*d?"e' }),
        ).toBe("a-b-c-d--e");
    });
});

describe("workflow rule matching", () => {
    const rule: WorkflowRule = {
        id: "rule-1",
        name: "PDF downloads",
        pathTemplate: "docs/:$1:",
        filenameTemplate: ":$1:-:filename:",
        shortcutMode: "none",
        matchers: {
            contextPattern: "link",
            pageDomainPattern: "example\\.com",
            sourceDomainPattern: "downloads\\.example\\.com",
            sourceUrlPattern: "files/(.+)\\.pdf$",
            fileExtensionPattern: "pdf",
            linkTextPattern: "article",
        },
    };

    it("matches when all populated matcher fields pass", () => {
        expect(
            doesRuleMatch(rule, {
                context: "link",
                pageUrl: previewContext.pageUrl,
                sourceUrl: previewContext.sourceUrl,
                filename: previewContext.filename,
                linkText: previewContext.linkText,
            }),
        ).toBe(true);
    });

    it("collects captures from successful matcher regexes", () => {
        const result = resolveRuleMatch(rule, {
            context: "link",
            pageUrl: previewContext.pageUrl,
            sourceUrl: previewContext.sourceUrl,
            filename: previewContext.filename,
            linkText: previewContext.linkText,
        });

        expect(result.matches).toBe(true);
        expect(result.captures).toContain("article");
        expect(result.captures).toContain("downloads.example.com");
    });

    it("fails when a populated matcher does not match", () => {
        expect(
            doesRuleMatch(rule, {
                context: "media",
                pageUrl: previewContext.pageUrl,
                sourceUrl: previewContext.sourceUrl,
                filename: previewContext.filename,
                linkText: previewContext.linkText,
            }),
        ).toBe(false);
    });

    it("normalizes workflow rules", () => {
        const normalized = normalizeWorkflowRule({
            ...rule,
            name: "  PDF downloads  ",
            pathTemplate: " docs ",
        });

        expect(normalized.name).toBe("PDF downloads");
        expect(normalized.pathTemplate).toBe("docs");
    });
});

describe("menu entries", () => {
    it("normalizes divider entries and recognizes them", () => {
        const divider = normalizeMenuEntry({
            id: "divider-1",
            kind: "divider",
            label: "",
            menuPath: "Section",
            workflowRuleId: null,
        });

        expect(isDividerEntry(divider)).toBe(true);
        expect(divider.kind).toBe("divider");
    });
});
