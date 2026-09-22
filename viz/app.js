// adsb-survey — world tile-density viz (Open MCT + MapLibre + Mapterhorn hillshade)
//
// Structure follows dwg7/cafebabe's Open MCT patterns (patterns/open-mct-object-model.md):
// the only reliably stable extension point across 5 independent dwg7 apps is
// objects.addProvider + composition.addProvider + a fixed addRoot, with a single
// custom type (here `adsb-survey.day`) so the built-in Grid View never competes with
// our own view in the view-switcher (same reason m3xx-fleet gave a custom root type).
//
// Basemap follows dwg7/mapterhorn-japan-bridge's 2D-only choice (patterns/
// maplibre-gl-js-rendering.md "3D terrain併用の可否"): terrain is a world-scale,
// background-only concern here, so hillshade alone (no style.terrain) keeps this
// light regardless of the viewer's GPU. The Mapterhorn raster-dem source URL/params
// are copied verbatim from dwg7/kitavolca's docs/style.json (real production values,
// not guessed): https://tiles.mapterhorn.com/{z}/{x}/{y}.webp, Terrarium, tileSize 512.
//
// Data stays local (DECISIONS.md D4's "technology open, data closed" / dwg7's
// submarine principle): this page fetches ../data/reports/tile-density-<date>.json,
// which is gitignored and only exists on the machine that ran scripts/tile-density.py.
// Serve this directory with a local static server (fetch() needs http(s), not file://):
//     cd /Volumes/Migrate-2025-04/github/adsb-survey && python3 -m http.server 8642
//     open http://localhost:8642/viz/

window.ADSB_SURVEY = (function () {
  if (!window.openmct) {
    throw new Error('Open MCT failed to load');
  }

  const openmct = window.openmct;
  const NAMESPACE = 'adsb-survey';
  const ZOOM = 4;
  const TILE_N = 2 ** ZOOM;

  // Days with a tile-density report (scripts/tile-density.py --json-out). Extend this
  // as more days are analyzed -- see DECISIONS.md D2/D3.
  const DATES = [
    { key: '2026.09.18', name: '2026-09-18 (金)' },
    { key: '2026.09.16', name: '2026-09-16 (水)' }
  ];

  const objectsByKey = new Map();
  const rootChildren = [];

  function registerRoot() {
    const identifier = { namespace: NAMESPACE, key: 'root' };
    objectsByKey.set('root', { identifier, name: 'adsb-survey — world tile density', type: 'folder' });
    openmct.objects.addRoot(identifier);
  }

  function registerDay(date) {
    const identifier = { namespace: NAMESPACE, key: date.key };
    objectsByKey.set(date.key, { identifier, name: date.name, type: 'adsb-survey.day' });
    rootChildren.push(identifier);
  }

  // z4 tile (x, y) -> [lonMin, latMin, lonMax, latMax], the exact inverse of
  // scripts/tile-density.py's tile_and_frac() (standard XYZ/Web Mercator slippy-map
  // tiles). Kept independent per-language rather than shared, same as every other
  // dwg7 instrument (patterns/markdown-file-conventions.md "instrument files are
  // self-contained") -- there is no shared runtime between the Python analysis
  // script and this browser-side viz.
  function tileBounds(x, y, z) {
    const n = 2 ** z;
    const lonMin = (x / n) * 360 - 180;
    const lonMax = ((x + 1) / n) * 360 - 180;
    function latForY(yy) {
      const merc = Math.PI * (1 - (2 * yy) / n);
      return (180 / Math.PI) * Math.atan(Math.sinh(merc));
    }
    return [lonMin, latForY(y + 1), lonMax, latForY(y)];
  }

  function tileToFeature(key, tile) {
    const [lonMin, latMin, lonMax, latMax] = tileBounds(tile.x, tile.y, ZOOM);
    return {
      type: 'Feature',
      properties: {
        tile: `4/${tile.x}/${tile.y}`,
        aircraft: tile.aircraft,
        points: tile.points,
        emptyPct: tile.empty_pct,
        note: tile.longlist || tile.watchlist || null,
        kind: tile.longlist ? 'longlist' : tile.watchlist ? 'watchlist' : null,
        logAircraft: Math.log10(tile.aircraft + 1)
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [lonMin, latMin],
            [lonMax, latMin],
            [lonMax, latMax],
            [lonMin, latMax],
            [lonMin, latMin]
          ]
        ]
      }
    };
  }

  // Sequential ramp, dark->warm, picked by hand for a dark (Espresso-theme) map --
  // not the dataviz skill's validated palette (this stays local/internal, never
  // published, so that bar doesn't apply here; see DECISIONS.md D4's "tool open,
  // data closed").
  const RAMP = [
    [0, '#16213a'],
    [1, '#1f6f8b'],
    [2, '#3fae8f'],
    [3, '#d9c25c'],
    [4.3, '#f2a154']
  ];

  function buildStyle(geojson) {
    return {
      version: 8,
      sources: {
        mapterhorn: {
          type: 'raster-dem',
          tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
          encoding: 'terrarium',
          tileSize: 512,
          maxzoom: 14,
          attribution: "<a href='https://mapterhorn.com/attribution'>Mapterhorn</a>"
        },
        'tile-density': {
          type: 'geojson',
          data: geojson
        }
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#0a131f' } },
        {
          id: 'hillshade',
          type: 'hillshade',
          source: 'mapterhorn',
          paint: {
            'hillshade-exaggeration': 0.6,
            'hillshade-shadow-color': 'rgba(60,60,60,1)',
            'hillshade-highlight-color': 'rgba(255,255,255,1)',
            'hillshade-accent-color': 'rgba(90,90,90,1)'
          }
        },
        {
          id: 'tile-density-fill',
          type: 'fill',
          source: 'tile-density',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'logAircraft'],
              ...RAMP.flat()
            ],
            'fill-opacity': 0.55
          }
        },
        {
          id: 'tile-density-outline',
          type: 'line',
          source: 'tile-density',
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'kind'], 'longlist'],
              '#ffffff',
              ['==', ['get', 'kind'], 'watchlist'],
              '#ffd166',
              'rgba(255,255,255,0.18)'
            ],
            'line-width': ['case', ['!=', ['get', 'kind'], null], 2, 0.5]
          }
        }
      ]
    };
  }

  function formatTileInfo(props) {
    const label = props.note ? `${props.tile} — ${props.note}` : props.tile;
    return (
      `<div class="adsb-survey-info-title">${label}</div>` +
      `機体 ${props.aircraft.toLocaleString()} / 点 ${props.points.toLocaleString()} / ` +
      `空白 ${props.emptyPct}%`
    );
  }

  async function renderDay(container, dateKey) {
    container.innerHTML = '';
    const mapWrap = document.createElement('div');
    mapWrap.className = 'adsb-survey-map-wrap';
    container.appendChild(mapWrap);

    const mapDiv = document.createElement('div');
    mapDiv.className = 'adsb-survey-map';
    mapWrap.appendChild(mapDiv);

    const legend = document.createElement('div');
    legend.className = 'adsb-survey-legend';
    legend.innerHTML =
      '<div>機体数(対数)</div>' +
      `<div class="adsb-survey-legend-ramp">${RAMP.map((s) => `<span style="background:${s[1]}"></span>`).join('')}</div>` +
      '<div>少 → 多 ・ 白枠=ロングリスト ・ 黄枠=ウォッチリスト</div>';
    mapWrap.appendChild(legend);

    const info = document.createElement('div');
    info.className = 'adsb-survey-info';
    info.innerHTML = '<div class="adsb-survey-info-hint">タイルにカーソルを合わせると詳細を表示します。</div>';
    mapWrap.appendChild(info);

    const caption = document.createElement('p');
    caption.className = 'adsb-survey-caption';
    container.appendChild(caption);

    let report;
    try {
      const response = await fetch(`../data/reports/tile-density-${dateKey}.json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      report = await response.json();
    } catch (error) {
      mapDiv.textContent =
        `data/reports/tile-density-${dateKey}.json を読み込めませんでした` +
        '（scripts/tile-density.py --json-out で先に生成し、viz/ をローカルサーバー越しに開いてください）。';
      return undefined;
    }

    const features = Object.entries(report.tiles).map(([key, tile]) => tileToFeature(key, tile));
    const geojson = { type: 'FeatureCollection', features };
    const style = buildStyle(geojson);

    const map = new maplibregl.Map({
      container: mapDiv,
      style,
      center: [20, 20],
      zoom: 1.2
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('mousemove', 'tile-density-fill', (event) => {
      if (!event.features || !event.features.length) {
        return;
      }
      info.innerHTML = formatTileInfo(event.features[0].properties);
    });
    map.on('mouseleave', 'tile-density-fill', () => {
      info.innerHTML = '<div class="adsb-survey-info-hint">タイルにカーソルを合わせると詳細を表示します。</div>';
    });
    map.on('mouseenter', 'tile-density-fill', () => {
      mapDiv.style.cursor = 'pointer';
    });
    map.on('mouseleave', 'tile-density-fill', () => {
      mapDiv.style.cursor = '';
    });

    caption.innerHTML =
      `${report.date} ・ トレースファイル ${report.files_read.toLocaleString()} 件 ・ z${report.zoom}タイル ${features.length}枚 ・ ` +
      "地形: <a href=\"https://mapterhorn.com/attribution\" target=\"_blank\" rel=\"noopener noreferrer\">Mapterhorn</a> ・ " +
      '航跡: <a href="https://github.com/adsblol/globe_history_2026" target="_blank" rel="noopener noreferrer">adsb.lol</a> (ODbL)';

    return () => map.remove();
  }

  function registerDayView(date) {
    openmct.objectViews.addProvider({
      key: `adsb-survey.view.${date.key}`,
      name: date.name,
      canView(domainObject) {
        return (
          domainObject.identifier.namespace === NAMESPACE && domainObject.identifier.key === date.key
        );
      },
      view() {
        let root;
        let cleanup;
        return {
          show(element) {
            root = document.createElement('div');
            root.className = 'adsb-survey-instrument';
            element.appendChild(root);
            renderDay(root, date.key)
              .then((teardown) => {
                cleanup = teardown;
              })
              .catch(() => {});
          },
          destroy() {
            if (typeof cleanup === 'function') {
              try {
                cleanup();
              } catch (error) {
                // best-effort MapLibre teardown; a failing one shouldn't block navigation
              }
            }
            if (root && root.parentNode) {
              root.parentNode.removeChild(root);
            }
          }
        };
      }
    });
  }

  registerRoot();
  DATES.forEach(registerDay);

  openmct.types.addType('adsb-survey.day', {
    name: '世界タイル密度',
    description: 'z4タイルごとの機体数・位置点数(1日分)',
    creatable: false
  });

  openmct.objects.addProvider(NAMESPACE, {
    get(identifier) {
      const domainObject = objectsByKey.get(identifier.key);
      return domainObject ? Promise.resolve(domainObject) : Promise.reject(new Error('Unknown object'));
    }
  });

  openmct.composition.addProvider({
    appliesTo(domainObject) {
      return domainObject.identifier.namespace === NAMESPACE && domainObject.identifier.key === 'root';
    },
    load() {
      return Promise.resolve(rootChildren.slice());
    }
  });

  DATES.forEach(registerDayView);

  const openmctScript = document.querySelector('script[src*="openmct"]');
  if (openmctScript) {
    openmct.setAssetPath(openmctScript.src.replace(/openmct\.js(?:\?.*)?$/, ''));
  }
  openmct.install(openmct.plugins.LocalStorage());
  openmct.install(openmct.plugins.UTCTimeSystem());
  openmct.install(openmct.plugins.Espresso());

  openmct.on('start', () => {
    openmct.router.setPath(`/browse/${NAMESPACE}:root`);
  });
  openmct.start('#app');

  return { DATES, tileBounds };
})();
