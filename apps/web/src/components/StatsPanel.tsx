import { useState } from 'react';

type StatsRow = {
  name: string;
  hex: string;
  count: number;
  ratio: number;
  lineCost: number;
};

type Props = {
  proMode: boolean;
  totalBeads: number;
  statsRowCount: number;
  materialCost: number;
  laborCost: number;
  fixedCost: number;
  marginRate: number;
  quotePrice: number;
  hasConverted: boolean;
  statsSearch: string;
  filteredStatsRows: StatsRow[];
  onStatsSearchChange: (v: string) => void;
  proUnitCost: number;
  proLossRate: number;
  proHourlyRate: number;
  proWorkHours: number;
  proFixedCost: number;
  proMargin: number;
  onProUnitCostChange: (v: number) => void;
  onProLossRateChange: (v: number) => void;
  onProHourlyRateChange: (v: number) => void;
  onProWorkHoursChange: (v: number) => void;
  onProFixedCostChange: (v: number) => void;
  onProMarginChange: (v: number) => void;
};

export default function StatsPanel({
  proMode,
  totalBeads,
  statsRowCount,
  materialCost,
  laborCost,
  fixedCost,
  marginRate,
  quotePrice,
  hasConverted,
  statsSearch,
  filteredStatsRows,
  onStatsSearchChange,
  proUnitCost,
  proLossRate,
  proHourlyRate,
  proWorkHours,
  proFixedCost,
  proMargin,
  onProUnitCostChange,
  onProLossRateChange,
  onProHourlyRateChange,
  onProWorkHoursChange,
  onProFixedCostChange,
  onProMarginChange,
}: Props) {
  const [costOpen, setCostOpen] = useState(false);
  return (
    <section className="panel stats">
      <h2>完整色號統計</h2>
      <div className={`totals ${proMode ? '' : 'compact'}`.trim()}>
        <div>
          <strong>{totalBeads}</strong>
          <span>總顆數</span>
        </div>
        <div>
          <strong>{statsRowCount}</strong>
          <span>總色號數</span>
        </div>
        {proMode && (
          <div>
            <strong>{materialCost.toFixed(2)}</strong>
            <span>預估材料成本</span>
          </div>
        )}
      </div>

      {proMode && (
        <>
          <div className="draft-box-head" style={{ cursor: 'pointer' }} onClick={() => setCostOpen((v) => !v)}>
            <span style={{ fontSize: 13 }}>成本試算</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transition: 'transform 200ms', transform: costOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          {costOpen && (<>
          <div className="row two">
            <label>
              單顆成本
              <input
                type="number"
                min={0}
                step={0.01}
                value={proUnitCost}
                onChange={(e) => onProUnitCostChange(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              損耗率 (%)
              <input
                type="number"
                min={0}
                step={0.1}
                value={proLossRate}
                onChange={(e) => onProLossRateChange(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <div className="row two">
            <label>
              時薪
              <input
                type="number"
                min={0}
                step={1}
                value={proHourlyRate}
                onChange={(e) => onProHourlyRateChange(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              預估工時
              <input
                type="number"
                min={0}
                step={0.25}
                value={proWorkHours}
                onChange={(e) => onProWorkHoursChange(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <div className="row two">
            <label>
              固定成本
              <input
                type="number"
                min={0}
                step={1}
                value={proFixedCost}
                onChange={(e) => onProFixedCostChange(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              利潤率 (%)
              <input
                type="number"
                min={0}
                step={0.1}
                value={proMargin}
                onChange={(e) => onProMarginChange(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <p className="hint">
            Pro 拆解：材料 {materialCost.toFixed(2)} + 人工 {laborCost.toFixed(2)} + 固定費 {fixedCost.toFixed(2)}，再加上利潤率 {marginRate.toFixed(1)}%
          </p>
          </>)}
        </>
      )}

      {hasConverted && (
        <div className="quote-box">
          <span>建議報價</span>
          <strong>{quotePrice}</strong>
        </div>
      )}

      <label>
        統計搜尋
        <input
          type="text"
          placeholder="搜尋色號..."
          value={statsSearch}
          onChange={(e) => onStatsSearchChange(e.target.value)}
          title="僅過濾顯示，不影響全量匯出"
        />
      </label>
      <p className="hint" style={{ marginTop: 2 }}>僅過濾顯示，不影響全量匯出</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>色號</th>
              <th>顆數</th>
              <th>佔比</th>
              {proMode && <th>成本</th>}
            </tr>
          </thead>
          <tbody>
            {filteredStatsRows.map((r) => (
              <tr key={r.name}>
                <td>
                  <span className="color-pill" style={{ color: r.hex }} />
                  {r.name}
                </td>
                <td>{r.count}</td>
                <td>{r.ratio.toFixed(2)}%</td>
                {proMode && <td>{r.lineCost.toFixed(2)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
