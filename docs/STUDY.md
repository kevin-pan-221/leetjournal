# The enchanting study

Study is an eye-level 3D room with built-in, original 16×16 room block textures.
It works offline and requires no Minecraft installation. The lapis, armor and tool
UI icons use bundled default Minecraft item textures; worn armor uses the
separate 64×32 equipment atlases and the stand uses its 64×64 wooden texture. See
`public/branding/LAPIS-SOURCE.md` and `public/minecraft/SOURCES.md` for sources
and attribution. Leather icons use the default undyed tint and separate overlays;
enchanted icons retain a clipped glint. Room block textures remain original.
It is Minecraft-inspired, not affiliated with Mojang/Microsoft and not a
version-exact implementation of Minecraft's enchanting algorithm.

## Practice rewards

- Twenty XP and one lapis for the first solve of each distinct problem.
- Ten XP and one lapis for a successful review on a later UTC date, at most once
  per problem per day. A first solve during a review earns the first-solve reward
  only. Repeated normal solves do not earn additional rewards.
- A solve means a completed reflection marked **Solved** or **Easy**. This is
  self-reported, not automatic LeetCode submission verification.
- No XP, lapis, gear, or shelves for elapsed time, abandoned/active sessions,
  or unsuccessful reflections. Recorded focus time remains in the journal.
- One bookshelf per five distinct solved problems, capped at 15 shelves.
- Everyone starts wearing a full leather armor set (helmet, chestplate, leggings, boots).
- Every 100 lifetime XP earns another piece. Chainmail armor unlocks at 100–400 XP
  (boots, helmet, leggings, chestplate), iron armor at 500–800 XP, then an iron pickaxe
  and sword at 900 and 1,000 XP. Diamond armor begins at 1,100 XP, followed by diamond
  tools. Subsequent six-piece cycles provide more diamond items to enchant.
  Chainmail tools do not exist. The next item and remaining XP are visible.
- New gear fills an empty stand slot automatically but never replaces chosen gear.
- Version 4 archives older Study state and its credit ledger in
  `study_reward_backups`, then rebuilds from successful historical solves and
  reviews. Previously time-funded gear and enchantments are removed from the
  active collection; the old state remains recoverable. Solved-problem rewards
  are restored, with a fresh spendable XP/lapis balance and starter leather worn.
  Journal entries, review schedules, and recorded durations are never modified.
  Migration, reward replay, and saving are a single atomic, idempotent transaction.

Completed and ended attempts are processed once using `study_credits`, including
zero-reward attempts. Editing a processed reflection cannot farm rewards;
a later genuinely completed solve can earn the first-solve reward. Historical
duration is never used by Study. Spending XP never reduces bookshelf power or
lifetime equipment milestones.

## Enchanting

Click the room's table to open a centered enchanting window over the dimmed room.
Click the stand or chest to inspect and equip earned gear. Escape or the close
button returns to the room; furniture remains available through keyboard-accessible
controls shown on keyboard focus (or when 3D is unavailable). Pointer users
interact directly with furniture, without a shortcut dock or hover labels.
No side panel changes the room layout.
Equipment has visual Armor/Tools filters, equipped checkmarks and enchantment
badges. The next earned item has its own lifetime-XP progress bar, separate from
spendable enchanting levels. Selecting and equipping an item never consumes XP.
Enchanting shows current balances and the exact missing level/lapis requirement.

Select an earned, unenchanted item and one of three rune-only offers. Each row displays
the required level. The cost is shown separately: 1/2/3 levels and 1/2/3 lapis.
Level progression uses the familiar nonlinear XP thresholds; a level-30
requirement does not mean spending 30 levels. Fifteen shelves unlock the top
level-30 offer. Enchantment names are revealed only after the purchase commits.

The weighted roll respects item compatibility, maximum ranks, and incompatible
groups (protection types, sword damage types, Fortune/Silk Touch). Power and
material affect the roll; multiple compatible enchantments may be awarded.
Treasure-only enchants, curses, anvils, combining, and disenchanting are not in
this first version. Names/ranks are equipment collection attributes: no combat,
mining, XP multipliers, or changes to actual learning/review scheduling.

Offers use a saved seed and revision. Reopening Study doesn't reroll. Successful
enchanting advances the seed; increasing bookshelf power changes requirements.
Payment, item mutation, and seed advancement happen in one SQLite transaction.
Duplicate/stale requests fail without a second charge. The UI reconciles state
after an uncertain result rather than automatically resending a purchase.

## Rendering and accessibility

Three.js is loaded only when Study opens. The eye-level camera keeps interactive
furniture visible as the viewport changes. Native modal dialogs contain keyboard
focus, support Escape, and make the background inert. Real DOM controls
mirror canvas object clicks and support keyboard navigation. The inventory and
table remain usable if WebGL is unavailable. Animations pause offscreen and in
hidden windows and while a dialog is open, respect reduced motion, and can be disabled in Settings.
Render resources and listeners are disposed when leaving the page.

Bookshelves use the bundled default bookshelf sides and oak top/bottom textures.
The chest is an atlas-mapped body, lid and latch, sharing the same cuboid UV helper
as worn armor. Clicking the chest opens its hinged lid and latch while equipment
is open; returning closes them. Clicking the armor stand does not open the chest.
The short transition can finish while ambient effects pause behind the dialog;
disabled/reduced motion snaps to the matching pose without animation.
Its body has actual inner walls, a recessed floor and a one-pixel rim, with no
top face across the opening. The default atlas remains on the exterior.
Texture completion requests a fresh frame even with motion off;
the room owns and disposes cached textures. Source attribution is in
`public/minecraft/SOURCES.md`.
The enchanting table uses its default top/side/bottom textures with the original
16×12×16 proportions and cropped side UVs. Its floating book maps cover and page
regions from the default book atlas; the existing hover, bob and page animations
are retained. Both table and book open the same enchanting dialog.
Bookshelf particles use all 26 default SGA glyph sprites, changing glyph only at
the start of each journey. Fourteen reusable sprites fade into and out of their
paths; reduced motion freezes them, and leaving Study disposes their resources.
Enchanted equipment has moving, pixel-textured glint layers on each actual mesh,
masked by the armor atlas's alpha so helmet openings and chainmail holes stay
transparent, not a glow box around the stand. Normal textures remain visible underneath.
Armor cuboids use individual per-face UV regions, outer armor and inner leggings
layers, and untinted leather detail overlays. New equipment disposes old geometry;
textures and materials are cached per room and disposed when leaving.
Tools attach at their handle pixels to hand sockets under the shoulder joints;
wooden arms, armor sleeves, and held gear share the same pose hierarchy. The sword
uses the main hand and the mirrored pickaxe uses the off hand, without independent
room-space placement offsets.
The glint is stationary with reduced motion or Study animations disabled.

## Development checks

Run `npm run check:all` and `npm run build`. The Rust study tests cover reward
idempotency, payment rollback, stale requests, inventory ownership, XP levels,
compatibility and conflicting enchants. Frontend tests cover glyph stability and
camera framing. With the dev server running, `/tests/study-preview.html` provides
isolated new-user and advanced fixtures; it never modifies the real database.
Append `?unobstructed` to visually inspect furniture behind an open dialog; this
test-only mode hides the dialog/backdrop, and Escape still returns to the room.
