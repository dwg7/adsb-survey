# adsb-survey

Tools for studying aerial-survey flights in open ADS-B data from
[adsb.lol](https://www.adsb.lol/), by 4/x/y tile.

航空測量(写真測量・レーザ計測など)の飛行を、オープンな ADS-B データから読み解くための道具。
z/x/y タイル(ズームレベル4)を単位に解析する。

## Data

**No data is included in this repository.** Put it under `data/` (gitignored).

- adsb.lol daily archives ([globe_history](https://github.com/adsblol/globe_history_2026)):
  [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). About 3.4 GB per day, worldwide,
  in [readsb's globe_history format](https://github.com/wiedehopf/readsb/blob/dev/README-json.md#trace-jsons).
- adsb.fi open data API, if used for cross-checks: personal, non-commercial use only,
  with attribution ([terms](https://github.com/adsbfi/opendata)). Not mixed into anything published.

Analysis results are for the maintainer's own study and are not published from this repository.

## Tiles (long list, to be narrowed)

| tile | lon | lat | contents |
|---|---|---|---|
| 4/14/5 | 135.0–157.5 | 41.0–55.8 | Hokkaido, Sakhalin, Kurils |
| 4/14/6 | 135.0–157.5 | 21.9–41.0 | eastern Honshu, Tokyo area |
| 4/13/6 | 112.5–135.0 | 21.9–41.0 | Korea, eastern China, Taiwan, Kyushu |
| 4/9/4 | 22.5–45.0 | 55.8–66.5 | southern Finland, Baltic states, St Petersburg |
| 4/9/6 | 22.5–45.0 | 21.9–41.0 | Greece, Turkey, Cyprus, Levant, Egypt |
| 4/7/7 | -22.5–0.0 | 0.0–21.9 | West African coast incl. Sierra Leone |

## Related

- [dwg7/kikicom](https://github.com/dwg7/kikicom): a single RTL-SDR + readsb receiver in Sapporo
  (the same readsb that writes adsb.lol's archives), where this idea started.

## License

The tools are [CC0 1.0](LICENSE). Data licenses are as above.
