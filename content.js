/* ==========================================================================
   CONTENT — EDIT YOUR IMAGES HERE
   --------------------------------------------------------------------------
   This is the ONE file you edit when you want to swap an image or video on
   the site. You never need to touch the HTML or CSS.

   How it works:
   1. Put your new file in the assets/ folder (keep the same name, or use a
      new name and update the path below).
   2. Change the path next to the matching label below.
   3. Save and reload the page — done. Layout, carousels and hovers are
      untouched.

   Paths are relative to the site root (the folder with index.html).
   ========================================================================== */

var SITE_CONTENT = {
  images: {
    /* ---- Home page section cards (bento tiles) ----
       Square images keep the bento grid perfectly aligned. Other ratios
       still show fully (never cropped) but may shift the tidy alignment. */
    "game-dev-card":   "assets/game-cabin-2.jpg",        /* Home → Game Dev card image (Unreal horror game) */
    "3d-art-card":     "assets/bugatti-render.jpg",         /* Home → 3D Art card image      */
    "motion-card":     "assets/typotab-thumbnail.jpg",      /* Home → Motion card image      */

    /* (hero-composite removed 2026-10-14: three-section idea dropped) */

    /* ---- Game Dev page : Unreal horror game environment captures ---- */
    "game-forest-path":  "assets/game-forest-path.jpg",  /* Game Dev hero: sunlit forest path  */
    "game-cabin":        "assets/game-cabin.jpg",        /* Game Dev: log cabin forest clearing */
    "game-lake":         "assets/game-lake.jpg",         /* Game Dev: lakeshore at dawn         */
    "game-cabin-2":      "assets/game-cabin-2.jpg",      /* Game Dev: cabin through trees, dusk   */

    /* ---- 3D Art page : Bugatti Chiron carousel (Render → Wireframe) ---- */
    "bugatti-render":     "assets/bugatti-render.jpg",
    "bugatti-wireframe":  "assets/bugatti-wireframe.jpg",

    /* ---- 3D Art page : King Cobra carousel (Render → Wireframe) ---- */
    "cobra-render":     "assets/revolver-render.png",
    "cobra-wireframe":  "assets/revolver-wireframe.png",

    /* ---- 3D Art page : Isometric Bedroom video tile ---- */
    "bedroom-poster":  "assets/miniature-bedroom-poster.jpg",

    /* ---- Motion page video tiles (thumbnail posters) ---- */
    "typotab":   "assets/typotab-thumbnail.jpg",
    "starbucks": "assets/starbucks-thumbnail.jpg",
    "saas-explainer": "assets/saas-explainer-thumbnail.jpg",

    /* ---- Game Dev page video tiles (gameplay posters) ---- */
    "gameplay-forest-walk": "assets/gameplay-forest-walk.jpg",
    "gameplay-cabin-entry": "assets/gameplay-cabin-entry.jpg",
    "gameplay-pause-menu":  "assets/gameplay-pause-menu.jpg",

    /* ---- Game Dev page : World Building & Implementation (Unreal editor captures) ----
       Swap any of these with your own file in assets/ and reload. */
    "underhood-sculpt":       "assets/underhood-landscape-sculpt.png", /* landscape sculpt mode */
    "underhood-trees-lit":    "assets/underhood-trees-lit.jpg",        /* trees, lit view (compare slider) */
    "underhood-trees-nanite": "assets/underhood-trees-nanite.jpg",     /* trees, Nanite viz (compare slider) */
    "underhood-pcg-graph":    "assets/underhood-pcg-graph.png",        /* full PCG grass graph */
    "underhood-pcg-core":     "assets/underhood-pcg-core.png",         /* PCG core logic, close-up */
    "underhood-foliage":      "assets/underhood-foliage-tool.png",     /* foliage tool settings */
    "underhood-world":        "assets/underhood-world-partition.png",  /* World Partition grid */
    "underhood-metahuman":    "assets/underhood-metahuman.png",         /* clothed MetaHuman, editor */
    "underhood-gasp":         "assets/underhood-gasp-blueprint.png"    /* GASP character blueprint */
  },

  videos: {
    /* ---- 3D Art page : Isometric Bedroom turntable video (audio stripped) ---- */
    "bedroom-video": "assets/miniature-bedroom-muted.mp4",

    /* ---- Motion page : kinetic typography + coffee concept (with SFX audio) ---- */
    "typotab-video":   "assets/short-form-saas.mp4",
    "starbucks-video": "assets/short-form-coffee.mp4",
    "saas-explainer-video": "assets/saas-explainer.mp4",

    /* ---- Game Dev page : Unreal gameplay captures (game audio stripped from the files) ---- */
    "gameplay-forest-walk-video": "assets/gameplay-forest-walk.mp4",
    "gameplay-cabin-entry-video": "assets/gameplay-cabin-entry.mp4",
    "gameplay-pause-menu-video":  "assets/gameplay-pause-menu.mp4"
  }
};
