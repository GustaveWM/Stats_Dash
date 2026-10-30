/* Last Five: the page. Everything it shows comes from data.js (written by build.py). The only other requests are the
   player photos and team logos from ESPN's image server; the page reads the same without them. */
(function () {
  'use strict';
  var D = window.FF;
  var root = document.getElementById('view');
  if (!D || !D.players) {
    root.innerHTML = '<p class="empty">No data yet. Run build.py (or refresh.bat) first.</p>';
    return;
  }
  var M = D.meta;

  // ---------- settings
  var REC = { std: 0, half: 0.5, ppr: 1 };
  var SCORING = [['std', 'Standard'], ['half', 'Half PPR'], ['ppr', 'PPR']];
  var POS_TABS = [['ALL', 'All'], ['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['TE', 'TE'], ['FLEX', 'Flex']];
  var STAT_LABEL = {
    pts: 'Fantasy points', py: 'Pass yards', pt: 'Pass TD', pa: 'Pass att', pc: 'Completions', pi: 'INT',
    ry: 'Rush yards', ra: 'Carries', rt: 'Rush TD', tg: 'Targets', rc: 'Receptions', ey: 'Rec yards',
    et: 'Rec TD', tch: 'Touches', td: 'Rush + rec TD'
  };
  var STAT_OPTS = {
    ALL: ['pts'],
    QB: ['pts', 'py', 'pt', 'pa', 'pc', 'pi', 'ry', 'ra'],
    RB: ['pts', 'ra', 'ry', 'rt', 'tg', 'rc', 'ey', 'tch'],
    WR: ['pts', 'tg', 'rc', 'ey', 'et'],
    TE: ['pts', 'tg', 'rc', 'ey', 'et'],
    FLEX: ['pts', 'tch', 'tg', 'rc', 'ra', 'ry', 'ey', 'td']
  };
  var YARDS = { py: 1, ry: 1, ey: 1 };
  var TDS = { pt: 1, rt: 1, et: 1, td: 1, pi: 1 };
  var SORTS = {
    proj: function (r) { return r.c.proj; },
    l5: function (r) { return r.c.l5; },
    szn: function (r) { return r.c.szn; },
    delta: function (r) { return r.c.delta; },
    dvp: function (r) { return r.p.dvp; },
    env: function (r) { return r.p.env.implied; }
  };
  var SORT_LABEL = { proj: 'Projection', l5: 'Last 5 average', szn: 'Season average', delta: 'Projection vs last 5', dvp: 'Matchup', env: 'Team points' };
  var KEY = 'last5.prefs';

  var S = { view: 'players', pos: 'ALL', stat: 'pts', scoring: 'ppr', q: '', team: '', showOut: false,
            sort: 'proj', dir: -1, open: null, limit: 50, mpos: 'WR', scrollTo: null };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    ['pos', 'stat', 'scoring', 'showOut'].forEach(function (k) { if (saved[k] !== undefined) S[k] = saved[k]; });
    if (!STAT_OPTS[S.pos]) S.pos = 'ALL';
    if (STAT_OPTS[S.pos].indexOf(S.stat) < 0) S.stat = 'pts';
    if (!(S.scoring in REC)) S.scoring = 'ppr';
  } catch (e) { /* private window: settings just do not stick */ }
  function remember() {
    try { localStorage.setItem(KEY, JSON.stringify({ pos: S.pos, stat: S.stat, scoring: S.scoring, showOut: S.showOut })); } catch (e) { /* ignore */ }
  }
  // a link can carry the view: index.html?pos=RB&stat=ra&scoring=half&open=Saquon (a name, or part of one)
  (function () {
    var qs = new URLSearchParams(location.search);
    if (qs.get('pos') && STAT_OPTS[qs.get('pos')]) S.pos = qs.get('pos');
    if (qs.get('stat') && STAT_OPTS[S.pos].indexOf(qs.get('stat')) >= 0) S.stat = qs.get('stat');
    if (qs.get('scoring') in REC) S.scoring = qs.get('scoring');
    if (qs.get('q')) S.q = qs.get('q');
    if (qs.get('open')) {
      var want = qs.get('open').toLowerCase();
      var hit = D.players.filter(function (p) { return p.id === qs.get('open') || p.name.toLowerCase().indexOf(want) >= 0; })[0];
      if (hit) S.open = hit.id;
    }
  })();

  // ---------- numbers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function ord(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function pts(g, sc) {
    return (g.py || 0) * 0.04 + (g.pt || 0) * 4 - (g.pi || 0) * 2 + (g.ry || 0) * 0.1 + (g.rt || 0) * 6 +
      (g.ey || 0) * 0.1 + (g.et || 0) * 6 - (g.fl || 0) * 2 + (g.x2 || 0) * 2 + (g.st || 0) * 6 + (g.rc || 0) * REC[sc];
  }
  function val(g, st, sc) {
    if (st === 'pts') return pts(g, sc);
    if (st === 'tch') return (g.ra || 0) + (g.rc || 0);
    if (st === 'td') return (g.rt || 0) + (g.et || 0);
    return g[st] || 0;
  }
  function fmt(st, v, kind) {
    if (v == null || isNaN(v)) return '–';
    if (st === 'pts') return v.toFixed(1);
    if (kind === 'game' || YARDS[st]) return String(Math.round(v));
    if (TDS[st]) return v.toFixed(2);
    return v.toFixed(1);
  }
  function signed(v, digits) {
    if (v == null || isNaN(v)) return '–';
    var s = v.toFixed(digits);
    if (Number(s) === 0) return (0).toFixed(digits);
    return (v > 0 ? '+' : '') + s;
  }
  function pct(v) { return v == null || !isFinite(v) ? '–' : Math.round(v * 100) + '%'; }
  function num1(v) { return v == null || !isFinite(v) ? '–' : v.toFixed(1); }       // lines for a week not yet posted are missing
  function to12(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(t || '');
    if (!m) return '';
    var h = +m[1];
    return (h % 12 || 12) + ':' + m[2] + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  function when(date, time) {
    var d = new Date(date + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' }) + (time ? ' ' + to12(time) + ' ET' : '');
  }
  function oppLabel(p) { return (p.home ? 'vs ' : '@ ') + p.opp; }
  // the last game the data holds: a date (a Thursday game of the week being projected is already in), else a week
  function throughText() {
    return M.through_date ? new Date(M.through_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'week ' + M.through;
  }
  function metIt(v, proj) { return v >= proj - 1e-9; }                                   // a game at or above the projection
  function deltaDigits() { return S.stat === 'pts' || !YARDS[S.stat] ? (TDS[S.stat] ? 2 : 1) : 0; }

  // ---------- teams and pictures: a colour for each team, photos and logos from ESPN's image server
  var TEAMS = {
    ARI: '97233F', ATL: 'A71930', BAL: '4A3AA0', BUF: '0A4DB5', CAR: '0085CA', CHI: 'C83803', CIN: 'FB4F14', CLE: '7A4A28',
    DAL: '1E4DB7', DEN: '1B4F8F', DET: '0076B6', GB: '2B6A4D', HOU: '1F4A6E', IND: '1A4E96', JAX: '006778', KC: 'E31837',
    LA: '2B5CC4', LAC: 'FFC20E', LV: 'A5ACAF', MIA: '008E97', MIN: '5B30A0', NE: 'C60C30', NO: 'D3BC8D', NYG: '1E3F99',
    NYJ: '15705A', PHI: '0B6E76', PIT: 'FFB612', SEA: '69BE28', SF: 'AA0000', TB: 'D50A0A', TEN: '4B92DB', WAS: '8A2433'
  };
  var LOGO_CODE = { LA: 'lar', WAS: 'wsh' };                                              // where ESPN's code differs
  var IMG = 'https://a.espncdn.com/combiner/i?img=/i/';
  function tcol(t) { return '#' + (TEAMS[t] || '8a8983'); }
  function logo(t, size) {
    return '<img class="tl" src="' + IMG + 'teamlogos/nfl/500/' + (LOGO_CODE[t] || String(t).toLowerCase()) + '.png&amp;w=' + size * 2 + '&amp;h=' + size * 2 +
      '" alt="" width="' + size + '" height="' + size + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  }
  function initials(name) {
    var w = String(name).replace(/\s+(Jr|Sr|II|III|IV|V)\.?$/i, '').trim().split(/\s+/);
    return (w[0].charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase();
  }
  // the initials sit under the photo, so they show if it does not load
  function avatar(p, size) {
    var w = size > 48 ? 192 : 96;
    return '<span class="av t" style="--tc:' + tcol(p.team) + ';--s:' + size + 'px"><span class="ini">' + esc(initials(p.name)) + '</span>' +
      (p.espn ? '<img src="' + IMG + 'headshots/nfl/players/full/' + esc(p.espn) + '.png&amp;w=' + w + '&amp;h=' + Math.round(w * 0.73) +
        '" alt="" width="' + size + '" height="' + size + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>';
  }
  function posTag(pos) { return '<span class="pos pos-' + pos + '">' + pos + '</span>'; }

  // ---------- one player, for the stat and scoring chosen
  function calcFor(p, st, sc) {
    var vals = p.games.slice(-5).map(function (g) { return val(g, st, sc); });
    var cur = p.games.filter(function (g) { return g.s === M.season; });
    var l5 = mean(vals);
    var proj = st === 'pts' ? p.pts[sc][0] : val(p.proj, st, sc);
    return { vals: vals, l5: l5, szn: cur.length ? mean(cur.map(function (g) { return val(g, st, sc); })) : null,
             nszn: cur.length, proj: proj, delta: l5 == null ? null : proj - l5 };
  }
  function calc(p) { return calcFor(p, S.stat, S.scoring); }
  function inPos(p) { return S.pos === 'ALL' || (S.pos === 'FLEX' ? p.pos !== 'QB' : p.pos === S.pos); }
  function playing(p) { return p.status !== 'Out' && p.status !== 'IR'; }
  function visible() {
    var list = D.players.filter(inPos);
    if (S.team) list = list.filter(function (p) { return p.team === S.team; });
    if (S.q) {
      var q = S.q.toLowerCase();
      list = list.filter(function (p) { return p.name.toLowerCase().indexOf(q) >= 0 || p.team.toLowerCase() === q; });
    }
    if (!S.showOut) list = list.filter(playing);
    var rows = list.map(function (p) { return { p: p, c: calc(p) }; });
    var f = SORTS[S.sort] || SORTS.proj;
    rows.sort(function (a, b) {
      var x = f(a), y = f(b);
      if (x == null) x = -Infinity;
      if (y == null) y = -Infinity;
      if (x === y) return 0;
      var asc = x < y ? -1 : 1;
      return S.dir < 0 ? -asc : asc;
    });
    return rows;
  }

  // ---------- pieces of a row
  function statusTag(p) {
    if (!p.status) return '';
    var cls = p.status === 'Questionable' ? 'warn' : 'bad';
    return ' · <span class="' + cls + '">' + esc(p.status) + '</span>';
  }
  // the last five games as bars, green at or above the projection and red below it, the dashed line at the projection
  function barsHTML(c) {
    if (!c.vals.length) return '<span class="none muted">no games yet</span>';
    var max = Math.max.apply(null, c.vals.concat([c.proj, 0.0001])), H = 32, hits = 0;
    var bars = c.vals.map(function (v) {
      var met = metIt(v, c.proj);
      if (met) hits++;
      return '<div class="bar' + (met ? ' hit' : '') + '" style="height:' + Math.max(2, Math.round(H * v / max)) + 'px"></div>';
    }).join('');
    var vals = c.vals.map(function (v) { return '<span>' + fmt(S.stat, v, 'game') + '</span>'; }).join('');
    return '<div class="bars" title="Last ' + c.vals.length + ' games, oldest to newest. Dashed line: the projection. ' + hits + ' of ' + c.vals.length +
      ' at or above it."><div class="five"><div class="plot">' + bars + '<div class="pl" style="bottom:' + Math.round(H * c.proj / max) + 'px"></div></div>' +
      '<div class="vals">' + vals + '</div></div><div class="rate' + (hits >= 4 ? ' good' : (hits <= 1 ? ' bad' : '')) + '">' + hits + '/' + c.vals.length + '</div></div>';
  }
  function deltaHTML(c) {
    if (c.delta == null) return '–';
    var rel = c.l5 ? c.delta / c.l5 : 0;
    var cls = rel >= 0.08 ? 'good' : (rel <= -0.08 ? 'bad' : 'muted');
    return '<span class="delta ' + cls + '">' + signed(c.delta, deltaDigits()) + '</span>';
  }
  function dvpHTML(p) {
    if (p.dvp == null) return '–';
    var v = (p.dvp - 1) * 100, cls = v >= 3 ? 'good' : (v <= -3 ? 'bad' : 'muted');
    return '<div class="' + cls + '">' + signed(v, 0) + '%</div><div class="sub">' + ord(p.dvp_rank) + ' softest</div>';
  }
  function rowHTML(r, i) {
    var p = r.p, c = r.c, open = S.open === p.id;
    var range = S.stat === 'pts' ? '<div class="range">' + Math.round(p.pts[S.scoring][1]) + '–' + Math.round(p.pts[S.scoring][2]) + '</div>' : '';
    var h = '<div class="row' + (open ? ' open' : '') + '" role="button" tabindex="0" aria-expanded="' + open + '" data-id="' + esc(p.id) + '">' +
      '<div class="c c-rk rank">' + (i + 1) + '</div>' +
      '<div class="c c-pl">' + avatar(p, 40) + '<div class="tx"><div class="who">' + esc(p.name) + '</div><div class="sub">' + posTag(p.pos) + ' · ' + p.team +
        statusTag(p) + (p.missed ? ' · missed ' + p.missed : '') + '</div></div></div>' +
      '<div class="c c-op"><div class="opp">' + logo(p.opp, 18) + '<span>' + oppLabel(p) + '</span></div><div class="sub">' + when(p.date, p.time) + '</div></div>' +
      '<div class="c c-pr r"><div class="proj">' + fmt(S.stat, c.proj, 'avg') + '</div>' + range + '</div>' +
      '<div class="c c-ba">' + barsHTML(c) + '</div>' +
      '<div class="c c-l5 r">' + fmt(S.stat, c.l5, 'avg') + '</div>' +
      '<div class="c c-szn r">' + fmt(S.stat, c.szn, 'avg') + '<div class="sub">' + c.nszn + ' gp</div></div>' +
      '<div class="c c-delta r">' + deltaHTML(c) + '</div>' +
      '<div class="c c-dvp r">' + dvpHTML(p) + '</div>' +
      '<div class="c c-env r">' + num1(p.env.implied) + '<div class="sub">opp ' + num1(p.env.against) + '</div></div>' +
      '</div>';
    return h + (open ? detailHTML(p, c) : '');
  }

  // ---------- a player opened
  var LOG = {
    QB: [['pc', 'Cmp', 0], ['pa', 'Att', 0], ['py', 'Pass yds', 0], ['pt', 'TD', 0], ['pi', 'INT', 0], ['ra', 'Rush', 0], ['ry', 'Rush yds', 0], ['rt', 'TD', 0]],
    RB: [['ra', 'Car', 0], ['ry', 'Rush yds', 0], ['rt', 'TD', 0], ['tg', 'Tgt', 0], ['rc', 'Rec', 0], ['ey', 'Rec yds', 0], ['et', 'TD', 0]],
    WR: [['tg', 'Tgt', 0], ['rc', 'Rec', 0], ['ey', 'Rec yds', 0], ['et', 'TD', 0], ['ra', 'Rush', 0], ['ry', 'Rush yds', 0], ['rt', 'TD', 0]]
  };
  LOG.TE = LOG.WR;
  function cell(key, v, kind) {
    if (v == null) return '–';
    if (kind === 'game') return String(Math.round(v));
    if (YARDS[key]) return String(Math.round(v));
    if (key === 'pt' || key === 'rt' || key === 'et' || key === 'pi') return v.toFixed(2);
    return v.toFixed(1);
  }
  function logTable(p) {
    var sc = S.scoring, cols = LOG[p.pos], last = p.games.slice(-5), pr = p.pts[sc];
    var cur = p.games.filter(function (g) { return g.s === M.season; });
    function line(g, label, cls, kind, extra) {
      var tds = cols.map(function (c) { return '<td>' + cell(c[0], g[c[0]] || 0, kind) + '</td>'; }).join('');
      return '<tr class="' + cls + '"><td class="l">' + label + '</td>' + tds + '<td class="' + (extra.met || '') + '">' + extra.pts + '</td><td>' + extra.snap + '</td></tr>';
    }
    function avgOf(arr) {
      var o = {};
      cols.forEach(function (c) { o[c[0]] = mean(arr.map(function (g) { return g[c[0]] || 0; })); });
      o.fl = 0;
      return o;
    }
    function ptsAvg(arr) { return mean(arr.map(function (g) { return pts(g, sc); })); }
    function snapAvg(arr) { return mean(arr.filter(function (g) { return g.sp != null; }).map(function (g) { return g.sp; })); }
    var head = '<tr><th class="l">Game</th>' + cols.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '<th>Pts</th><th>Snaps</th></tr>';
    var body = last.map(function (g) {
      var lbl = (g.s !== M.season ? g.s + ' ' : '') + 'Wk ' + g.w + ' <span class="muted">' + (g.h ? 'vs ' : '@ ') + g.o + '</span>';
      var v = pts(g, sc);
      return line(g, lbl, 'past', 'game', { pts: v.toFixed(1), snap: g.sp != null ? pct(g.sp) : '–', met: metIt(v, pr[0]) ? 'hit' : 'miss' });
    }).join('');
    var a5 = avgOf(last), as = avgOf(cur);
    body += line(a5, 'Last ' + last.length + ' average', 'avg', 'avg', { pts: ptsAvg(last).toFixed(1), snap: pct(snapAvg(last)) });
    if (cur.length && cur.length !== last.length) {
      body += line(as, 'Season average <span class="muted">(' + cur.length + ' gp)</span>', 'avg', 'avg', { pts: ptsAvg(cur).toFixed(1), snap: pct(snapAvg(cur)) });
    }
    body += line(p.proj, 'Week ' + M.week + ' projection', 'proj-row', 'avg',
      { pts: pr[0].toFixed(1) + ' <span class="muted">(' + Math.round(pr[1]) + '–' + Math.round(pr[2]) + ')</span>', snap: '–' });
    return '<table class="plain"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }
  function chartSVG(p, c) {
    var st = S.stat, sc = S.scoring, gs = p.games.slice(-10);
    var vals = gs.map(function (g) { return val(g, st, sc); });
    var range = st === 'pts' ? [p.pts[sc][1], p.pts[sc][2]] : null;
    var W = 560, H = 200, top = 22, bot = 34, n = gs.length + 1, slot = W / n, bw = Math.min(34, slot * 0.62);
    var max = Math.max.apply(null, vals.concat([c.proj, range ? range[1] : 0, 1]));
    function y(v) { return top + (H - top - bot) * (1 - v / max); }
    var base = y(0), out = '<line class="base" x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '"/>';
    gs.forEach(function (g, i) {
      var x = i * slot + (slot - bw) / 2, v = vals[i];
      out += '<rect class="bar' + (metIt(v, c.proj) ? ' hit' : '') + '" x="' + x + '" y="' + y(v) + '" width="' + bw + '" height="' + Math.max(1, base - y(v)) + '"/>' +
        '<text class="val" x="' + (x + bw / 2) + '" y="' + (y(v) - 4) + '" text-anchor="middle">' + fmt(st, v, 'game') + '</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (base + 13) + '" text-anchor="middle">' + (g.s !== M.season ? g.s % 100 + '/' : '') + g.w + '</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (base + 25) + '" text-anchor="middle">' + (g.h ? '' : '@') + g.o + '</text>';
    });
    out += '<line class="pline" x1="0" x2="' + W + '" y1="' + y(c.proj) + '" y2="' + y(c.proj) + '"/>';
    var px = gs.length * slot + (slot - bw) / 2, cx = px + bw / 2;
    out += '<rect class="pbar" x="' + px + '" y="' + y(c.proj) + '" width="' + bw + '" height="' + Math.max(1, base - y(c.proj)) + '"/>';
    if (range) {
      out += '<line class="whisk" x1="' + cx + '" x2="' + cx + '" y1="' + y(range[0]) + '" y2="' + y(range[1]) + '"/>' +
        '<line class="whisk" x1="' + (cx - 6) + '" x2="' + (cx + 6) + '" y1="' + y(range[0]) + '" y2="' + y(range[0]) + '"/>' +
        '<line class="whisk" x1="' + (cx - 6) + '" x2="' + (cx + 6) + '" y1="' + y(range[1]) + '" y2="' + y(range[1]) + '"/>';
    }
    out += '<text class="pv" x="' + cx + '" y="' + ((range ? y(range[1]) : y(c.proj)) - 6) + '" text-anchor="middle">' + fmt(st, c.proj, 'avg') + '</text>' +
      '<text x="' + cx + '" y="' + (base + 13) + '" text-anchor="middle">' + M.week + '</text>' +
      '<text x="' + cx + '" y="' + (base + 25) + '" text-anchor="middle">' + (p.home ? '' : '@') + p.opp + '</text>';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(STAT_LABEL[st]) + ' in recent games and the projection">' + out + '</svg>';
  }
  function facts(p) {
    var rows = [];
    function add(k, v) { rows.push('<div><span>' + k + '</span><span>' + v + '</span></div>'); }
    var last = p.games[p.games.length - 1];
    add('Next game', oppLabel(p) + ' · ' + when(p.date, p.time));
    if (isFinite(p.env.implied)) add('Expected points', num1(p.env.implied) + ' for ' + p.team + ', ' + num1(p.env.against) + ' for ' + p.opp);
    if (p.dvp != null) {
      var v = (p.dvp - 1) * 100;
      add('Matchup', signed(v, 0) + '% expected from ' + p.opp + ' against ' + p.pos + 's · ' + ord(p.dvp_rank) + ' softest of ' + D.defense.length);
    }
    if (p.use.sn != null) add('Snap share', pct(p.use.sn) + ' over the last 5' + (last && last.sp != null ? ' · ' + pct(last.sp) + ' last game' : ''));
    if (p.pos === 'RB' && p.use.cs != null) add('Carry share', pct(p.use.cs) + ' of the team’s carries');
    if (p.pos !== 'QB' && p.use.ts != null) add('Target share', pct(p.use.ts) + ' of the team’s targets');
    if ((p.pos === 'WR' || p.pos === 'TE') && p.use.ay != null) add('Air-yards share', pct(p.use.ay));
    if (p.missed) add('Missed', p.missed + ' team game' + (p.missed > 1 ? 's' : '') + ' since he last played');
    return rows.join('');
  }
  function tiles(p, c) {
    var n = c.vals.length, hits = c.vals.filter(function (x) { return metIt(x, c.proj); }).length;
    function tile(k, v, s, cls) { return '<div class="tile"><div class="k">' + k + '</div><div class="v ' + (cls || '') + '">' + v + '</div><div class="s">' + (s || '') + '</div></div>'; }
    return '<div class="tiles">' +
      tile('Projection', fmt(S.stat, c.proj, 'avg'), S.stat === 'pts' ? Math.round(p.pts[S.scoring][1]) + '–' + Math.round(p.pts[S.scoring][2]) + ' range' : '', 'acc') +
      tile('Last ' + n + ' average', fmt(S.stat, c.l5, 'avg'), c.delta == null ? '' : 'projection ' + signed(c.delta, deltaDigits()) + ' from it') +
      tile('Season average', fmt(S.stat, c.szn, 'avg'), c.nszn + ' game' + (c.nszn === 1 ? '' : 's')) +
      tile('At or above projection', n ? hits + ' of ' + n : '–', n ? 'in the last ' + n + ' games' : '') + '</div>';
  }
  function detailHTML(p, c) {
    var note = p.status ? '<div class="note"><span class="' + (p.status === 'Questionable' ? 'warn' : 'bad') + '">' + esc(p.status) + '</span>' +
      (p.note ? ' · ' + esc(p.note) : '') + '</div>' : '';
    return '<div class="detail"><div class="dhead">' + avatar(p, 72) + '<div><h3>' + esc(p.name) + '</h3><div class="lede">' + posTag(p.pos) + ' · ' + p.team +
      (p.age ? ' · age ' + Math.floor(p.age) : '') + ' · ' + STAT_LABEL[S.stat] + (S.stat === 'pts' ? ', ' + scoringName() : '') + '</div>' + note + '</div></div>' +
      tiles(p, c) +
      '<div class="cols2"><div>' + chartSVG(p, c) + '</div><div class="facts">' + facts(p) + '</div></div>' +
      '<div class="scroll">' + logTable(p) + '</div></div>';
  }
  function scoringName() { return SCORING.filter(function (s) { return s[0] === S.scoring; })[0][1]; }

  // ---------- the Players page
  function tabs(items, key, cur, cls) {
    return '<div class="tabs ' + (cls || '') + '">' + items.map(function (it) {
      return '<button data-' + key + '="' + it[0] + '" aria-pressed="' + (it[0] === cur) + '">' + it[1] + '</button>';
    }).join('') + '</div>';
  }
  // the week at a glance: who is projected highest, who is projected up or down from his recent games, who is hurt
  function spotsHTML() {
    var rows = D.players.filter(function (p) { return inPos(p) && playing(p); }).map(function (p) {
      return { p: p, c: calcFor(p, 'pts', S.scoring) };
    }).sort(function (a, b) { return b.c.proj - a.c.proj; });
    // form is for players who have played every game: after a layoff the last five reach back before the injury
    var form = rows.slice(0, 80).filter(function (r) { return r.c.delta != null && r.c.vals.length >= 3 && !r.p.missed; });
    var top = rows.slice(0, 3);
    var up = form.filter(function (r) { return r.c.delta >= 0.5; }).sort(function (a, b) { return b.c.delta - a.c.delta; }).slice(0, 3);
    var down = form.filter(function (r) { return r.c.delta <= -0.5; }).sort(function (a, b) { return a.c.delta - b.c.delta; }).slice(0, 3);
    var hurt = rows.slice(0, 40).filter(function (r) { return r.p.status; }).slice(0, 3);
    function item(r, big, cls, small) {
      var p = r.p;
      return '<li><button data-open="' + esc(p.id) + '">' + avatar(p, 30) + '<span class="nm"><b>' + esc(p.name) + '</b><span class="sub">' + posTag(p.pos) + ' · ' +
        p.team + ' · ' + oppLabel(p) + '</span></span><span class="val"><b class="' + cls + '">' + big + '</b><span class="sub">' + small + '</span></span></button></li>';
    }
    function card(cls, title, cap, list, none) {
      return '<section class="spot ' + cls + '"><h3>' + title + '</h3><div class="cap">' + cap + '</div><ul>' +
        (list.length ? list.join('') : '<li class="none muted">' + none + '</li>') + '</ul></section>';
    }
    return '<div class="spots">' +
      card('s-top', 'Top projected', 'Highest projections, ' + scoringName(), top.map(function (r) {
        return item(r, r.c.proj.toFixed(1), '', Math.round(r.p.pts[S.scoring][1]) + '–' + Math.round(r.p.pts[S.scoring][2]));
      }), 'No players.') +
      card('s-up', 'Above recent form', 'Projected above his last-5 average', up.map(function (r) {
        return item(r, signed(r.c.delta, 1), 'good', r.c.proj.toFixed(1) + ' vs ' + r.c.l5.toFixed(1));
      }), 'None this week.') +
      card('s-down', 'Below recent form', 'Projected below his last-5 average', down.map(function (r) {
        return item(r, signed(r.c.delta, 1), 'bad', r.c.proj.toFixed(1) + ' vs ' + r.c.l5.toFixed(1));
      }), 'None this week.') +
      card('s-hurt', 'Injury watch', 'A designation, among the top 40', hurt.map(function (r) {
        return item(r, esc(r.p.status), 'st ' + (r.p.status === 'Questionable' ? 'warn' : 'bad'), 'projected ' + r.c.proj.toFixed(1));
      }), 'None among the top 40.') + '</div>';
  }
  function controlsHTML() {
    var teams = Array.from(new Set(D.players.map(function (p) { return p.team; }))).sort();
    var statTabs = STAT_OPTS[S.pos].length > 1
      ? '<div class="ctl"><span class="label">Stat</span>' + tabs(STAT_OPTS[S.pos].map(function (s) { return [s, STAT_LABEL[s]]; }), 'stat', S.stat, 'small') + '</div>' : '';
    return '<div class="controls">' +
      '<div class="ctl">' + tabs(POS_TABS, 'pos', S.pos) + '</div>' + statTabs +
      '<div class="ctl"><span class="label">Scoring</span><div class="toggles">' + SCORING.map(function (s) {
        return '<button data-scoring="' + s[0] + '" aria-pressed="' + (s[0] === S.scoring) + '">' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<input type="search" id="q" placeholder="Search players" value="' + esc(S.q) + '" aria-label="Search player or team">' +
      '<select id="team" aria-label="Team"><option value="">All teams</option>' + teams.map(function (t) {
        return '<option' + (t === S.team ? ' selected' : '') + '>' + t + '</option>';
      }).join('') + '</select>' +
      '<select id="msort" class="mobile-sort" aria-label="Sort by">' + Object.keys(SORT_LABEL).map(function (k) {
        return '<option value="' + k + '"' + (k === S.sort ? ' selected' : '') + '>Sort: ' + SORT_LABEL[k] + '</option>';
      }).join('') + '</select>' +
      '<div class="toggles"><button data-out="1" aria-pressed="' + S.showOut + '">Show out players</button></div>' +
      '<span class="fill"></span><span class="count" id="count"></span></div>' +
      '<div class="legend">Bars are the last five games, oldest to newest; the dashed line is the projection for the next game. ' +
      '<i class="lh"></i>At or above it, <i class="lm"></i>below it. Click a player for the game log.</div></div>';
  }
  function head(key, label, cls, tip) {
    var on = S.sort === key;
    return '<div class="' + (cls || '') + '"><button data-sort="' + key + '"' + (on ? ' aria-sort="' + (S.dir < 0 ? 'descending' : 'ascending') + '"' : '') +
      (tip ? ' title="' + esc(tip) + '"' : '') + '>' + label + (on ? (S.dir < 0 ? ' ↓' : ' ↑') : '') + '</button></div>';
  }
  function listHTML() {
    var rows = visible(), n = rows.length, shown = rows.slice(0, S.limit);
    var st = STAT_LABEL[S.stat];
    // the header cells carry the same c-* classes as a row's, so each column hides with its header at narrow widths
    var h = '<div class="board"><div class="row head"><div></div><div>Player</div><div>Next game</div>' +
      head('proj', 'Proj', 'r', st + ' projected for the next game') + '<div>Last 5 games</div>' +
      head('l5', 'L5 avg', 'r c-l5') + head('szn', 'Season', 'r c-szn') + head('delta', 'vs L5', 'r c-delta', 'Projection minus last-5 average') +
      head('dvp', 'Matchup', 'r c-dvp', 'How soft the opponent is expected to be for this position: the part of its recent record against the position that carries into the next game') +
      head('env', 'Team pts', 'r c-env', 'Points the game lines expect from his team, and from the opponent') + '</div>';
    if (!shown.length) h += '<p class="empty">No players match.</p>';
    h += shown.map(rowHTML).join('') + '</div>';
    if (n > shown.length) h += '<button class="more" data-more="1">Show ' + Math.min(50, n - shown.length) + ' more</button>';
    return { html: h, n: n };
  }
  function renderList() {
    var l = listHTML();
    document.getElementById('list').innerHTML = l.html;
    document.getElementById('count').textContent = l.n + ' players · ' + STAT_LABEL[S.stat].toLowerCase() +
      (S.stat === 'pts' ? ', ' + scoringName() : '');
  }
  function renderPlayers() {
    root.innerHTML = spotsHTML() + controlsHTML() + '<div id="list"></div>';
    renderList();
    if (S.scrollTo) {
      var el = document.querySelector('.row[data-id="' + S.scrollTo.replace(/"/g, '') + '"]');
      S.scrollTo = null;
      if (el) el.scrollIntoView();
    }
  }
  // open one player's game log from anywhere (the week's highlights, a game's top players)
  function openPlayer(id) {
    var p = D.players.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (!inPos(p)) { S.pos = 'ALL'; if (STAT_OPTS.ALL.indexOf(S.stat) < 0) S.stat = 'pts'; }
    S.q = ''; S.team = ''; S.open = id; S.scrollTo = id;
    var at = visible().map(function (r) { return r.p.id; }).indexOf(id);
    if (at < 0) { S.showOut = true; at = visible().map(function (r) { return r.p.id; }).indexOf(id); }
    S.limit = Math.max(S.limit, at + 1);
    remember();
    if (S.view !== 'players') location.hash = '#players'; else renderPlayers();
  }

  // ---------- Matchups
  function carryText() {
    var c = M.dvp_carry || {}, v = Object.keys(c).map(function (k) { return c[k]; });
    return v.length ? 'about ' + Math.round(Math.min.apply(null, v) * 100) + '–' + Math.round(Math.max.apply(null, v) * 100) + '%' : 'a minority of it';
  }
  function renderMatchups() {
    var POS = ['QB', 'RB', 'WR', 'TE'];
    var rows = D.defense.slice().sort(function (a, b) { return (b.rel[S.mpos] || 0) - (a.rel[S.mpos] || 0); });
    // the tint deepens with the gap; green is a soft defense, red a tough one
    function cellP(v) {
      if (v == null) return '<td class="heat">–</td>';
      var x = (v - 1) * 100, a = Math.min(0.5, Math.abs(x) * 0.035);
      var bg = Math.abs(x) < 1 ? '' : ' style="background:rgba(var(--' + (x > 0 ? 'good' : 'bad') + '-rgb),' + a.toFixed(2) + ')"';
      return '<td class="heat"' + bg + '>' + signed(x, 0) + '%</td>';
    }
    root.innerHTML = '<div class="page"><p>How soft or tough each defense is expected to be for a position next game, as a share of the league’s average points. ' +
      'A defense’s recent record is shrunk to the part that has carried over from one game to the next (' + carryText() + '). ' +
      'Green is softer for the offense. Sorted by the column in bold.</p>' +
      '<div class="scroll"><table class="defs plain"><thead><tr><th class="l">Defense</th><th class="l">Faces</th>' + POS.map(function (p) {
        return '<th><button data-mpos="' + p + '"' + (S.mpos === p ? ' aria-sort="descending"' : '') + '>' + p + (S.mpos === p ? ' ↓' : '') + '</button></th>';
      }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td class="l"><span class="tm">' + logo(r.team, 22) + r.team + '</span></td><td class="l"><span class="fc">' + (r.home ? 'vs ' : '@ ') +
          logo(r.faces, 16) + r.faces + '</span></td>' + POS.map(function (p) { return cellP(r.rel[p]); }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  // ---------- Games
  function renderGames() {
    var sc = S.scoring, byTeam = {};
    D.players.forEach(function (p) { (byTeam[p.team] = byTeam[p.team] || []).push(p); });
    var maxP = Math.max.apply(null, D.players.map(function (p) { return p.pts[sc][0]; }).concat([1]));
    function tops(team) {
      var list = (byTeam[team] || []).filter(playing).sort(function (a, b) { return b.pts[sc][0] - a.pts[sc][0]; }).slice(0, 4);
      if (!list.length) return '<div class="none muted">No projections.</div>';
      return list.map(function (p) {
        var v = p.pts[sc][0];
        return '<button class="tp" data-open="' + esc(p.id) + '">' + avatar(p, 30) + '<span class="nm"><b>' + esc(p.name) + '</b><span class="sub">' + posTag(p.pos) +
          (p.status ? ' · <span class="' + (p.status === 'Questionable' ? 'warn' : 'bad') + '">' + esc(p.status) + '</span>' : '') + '</span></span>' +
          '<span class="tb"><i style="width:' + Math.round(100 * v / maxP) + '%;background:var(--' + p.pos.toLowerCase() + ')"></i></span><span class="pv">' + v.toFixed(1) + '</span></button>';
      }).join('');
    }
    // each game: who plays whom and when, what the lines expect from each side, and each side's top projected players
    root.innerHTML = '<div class="page"><p>Projected fantasy points in ' + scoringName() + ' for each team’s top players, and the points the game lines expect from each side. ' +
      'Click a player to open his game log.</p><div class="games">' + M.games.map(function (g) {
        var lines = g.total != null && isFinite(g.total) && g.margin != null && isFinite(g.margin);
        var fav = g.margin > 0 ? g.home + ' by ' + g.margin : (g.margin < 0 ? g.away + ' by ' + (-g.margin) : 'even');
        var split = '';
        if (lines && g.away_pts != null && g.home_pts != null) {
          var tot = g.away_pts + g.home_pts;
          split = '<div class="split"><i class="t" style="--tc:' + tcol(g.away) + ';width:' + (100 * g.away_pts / tot).toFixed(1) + '%"></i><i class="t" style="--tc:' +
            tcol(g.home) + ';width:' + (100 * g.home_pts / tot).toFixed(1) + '%"></i></div><div class="splitlab"><span>' + num1(g.away_pts) + '</span><span>expected points</span><span>' +
            num1(g.home_pts) + '</span></div>';
        }
        return '<div class="gcard"><div class="gtop"><div class="gteam t" style="--tc:' + tcol(g.away) + '">' + logo(g.away, 46) + '<span>' + g.away + '</span></div>' +
          '<div class="gmid"><b>' + when(g.date, g.time) + '</b>' + (lines ? 'total ' + g.total + ' · ' + fav : 'lines not posted yet') + '</div>' +
          '<div class="gteam home t" style="--tc:' + tcol(g.home) + '"><span>' + g.home + '</span>' + logo(g.home, 46) + '</div></div>' + split +
          '<div class="gcols"><div class="gcol t" style="--tc:' + tcol(g.away) + '">' + tops(g.away) + '</div><div class="gcol t" style="--tc:' + tcol(g.home) + '">' + tops(g.home) + '</div></div></div>';
      }).join('') + '</div>' + (M.bye.length ? '<p class="muted">On a bye: ' + M.bye.join(', ') + '.</p>' : '') + '</div>';
  }

  // ---------- About
  function renderAbout() {
    var a = D.accuracy, tbl = '', cov = '';
    if (a && a.summary) {
      var NAMES = { last5: 'Last 5 average', season: 'Season average', decay: 'Recent-weighted average', blend: 'Best fixed mix of those', model: 'This projection' };
      var POS = ['QB', 'RB', 'WR', 'TE', 'all'];
      var by = {};
      a.summary.forEach(function (r) { by[r.method + '|' + r.position] = r; });
      // how much smaller each method's average miss is than a last-5 average's, all positions
      var base = by['last5|all'], gains = [];
      if (base) {
        gains = Object.keys(NAMES).map(function (m) {
          var r = by[m + '|all'];
          return r ? { m: m, name: NAMES[m], gain: (base.mae - r.mae) / base.mae * 100 } : null;
        }).filter(Boolean);
      }
      var top = Math.max.apply(null, gains.map(function (x) { return x.gain; }).concat([1]));
      var chart = gains.length ? '<div>' + gains.map(function (x) {
        return '<div class="imp' + (x.m === 'model' ? ' mine' : '') + '"><span>' + x.name + '</span><span class="track"><i style="width:' + Math.max(0, Math.round(100 * x.gain / top)) +
          '%"></i></span><span class="g">' + (x.m === 'last5' ? 'baseline' : x.gain.toFixed(1) + '% smaller') + '</span></div>';
      }).join('') + '</div><p class="muted">Average miss in fantasy points compared with a last-5 average, all positions together. The table has each position.</p>' : '';
      tbl = chart + '<div class="scroll"><table class="plain"><thead><tr><th class="l">Average miss, fantasy points (PPR)</th>' +
        POS.map(function (p) { return '<th>' + (p === 'all' ? 'All' : p) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        Object.keys(NAMES).map(function (m) {
          return '<tr class="' + (m === 'model' ? 'proj-row' : '') + '"><td class="l">' + NAMES[m] + '</td>' + POS.map(function (p) {
            var r = by[m + '|' + p]; return '<td>' + (r ? r.mae.toFixed(2) : '–') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
      var rc = ['QB', 'RB', 'WR', 'TE'].map(function (p) {
        var m = by['model|' + p], l = by['last5|' + p];
        return m && l ? p + ' ' + m.rank_corr.toFixed(2) + ' vs ' + l.rank_corr.toFixed(2) : '';
      }).join(' · ');
      var c = a.coverage && a.coverage.ppr;
      if (c) {
        cov = '<p>The range shown beside each projection is where 80% of comparable games ended up. Fitted without ' + a.coverage_season +
          ', then checked on it, the share of games inside the range was ' + ['QB', 'RB', 'WR', 'TE'].map(function (p) {
            return p + ' ' + Math.round(c[p].inside * 100) + '%';
          }).join(', ') + '.</p>';
      }
      tbl += '<p class="muted">Rank correlation inside each week (1 is perfect), this projection vs last-5 average: ' + rc + '.</p>' + cov;
    }
    root.innerHTML = '<div class="page">' +
      '<h2>What this is</h2><p>For every skill-position player expected to play in week ' + M.week + ', the last five games he played and a projection of the next one. ' +
      'Pick a stat above the list to see the same five games and projection for targets, rushing yards, touchdowns and so on. Open a player for the game log.</p>' +
      '<h2>How to read the bars</h2><p>Each bar is one of the last five games, oldest to newest. The dashed line is the projection for the next game: a green bar is a game at or above it, a red bar one below it, ' +
      'and the number beside the bars counts the green ones. A player who clears the line most weeks is steadier than one whose average comes from a single big game. ' +
      'The two “recent form” lists above the table compare the projection with the last-5 average and leave out players who have missed games, since their last five reach back before the injury.</p>' +
      '<h2>How the projection is made</h2><ul>' +
      '<li>Each stat (targets, receptions, yards, touchdowns, carries, attempts...) has its own model, trained on every game since 2016.</li>' +
      '<li>A model sees only what was known before kickoff: the player’s last 3, 5 and 16 games, this season so far, a recent-weighted average, snap share, target and carry share, age and experience, home or away, rest, what the game lines expect each team to score, and the usage of teammates who are out (ESPN’s Out and Doubtful list and the roster), which is what moves a backup quarterback or a second receiver into a bigger role.</li>' +
      '<li>Fantasy points are then added up from the projected stats, so the stat line and the points always agree and the scoring toggle just changes the weights.</li>' +
      '<li>The opponent’s defense is not used. In testing, neither a defense’s overall numbers nor its record against the position improved the projections. The Matchup column shows how much of that record has carried from one game to the next, as context.</li>' +
      '<li>The projection is for the player playing. It does not know about a late scratch or an in-game injury. A designation from ESPN (Questionable, Doubtful, Out) is shown next to the name.</li></ul>' +
      '<h2>How well it does</h2><p>Tested the way it would have been used: models fitted on earlier seasons only, then asked about every game of the next season, ' +
      (a ? a.seasons[0] + ' to ' + a.seasons[1] : '') + ', for players whose recent output made them fantasy-relevant. Lower is better.</p>' + tbl +
      '<h2>What it leaves out</h2><ul><li>Kickers and defenses.</li><li>Rookies before their first game, and players coming back from a long absence have few games to go on.</li>' +
      '<li>Weather, and anything announced after the injury designations: a player ruled out late is still projected as if he plays.</li></ul>' +
      '<h2>Data</h2><p>Weekly stats, snap counts and rosters from nflverse; schedule and game lines from nfldata; injury designations, player photos and team logos from ESPN ' +
      '(the photos and logos load from ESPN’s server, so they need a connection). Built ' + esc(M.built) + ' with games through ' + throughText() + '.</p></div>';
  }

  // ---------- shell
  function render() {
    var nav = document.querySelectorAll('#nav a');
    Array.prototype.forEach.call(nav, function (a) {
      if (a.getAttribute('data-view') === S.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var built = new Date(String(M.built).replace(' ', 'T')), age = (Date.now() - built.getTime()) / 864e5;
    document.getElementById('stamp').textContent = 'Week ' + M.week + ' · ' + M.season + ' · games through ' + throughText() + ' · built ' + M.built +
      (age > 3 ? ' · ' + Math.floor(age) + ' days old, run refresh.bat' : '');
    if (S.view === 'matchups') renderMatchups();
    else if (S.view === 'games') renderGames();
    else if (S.view === 'about') renderAbout();
    else renderPlayers();
  }
  function route() {
    var h = (location.hash || '#players').slice(1);
    S.view = ['players', 'matchups', 'games', 'about'].indexOf(h) >= 0 ? h : 'players';
    render();
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-pos],[data-stat],[data-scoring],[data-sort],[data-more],[data-out],[data-mpos],[data-open],.row[data-id]');
    if (!t) return;
    if (t.hasAttribute('data-pos')) {
      S.pos = t.getAttribute('data-pos');
      if (STAT_OPTS[S.pos].indexOf(S.stat) < 0) S.stat = 'pts';
      S.limit = 50; S.open = null; remember(); renderPlayers();
    } else if (t.hasAttribute('data-stat')) {
      S.stat = t.getAttribute('data-stat'); remember(); renderPlayers();
    } else if (t.hasAttribute('data-scoring')) {
      S.scoring = t.getAttribute('data-scoring'); remember();
      if (S.view === 'games') renderGames(); else renderPlayers();
    } else if (t.hasAttribute('data-out')) {
      S.showOut = !S.showOut; remember(); renderPlayers();
    } else if (t.hasAttribute('data-sort')) {
      var k = t.getAttribute('data-sort');
      if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = -1; }
      renderPlayers();
    } else if (t.hasAttribute('data-more')) {
      S.limit += 50; renderList();
    } else if (t.hasAttribute('data-mpos')) {
      S.mpos = t.getAttribute('data-mpos'); renderMatchups();
    } else if (t.hasAttribute('data-open')) {
      openPlayer(t.getAttribute('data-open'));
    } else {
      var id = t.getAttribute('data-id');
      S.open = S.open === id ? null : id;
      renderList();
      if (S.open) {
        var el = document.querySelector('.row[data-id="' + id.replace(/"/g, '') + '"]');
        if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView();
      }
    }
  });
  root.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('row') && e.target.hasAttribute('data-id')) {
      e.preventDefault(); e.target.click();
    }
  });
  root.addEventListener('input', function (e) {
    if (e.target.id === 'q') { S.q = e.target.value.trim(); S.limit = 50; renderList(); }
  });
  root.addEventListener('change', function (e) {
    if (e.target.id === 'team') { S.team = e.target.value; S.limit = 50; renderList(); }
    else if (e.target.id === 'msort') { S.sort = e.target.value; S.dir = -1; renderList(); }
  });
  // a photo or logo that does not load is dropped: the initials or the team's letters under it are still there
  root.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.target.remove();
  }, true);
  window.addEventListener('hashchange', route);
  route();
})();
