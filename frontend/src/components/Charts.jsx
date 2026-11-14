import { useState } from "react";
import { dayMonth, inr, num, weekday } from "../utils/format.js";

// Pick a round number above the data so grid lines land on tidy values (5, 10, 20, 50, 100...).
function niceMax(value) {
  if (value <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

const W = 720;
const H = 250;
const M = { top: 12, right: 10, bottom: 30, left: 42 };

// Units received (green) and issued (clay) per day. Hover a day to see the numbers;
// a hidden table below carries the same data for screen readers.
export function TrendChart({ data }) {
  const [active, setActive] = useState(null);
  const peak = Math.max(1, ...data.flatMap((d) => [d.units_in, d.units_out]));
  const max = niceMax(peak);
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const step = innerW / data.length;
  const barW = Math.min(15, step * 0.3);
  const y = (v) => M.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const totalIn = data.reduce((s, d) => s + d.units_in, 0);
  const totalOut = data.reduce((s, d) => s + d.units_out, 0);
  const point = active !== null ? data[active] : null;
  const pointX = active !== null ? ((M.left + step * active + step / 2) / W) * 100 : 0;

  return (
    <div className="chart" onMouseLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Units received and issued per day for the last ${data.length} days. ${num(totalIn)} received, ${num(totalOut)} issued.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="axis" x={M.left - 8} y={y(t) + 4} textAnchor="end">
              {num(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = M.left + step * i + step / 2;
          const showLabel = data.length <= 8 || i % 2 === (data.length - 1) % 2;
          return (
            <g key={d.day} onMouseEnter={() => setActive(i)}>
              {active === i ? <rect className="hover-band" x={M.left + step * i} y={M.top} width={step} height={innerH} /> : null}
              <rect className="bar bar-in" x={cx - barW - 1} y={y(d.units_in)} width={barW} height={Math.max(0, M.top + innerH - y(d.units_in))} rx="2" />
              <rect className="bar bar-out" x={cx + 1} y={y(d.units_out)} width={barW} height={Math.max(0, M.top + innerH - y(d.units_out))} rx="2" />
              {showLabel ? (
                <text className="axis" x={cx} y={H - 9} textAnchor="middle">
                  {dayMonth(d.day)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {point ? (
        <div className="chart-tip" style={{ left: `${pointX}%` }} role="presentation">
          <strong>
            {weekday(point.day)}, {dayMonth(point.day)}
          </strong>
          <span className="tip-in">{num(point.units_in)} received</span>
          <span className="tip-out">{num(point.units_out)} issued</span>
        </div>
      ) : null}
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i className="key key-in" /> Received · {num(totalIn)}
        </span>
        <span>
          <i className="key key-out" /> Issued · {num(totalOut)}
        </span>
      </div>
      <table className="sr-only">
        <caption>Units received and issued per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Received</th>
            <th scope="col">Issued</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{dayMonth(d.day)}</th>
              <td>{d.units_in}</td>
              <td>{d.units_out}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Stock value per category as horizontal bars.
export function CategoryBars({ categories }) {
  const rows = categories.filter((c) => Number(c.products) > 0);
  const max = Math.max(1, ...rows.map((c) => Number(c.value)));
  const total = rows.reduce((s, c) => s + Number(c.value), 0) || 1;
  return (
    <ul className="catbars">
      {rows.map((c) => (
        <li key={c.id}>
          <div className="catbars-top">
            <span className="catbars-name">{c.name}</span>
            <span className="catbars-value">{inr(c.value, 0)}</span>
          </div>
          <span className="catbars-track" aria-hidden="true">
            <span style={{ width: `${(Number(c.value) / max) * 100}%` }} />
          </span>
          <small>
            {c.products} products · {num(c.units)} units · {Math.round((Number(c.value) / total) * 100)}% of value
          </small>
        </li>
      ))}
    </ul>
  );
}

// Stock level after each movement, drawn as a step line with the reorder level as a dashed guide.
export function LevelChart({ points, reorder }) {
  if (points.length < 2) return null;
  const w = 640;
  const h = 150;
  const m = { top: 12, right: 8, bottom: 22, left: 36 };
  const values = points.map((p) => p.balance);
  const max = niceMax(Math.max(...values, reorder || 0));
  const innerW = w - m.left - m.right;
  const innerH = h - m.top - m.bottom;
  const x = (i) => m.left + (i / (points.length - 1)) * innerW;
  const y = (v) => m.top + innerH - (v / max) * innerH;

  let path = `M ${x(0)} ${y(values[0])}`;
  for (let i = 1; i < points.length; i++) path += ` H ${x(i)} V ${y(values[i])}`;
  const area = `${path} V ${y(0)} H ${x(0)} Z`;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <svg className="levelchart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Stock level over the last ${points.length} movements, now ${last.balance}`}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line className="grid" x1={m.left} x2={w - m.right} y1={y(max * f)} y2={y(max * f)} />
          <text className="axis" x={m.left - 6} y={y(max * f) + 4} textAnchor="end">
            {num(Math.round(max * f))}
          </text>
        </g>
      ))}
      {reorder > 0 ? (
        <g>
          <line className="reorder-line" x1={m.left} x2={w - m.right} y1={y(reorder)} y2={y(reorder)} />
          <text className="axis axis-warn" x={w - m.right} y={y(reorder) - 5} textAnchor="end">
            Reorder at {num(reorder)}
          </text>
        </g>
      ) : null}
      <path className="level-area" d={area} />
      <path className="level-line" d={path} />
      <circle className="level-dot" cx={x(points.length - 1)} cy={y(last.balance)} r="4" />
      <text className="axis" x={m.left} y={h - 5}>
        {dayMonth(first.at)}
      </text>
      <text className="axis" x={w - m.right} y={h - 5} textAnchor="end">
        {dayMonth(last.at)}
      </text>
    </svg>
  );
}
