/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const _windowidsMaximized = {};
const _windowidsSizeChange = {};
const _windowidsPendingStartup = {};
const _windowidsPendingOverview = {};
const _windowidsPendingStability = {};
let _startupComplete = false;

export default class Extension {
    // First free workspace on the specified monitor, starting after the
    // reserved workspace at index 0.
    getFirstFreeMonitor(manager, mMonitor, firstIndex = 1) {
        const n = manager.get_n_workspaces();
        for (let i = firstIndex; i < n; i++) {
            const winCount = manager.get_workspace_by_index(i).list_windows().filter(w => !w.is_always_on_all_workspaces() && w.get_monitor() === mMonitor).length;
            if (winCount < 1)
                return i;
        }
        return -1;
    }

    placeOnWorkspace(win) {
        // Don't move windows while overview is visible (prevents triggering it at login).
        if (Main.overview.visible) {
            _windowidsPendingOverview[win.get_id()] = win;
            return;
        }
        if (win.skip_taskbar || !win.showing_on_its_workspace() || win.get_transient_for())
            return;

        const mMonitor = win.get_monitor();
        if (this._mutterSettings.get_boolean('workspaces-only-on-primary') &&
            mMonitor !== win.get_display().get_primary_monitor())
            return;

        const sourceWorkspace = win.get_workspace();
        const sourceIndex = sourceWorkspace.index();
        const otherWindows = sourceWorkspace.list_windows().filter(w =>
            w !== win && !w.is_always_on_all_workspaces() && w.get_monitor() === mMonitor);

        // Workspace 1 (index 0) is for ordinary windows. A maximized window
        // always leaves it; elsewhere, only split a workspace that is shared.
        if (sourceIndex !== 0 && otherWindows.length === 0)
            return;
        if (win.get_id() in _windowidsMaximized)
            return;

        const manager = win.get_display().get_workspace_manager();
        let targetIndex = this.getFirstFreeMonitor(manager, mMonitor);
        if (targetIndex === -1) {
            manager.append_new_workspace(false, global.get_current_time());
            targetIndex = manager.get_n_workspaces() - 1;
        }

        const dedicatedWorkspace = manager.get_workspace_by_index(targetIndex);
        const workspaceInfo = {
            sourceWorkspace,
            dedicatedWorkspace,
            monitor: mMonitor
        };
        _windowidsMaximized[win.get_id()] = workspaceInfo;
        this._dedicatedWorkspaces.add(dedicatedWorkspace);
        const display = win.get_display();
        dedicatedWorkspace.connectObject('window-removed', (_, removedWin) => {
            if (removedWin === win)
                this.removeEmptyDedicatedWorkspace(display, workspaceInfo);
        }, this);
        win.change_workspace_by_index(targetIndex, false);
        dedicatedWorkspace.activate_with_focus(win, global.get_current_time());
    }

    restoreToSourceWorkspace(win) {
        const workspaceInfo = _windowidsMaximized[win.get_id()];
        if (!workspaceInfo)
            return;

        delete _windowidsMaximized[win.get_id()];
        win.change_workspace(workspaceInfo.sourceWorkspace);
        workspaceInfo.sourceWorkspace.activate_with_focus(win, global.get_current_time());
        this.removeEmptyDedicatedWorkspace(win.get_display(), workspaceInfo);
    }

    placeNormalWindowOnHomeWorkspace(win) {
        const mMonitor = win.get_monitor();
        if (this._mutterSettings.get_boolean('workspaces-only-on-primary') &&
            mMonitor !== win.get_display().get_primary_monitor())
            return;

        const manager = win.get_display().get_workspace_manager();
        const homeWorkspace = manager.get_workspace_by_index(0);
        if (win.get_workspace() !== homeWorkspace)
            win.change_workspace(homeWorkspace);
        homeWorkspace.activate_with_focus(win, global.get_current_time());
    }

    removeEmptyDedicatedWorkspace(display, workspaceInfo) {
        if (!workspaceInfo || this._workspacesPendingCleanup.has(workspaceInfo.dedicatedWorkspace))
            return;

        this._workspacesPendingCleanup.add(workspaceInfo.dedicatedWorkspace);

        const cleanupTimeoutId = setTimeout(() => {
            this._workspaceCleanupTimeoutIds.delete(cleanupTimeoutId);
            this._workspacesPendingCleanup.delete(workspaceInfo.dedicatedWorkspace);

            const {dedicatedWorkspace, sourceWorkspace} = workspaceInfo;
            const windows = dedicatedWorkspace.list_windows().filter(w =>
                !w.is_always_on_all_workspaces() &&
                w.get_monitor() === workspaceInfo.monitor
            );
            if (dedicatedWorkspace.index() === 0)
                return;
            if (windows.length > 0)
                return;

            const manager = display.get_workspace_manager();
            if (manager.get_active_workspace() === dedicatedWorkspace)
                sourceWorkspace.activate(global.get_current_time());
            manager.remove_workspace(dedicatedWorkspace, global.get_current_time());
        }, 100);
        this._workspaceCleanupTimeoutIds.add(cleanupTimeoutId);
    }

    window_manager_map(act) {
        const win = act.meta_window;
        if (win.window_type !== Meta.WindowType.NORMAL)
            return;
        const isMaximized = win.maximized_horizontally && win.maximized_vertically;
        if (win.is_always_on_all_workspaces())
            return;
        // Filter out transient/hidden windows immediately
        if (win.skip_taskbar || win.get_transient_for())
            return;

        // Do not rearrange windows restored while the session is starting.
        if (!isMaximized) {
            if (_startupComplete)
                this.placeNormalWindowOnHomeWorkspace(win);
            return;
        }
        if (!_startupComplete) {
            _windowidsPendingStartup[win.get_id()] = win;
            return;
        }
        // Add stability delay to filter out short-lived windows
        _windowidsPendingStability[win.get_id()] = setTimeout(() => {
            delete _windowidsPendingStability[win.get_id()];
            // Verify window is still valid, maximized, visible, and not transient
            if (win && !win.is_always_on_all_workspaces()) {
                const stillMaximized = win.maximized_horizontally && win.maximized_vertically;
                if (stillMaximized && win.showing_on_its_workspace() && !win.skip_taskbar && !win.get_transient_for())
                    this.placeOnWorkspace(win);
            }
        }, 500);
    }

    window_manager_destroy(act) {
        const win = act.meta_window;
        if (win.window_type !== Meta.WindowType.NORMAL)
            return;

        const workspaceInfo = _windowidsMaximized[win.get_id()];
        delete _windowidsMaximized[win.get_id()];
        if (workspaceInfo)
            this.removeEmptyDedicatedWorkspace(win.get_display(), workspaceInfo);
    }

    window_manager_size_change(act, change, rectold) {
        const win = act.meta_window;
        if (win.window_type !== Meta.WindowType.NORMAL)
            return;
        if (!_startupComplete)
            return;
        if (win.is_always_on_all_workspaces())
            return;
        if (change === Meta.SizeChange.MAXIMIZE) {
            const isMaximized = win.maximized_horizontally && win.maximized_vertically;
            if (isMaximized)
                _windowidsSizeChange[win.get_id()] = 'place';
        } else if (change  === Meta.SizeChange.FULLSCREEN) {
            _windowidsSizeChange[win.get_id()] = 'place';
        } else if (change === Meta.SizeChange.UNMAXIMIZE) {
            // do nothing if it was only partially maximized
            const rectmax = win.get_work_area_for_monitor(win.get_monitor());
            if (rectmax.equal(rectold))
                _windowidsSizeChange[win.get_id()] = 'back';
        } else if (change === Meta.SizeChange.UNFULLSCREEN) {
            const isMaximized = win.maximized_horizontally && win.maximized_vertically;
            if (!isMaximized)
                _windowidsSizeChange[win.get_id()] = 'back';
        }
    }

    window_manager_minimize(act) {
        const win = act.meta_window;
        if (win.window_type !== Meta.WindowType.NORMAL)
            return;
        // A minimized maximized window remains assigned to its workspace.
    }

    window_manager_unminimize(act) {
        const win = act.meta_window;
        if (win.window_type !== Meta.WindowType.NORMAL)
            return;
        if (!_startupComplete)
            return;
        const isMaximized = win.maximized_horizontally && win.maximized_vertically;
        if (!isMaximized)
            return;
        if (win.is_always_on_all_workspaces())
            return;
        // Filter out transient/hidden windows
        if (win.skip_taskbar || win.get_transient_for())
            return;
        this.placeOnWorkspace(win);
    }

    window_manager_size_changed(act) {
        const win = act.meta_window;
        const action = _windowidsSizeChange[win.get_id()];
        if (action) {
            if (action === 'place') {
                // Filter out transient/hidden windows
                if (!win.skip_taskbar && !win.get_transient_for())
                    this.placeOnWorkspace(win);
            } else if (action === 'back') {
                this.restoreToSourceWorkspace(win);
            }

            delete _windowidsSizeChange[win.get_id()];
        }
    }

    window_manager_switch_workspace() {
    }

    enable() {
        this._mutterSettings = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        this._workspaceCleanupTimeoutIds = new Set();
        this._workspacesPendingCleanup = new Set();
        this._dedicatedWorkspaces = new Set();
        _startupComplete = false;
        // Delay extension activation to prevent workspace reordering during session startup
        this._startupTimeoutId = setTimeout(() => {
            _startupComplete = true;
            this._startupTimeoutId = null;
            // Process any windows that arrived during startup
            for (const winId in _windowidsPendingStartup) {
                const win = _windowidsPendingStartup[winId];
                if (win && !win.is_always_on_all_workspaces()) {
                    const isMaximized = win.maximized_horizontally && win.maximized_vertically;
                    // Filter out transient/hidden windows
                    if (isMaximized && win.showing_on_its_workspace() && !win.skip_taskbar && !win.get_transient_for())
                        this.placeOnWorkspace(win);
                }
            }
            // Clear the pending list
            for (const winId in _windowidsPendingStartup)
                delete _windowidsPendingStartup[winId];
        }, 10000);
        // Listen for overview hidden to process pending windows
        Main.overview.connectObject('hidden', () => {
            for (const winId in _windowidsPendingOverview) {
                const win = _windowidsPendingOverview[winId];
                if (win && !win.is_always_on_all_workspaces()) {
                    const isMaximized = win.maximized_horizontally && win.maximized_vertically;
                    // Filter out transient/hidden windows
                    if (isMaximized && win.showing_on_its_workspace() && !win.skip_taskbar && !win.get_transient_for())
                        this.placeOnWorkspace(win);
                }
            }
            // Clear the pending list
            for (const winId in _windowidsPendingOverview)
                delete _windowidsPendingOverview[winId];
        }, this);
        // Trigger new window with maximize size and if the window is maximized
        global.window_manager.connectObject(
            'minimize', (_, act) => {
                this.window_manager_minimize(act);
            },
            'unminimize', (_, act) => {
                this.window_manager_unminimize(act);
            },
            'size-changed', (_, act) => {
                this.window_manager_size_changed(act);
            },
            'switch-workspace', _ => {
                this.window_manager_switch_workspace();
            },
            'map', (_, act) => {
                this.window_manager_map(act);
            },
            'destroy', (_, act) => {
                this.window_manager_destroy(act);
            },
            'size-change', (_, act, change, rectold) => {
                this.window_manager_size_change(act, change, rectold);
            },
            this
        );
    }

    disable() {
        if (this._startupTimeoutId) {
            clearTimeout(this._startupTimeoutId);
            this._startupTimeoutId = null;
        }

        // Clear any pending stability timeouts
        for (const winId in _windowidsPendingStability) {
            clearTimeout(_windowidsPendingStability[winId]);
            delete _windowidsPendingStability[winId];
        }

        for (const timeoutId of this._workspaceCleanupTimeoutIds)
            clearTimeout(timeoutId);
        this._workspaceCleanupTimeoutIds.clear();
        this._workspacesPendingCleanup.clear();

        for (const workspace of this._dedicatedWorkspaces)
            workspace.disconnectObject(this);
        this._dedicatedWorkspaces.clear();

        Main.overview.disconnectObject(this);
        global.window_manager.disconnectObject(this);

        _startupComplete = false;
        this._mutterSettings = null;

        for (const winId in _windowidsMaximized)
            delete _windowidsMaximized[winId];
    }
}
