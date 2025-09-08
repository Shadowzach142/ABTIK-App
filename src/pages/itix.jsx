
        {/* MAP, CHART, ARES, MOST AFFECTED */}
        <div className="col-2">
          <div className="col2-row">
          <div className="card">
            <div className="card-header">
              <div className="part-title">Disease Distribution Map</div>
              <div className="card-subtitle">{selectedDisease || "—"}</div>
            </div>

            <div className="map-box">
              {loading ? (
                <div className="map-loading">Loading data…</div>
              ) : (
                <>
                  <MapContainer center={defaultCenter} zoom={6} className="map">
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution="&copy; OpenStreetMap contributors"
                    />

                    {markers.map((m) => (
                      <CircleMarker
                        key={m.place}
                        center={[m.coords.lat, m.coords.lng]}
                        radius={6 + Math.sqrt(m.count) * 3}
                        pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.85 }}
                      >
                        <Popup>
                          <div style={{ fontWeight: 700 }}>{m.place}</div>
                          <div>{m.count} records</div>
                        </Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>

                  <div className="map-pin-wrapper">
                    <div className="map-pin-box">
                      <MapPin size={22} color="#1e40af" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="part-title">{selectedDisease || "—"} - Trend</div>
              <div className="part-subtitle">Monthly</div>
            </div>

            <div className="trend-row">
              <div className="trend-y">
                {yTicks
                  .slice()
                  .reverse()
                  .map((val, i) => (
                    <div key={i} className="trend-y-label">
                      {val}
                    </div>
                  ))}
              </div>

              <div className="trend-chart">
                <div ref={chartRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
                  <svg
                    viewBox={`0 0 ${spark.W} ${spark.H}`}
                    className="chart-svg"
                    preserveAspectRatio="xMidYMid meet"
                    /* opacity is dynamic so keep just that inline */
                    style={{ opacity: chartOpacity }}
                  >
                    {yTicks.map((val, i) => {
                      const y = Math.round((1 - val / (spark.maxVal || 1)) * (spark.H - 36)) + 18;
                      return <line key={i} x1={0} x2={spark.W} y1={y} y2={y} stroke="#eef2f7" strokeWidth="1" />;
                    })}

                    <path d={spark.area} fill="#ef4444" opacity="0.06" />
                    <path d={spark.d} fill="none" stroke="#ef4444" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />

                    {spark.pts.map((p, idx) => (
                      <g key={idx}>
                        <circle cx={p[0]} cy={p[1]} r={3.6} fill="#ef4444" stroke="#fff" strokeWidth="0.8" />
                        {shouldShowPointLabel(idx, p[2]) && (
                          <text x={p[0]} y={p[1] - 10} fontSize="11" fill="#0f172a" fontWeight="700" textAnchor="middle">
                            {p[2]}
                          </text>
                        )}
                      </g>
                    ))}

                    {xTicks.map((t, i) => {
                      const idx = t.idx;
                      if (!spark.pts || !spark.pts[idx]) return null;
                      const x = spark.pts[idx][0];
                      const dt = new Date(t.date);
                      const label = dt.toLocaleString("en-US", { month: "short", year: "2-digit" });
                      return (
                        <g key={i} transform={`translate(${x},0)`}>
                          <line x1={0} x2={0} y1={spark.H - 36} y2={spark.H - 18} stroke="#e6edf3" strokeWidth="1" />
                          <text x={0} y={spark.H - 4} fontSize="11" fill="#64748b" textAnchor="middle">
                            {label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="chart-caption">Months (X) — Records (Y)</div>

                {tooltip.show && (
                  /* tooltip position is dynamic (left/top) so we must keep that inline */
                  <div className="tooltip-box" style={{ left: tooltip.x, top: tooltip.y }}>
                    <div className="tooltip-title">{tooltip.label}</div>
                    <div className="tooltip-value">
                      {tooltip.value} record{tooltip.value !== 1 ? "s" : ""}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>

            <div className="col2-row">



              <div className="overview-box">
                <div className="card-header">
                  <div className="part-title">Top Areas</div>
                  <div className="card-subtitle">{placeCounts.reduce((s, d) => s + d.count, 0)} total</div>
                </div>
              <div className=" ">
                <PieChart
                  data={placeCounts}
                  size={180}
                  innerRatio={0.6}
                  onSliceClick={(d) => {
                    if (d && d.label) {
                    }
                  }}
                  ariaLabel="Top areas pie chart"
                />
              </div>
            </div>
          </div>
        </div>

        {/* CHOICES */}
        <div className="col-3">
          <div className="col3-dets">

          <div className="part-title">Overview</div>
            <div className="part-subtitle">Summary of key metrics</div>

          <div className="overview-box">

              <div className="card-header">
                <div className="part-title">Top Symptoms</div>
                <div className="card-subtitle">
                  {diseaseCounts.reduce((s, d) => s + d.count, 0)} total
                </div>
              </div>

            {/* SYMPTOMS BOX */}

            </div>

            <div className="overview-box">
              <div className="part-title">Recent Reports (diseases)</div>
              <div className="top-symptoms-box">
              {recordsWithPatient.slice(0, 200).map((r, i) => (
                <div key={i} className="recent-item">
                  <div className="recent-row">
                    <div className="recent-symptoms">• {compactSymptomsText(r)}</div>
                    <div className="recent-date">{r.recorddate}</div>
                  </div>
                </div>
              ))}
              {recordsWithPatient.length === 0 && <div className="no-data">No recent reports</div>}
            </div>
          </div>
          </div>
        </div>
