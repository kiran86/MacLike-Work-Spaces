# MacLike(Work)Spaces (GNOME 49+)

I'm a big fan of the MacOS window management behavior, where maximizing a window moves it to its own workspace. Although it cannot be exactly replicated in GNOME, this extension provides a similar experience.

This project is a fork of [balintbarna's maximize-to-empty-workspace extension](https://github.com/balintbarna/gnome-shell-extension-maximize-to-empty-workspace). It adapts and extends that original work for newer GNOME versions and adds the workspace behavior described below. The original author is credited here, and this project remains under the GNU GPL v3 license.

## Description
Using **Fixed number of workspaces** options, Workspace 1 is reserved for Files and other small, non-maximized windows.
When a window is maximized—or an application opens already maximized—it moves to its own empty workspace, starting at workspace 2. Restoring the window moves it back to the workspace it came from.

Project home: https://github.com/kiran86/MacLike(Work)Spaces

## Setup

This extension is designed for a fixed workspace layout with one base workspace:

1. Open **Settings** → **Multitasking** → **Workspaces**.
2. Select **Fixed number of workspaces**.
3. Set the number of workspaces to **1**.
4. Also select **Workspaces on primary display only** if you have multiple monitors.

Workspace 1 is then kept for Files and other small windows. Maximized windows are placed in temporary workspaces starting at workspace 2, which are removed again after their windows close. Newly launched non-maximized windows are
moved to workspace 1 and focused there.



This is a fork of [balintbarna's version](https://github.com/balintbarna/gnome-shell-extension-maximize-to-empty-workspace), updated to support GNOME 49+ and released under the GNU GPL v3 license.
