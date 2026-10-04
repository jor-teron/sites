/*
 * Gallery — configuration.
 * Photo list, accepted file types, keys and on-screen text.
 * gallery_logic.js reads everything from GALLERY_CONFIG.
 */
const GALLERY_CONFIG = {
  // Photos shown at start. Entries with a "/" or an http(s) URL are used as-is;
  // bare file names are loaded from photoDir.
  photos: [
    "../../../shared/wallpaper/bess.jpg",
    "../../../shared/wallpaper/dalia.jpg",
    "../../../shared/wallpaper/dog_01.jpg",
    "../../../shared/wallpaper/dog_02.jpg",
    "../../../shared/wallpaper/dolphin_1.jpg",
    "../../../shared/wallpaper/dolphin_2.jpg",
    "../../../shared/wallpaper/fish_02.jpg",
    "../../../shared/wallpaper/fish_03.jpg",
    "../../../shared/wallpaper/fish_04.jpg",
    "../../../shared/wallpaper/lake_1.jpg",
    "../../../shared/wallpaper/lake_2.jpg",
    "../../../shared/wallpaper/lake_3.jpg",
    "../../../shared/wallpaper/ocean_2.jpg",
    "../../../shared/wallpaper/ocean_3.jpg",
    "../../../shared/wallpaper/ocean_7.jpg",
    "../../../shared/wallpaper/panda_01.jpg",
    "../../../shared/wallpaper/panda_02.jpg",
    "../../../shared/wallpaper/panda_1.jpg",
    "../../../shared/wallpaper/panda_2.jpg",
    "../../../shared/wallpaper/penquin_1.jpg",
    "../../../shared/wallpaper/xp.jpg",
    "../../../shared/wallpaper/xp_small.jpg"
  ],

  photoDir: "photos/",             // folder for bare file names in photos[]

  // Files accepted from "Add photos" / drag-and-drop
  imageTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"], // accepted MIME types
  imageExtPattern: /\.(jpe?g|png|webp|gif)$/i,                        // fallback: accepted by extension

  fallbackColumns: 3,              // grid columns assumed if CSS columns can't be read

  // Key bindings (KeyboardEvent.key)
  keys: {
    arrows: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"], // default scrolling is suppressed for these
    viewerPrev: ["ArrowLeft", "ArrowUp"],     // previous photo in the viewer
    viewerNext: ["ArrowRight", "ArrowDown"],  // next photo in the viewer
    close: "Escape",                          // close the viewer
    open: "Enter",                            // open the highlighted tile
    left: "ArrowLeft",                        // grid: move left
    right: "ArrowRight",                      // grid: move right
    up: "ArrowUp",                            // grid: move up
    down: "ArrowDown",                        // grid: move down
  },

  // CSS classes used by the logic
  classes: {
    tile: "tile",                  // grid tile button
    selected: "selected",          // highlighted tile
    dragging: "dragging",          // body class while dragging files over the page
    stage: "stage",                // clicking the stage backdrop closes the viewer
  },

  // On-screen text
  text: {
    countSeparator: " / ",         // "3 / 22" in the viewer
  },
};
