/*
 * Mpris Indicator Button extension for Gnome Shell 3.28+
 * Copyright 2018 Jason Gray (JasonLG1979)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
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
 * If this extension breaks your desktop you get to keep all of the pieces...
 */
"use strict";

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Atk = imports.gi.Atk;
const GObject = imports.gi.GObject;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;


// The Cover Icon has crazy fallback redundancy.
// The order is as follows:
// 1. The actual cover art
// 2. The player's symbolic icon
// 3. The player's full color icon
// 4. A symbolic icon loosely representing
//    the current track's media type. (audio or video)
// 5. If all else fails the audio mimetype symbolic icon.
var CoverIcon = GObject.registerClass({
    GTypeName: "CoverIcon",
    Properties: {
        "cover-url": GObject.ParamSpec.string(
            "cover-url",
            "cover-url-prop",
            "the url of the current track's cover art",
            GObject.ParamFlags.WRITABLE,
            ""
        )
    }
}, class CoverIcon extends St.Icon {
    _init() {
        super._init({
            icon_size: 38,
            opacity: 153,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_role: Atk.Role.ICON
        });

        this._parentHoverState = false;
        this._cancellable = null;
        this.__fallback = true;
        this._fallbackGicon = Gio.ThemedIcon.new("audio-x-generic-symbolic");
        this._fallbackGicon.isSymbolic = true;
        this.gicon = this._fallbackGicon;

        let destroyId = this.connect("destroy", () => {
            this.disconnect(destroyId);
            if (this._cancellable) {
                if (!this._cancellable.is_cancelled()) {
                    this._cancellable.cancel();
                }
                this._cancellable.run_dispose();
            }
            this._parentHoverState = null;
            this._cancellable = null;
            this.__fallback = null;
            this._fallbackGicon = null;
        });
    }

    onParentHover(hover) {
        this._parentHoverState = hover;
        this.opacity = !this.gicon.isSymbolic ? 255 : hover ? 204 : 153;
    }

    setFallbackGicon(gicon) {
        this._fallbackGicon = gicon;
        if (this.__fallback) {
            this._fallback();
        }
    }

    set cover_url(cover_url) {
        // Asynchronously set the cover icon.
        // Much more fault tolerant than:
        //
        // let file = Gio.File.new_for_uri(coverUrl);
        // icon.gicon = new Gio.FileIcon({ file: file });
        //
        // Which silently fails on error and can lead to the wrong cover being shown.
        // On error this will fallback gracefully.
        //
        // The Gio.Cancellable and corresponding catch logic protects against machine gun updates.
        // It serves to insure we only have one async operation happening at a time,
        // the most recent.
        if (this._cancellable) {
            if (!this._cancellable.is_cancelled()) {
                this._cancellable.cancel();
            }
            this._cancellable.run_dispose();
            this._cancellable = null;
        }

        if (cover_url) {
            this.__fallback = false;
            let file = Gio.File.new_for_uri(cover_url);
            this._cancellable = new Gio.Cancellable();
            file.load_contents_async(this._cancellable, (source, result) => {
                try {
                    let bytes = source.load_contents_finish(result)[1];
                    let newIcon = Gio.BytesIcon.new(bytes);
                    newIcon.isSymbolic = false;
                    this.gicon = newIcon;
                    this.opacity = 255;
                    this.accessible_role = Atk.Role.IMAGE;
                } catch (error) {
                    if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                        this._fallback();
                    }
                }
            });
        } else {
            this._fallback();
        }
    }

    _fallback() {
        this.__fallback = true;
        this.gicon = this._fallbackGicon;
        this.accessible_role = Atk.Role.ICON;
        this.onParentHover(this._parentHoverState);
    }
});

var TrackLabel = GObject.registerClass({
    GTypeName: "TrackLabel"
}, class TrackLabel extends St.Label {
    _init(baseOpacity, hoverOpacity) {
        super._init({
            accessible_role: Atk.Role.LABEL,
            opacity: baseOpacity
        });

        this._baseOpacity = baseOpacity;
        this._hoverOpacity = hoverOpacity;

        let destroyId = this.connect("destroy", () => {
            this.disconnect(destroyId);
            this._baseOpacity = null;
            this._hoverOpacity = null;
        });
    }

    onParentHover(hover) {
        this.opacity = hover ? this._hoverOpacity : this._baseOpacity;
    }
});

var MediaControlButton = GObject.registerClass({
    GTypeName: "MediaControlButton"
}, class MediaControlButton extends St.Button {
    _init(iconName) {
        super._init({
            style: "padding: 10px, 12px, 10px, 12px;",
            opacity: 204,
            accessible_role: Atk.Role.PUSH_BUTTON,
            child: new St.Icon({
                icon_name: iconName,
                accessible_role: Atk.Role.ICON,
                icon_size: 16
            })
        });

        let callback = () => {
            this.opacity = !this.reactive ? 102 : this.hover ? 255 : 204;
        };

        let signalIds = [
            this.connect("notify::hover", callback),
            this.connect("notify::reactive", callback),
            this.connect("destroy", () => {
                signalIds.forEach(signalId => this.disconnect(signalId));
            })
        ];
    }
});
