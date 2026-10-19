import { TZ_ABBREVIATIONS, GMT_OFFSETS, deviceTzCode, isKnownTz } from '../lib/utils';

// One picker for every timezone: all GMT offsets (GMT-12 … GMT+14, with the
// half-hour ones) plus named zones like ET / PT that follow daylight saving.
export default function TimezoneSelect({ value, onChange, includeLocal = false, className = 'input', style, id }) {
  const v = value || (includeLocal ? 'LOCAL' : deviceTzCode());
  const listed = v === 'LOCAL' || GMT_OFFSETS.some((z) => z.abbr === v) || TZ_ABBREVIATIONS.some((z) => z.abbr === v);
  const mine = deviceTzCode();
  return (
    <select id={id} className={className} style={style} value={v} onChange={(e) => onChange(e.target.value)}>
      {includeLocal && <option value="LOCAL">My phone’s time ({mine})</option>}
      {!listed && <option value={v}>{v}{isKnownTz(v) ? '' : ' (unknown)'}</option>}
      <optgroup label="By GMT offset">
        {GMT_OFFSETS.map((z) => <option key={z.abbr} value={z.abbr}>{z.abbr} — {z.name}{z.abbr === mine ? ' · you' : ''}</option>)}
      </optgroup>
      <optgroup label="Named zones">
        {TZ_ABBREVIATIONS.map((z) => {
          const o = z.offset;
          const off = `GMT${o >= 0 ? '+' : ''}${o}`;
          return <option key={z.abbr} value={z.abbr}>{z.abbr} — {z.name}{z.iana ? '' : ` (${off})`}</option>;
        })}
      </optgroup>
    </select>
  );
}
