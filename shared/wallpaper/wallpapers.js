/*
 * Picture wallpapers (shared/wallpaper/wallpapers.js) — the manifest of the images in this
 * folder, read by hub/hub_wallpapers.js (Hub desktop + Settings → Wallpaper).
 * To add a picture: drop the .jpg here and add one line below:
 *   [file, label, thumb (optional smaller copy, '' = the same file), light (1 = bright picture:
 *    the home text turns dark)]
 * A plain JS file (not CSV / JSON) so it also works when the site is opened from disk
 * (file://, no fetch) and the wallpaper paints at once on start (no flash).
 * The wallpaper uses the image URL directly (background-image, cover); nothing is copied.
 * xp_small.jpg is only the thumbnail of xp.jpg.
 */
window.HUB_PICTURES = [
  ['xp.jpg', 'Hills', 'xp_small.jpg', 0],
  ['bess.jpg', 'Daisy', '', 0],
  ['dalia.jpg', 'Dahlia', '', 0],
  ['dog_01.jpg', 'Puppy', '', 1],
  ['dog_02.jpg', 'Puppy walk', '', 0],
  ['dolphin_1.jpg', 'Dolphin', '', 1],
  ['dolphin_2.jpg', 'Dolphins', '', 1],
  ['fish_02.jpg', 'Striped fish', '', 0],
  ['fish_03.jpg', 'Angelfish', '', 1],
  ['fish_04.jpg', 'Reef fish', '', 0],
  ['lake_1.jpg', 'Blue lake', '', 0],
  ['lake_2.jpg', 'Mirror lake', '', 0],
  ['lake_3.jpg', 'Forest lake', '', 0],
  ['ocean_2.jpg', 'Sky and sea', '', 1],
  ['ocean_3.jpg', 'Sandbar', '', 1],
  ['ocean_7.jpg', 'Cove', '', 0],
  ['panda_01.jpg', 'Panda 1', '', 0],
  ['panda_02.jpg', 'Panda 2', '', 0],
  ['panda_1.jpg', 'Panda 3', '', 0],
  ['panda_2.jpg', 'Panda 4', '', 0],
  ['penquin_1.jpg', 'Penguins', '', 0]
];
