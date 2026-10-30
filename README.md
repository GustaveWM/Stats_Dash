# Last Five

A fantasy football form guide. For every QB, RB, WR and TE expected to play next week: the last five games he played, and a
projection of the next one with a range. Pick a stat or the scoring (standard, half PPR, PPR) and click a player for the game log.

Live page: https://gustavewm.github.io/Stats_Dash/

This repository holds only the built page (static HTML, CSS and JavaScript), republished after each refresh. The projections come
from gradient-boosted models trained on every game since 2016. On games the models had never seen (2022 to 2026) the average miss
was 4.98 PPR points, against 5.36 for a last-five average; the About tab of the page has the details.

Data: weekly stats, snap counts and rosters from [nflverse](https://github.com/nflverse/nflverse-data); schedule and game lines
from [nfldata](https://github.com/nflverse/nfldata); injury designations, player photos and team logos from ESPN (the photos and logos load from its image server). Not affiliated with
the NFL. Estimates, not advice.
