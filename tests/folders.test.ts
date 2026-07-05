import { describe, expect, it } from "vitest";
import {
    doesRuleMatch,
    getTokenExample,
    normalizeWorkflowRule,
    renderFilenameTemplate,
    renderPathTemplate,
    resolveRuleMatch,
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
    now: new Date("2026-07-04T12:34:56Z"),
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
