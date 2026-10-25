/**
 * dsh-sidebar-density — host half.
 *
 * This plugin has no host behaviour on purpose: DSH's sidebar is a client-side
 * shell, so the entire feature is a client half (`./client.js`) that contributes
 * one small control into the shipped `sidebar.footer.action` seat and ships the
 * CSS behind it. This row exists only so the host Loader composes the package —
 * `dsh-client-modules` scans the Loader's entries for packages declaring
 * `dsh.client`, so a package that is never loaded never reaches the browser.
 *
 * Keeping the host half inert has two consequences worth stating:
 *
 *  - no service, no route, no tool, no config schema: installing this plugin
 *    cannot change what the agent can do, only what the sidebar looks like;
 *  - turning it off is one patch line (`- id: sidebar-density` + `disabled:
 *    true`) or one `dsh plugin remove`, with no server-side state to clean up.
 *
 * @module dsh-sidebar-density
 */

/** Plugin id. Also the Loader row id in `cordis.patch.yml`. */
export const name = 'dsh-sidebar-density'

/** No host services are required. */
export const inject = []

/** Nothing to do: the client half owns the whole feature. */
export function apply() {}
