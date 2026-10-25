// Core - Charts: dependency-free SVG charts.
// Types: column, bar, line, area, histogram, pie.
//
//   BitcasCharts.render(container, {
//       type: 'column',          // column | bar | line | area | histogram | pie
//       labels: ['Mon', ...],    // category labels (same length as values)
//       values: [12, 30, ...],   // numbers
//       raw: [...],              // optional raw samples (histogram bins these instead of values)
//       unit: 'vehicles',        // tooltip suffix
//       compact: false           // smaller paddings / fewer ticks (gallery cards)
//   });
//
// Colors come from CSS variables so the charts follow the light/dark theme.

const BitcasCharts = (() => {
    const NS = 'http://www.w3.org/2000/svg';
    const PIE_COLORS = ['#f59e0b', '#5b9bff', '#34d399', '#a78bfa', '#f87171', '#22d3ee', '#fb923c', '#94a3b8'];
    let uid = 0;

    // --- helpers ----------------------------------------------------------

    function fmt(value) {
        if (!Number.isFinite(value)) return '--';
        if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
        return Number.isInteger(value) ? String(value) : (Math.round(value * 10) / 10).toString();
    }

    function niceCeil(max) {
        if (max <= 0) return 1;
        const pow = Math.pow(10, Math.floor(Math.log10(max)));
        const norm = max / pow;
        const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
        return step * pow;
    }

    function esc(text) {
        return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    // Smooth path through points (monotone-ish cubic via Catmull-Rom with clamped tangents).
    function smoothPath(points) {
        if (points.length < 2) return '';
        let d = `M${points[0][0]},${points[0][1]}`;
        for (let i = 0; i < points.length - 1; i += 1) {
            const p0 = points[i - 1] || points[i];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[i + 2] || p2;
            const t = 0.18;
            let c1y = p1[1] + (p2[1] - p0[1]) * t;
            let c2y = p2[1] - (p3[1] - p1[1]) * t;
            const lo = Math.min(p1[1], p2[1]);
            const hi = Math.max(p1[1], p2[1]);
            c1y = Math.max(lo, Math.min(hi, c1y));
            c2y = Math.max(lo, Math.min(hi, c2y));
            const c1x = p1[0] + (p2[0] - p0[0]) * t;
            const c2x = p2[0] - (p3[0] - p1[0]) * t;
            d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
        }
        return d;
    }

    function roundedTopRect(x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h));
        return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
    }

    function roundedRightRect(x, y, w, h, r) {
        r = Math.max(0, Math.min(r, h / 2, w));
        return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
    }

    function buildHistogram(source) {
        const data = source.filter((v) => Number.isFinite(v));
        if (!data.length) return { labels: [], values: [] };
        const min = Math.min(...data);
        const max = Math.max(...data);
        if (min === max) return { labels: [fmt(min)], values: [data.length] };

        const n = data.length;
        const k = n <= 8 ? Math.max(3, Math.ceil(n / 2)) : Math.min(12, Math.max(5, Math.ceil(Math.log2(n) + 1)));
        const width = (max - min) / k;
        const counts = new Array(k).fill(0);
        data.forEach((v) => {
            counts[Math.min(k - 1, Math.floor((v - min) / width))] += 1;
        });
        const labels = counts.map((unused, i) => `${fmt(min + i * width)}\u2013${fmt(min + (i + 1) * width)}`);
        return { labels, values: counts };
    }

    // --- layout -------------------------------------------------------------

    function frame(el, cfg) {
        const cs = getComputedStyle(el);
        const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        const width = Math.max(240, (el.clientWidth - padX) || 640);
        const height = Math.max(120, (el.clientHeight - padY) || (cfg.compact ? 190 : 300));
        const compact = !!cfg.compact;
        return {
            width,
            height,
            left: 6,
            right: compact ? 6 : 40,
            top: compact ? 12 : 22,
            bottom: compact ? 22 : 28
        };
    }

    function axes(f, max, compact) {
        const innerH = f.height - f.top - f.bottom;
        const steps = compact ? 3 : 4;
        let html = '';
        for (let i = 0; i <= steps; i += 1) {
            const value = (max / steps) * i;
            const y = f.top + innerH - (innerH * i) / steps;
            html += `<line class="ch-grid" x1="${f.left}" x2="${f.width - f.right}" y1="${y}" y2="${y}"/>`;
            if (!compact) html += `<text class="ch-ytick" x="${f.width - f.right + 10}" y="${y + 4}">${fmt(value)}</text>`;
        }
        return html;
    }

    function xLabels(f, labels, centers, minGap) {
        const every = Math.max(1, Math.ceil(minGap / Math.max(1, (centers[1] ?? centers[0] + minGap) - centers[0])));
        return labels.map((label, i) => (i % every === 0
            ? `<text class="ch-xtick" x="${centers[i]}" y="${f.height - 8}" text-anchor="middle">${esc(label)}</text>`
            : '')).join('');
    }

    // --- renderers: each returns { svg, hits } ------------------------------

    function drawColumn(cfg, f) {
        const { labels, values } = cfg;
        const max = niceCeil(Math.max(...values, 1));
        const innerW = f.width - f.left - f.right;
        const innerH = f.height - f.top - f.bottom;
        const band = innerW / values.length;
        const barW = Math.min(band * 0.62, 46);
        const centers = values.map((unused, i) => f.left + band * i + band / 2);
        const tops = values.map((v) => f.top + innerH - (v / max) * innerH);

        let svg = axes(f, max, cfg.compact);
        svg += values.map((v, i) => {
            const h = Math.max(2, (v / max) * innerH);
            return `<path class="ch-bar" data-i="${i}" style="animation-delay:${i * 22}ms" d="${roundedTopRect(centers[i] - barW / 2, f.top + innerH - h, barW, h, 7)}"/>`;
        }).join('');
        svg += xLabels(f, labels, centers, 40);
        return { svg, hits: centers.map((cx, i) => ({ x: cx, y: tops[i], bandX: cx - band / 2, bandW: band })) , guide: true };
    }

    function drawHistogram(cfg, f) {
        const { labels, values } = cfg;
        const max = niceCeil(Math.max(...values, 1));
        const innerW = f.width - f.left - f.right;
        const innerH = f.height - f.top - f.bottom;
        const band = innerW / values.length;
        const centers = values.map((unused, i) => f.left + band * i + band / 2);
        const tops = values.map((v) => f.top + innerH - (v / max) * innerH);

        let svg = axes(f, max, cfg.compact);
        svg += values.map((v, i) => {
            const h = Math.max(v ? 2 : 0, (v / max) * innerH);
            return `<path class="ch-bar" data-i="${i}" style="animation-delay:${i * 28}ms" d="${roundedTopRect(f.left + band * i + 1.5, f.top + innerH - h, band - 3, h, 4)}"/>`;
        }).join('');
        svg += xLabels(f, labels.map((l) => l.split('\u2013')[0]), centers, 46);
        return { svg, hits: centers.map((cx, i) => ({ x: cx, y: tops[i], bandX: cx - band / 2, bandW: band })), guide: true };
    }

    function drawLine(cfg, f, withArea) {
        const { labels, values } = cfg;
        const max = niceCeil(Math.max(...values, 1));
        const innerW = f.width - f.left - f.right;
        const innerH = f.height - f.top - f.bottom;
        const n = values.length;
        const step = n > 1 ? innerW / (n - 1) : 0;
        const pad = n > 1 ? 0 : innerW / 2;
        const points = values.map((v, i) => [f.left + pad + step * i, f.top + innerH - (v / max) * innerH]);
        const gid = `chg${(uid += 1)}`;

        let svg = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style="stop-color:var(--chart-line);stop-opacity:.38"/>
            <stop offset="100%" style="stop-color:var(--chart-line);stop-opacity:0"/></linearGradient></defs>`;
        svg += axes(f, max, cfg.compact);
        const path = smoothPath(points);
        if (withArea && points.length > 1) {
            const base = f.top + innerH;
            svg += `<path class="ch-area" fill="url(#${gid})" d="${path} L${points[n - 1][0]},${base} L${points[0][0]},${base} Z"/>`;
        }
        svg += points.length > 1
            ? `<path class="ch-line" pathLength="1" d="${path}"/>`
            : '';
        svg += points.map((p, i) => `<circle class="ch-dot${i === n - 1 ? ' last' : ''}" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="${n > 30 ? 0 : 3.5}"/>`).join('');
        svg += xLabels(f, labels, points.map((p) => p[0]), 44);
        const band = n > 1 ? step : innerW;
        return { svg, hits: points.map((p) => ({ x: p[0], y: p[1], bandX: p[0] - band / 2, bandW: band })), guide: true, vertical: true };
    }

    function drawBar(cfg, f) {
        const { labels, values } = cfg;
        const max = niceCeil(Math.max(...values, 1));
        const labelW = Math.min(110, Math.max(54, ...labels.map((l) => String(l).length * 6.4)));
        const left = f.left + labelW;
        const right = f.width - 54;
        const innerW = Math.max(40, right - left);
        const top = f.top - 6;
        const innerH = f.height - top - 10;
        const band = innerH / values.length;
        const barH = Math.min(band * 0.58, 26);

        let svg = '';
        for (let i = 0; i <= 3; i += 1) {
            const x = left + (innerW * i) / 3;
            svg += `<line class="ch-grid" x1="${x}" x2="${x}" y1="${top}" y2="${top + innerH}"/>`;
        }
        const hits = [];
        values.forEach((v, i) => {
            const cy = top + band * i + band / 2;
            const w = Math.max(2, (v / max) * innerW);
            svg += `<text class="ch-ytick" x="${left - 10}" y="${cy + 4}" text-anchor="end">${esc(labels[i])}</text>`;
            svg += `<path class="ch-bar h" data-i="${i}" style="animation-delay:${i * 40}ms" d="${roundedRightRect(left, cy - barH / 2, w, barH, 7)}"/>`;
            svg += `<text class="ch-vlabel" x="${left + w + 8}" y="${cy + 4}">${fmt(v)}</text>`;
            hits.push({ x: left + w, y: cy, bandX: 0, bandW: f.width, bandY: cy - band / 2, bandH: band });
        });
        return { svg, hits, guide: false, horizontal: true };
    }

    function drawPie(cfg, el) {
        let items = cfg.labels.map((label, i) => ({ label, value: Math.max(0, cfg.values[i]) })).filter((it) => it.value > 0);
        items.sort((a, b) => b.value - a.value);
        if (items.length > 8) {
            const rest = items.slice(7).reduce((sum, it) => sum + it.value, 0);
            items = items.slice(0, 7).concat([{ label: 'Other', value: rest }]);
        }
        const total = items.reduce((sum, it) => sum + it.value, 0) || 1;
        const size = Math.max(110, Math.min((el.clientHeight - 24) || 200, (el.clientWidth || 400) * 0.5, 300));
        const r = size / 2 - 8;
        const c = size / 2;

        let angle = -Math.PI / 2;
        const slices = items.map((it, i) => {
            const frac = it.value / total;
            const a0 = angle;
            const a1 = angle + frac * Math.PI * 2;
            angle = a1;
            const mid = (a0 + a1) / 2;
            const large = a1 - a0 > Math.PI ? 1 : 0;
            const path = frac >= 0.9999
                ? `M${c},${c - r} A${r},${r} 0 1 1 ${c - 0.01},${c - r} Z`
                : `M${c},${c} L${c + r * Math.cos(a0)},${c + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${c + r * Math.cos(a1)},${c + r * Math.sin(a1)} Z`;
            return { ...it, path, frac, color: PIE_COLORS[i % PIE_COLORS.length], dx: Math.cos(mid) * 7, dy: Math.sin(mid) * 7 };
        });

        const svg = `<svg class="ch-svg ch-pie-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">
            ${slices.map((s, i) => `<path class="ch-slice" data-i="${i}" style="fill:${s.color};animation-delay:${i * 60}ms;--dx:${s.dx}px;--dy:${s.dy}px" d="${s.path}"/>`).join('')}
        </svg>`;
        const legend = `<ul class="ch-legend">${slices.map((s, i) => `
            <li data-i="${i}"><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${Math.round(s.frac * 100)}%</b></li>`).join('')}</ul>`;
        return { svg, legend, slices };
    }

    // --- main entry ---------------------------------------------------------

    function render(el, cfg, animate = true, force = false) {
        if (!el) return;
        // Live data refreshes call render() often: only redraw (and animate) when something changed.
        const signature = JSON.stringify([cfg.type, cfg.labels, cfg.values, cfg.raw && cfg.raw.length, cfg.compact, cfg.unit]);
        if (!force && el._chartSig === signature && el.firstChild) return;
        el._chartSig = signature;
        el._chartCfg = cfg;
        const values = (cfg.values || []).map(Number).filter((v) => Number.isFinite(v));
        const hasData = values.length && values.some((v) => v > 0) || (cfg.type === 'histogram' && (cfg.raw || []).length);
        el.classList.add('ch-root');
        el.classList.toggle('ch-animate', animate);
        el.classList.toggle('ch-compact', !!cfg.compact);

        if (!hasData) {
            el.innerHTML = `<div class="ch-empty">${esc(cfg.emptyText || 'No data yet.')}</div>`;
            observe(el);
            return;
        }

        let plot = { ...cfg, labels: cfg.labels.slice(), values: cfg.values.slice() };
        if (cfg.type === 'histogram') {
            const bins = buildHistogram((cfg.raw && cfg.raw.length ? cfg.raw : cfg.values).map(Number));
            plot = { ...cfg, labels: bins.labels, values: bins.values, unit: 'samples' };
        }

        if (cfg.type === 'pie') {
            const pie = drawPie(plot, el);
            el.innerHTML = `<div class="ch-pie">${pie.svg}${pie.legend}</div><div class="ch-tip" hidden></div>`;
            bindPie(el, pie.slices, plot);
            observe(el);
            return;
        }

        const f = frame(el, cfg);
        let drawn;
        if (cfg.type === 'bar') drawn = drawBar(plot, f);
        else if (cfg.type === 'line') drawn = drawLine(plot, f, false);
        else if (cfg.type === 'area') drawn = drawLine(plot, f, true);
        else if (cfg.type === 'histogram') drawn = drawHistogram(plot, f);
        else drawn = drawColumn(plot, f);

        const hitRects = drawn.hits.map((h, i) => (drawn.horizontal
            ? `<rect class="ch-hit" data-i="${i}" x="0" y="${h.bandY}" width="${f.width}" height="${h.bandH}"/>`
            : `<rect class="ch-hit" data-i="${i}" x="${h.bandX}" y="0" width="${h.bandW}" height="${f.height}"/>`)).join('');
        const guide = drawn.guide
            ? `<line class="ch-guide" x1="${f.left}" x2="${f.width - f.right}" y1="0" y2="0" style="display:none"/>`
            : '';

        el.innerHTML = `<svg class="ch-svg type-${cfg.type}" width="${f.width}" height="${f.height}" viewBox="0 0 ${f.width} ${f.height}" role="img">
            <defs><linearGradient id="chb${uid}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style="stop-color:var(--chart-hi-top)"/><stop offset="100%" style="stop-color:var(--chart-hi-bottom)"/></linearGradient></defs>
            ${drawn.svg}${guide}${hitRects}</svg><div class="ch-tip" hidden></div>`;
        el.querySelector('svg').style.setProperty('--hi-fill', `url(#chb${uid})`);
        uid += 1;
        bindHover(el, plot, drawn, f);
        observe(el);
    }

    function bindHover(el, plot, drawn, f) {
        const svg = el.querySelector('svg');
        const tip = el.querySelector('.ch-tip');
        const guide = el.querySelector('.ch-guide');
        const shapes = svg.querySelectorAll('.ch-bar, .ch-dot');
        const maxIndex = plot.values.indexOf(Math.max(...plot.values));
        let active = -1;

        function show(i) {
            if (i === active || !drawn.hits[i]) return;
            active = i;
            shapes.forEach((shape) => shape.classList.toggle('is-hi', Number(shape.dataset.i) === i));
            const hit = drawn.hits[i];
            if (guide) {
                if (drawn.vertical) {
                    guide.setAttribute('x1', hit.x); guide.setAttribute('x2', hit.x);
                    guide.setAttribute('y1', f.top); guide.setAttribute('y2', f.height - f.bottom);
                } else {
                    guide.setAttribute('x1', f.left); guide.setAttribute('x2', f.width - f.right);
                    guide.setAttribute('y1', hit.y); guide.setAttribute('y2', hit.y);
                }
                guide.style.display = '';
            }
            tip.hidden = false;
            tip.innerHTML = `<span>${esc(plot.labels[i])}</span><b>${fmt(plot.values[i])}</b>${plot.unit ? `<small>${esc(plot.unit)}</small>` : ''}`;
            const tipW = tip.offsetWidth || 90;
            let left = hit.x - tipW / 2;
            if (drawn.horizontal) left = Math.min(f.width - tipW - 4, hit.x + 14);
            left = Math.max(4, Math.min(f.width - tipW - 4, left));
            tip.style.left = `${left}px`;
            tip.style.top = `${Math.max(0, hit.y - 40)}px`;
        }

        function rest() {
            // At rest, keep the peak highlighted (like the reference design).
            active = -1;
            if (drawn.horizontal) {
                shapes.forEach((shape) => shape.classList.remove('is-hi'));
                if (guide) guide.style.display = 'none';
                tip.hidden = true;
                return;
            }
            show(maxIndex);
        }

        svg.addEventListener('mousemove', (event) => {
            const target = event.target.closest('.ch-hit');
            if (target) show(Number(target.dataset.i));
        });
        svg.addEventListener('mouseleave', rest);
        svg.addEventListener('touchstart', (event) => {
            const target = event.target.closest('.ch-hit');
            if (target) show(Number(target.dataset.i));
        }, { passive: true });
        if (!el.classList.contains('ch-compact') || plot.type !== 'bar') rest();
    }

    function bindPie(el, slices, plot) {
        const tip = el.querySelector('.ch-tip');
        const paths = el.querySelectorAll('.ch-slice');
        const rows = el.querySelectorAll('.ch-legend li');
        const wrap = el.querySelector('.ch-pie');

        function set(i) {
            paths.forEach((p) => p.classList.toggle('is-hi', Number(p.dataset.i) === i));
            rows.forEach((r) => r.classList.toggle('is-hi', Number(r.dataset.i) === i));
            if (i < 0) { tip.hidden = true; return; }
            const s = slices[i];
            tip.hidden = false;
            tip.innerHTML = `<span>${esc(s.label)}</span><b>${fmt(s.value)}</b>${plot.unit ? `<small>${esc(plot.unit)}</small>` : ''}`;
        }

        wrap.addEventListener('mousemove', (event) => {
            const t = event.target.closest('[data-i]');
            set(t ? Number(t.dataset.i) : -1);
            const rect = el.getBoundingClientRect();
            tip.style.left = `${Math.min(rect.width - (tip.offsetWidth + 6), event.clientX - rect.left + 12)}px`;
            tip.style.top = `${Math.max(0, event.clientY - rect.top - 38)}px`;
        });
        wrap.addEventListener('mouseleave', () => set(-1));
    }

    // Re-render on resize (without replaying the entrance animation).
    function observe(el) {
        if (el._chartObserver || typeof ResizeObserver === 'undefined') return;
        let lastWidth = el.clientWidth;
        el._chartObserver = new ResizeObserver(() => {
            if (Math.abs(el.clientWidth - lastWidth) < 4) return;
            lastWidth = el.clientWidth;
            if (el._chartCfg) render(el, el._chartCfg, false, true);
        });
        el._chartObserver.observe(el);
    }

    return { render, fmt };
})();
