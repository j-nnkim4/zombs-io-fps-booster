// ==UserScript==
// @name         Zombs.io fps booster
// @version      2026.06.01
// @description  disable antialiasing & remove grid
// @author       jaden
// @match        *://zombs.io/*
// @match        *://*.zombs.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const REMOVE_GROUND_GRID = true;
    const DISABLE_ANTIALIAS = true;

    const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPI7HUEAAKaATgYEp1zAAAAAElFTkSuQmCC';
    const GRID_TEXTURE_MATCH = 'map-grass';

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
})();
