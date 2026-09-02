/**
 * Tools every deployment gets.
 *
 * Anything specific to one deployment belongs in deployment.js instead, so that
 * a deployment branch never has to edit this file.
 *
 * Empty for now. The upstream demo tools went out with the UI panels that
 * rendered their output - display_color_palette had nothing left to draw to, so
 * shipping its definition only spent tokens on every session. The list stays so
 * the three-layer registry in ./index.js (builtin / deployment / Tools service)
 * keeps its shape, and so adding a tool here needs no wiring.
 */

export const builtinTools = [];
