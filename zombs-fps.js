/*!
 * // ==UserScript==
 * // @name         Zombs.io fps booster
 * // @version      2026-06-01
 * // @description  disable antialiasing, remove grid, and skip off-screen zombie rendering
 * // @match        *://zombs.io/*
 * // @match        *://*.zombs.io/*
 * // @grant        none
 * // @run-at       document-start
 * // ==/UserScript==
 */


(function () {
    'use strict';

    const REMOVE_GROUND_GRID = true;
    const DISABLE_ANTIALIAS = true;
    const SKIP_OFFSCREEN_MODEL = true;
    const SKIP_OFFSCREEN_TICK = false;
    const WEAPON_ANIM_THROTTLE = 2;
    const ROUND_PIXELS = false;
    const SHOW_OVERLAY = false; // leave off, only used to compare performances
    const LOG = false;
    const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPI7HUEAAKaATgYEp1zAAAAAElFTkSuQmCC';
    const GRID_TEXTURE_MATCH = 'map-grass';
    const log = (...a) => { if (LOG) { try { console.log('%c[zombs-fps]', 'color:#8fd14f', ...a); } catch (e) {} } };

    if (REMOVE_GROUND_GRID) {
        const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        if (desc && desc.set) {
            Object.defineProperty(HTMLImageElement.prototype, 'src', {
                configurable: true,
                enumerable: desc.enumerable,
                get: desc.get,
                set: function (value) {
                    if (typeof value === 'string' && value.indexOf(GRID_TEXTURE_MATCH) !== -1) {
                        value = BLANK_PNG;
                    }
                    return desc.set.call(this, value);
                },
            });
        }

        const setAttr = HTMLImageElement.prototype.setAttribute;
        HTMLImageElement.prototype.setAttribute = function (name, value) {
            if (name === 'src' && typeof value === 'string' &&
                value.indexOf(GRID_TEXTURE_MATCH) !== -1) {
                value = BLANK_PNG;
            }
            return setAttr.call(this, name, value);
        };
    }

    if (DISABLE_ANTIALIAS) {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, attrs) {
            if (/webgl/i.test(type)) {
                attrs = Object.assign({}, attrs, { antialias: false });
            }
            return getContext.call(this, type, attrs);
        };
    }

    let patched = false;

    function getCurrentGame() {
        try {
            const G = window.Game;
            if (G && G.currentGame && G.currentGame.world && G.currentGame.world.entities) {
                return G.currentGame;
            }
        } catch (e) {}
        return null;
    }

    function firstEntity(cg) {
        const ents = cg.world.entities;
        for (const k in ents) { if (ents[k]) return ents[k]; }
        return null;
    }

    function protoOwning(obj, name) {
        let p = Object.getPrototypeOf(obj);
        while (p && !Object.prototype.hasOwnProperty.call(p, name)) p = Object.getPrototypeOf(p);
        return p;
    }

    function wrapEntityUpdate(proto) {
        const origUpdate = proto.update;
        if (typeof origUpdate !== 'function' || origUpdate.__zf) return false;

        const wrapped = function (dt, targetTick) {
            const cm = this.currentModel;

            if (SKIP_OFFSCREEN_MODEL && cm && this.node && this.node.visible === false) {
                this.currentModel = null;
                try { return origUpdate.call(this, dt, targetTick); }
                finally { this.currentModel = cm; }
            }

            if (WEAPON_ANIM_THROTTLE > 1 && cm && cm.weaponUpdateFunc) {
                cm.__zfWfc = (cm.__zfWfc | 0) + 1;
                if (cm.__zfWfc % WEAPON_ANIM_THROTTLE !== 0) {
                    const saved = cm.weaponUpdateFunc;
                    cm.weaponUpdateFunc = null;
                    try { return origUpdate.call(this, dt, targetTick); }
                    finally { cm.weaponUpdateFunc = saved; }
                }
            }

            return origUpdate.call(this, dt, targetTick);
        };
        wrapped.__zf = true;
        proto.update = wrapped;
        return true;
    }

    function wrapEntityTick(proto) {
        if (!SKIP_OFFSCREEN_TICK) return false;
        const origTick = proto.tick;
        if (typeof origTick !== 'function' || origTick.__zf) return false;

        const wrapped = function (msInTick, msPerTick) {
            if (this.node && this.node.visible === false) return;
            return origTick.call(this, msInTick, msPerTick);
        };
        wrapped.__zf = true;
        proto.tick = wrapped;
        return true;
    }

    function applyExtras(cg) {
        if (ROUND_PIXELS) {
            try {
                const r = cg.renderer.getInternalRenderer();
                if (r && 'roundPixels' in r) r.roundPixels = true;
            } catch (e) {}
        }
    }

    const status = { game: false, patched: false, tick: false };

    function tryPatch() {
        if (patched) return true;
        const cg = getCurrentGame();
        if (!cg) return false;
        status.game = true;

        const ent = firstEntity(cg);
        if (!ent) return false;

        const updProto = protoOwning(ent, 'update');
        if (!updProto) {
            log('no entity prototype owns update() -- bundle changed? aborting');
            return false;
        }
        wrapEntityUpdate(updProto);

        const tickProto = protoOwning(ent, 'tick');
        status.tick = tickProto ? wrapEntityTick(tickProto) : false;
        applyExtras(cg);

        patched = true;
        status.patched = true;
        log('patched NetworkEntity.update' + (status.tick ? ' + tick' : '') +
            ' | offscreen-skip=' + SKIP_OFFSCREEN_MODEL +
            ' weapon-throttle=' + WEAPON_ANIM_THROTTLE);
        return true;
    }

    const poll = setInterval(() => { if (tryPatch()) clearInterval(poll); }, 250);
    setTimeout(() => clearInterval(poll), 180000);

    if (SHOW_OVERLAY) startOverlay();

    function startOverlay() {
        const el = document.createElement('div');
        el.style.cssText =
            'position:fixed;top:6px;left:6px;z-index:99999;font:12px/1.4 monospace;' +
            'background:rgba(0,0,0,.6);color:#8fd14f;padding:4px 7px;border-radius:4px;pointer-events:none;white-space:pre';
        const attach = () => (document.body ? document.body.appendChild(el) : setTimeout(attach, 200));
        attach();

        let frames = 0, fps = 0, last = performance.now();
        const loop = () => {
            frames++;
            const now = performance.now();
            if (now - last >= 500) {
                fps = Math.round((frames * 1000) / (now - last));
                frames = 0; last = now;
                let total = 0, vis = 0;
                try {
                    const cg = getCurrentGame();
                    if (cg) {
                        const ents = cg.world.entities;
                        for (const k in ents) {
                            total++;
                            const n = ents[k] && ents[k].node;
                            if (n && n.visible) vis++;
                        }
                    }
                } catch (e) {}
                el.textContent =
                    'FPS ' + fps +
                    '\nGame ' + (status.game ? 'yes' : 'no') +
                    ' | patched ' + (status.patched ? 'yes' : 'no') +
                    '\nentities ' + total + ' (drawn ' + vis + ')';
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
})();
