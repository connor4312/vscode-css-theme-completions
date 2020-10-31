# css-theme-completions

This extension provides completions for VS Code theme colors in CSS. It updates automatically with colors extracted daily from VS Code builds.

![](/extension/screenshot.png)

This repo consists of two parts -- an Azure function that downloads and extracts colors from VS Code daily, and an extension that consumes the colors and provides them as completions.
