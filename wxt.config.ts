import { defineConfig } from "wxt";

export default defineConfig({
    modules: ["@wxt-dev/module-vue"],
    manifest: {
        name: "Save In MV3",
        description:
            "Save pages, links, and media into user-defined folders relative to the default Downloads directory.",
        permissions: [
            "contextMenus",
            "downloads",
            "notifications",
            "storage",
            "tabs",
        ],
        host_permissions: ["<all_urls>"],
        action: {
            default_title: "Save In MV3",
        },
    },
});
